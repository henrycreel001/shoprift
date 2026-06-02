/**
 * src/shopify-importer.js — Shopify Admin REST API product/collection importer.
 * Called by the Railway Express server (src/server.js POST /import).
 * Uses Node ≥18 global fetch. No Playwright, no Axios.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const API_VERSION = '2025-01';
const BATCH_SIZE = 5;      // concurrent Shopify API calls per batch
const BATCH_DELAY_MS = 600; // pause between batches — stays under 2 req/s sustained

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

// Create product metadata only — no images. Shopify blocks the response while
// downloading remote image URLs (especially slow on dm2buy CDN). Images are
// attached in a separate pass so product creation completes in ~300ms.
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
      ...(options ? { options } : {}),
      variants,
    },
  };
  const data = await shopifyFetch(shop, accessToken, 'POST', 'products.json', body);
  return data.product;
}

// Attach images to an already-created product. Shopify downloads URLs async.
async function attachImages(shop, accessToken, shopifyProductId, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return;
  const images = imageUrls.slice(0, 20).map(src => ({ src }));
  await shopifyFetch(shop, accessToken, 'PUT', `products/${shopifyProductId}.json`, {
    product: { id: shopifyProductId, images },
  });
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

async function updateProgress(jobId, current, total, message, phase = 'products', extra = {}) {
  await supabase
    .from('import_jobs')
    .update({
      progress: { current, total, phase, message, ...extra },
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/**
 * Imports a full StoreData into a Shopify store.
 * Phase 1: products → Phase 1b: images → Phase 2: collections → Phase 3: assigns.
 * Each item's error is isolated — one failure does not abort the rest.
 * Progress JSONB includes per-phase counters so the frontend can render
 * individual mini progress bars for each phase.
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
  let imagesDone = 0;
  let imagesTotal = 0;
  let assignsDone = 0;
  let assignsTotal = 0;

  // Full progress snapshot included in every updateProgress call so the
  // frontend always has all four phase counters and can derive weighted %.
  function allProgress() {
    return {
      collections_total: categories.length,
      images_total: imagesTotal,
      images_current: imagesDone,
      collections_current: collectionsCreated,
      assigns_total: assignsTotal,
      assigns_current: assignsDone,
    };
  }

  // Phase 1: Create products in concurrent batches (no images — fast ~300ms each).
  await updateProgress(jobId, 0, products.length, `Creating ${products.length} products...`, 'products', allProgress());
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (p) => {
      try {
        const sp = await createProduct(shop, accessToken, p, store_meta.name);
        productIdMap[p.id] = sp.id;
        productsCreated++;
      } catch (err) {
        errors.push(`Product "${p.name}": ${err.message}`);
        productsFailed++;
      }
    }));
    const done = Math.min(i + BATCH_SIZE, products.length);
    await updateProgress(jobId, done, products.length, `Created ${done}/${products.length} products`, 'products', allProgress());
    if (i + BATCH_SIZE < products.length) await delay(BATCH_DELAY_MS);
  }

  // Phase 1b: Attach images in concurrent batches. Separate pass so product
  // creation isn't blocked by image downloads from the dm2buy CDN.
  const imageJobs = products
    .filter(p => productIdMap[p.id] && p.images_cdn?.length > 0)
    .map(p => ({ shopifyId: productIdMap[p.id], urls: p.images_cdn }));
  imagesTotal = imageJobs.length;
  await updateProgress(jobId, products.length, products.length, `Uploading ${imagesTotal} images...`, 'images', allProgress());
  for (let i = 0; i < imageJobs.length; i += BATCH_SIZE) {
    const batch = imageJobs.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(({ shopifyId, urls }) =>
      attachImages(shop, accessToken, shopifyId, urls).catch(err =>
        errors.push(`Images for product ${shopifyId}: ${err.message}`)
      )
    ));
    imagesDone = Math.min(i + BATCH_SIZE, imageJobs.length);
    if (i + BATCH_SIZE < imageJobs.length) {
      await updateProgress(jobId, products.length, products.length, `Uploading images...`, 'images', allProgress());
      await delay(BATCH_DELAY_MS);
    }
  }
  imagesDone = imagesTotal; // mark complete even if last batch had no delay

  // Phase 2: Create collections.
  await updateProgress(jobId, products.length, products.length, `Creating ${categories.length} collections...`, 'collections', allProgress());
  for (const cat of categories) {
    try {
      const sc = await createCollection(shop, accessToken, cat);
      collectionIdMap[cat.name] = sc.id;
      collectionsCreated++;
    } catch (err) {
      errors.push(`Collection "${cat.name}": ${err.message}`);
    }
    await updateProgress(jobId, products.length, products.length, `Created ${collectionsCreated}/${categories.length} collections`, 'collections', allProgress());
    await delay(BATCH_DELAY_MS);
  }

  // Phase 3: Assign products to collections.
  const assigns = [];
  for (const p of products) {
    for (const catName of p.all_categories) {
      const colId = collectionIdMap[catName];
      const prodId = productIdMap[p.id];
      if (colId && prodId) assigns.push({ p, catName, colId, prodId });
    }
  }
  assignsTotal = assigns.length;
  await updateProgress(jobId, products.length, products.length, `Assigning to collections...`, 'assigns', allProgress());
  for (let i = 0; i < assigns.length; i += BATCH_SIZE) {
    const batch = assigns.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(({ p, catName, colId, prodId }) =>
      addToCollection(shop, accessToken, colId, prodId).catch(err =>
        errors.push(`Collect "${p.name}" → "${catName}": ${err.message}`)
      )
    ));
    assignsDone = Math.min(i + BATCH_SIZE, assigns.length);
    if (i + BATCH_SIZE < assigns.length) {
      await updateProgress(jobId, products.length, products.length, `Assigning to collections...`, 'assigns', allProgress());
      await delay(BATCH_DELAY_MS);
    }
  }

  return { productsCreated, productsFailed, collectionsCreated, errors };
}
