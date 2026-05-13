/**
 * scripts/recon-only.js — Standalone Phase 1 recon.
 *
 * Designed to run anywhere Node.js runs, with ZERO npm install required.
 * Uses only Node stdlib (https) — no axios, no Playwright, no .env.
 *
 * Use case: pulling client metrics (product / collection / image counts)
 * from a low-power environment like iSH on iOS, or any quick cloud shell,
 * when the full engine isn't installable.
 *
 * Usage:
 *   node scripts/recon-only.js https://anvii.dm2buy.com/
 *   node scripts/recon-only.js anvii          # subdomain shorthand also works
 */

import https from 'https';
import { URL } from 'url';

const DM2BUY_API_HOST = 'api.dm2buy.com';

function getJson(pathWithQuery) {
  const options = {
    host: DM2BUY_API_HOST,
    path: pathWithQuery,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Origin': 'https://dm2buy.com',
      'Referer': 'https://dm2buy.com/'
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} on ${pathWithQuery}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Invalid JSON from ${pathWithQuery}: ${err.message}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function extractSubdomain(input) {
  if (!input) throw new Error('Missing store URL or subdomain.');
  if (!input.includes('.') && !input.includes('/')) return input.trim();
  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    if (!url.hostname.endsWith('.dm2buy.com')) {
      throw new Error(`Not a dm2buy URL: ${input}`);
    }
    return url.hostname.split('.')[0];
  } catch (err) {
    throw new Error(`Invalid URL "${input}": ${err.message}`);
  }
}

async function fetchStoreMeta(subdomain) {
  const data = await getJson(
    `/v4/store/get-by-subdomain/${encodeURIComponent(subdomain)}` +
    `?select=internationalPayment,proplan,legalInfo`
  );
  if (!data?.success) {
    throw new Error(`Store not found for subdomain: ${subdomain}`);
  }
  return data.data;
}

async function fetchAllProducts(storeId) {
  const products = [];
  let page = 1;
  const limit = 50;
  while (true) {
    const res = await getJson(
      `/v3/product/store/${encodeURIComponent(storeId)}/collectionv2` +
      `?page=${page}&limit=${limit}&source=web`
    );
    const docs = res?.data?.docs || [];
    products.push(...docs);
    if (docs.length < limit) break;
    page++;
  }
  return products;
}

async function fetchCollections(storeId) {
  const res = await getJson(`/v3/collection/store/${encodeURIComponent(storeId)}`);
  return res?.collections || [];
}

function countImages(products) {
  const urls = new Set();
  for (const p of products) {
    for (const url of (p.productPhotos || [])) urls.add(url);
    for (const url of (p.otherPhotos || [])) urls.add(url);
  }
  return urls.size;
}

function countMissingDescriptions(products) {
  return products.filter(p => {
    const d = (p.description || '').trim();
    return d.length === 0;
  }).length;
}

function countOutOfStock(products) {
  return products.filter(p => p.outOfStock === true || p.inStock === false).length;
}

function priceRange(products) {
  const prices = products
    .map(p => Number(p.price))
    .filter(n => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return { min: null, max: null };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function estimateImportLabel(productCount, imageCount) {
  const seconds = (productCount * 8) + (imageCount * 2);
  if (seconds < 60) return `About ${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `About ${minutes} minute${minutes > 1 ? 's' : ''}`;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/recon-only.js <dm2buy-store-url-or-subdomain>');
    console.error('Example: node scripts/recon-only.js https://anvii.dm2buy.com/');
    process.exit(1);
  }

  const subdomain = extractSubdomain(arg);
  console.log(`Recon → ${subdomain}.dm2buy.com`);

  const storeMeta = await fetchStoreMeta(subdomain);
  const storeId = storeMeta.id;

  const [products, collections] = await Promise.all([
    fetchAllProducts(storeId),
    fetchCollections(storeId)
  ]);

  const imageCount = countImages(products);
  const missingDesc = countMissingDescriptions(products);
  const outOfStock = countOutOfStock(products);
  const { min, max } = priceRange(products);

  const summary = {
    store_name: storeMeta.storeName || 'Unknown Store',
    subdomain,
    store_url: `https://${subdomain}.dm2buy.com`,
    store_id: storeId,
    instagram_handle: storeMeta.instagramHandle || null,
    product_count: products.length,
    collection_count: collections.length,
    image_count: imageCount,
    products_missing_description: missingDesc,
    products_out_of_stock: outOfStock,
    price_range_inr: { min, max },
    estimated_import_label: estimateImportLabel(products.length, imageCount),
    recon_timestamp: new Date().toISOString()
  };

  console.log('');
  console.log('============= RECON RESULT =============');
  console.log(JSON.stringify(summary, null, 2));
  console.log('========================================');
  console.log('');
  console.log(`Store:        ${summary.store_name}`);
  console.log(`Instagram:    @${summary.instagram_handle || 'not found'}`);
  console.log(`Products:     ${summary.product_count}`);
  console.log(`Collections:  ${summary.collection_count}`);
  console.log(`Images:       ${summary.image_count}`);
  console.log(`Missing desc: ${summary.products_missing_description}`);
  console.log(`Out of stock: ${summary.products_out_of_stock}`);
  if (min !== null) console.log(`Price range:  ₹${min} – ₹${max}`);
  console.log(`Est. import:  ${summary.estimated_import_label}`);
}

main().catch(err => {
  console.error('');
  console.error('Recon failed:', err.message);
  process.exit(1);
});
