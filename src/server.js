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
import { enqueueExtraction } from './queue.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json());

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
    await enqueueExtraction({ jobId, storeUrl, userId, format });
    return res.json({ queued: true });
  } catch (err) {
    console.error(JSON.stringify({ phase: 'enqueue', jobId, error: err.message }));
    const status = err.message.includes('Queue full') ? 503 : 500;
    return res.status(status).json({ error: err.message });
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
