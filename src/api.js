/**
 * src/api.js — Shared dm2buy API utilities.
 * Two fetch strategies:
 *   1. pageGet(page, url, params) — routes through Chromium's TLS stack via
 *      page.evaluate(fetch). Requests are indistinguishable from a real browser.
 *      Use this when a Playwright page is available (preferred).
 *   2. Axios with httpsAgent — server-side fallback when no page is available.
 */

import axios from 'axios';
import https from 'https';
import { withRetry } from './utils.js';

const DM2BUY_API = 'https://api.dm2buy.com';

// Axios fallback: dm2buy API cert is expired — bypass TLS verification
export const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Makes a GET request through the Playwright page's fetch (Chromium TLS stack).
 * The request originates from the browser context, so TLS fingerprint and
 * headers match a real Chrome browser. Page must already be on the store domain
 * so fetch has the correct CORS origin.
 * @param {import('playwright').Page} page
 * @param {string} url — full API URL
 * @param {object|null} params — query params object
 * @returns {Promise<any>} parsed JSON response
 */
export async function pageGet(page, url, params = null) {
  const fullUrl = params
    ? `${url}?${new URLSearchParams(params)}`
    : url;

  const result = await page.evaluate(async (fetchUrl) => {
    try {
      const res = await fetch(fetchUrl, {
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });
      if (!res.ok) return { ok: false, status: res.status, data: null };
      const data = await res.json();
      return { ok: true, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: null, message: err.message };
    }
  }, fullUrl);

  if (!result.ok) {
    const detail = result.message || `HTTP ${result.status}`;
    throw new Error(`pageGet ${fullUrl} — ${detail}`);
  }
  return result.data;
}

/**
 * Fetches all products across paginated API responses.
 * Each page fetch is wrapped in withRetry for transient failure resilience.
 * @param {string} storeId
 * @returns {Promise<object[]>}
 */
export async function fetchAllProducts(storeId) {
  const products = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const docs = await withRetry(() =>
      axios.get(
        `${DM2BUY_API}/v3/product/store/${storeId}/collectionv2`,
        { params: { page, limit, source: 'web' }, httpsAgent }
      ).then(res => res.data?.data?.docs || [])
    );

    products.push(...docs);
    if (docs.length < limit) break;
    page++;
  }

  return products;
}
