/**
 * src/api.js — Shared dm2buy API utilities.
 * Single source of truth for httpsAgent and fetchAllProducts.
 * Imported by recon.js and extractor.js.
 */

import axios from 'axios';
import https from 'https';
import { withRetry } from './utils.js';

const DM2BUY_API = 'https://api.dm2buy.com';

// dm2buy API cert is expired — bypass TLS verification
export const httpsAgent = new https.Agent({ rejectUnauthorized: false });

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
