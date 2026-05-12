/**
 * src/extractor.js — Phase 3: Full store extraction via dm2buy API.
 * No DOM scraping — all data comes from dm2buy's REST API.
 * 800ms delay between product detail fetches to avoid rate limiting.
 */

import axios from 'axios';
import { computeDiscount, computeSlug, sleep } from './utils.js';
import * as job from './job.js';

const DM2BUY_API = 'https://api.dm2buy.com';
const NAV_DELAY_MS = parseInt(process.env.NAV_DELAY_MS || '800', 10);

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
  const name = apiProduct.name || detailData.name;
  const price = apiProduct.price;
  const originalPrice = apiProduct.mrp || null;
  const description = detailData.description || null;
  const images = [
    ...(apiProduct.productPhotos || []),
    ...(apiProduct.otherPhotos || [])
  ];
  const category = apiProduct.collectionV2?.[0]?.name || null;
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
 * @returns {Promise<object>}
 */
async function fetchStoreMeta(subdomain) {
  const res = await axios.get(
    `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
    { params: { select: 'internationalPayment,proplan,legalInfo' } }
  );
  return res.data.data;
}

/**
 * Fetches all products from the listing API (handles pagination).
 * @param {string} storeId
 * @returns {Promise<object[]>}
 */
async function fetchAllProducts(storeId) {
  const products = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const res = await axios.get(
      `${DM2BUY_API}/v3/product/store/${storeId}/collectionv2`,
      { params: { page, limit, source: 'web' } }
    );
    const docs = res.data?.data?.docs || [];
    products.push(...docs);
    if (docs.length < limit) break;
    page++;
  }

  return products;
}

/**
 * Fetches all collections from dm2buy API.
 * @param {string} storeId
 * @returns {Promise<object[]>}
 */
async function fetchCollections(storeId) {
  const res = await axios.get(`${DM2BUY_API}/v3/collection/store/${storeId}`);
  return res.data?.collections || [];
}

/**
 * Fetches detail for a single product (description, etc.).
 * @param {string} productId
 * @returns {Promise<object>}
 */
async function fetchProductDetail(productId) {
  const res = await axios.get(`${DM2BUY_API}/v3/product/${productId}`);
  return res.data?.data || {};
}

/**
 * Main extraction orchestrator. Runs Phase 3 for a dm2buy store.
 * Updates Supabase job progress after each product.
 * @param {string} storeUrl
 * @param {string} storeId — from recon_data
 * @param {string} jobId — Supabase job id (or null if tracking unavailable)
 * @returns {Promise<object>} raw_store_data
 */
export async function extract(storeUrl, storeId, jobId) {
  const subdomain = new URL(storeUrl).hostname.split('.')[0];

  // Fetch store meta, product listing, and collections in parallel
  const [storeData, listProducts, collections] = await Promise.all([
    fetchStoreMeta(subdomain),
    fetchAllProducts(storeId),
    fetchCollections(storeId)
  ]);

  const store_meta = extractStoreMeta(storeData);

  // Fetch product details sequentially with 800ms delay
  const products = [];
  for (let i = 0; i < listProducts.length; i++) {
    const apiProduct = listProducts[i];
    const current = i + 1;

    console.log(`⏳ Extracting products... (${current}/${listProducts.length})`);

    if (jobId) {
      await job.updateProgress(
        jobId, current, listProducts.length,
        'extraction',
        `Extracting products (${current}/${listProducts.length})`
      ).catch(() => {});
    }

    let detailData = {};
    try {
      detailData = await fetchProductDetail(apiProduct.id);
    } catch (err) {
      console.warn(`⚠️  Could not fetch detail for product ${apiProduct.id}: ${err.message}`);
    }

    const mapped = mapProduct(apiProduct, detailData, current, subdomain);
    products.push(mapped);

    if (i < listProducts.length - 1) await sleep(NAV_DELAY_MS);
  }

  // Build categories array per SCHEMA.md
  const categories = collections.map(col => ({
    name: col.name,
    url: `https://${subdomain}.dm2buy.com/?collection=${encodeURIComponent(col.name)}`,
    product_count: products.filter(p => p.category === col.name).length,
    slug: computeSlug(col.name)
  }));

  return {
    store_meta,
    products,
    categories,
    raw_store_data: storeData
  };
}
