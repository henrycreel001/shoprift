/**
 * src/extractor.js — Phase 3: Full store extraction via dm2buy API.
 * API calls route through Chromium's TLS stack (pageGet) when a page is
 * provided, falling back to Axios. Delays are randomized to mimic human
 * browsing. DOM scraping fallback activates if the API returns empty/blocked.
 */

import axios from 'axios';
import { computeDiscount, computeSlug, sleep, withRetry } from './utils.js';
import { httpsAgent, fetchAllProducts, fetchAllProductsViaPage, pageGet } from './api.js';
import { visitStorefront } from './browser.js';
import * as job from './job.js';

const DM2BUY_API = 'https://api.dm2buy.com';

/** Returns a randomized delay mimicking human reading pace. */
function randomDelay() {
  // 20% chance of a long pause (3–5s) simulating human reading time
  if (Math.random() < 0.20) return 3000 + Math.floor(Math.random() * 2000);
  return 600 + Math.floor(Math.random() * 1500); // 600–2100ms normal range
}

/**
 * Boilerplate phrases commonly found in Indian sm-store descriptions.
 * A description consisting only of these is not a real product description.
 */
const BOILERPLATE_PATTERNS = [
  /shipping/i,
  /delivery/i,
  /dispatch/i,
  /return policy/i,
  /exchange/i,
  /dm (us|for)/i,
  /whatsapp/i,
  /for (more )?details/i,
  /cod available/i,
  /cash on delivery/i,
  /prepaid/i,
];

/**
 * Determines whether a description contains only boilerplate text.
 * @param {string | null} description
 * @returns {boolean}
 */
function isBoilerplate(description) {
  if (!description || description.trim().length < 10) return true;
  const matchCount = BOILERPLATE_PATTERNS.filter(p => p.test(description)).length;
  // If 3+ boilerplate patterns match and description is short, it's boilerplate
  return matchCount >= 3 && description.trim().length < 200;
}

/**
 * Classifies variant options into colors, sizes, or other.
 * dm2buy uses type "fit" for all variants — infer from names.
 * @param {object[]} variantOptions
 * @returns {{ sizes: string[], colors: string[], other: string[] }}
 */
function classifyVariants(variantOptions) {
  const SIZE_PATTERNS = /^(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|free size|\d+\s*(ml|cm|mm|g|kg|oz|inch|in))$/i;
  const COLOR_KEYWORDS = ['pink', 'purple', 'blue', 'red', 'green', 'yellow', 'black', 'white', 'mint',
    'orange', 'grey', 'gray', 'brown', 'beige', 'cream', 'navy', 'teal', 'gold', 'silver', 'rose',
    'lavender', 'coral', 'nude', 'maroon', 'olive', 'peach', 'multicolor', 'multi'];

  const sizes = [];
  const colors = [];
  const other = [];

  for (const v of variantOptions) {
    if (!v.isActive) continue;
    const name = v.name?.trim() || '';
    if (SIZE_PATTERNS.test(name)) {
      sizes.push(name);
    } else if (COLOR_KEYWORDS.some(c => name.toLowerCase().includes(c))) {
      colors.push(name);
    } else {
      other.push(name);
    }
  }

  return { sizes, colors, other };
}

/**
 * Maps a dm2buy API product object to Shoprift SCHEMA.md product structure.
 * @param {object} apiProduct — from listing API
 * @param {object} detailData — from detail API (has description, store)
 * @param {number} id — sequential product id (1-based)
 * @param {string} subdomain
 * @returns {object} product per SCHEMA.md
 */
function mapProduct(apiProduct, detailData, id, subdomain) {
  const name = apiProduct.name || detailData.name || 'Untitled Product';
  const price = apiProduct.price;
  const originalPrice = apiProduct.mrp || null;
  const description = detailData.description || null;
  const images = [...new Set([
    ...(apiProduct.productPhotos || []),
    ...(apiProduct.otherPhotos || [])
  ])];
  const category = apiProduct.collectionV2?.[0]?.name || null;
  const all_categories = (apiProduct.collectionV2 || []).map(c => c.name);
  const variants = classifyVariants(apiProduct.variantOptions || []);
  const stock = apiProduct.availableStock;

  return {
    id,
    name,
    description: description || null,
    needs_description: isBoilerplate(description),
    price,
    original_price: originalPrice,
    discount_percentage: computeDiscount(price, originalPrice),
    currency: 'INR',
    category,
    all_categories,
    is_uncategorized: !category,
    variants,
    stock_status: stock > 0 ? 'in_stock' : stock === 0 ? 'out_of_stock' : 'unknown',
    images_cdn: images,
    images_local: [],
    images_failed: [],
    product_url: `https://${subdomain}.dm2buy.com/product/${apiProduct.id}`,
    tags: [],
    selected_for_import: true
  };
}

/**
 * Extracts store meta from the dm2buy store API response.
 * @param {object} storeData — from /v4/store/get-by-subdomain
 * @returns {object} store_meta per SCHEMA.md
 */
export function extractStoreMeta(storeData) {
  return {
    name: storeData.storeName || 'Unknown Store',
    description: storeData.homePage?.heroDescription || null,
    instagram: storeData.instagramHandle || null,
    contact: {
      phone: storeData.phone || storeData.supportPhone || null,
      email: storeData.supportEmail || null,
      whatsapp: storeData.phone || null,
      support_note: null
    },
    location: storeData.locationString || null,
    shipping: {
      processing_time: storeData.dispatchTime ? `Within ${storeData.dispatchTime} working days` : null,
      delivery_time: null,
      shipping_regions: 'India',
      minimum_order_value: storeData.minOrderValue || null,
      shipping_charges: storeData.shippingCharge || null,
      ships_within_days: storeData.dispatchTime ? parseInt(storeData.dispatchTime, 10) : null
    },
    payment_methods: storeData.storePrefs?.allowedPaymentMethods || [],
    policies: {
      cancellations_accepted: false,
      returns_accepted: false,
      exchanges_accepted: false,
      damage_claim_note: null
    }
  };
}

/**
 * Fetches store metadata from dm2buy API.
 * @param {string} subdomain
 * @param {import('playwright').Page|null} page
 * @returns {Promise<object>}
 */
async function fetchStoreMeta(subdomain, page) {
  const params = { select: 'internationalPayment,proplan,legalInfo' };
  if (page) {
    return withRetry(async () => {
      const data = await pageGet(page, `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`, params);
      if (!data?.success) throw new Error(`[extractor] Store not found for subdomain: ${subdomain}`);
      return data.data;
    });
  }
  return withRetry(() =>
    axios.get(
      `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
      { params, httpsAgent }
    ).then(res => {
      if (!res.data?.success) throw new Error(`[extractor] Store not found for subdomain: ${subdomain}`);
      return res.data.data;
    })
  );
}

/**
 * Fetches all collections from dm2buy API.
 * @param {string} storeId
 * @param {import('playwright').Page|null} page
 * @returns {Promise<object[]>}
 */
async function fetchCollections(storeId, page) {
  if (page) {
    return withRetry(async () => {
      const data = await pageGet(page, `${DM2BUY_API}/v3/collection/store/${storeId}`);
      return data?.collections || [];
    });
  }
  return withRetry(() =>
    axios.get(`${DM2BUY_API}/v3/collection/store/${storeId}`, { httpsAgent })
      .then(res => res.data?.collections || [])
  );
}

/**
 * Fetches detail for a single product (description, etc.).
 * @param {string} productId
 * @param {import('playwright').Page|null} page
 * @returns {Promise<object>}
 */
async function fetchProductDetail(productId, page) {
  if (page) {
    return withRetry(async () => {
      const data = await pageGet(page, `${DM2BUY_API}/v3/product/${productId}`);
      return data?.data || {};
    });
  }
  return withRetry(() =>
    axios.get(`${DM2BUY_API}/v3/product/${productId}`, { httpsAgent })
      .then(res => res.data?.data || {})
  );
}

/**
 * DOM fallback: extracts basic product list from the store's rendered HTML.
 * Used when the API returns 0 results or is blocked (401/403).
 * Slower and fragile — insurance policy only.
 * @param {import('playwright').Page} page
 * @param {string} storeUrl
 * @returns {Promise<object[]>} minimal product stubs (name, price, images)
 */
async function extractProductsFromDOM(page, storeUrl) {
  console.warn('⚠️  API returned no products — attempting DOM fallback extraction');
  await page.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  return page.evaluate(() => {
    const cards = document.querySelectorAll('[data-testid="product-card"], .product-card, article');
    return Array.from(cards).map((card, i) => {
      const name = card.querySelector('h2, h3, [data-testid="product-name"], .product-name')?.textContent?.trim() || `Product ${i + 1}`;
      const priceText = card.querySelector('[data-testid="product-price"], .price, .product-price')?.textContent?.trim() || '0';
      const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
      const imgs = Array.from(card.querySelectorAll('img')).map(img => img.src).filter(Boolean);
      const link = card.querySelector('a')?.href || '';
      return { name, price, imgs, link, _source: 'dom' };
    });
  });
}

/**
 * Main extraction orchestrator. Runs Phase 3 for a dm2buy store.
 * Updates Supabase job progress after each product.
 * @param {string} storeUrl
 * @param {string} storeId — from recon_data
 * @param {string} jobId — Supabase job id (or null if tracking unavailable)
 * @param {import('playwright').Page|null} [page] — Playwright page (optional)
 * @returns {Promise<object>} raw_store_data
 */
export async function extract(storeUrl, storeId, jobId, page = null) {
  const subdomain = new URL(storeUrl).hostname.split('.')[0];

  // Visit storefront first if using browser (builds real session)
  if (page) await visitStorefront(page, storeUrl);

  // Fetch store meta, product listing, and collections in parallel
  const [storeData, listProducts, collections] = await Promise.all([
    fetchStoreMeta(subdomain, page),
    page ? fetchAllProductsViaPage(page, storeId) : fetchAllProducts(storeId),
    fetchCollections(storeId, page)
  ]);

  // DOM fallback: if API returned 0 products, try scraping the rendered HTML
  let effectiveProducts = listProducts;
  if (listProducts.length === 0 && page) {
    const domProducts = await extractProductsFromDOM(page, storeUrl);
    if (domProducts.length > 0) {
      console.warn(`⚠️  DOM fallback found ${domProducts.length} products (data quality may be lower)`);
      // Convert DOM stubs to minimal API-compatible shape
      effectiveProducts = domProducts.map((p, i) => ({
        id: `dom_${i}`,
        name: p.name,
        price: p.price,
        mrp: null,
        productPhotos: p.imgs,
        otherPhotos: [],
        variantOptions: [],
        collectionV2: [],
        availableStock: -1,
        _dom_extracted: true
      }));
    }
  }

  const store_meta = extractStoreMeta(storeData);

  // Fetch product details sequentially with randomized human-like delays
  const products = [];
  for (let i = 0; i < effectiveProducts.length; i++) {
    const apiProduct = effectiveProducts[i];
    const current = i + 1;

    console.log(`⏳ Extracting products... (${current}/${effectiveProducts.length})`);

    if (jobId) {
      await job.updateProgress(
        jobId, current, effectiveProducts.length,
        'extraction',
        `Extracting products (${current}/${effectiveProducts.length})`
      ).catch(() => {});
    }

    let detailData = {};
    if (!apiProduct._dom_extracted) {
      try {
        detailData = await fetchProductDetail(apiProduct.id, page);
      } catch (err) {
        console.warn(`⚠️  Could not fetch detail for product ${apiProduct.id} after retries: ${err.message}`);
      }
    }

    const mapped = mapProduct(apiProduct, detailData, current, subdomain);
    products.push(mapped);

    if (i < effectiveProducts.length - 1) await sleep(randomDelay());
  }

  // Build categories array per SCHEMA.md
  const categories = collections.map(col => ({
    name: col.name,
    url: `https://${subdomain}.dm2buy.com/?collection=${encodeURIComponent(col.name)}`,
    product_count: products.filter(p => p.all_categories.includes(col.name)).length,
    slug: computeSlug(col.name)
  }));

  return {
    store_meta,
    products,
    categories,
    raw_store_data: storeData
  };
}
