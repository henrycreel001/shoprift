/**
 * src/recon.js — Phase 1: Fast store scan.
 * When a Playwright page is provided, API calls route through Chromium's TLS
 * stack (pageGet) after a storefront pre-visit. Falls back to Axios if no page.
 * Returns recon_data per SCHEMA.md in ~3-5 seconds.
 */

import axios from 'axios';
import { estimateTime, withRetry } from './utils.js';
import { httpsAgent, fetchAllProducts, pageGet } from './api.js';
import { visitStorefront } from './browser.js';

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
 * Fetches all collections for a store.
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
 * Fetches store metadata (name, instagram, shipping, etc.).
 * @param {string} subdomain
 * @param {import('playwright').Page|null} page
 * @returns {Promise<object>}
 */
async function fetchStoreMeta(subdomain, page) {
  const params = { select: 'internationalPayment,proplan,legalInfo' };
  if (page) {
    return withRetry(async () => {
      const data = await pageGet(page, `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`, params);
      if (!data?.success) throw new Error(`[recon] Store not found for subdomain: ${subdomain}`);
      return data.data;
    });
  }
  return withRetry(() =>
    axios.get(
      `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
      { params, httpsAgent }
    ).then(res => {
      if (!res.data?.success) throw new Error(`[recon] Store not found for subdomain: ${subdomain}`);
      return res.data.data;
    })
  );
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
 * When page is provided: visits storefront first (builds real session) then
 * routes API calls through Chromium fetch for TLS fingerprint hiding.
 * @param {string} storeUrl — full dm2buy store URL
 * @param {import('playwright').Page|null} [page] — Playwright page (optional)
 * @returns {Promise<object>} recon_data
 */
export async function recon(storeUrl, page = null) {
  const subdomain = extractSubdomain(storeUrl);

  // Visit storefront first to build real session cookies + referrer history
  if (page) await visitStorefront(page, storeUrl);

  const storeMeta = await fetchStoreMeta(subdomain, page);
  const storeId = storeMeta.id;

  const [products, collections] = await Promise.all([
    page
      ? withRetry(async () => {
          const data = await pageGet(page, `https://api.dm2buy.com/v3/product/store/${storeId}/collectionv2`, { page: 1, limit: 50, source: 'web' });
          return data?.data?.docs || [];
        })
      : fetchAllProducts(storeId),
    fetchCollections(storeId, page)
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
