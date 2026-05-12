/**
 * src/recon.js — Phase 1: Fast store scan.
 * Uses dm2buy REST API directly via Axios — no DOM scraping needed for recon.
 * Returns recon_data per SCHEMA.md in ~2-3 seconds.
 */

import axios from 'axios';
import { estimateTime } from './utils.js';

const DM2BUY_API = 'https://api.dm2buy.com';

/**
 * Extracts subdomain from a dm2buy store URL.
 * "https://kiwiishop.dm2buy.com" → "kiwiishop"
 * @param {string} storeUrl
 * @returns {string}
 */
function extractSubdomain(storeUrl) {
  const { hostname } = new URL(storeUrl);
  return hostname.split('.')[0];
}

/**
 * Fetches all products across paginated API responses.
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
 * Fetches all collections for a store.
 * @param {string} storeId
 * @returns {Promise<object[]>}
 */
async function fetchCollections(storeId) {
  const res = await axios.get(`${DM2BUY_API}/v3/collection/store/${storeId}`);
  return res.data?.collections || [];
}

/**
 * Fetches store metadata (name, instagram, shipping, etc.).
 * @param {string} subdomain
 * @returns {Promise<object>}
 */
async function fetchStoreMeta(subdomain) {
  const res = await axios.get(
    `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
    { params: { select: 'internationalPayment,proplan,legalInfo' } }
  );
  if (!res.data?.success) {
    throw new Error(`[recon] Store not found for subdomain: ${subdomain}`);
  }
  return res.data.data;
}

/**
 * Counts unique image URLs across all products.
 * @param {object[]} products
 * @returns {number}
 */
function countImages(products) {
  const urls = new Set();
  for (const p of products) {
    for (const url of (p.productPhotos || [])) urls.add(url);
    for (const url of (p.otherPhotos || [])) urls.add(url);
  }
  return urls.size;
}

/**
 * Runs Phase 1 recon against a dm2buy store.
 * Returns recon_data per SCHEMA.md. Fast — no browser required.
 * @param {string} storeUrl — full dm2buy store URL
 * @returns {Promise<object>} recon_data
 */
export async function recon(storeUrl) {
  const subdomain = extractSubdomain(storeUrl);
  const storeMeta = await fetchStoreMeta(subdomain);
  const storeId = storeMeta.id;

  const [products, collections] = await Promise.all([
    fetchAllProducts(storeId),
    fetchCollections(storeId)
  ]);

  const imageCount = countImages(products);
  const { seconds, label } = estimateTime(products.length, imageCount);

  return {
    store_name: storeMeta.storeName || 'Unknown Store',
    store_url: storeUrl,
    store_id: storeId,
    subdomain,
    instagram_handle: storeMeta.instagramHandle || null,
    product_count: products.length,
    collection_count: collections.length,
    image_count: imageCount,
    estimated_import_seconds: seconds,
    estimated_import_label: label,
    recon_timestamp: new Date().toISOString()
  };
}
