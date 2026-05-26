/**
 * src/server.js — Express HTTP server exposing engine endpoints to the web app.
 * Called by the Railway worker process alongside the BullMQ worker.
 *
 * Routes:
 *   POST /recon   — run recon, create Supabase job, return summary
 *   POST /enqueue — enqueue extraction job after payment verified
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { recon } from './recon.js';
import { launchBrowser, getPage, closeBrowser } from './browser.js';
import * as job from './job.js';
import { importStore } from './shopify-importer.js';
// queue.js imported dynamically inside POST /enqueue — avoids Redis connection at startup

const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json({ limit: '5mb' }));

/**
 * POST /recon
 * Body: { storeUrl: string, userId?: string }
 * Returns: { jobId, storeName, storeUrl, productCount, imageCount, collectionCount }
 */
app.post('/recon', async (req, res) => {
  const { storeUrl, userId } = req.body ?? {};

  if (!storeUrl || typeof storeUrl !== 'string') {
    return res.status(400).json({ error: 'storeUrl is required.' });
  }
  if (!storeUrl.includes('dm2buy.com')) {
    return res.status(400).json({ error: 'URL must be a dm2buy.com store.' });
  }

  const accountId = userId ?? randomUUID();
  let browser = null;
  let jobId = null;

  try {
    jobId = await job.createJob(accountId, storeUrl);

    browser = await launchBrowser();
    const page = await getPage(browser);

    const reconData = await recon(storeUrl, page);
    await job.updateReconData(jobId, reconData).catch(() => {});

    return res.json({
      jobId,
      storeName: reconData.store_name,
      storeUrl,
      productCount: reconData.product_count,
      imageCount: reconData.image_count,
      collectionCount: reconData.collection_count,
    });
  } catch (err) {
    console.error(JSON.stringify({ phase: 'recon', storeUrl, error: err.message }));
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    return res.status(502).json({ error: err.message });
  } finally {
    if (browser) await closeBrowser(browser).catch(() => {});
  }
});

/**
 * POST /enqueue
 * Body: { jobId: string, storeUrl: string, userId: string, format?: string }
 * Returns: { queued: true }
 */
app.post('/enqueue', async (req, res) => {
  const { jobId, storeUrl, userId, format = 'shopify' } = req.body ?? {};

  if (!jobId || !storeUrl || !userId) {
    return res.status(400).json({ error: 'jobId, storeUrl, and userId are required.' });
  }

  try {
    const { enqueueExtraction } = await import('./queue.js');
    await enqueueExtraction({ jobId, storeUrl, userId, format });
    return res.json({ queued: true });
  } catch (err) {
    console.error(JSON.stringify({ phase: 'enqueue', jobId, error: err.message }));
    const status = err.message.includes('Queue full') ? 503 : 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * POST /import
 * Body: { jobId: string, shop: string, storeData: object }
 * Looks up the Shopify session for the shop, then imports all products + collections
 * asynchronously (setImmediate). Returns 200 immediately after queuing.
 */
app.post('/import', async (req, res) => {
  const { jobId, shop, storeData, skipUrls } = req.body ?? {};

  if (!jobId || !shop || !storeData) {
    return res.status(400).json({ error: 'jobId, shop, and storeData are required.' });
  }

  const accessToken = await job.getShopifyToken(shop).catch(() => null);
  if (!accessToken) {
    return res.status(401).json({ error: `No active Shopify session for shop: ${shop}` });
  }

  await job.updateStatus(jobId, 'importing').catch(() => {});

  setImmediate(async () => {
    try {
      const result = await importStore({ jobId, shop, accessToken, storeData, skipUrls: skipUrls ?? [] });
      // is_trial + trial_product_urls are top-level columns set at INSERT — never overwritten here.
      // updateReconData BEFORE updateStatus to avoid race condition on poll.
      await job.updateReconData(jobId, result).catch(() => {});
      await job.updateStatus(jobId, 'complete').catch(() => {});
    } catch (err) {
      console.error(JSON.stringify({ phase: 'shopify-import', jobId, shop, error: err.message }));
      await job.failJob(jobId, err.message).catch(() => {});
    }
  });

  return res.json({ queued: true });
});

/**
 * POST /verify/check
 * Body: { storeUrl: string, code: string }
 * One-shot check: fetches dm2buy public API to see if any product name contains code.
 * Returns { verified: boolean }. Client retries on false.
 */
app.post('/verify/check', async (req, res) => {
  const { storeUrl, code } = req.body ?? {};
  if (!storeUrl || !code) {
    return res.status(400).json({ error: 'storeUrl and code required.' });
  }
  try {
    const subdomain = new URL(storeUrl).hostname.split('.')[0];
    const storeRes = await fetch(
      `https://api.dm2buy.com/v4/store/get-by-subdomain/${subdomain}?select=internationalPayment`,
    );
    const storeData = await storeRes.json();
    const storeId = storeData?.data?.id;
    if (!storeId) return res.status(404).json({ error: 'Store not found.', verified: false });

    const productsRes = await fetch(
      `https://api.dm2buy.com/v3/product/store/${storeId}/collectionv2?page=1&limit=50&source=web`,
    );
    const productsData = await productsRes.json();
    const products = productsData?.data?.docs ?? [];
    const found = products.some((p) => (p.name ?? '').includes(code));
    return res.json({ verified: found });
  } catch (err) {
    return res.status(502).json({ error: err.message, verified: false });
  }
});

/**
 * Starts the HTTP server. Called from worker.js alongside the BullMQ worker.
 * @returns {import('http').Server}
 */
export function startServer() {
  return app.listen(PORT, () => {
    console.log(`🌐 Shoprift HTTP server listening on port ${PORT}`);
  });
}
