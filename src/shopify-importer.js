/**
 * src/shopify-importer.js — Shopify Admin REST API product/collection importer.
 * Called by the Railway Express server (src/server.js POST /import).
 * Uses Node ≥18 global fetch. No Playwright, no Axios.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const API_VERSION = '2024-04';
const RATE_DELAY_MS = 550; // 2 req/s Shopify REST limit; 550ms gives headroom

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Authenticated Shopify Admin REST call with 429 backoff.
 * @param {string} shop — e.g. "shoprift-dev.myshopify.com"
 * @param {string} accessToken
 * @param {string} method
 * @param {string} path — e.g. "products.json"
 * @param {object} [body]
 * @param {number} [retries=3]
 * @returns {Promise<object>}
 */
async function shopifyFetch(shop, accessToken, method, path, body, retries = 3) {
  const url = `https://${shop}/admin/api/${API_VERSION}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 429 && retries > 0) {
    const retryAfterSec = parseFloat(res.headers.get('retry-after') ?? '2');
    await delay(Math.ceil(retryAfterSec * 1000));
    return shopifyFetch(shop, accessToken, method, path, body, retries - 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Shopify ${method} /${path} → ${res.status}: ${text.slice(0, 200)}`);
    if (res.status === 401 || res.status === 403) err.permanent = true;
    throw err;
  }

  return res.json();
}

/**
 * Maps extracted variants to Shopify options + variants arrays.
 * @param {{ sizes: string[], colors: string[], other: string[] }} variants
 * @param {number} price
 * @param {number|null} originalPrice
 * @returns {{ options: object[]|null, variants: object[] }}
 */
function buildShopifyVariants(variants, price, originalPrice) {
  const { sizes, colors, other } = variants;
  const priceStr = price.toFixed(2);
  const cmp = originalPrice && originalPrice > price ? originalPrice.toFixed(2) : null;
  const base = {
    price: priceStr,
    ...(cmp ? { compare_at_price: cmp } : {}),
    inventory_management: null,
  };

  if (!sizes.length && !colors.length && !other.length) {
    return { options: null, variants: [base] };
  }
  if (sizes.length && !colors.length) {
    return { options: [{ name: 'Size' }], variants: sizes.map(s => ({ ...base, option1: s })) };
  }
  if (colors.length && !sizes.length) {
    return { options: [{ name: 'Color' }], variants: colors.map(c => ({ ...base, option1: c })) };
  }
  if (sizes.length && colors.length) {
    const combos = [];
    for (const s of sizes) {
      for (const c of colors) combos.push({ ...base, option1: s, option2: c });
    }
    return { options: [{ name: 'Size' }, { name: 'Color' }], variants: combos };
  }
  // other only
  return { options: [{ name: 'Option' }], variants: other.map(o => ({ ...base, option1: o })) };
}

async function createProduct(shop, accessToken, product, storeName) {
  const { options, variants } = buildShopifyVariants(
    product.variants,
    product.price,
    product.original_price,
  );
  const body = {
    product: {
      title: product.name,
      body_html: product.description ? `<p>${product.description}</p>` : '',
      vendor: storeName,
      status: 'active',
      images: product.images_cdn.slice(0, 20).map(src => ({ src })),
      ...(options ? { options } : {}),
      variants,
    },
  };
  const data = await shopifyFetch(shop, accessToken, 'POST', 'products.json', body);
  return data.product;
}

async function createCollection(shop, accessToken, category) {
  const data = await shopifyFetch(shop, accessToken, 'POST', 'custom_collections.json', {
    custom_collection: { title: category.name },
  });
  return data.custom_collection;
}

async function addToCollection(shop, accessToken, collectionId, productId) {
  await shopifyFetch(shop, accessToken, 'POST', 'collects.json', {
    collect: { product_id: productId, collection_id: collectionId },
  });
}

async function updateProgress(jobId, current, total, message) {
  await supabase
    .from('import_jobs')
    .update({
      progress: { current, total, phase: 'importing', message },
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/**
 * Imports a full StoreData into a Shopify store.
 * Phase 1: products → Phase 2: collections → Phase 3: collection assignments.
 * Each item's error is isolated — one failure does not abort the rest.
 * Updates import_jobs.progress after each step.
 *
 * @param {object} p
 * @param {string} p.jobId
 * @param {string} p.shop — e.g. "shoprift-dev.myshopify.com"
 * @param {string} p.accessToken — from shopify_sessions
 * @param {object} p.storeData — StoreData per SCHEMA.md
 * @returns {Promise<{ productsCreated: number, productsFailed: number, collectionsCreated: number, errors: string[] }>}
 */
export async function importStore({ jobId, shop, accessToken, storeData, skipUrls = [] }) {
  const { products: allProducts, categories, store_meta } = storeData;
  const products = skipUrls.length > 0
    ? allProducts.filter(p => !skipUrls.includes(p.product_url))
    : allProducts;
  const errors = [];
  const productIdMap = {}; // our product.id → Shopify product id
  const collectionIdMap = {}; // category.name → Shopify collection id
  let productsCreated = 0;
  let productsFailed = 0;
  let collectionsCreated = 0;

  const totalSteps = products.length + categories.length;

  // Phase 1: Create products
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    await updateProgress(jobId, i + 1, totalSteps, `Creating product ${i + 1}/${products.length}: ${p.name}`);
    await delay(RATE_DELAY_MS);
    try {
      const sp = await createProduct(shop, accessToken, p, store_meta.name);
      productIdMap[p.id] = sp.id;
      productsCreated++;
    } catch (err) {
      errors.push(`Product "${p.name}": ${err.message}`);
      productsFailed++;
    }
  }

  // Phase 2: Create collections
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    await updateProgress(
      jobId,
      products.length + i + 1,
      totalSteps,
      `Creating collection ${i + 1}/${categories.length}: ${cat.name}`,
    );
    await delay(RATE_DELAY_MS);
    try {
      const sc = await createCollection(shop, accessToken, cat);
      collectionIdMap[cat.name] = sc.id;
      collectionsCreated++;
    } catch (err) {
      errors.push(`Collection "${cat.name}": ${err.message}`);
    }
  }

  // Phase 3: Assign products to collections
  for (const p of products) {
    for (const catName of p.all_categories) {
      const colId = collectionIdMap[catName];
      const prodId = productIdMap[p.id];
      if (!colId || !prodId) continue;
      await delay(RATE_DELAY_MS);
      try {
        await addToCollection(shop, accessToken, colId, prodId);
      } catch (err) {
        errors.push(`Collect "${p.name}" → "${catName}": ${err.message}`);
      }
    }
  }

  return { productsCreated, productsFailed, collectionsCreated, errors };
}
