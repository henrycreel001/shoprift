/**
 * src/queue.js — BullMQ job queue for web app extraction jobs.
 * Concurrency 1 — one extraction at a time to protect Railway IP.
 * Cap 50 pending jobs — beyond that, return "Queue full" to users.
 * Redis connection via REDIS_URL env var.
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

import { recon } from './recon.js';
import { extract } from './extractor.js';
import { downloadAllImages } from './downloader.js';
import { format, writeStoreData, generateMigrationReport } from './formatter.js';
import { validate } from './validator.js';
import { mapToCsv } from './csv-mapper.js';
import { createDeliveryZip } from './zipper.js';
import { launchBrowser, getPage, closeBrowser } from './browser.js';
import * as job from './job.js';

const QUEUE_NAME = 'shoprift-jobs';
const MAX_PENDING = 50;
const OUTPUT_ROOT = process.env.OUTPUT_DIR || '/tmp/shoprift-output';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key required for storage uploads
);

/**
 * Creates a shared Redis connection from REDIS_URL.
 * maxRetriesPerRequest: null required by BullMQ.
 * @returns {IORedis}
 */
export function createRedisConnection() {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });
}

const connection = createRedisConnection();

/**
 * The BullMQ queue. Used by the web app API routes to add jobs.
 */
export const extractionQueue = new Queue(QUEUE_NAME, { connection });

/**
 * Returns true if the queue has too many waiting jobs to accept a new one.
 * @returns {Promise<boolean>}
 */
export async function isQueueFull() {
  const waiting = await extractionQueue.getWaitingCount();
  return waiting >= MAX_PENDING;
}

/**
 * Enqueues a new extraction job.
 * @param {object} payload — { jobId, storeUrl, userId, format }
 * @returns {Promise<import('bullmq').Job>}
 */
export async function enqueueExtraction(payload) {
  if (await isQueueFull()) {
    throw new Error('Queue full — try again in 30 minutes.');
  }
  return extractionQueue.add('extract', payload, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 }
  });
}

/**
 * Uploads the delivery zip to Supabase Storage.
 * Path: {userId}/{jobId}/delivery.zip
 * @param {string} userId
 * @param {string} jobId
 * @param {string} zipPath — local file path
 * @returns {Promise<string>} storage path
 */
async function uploadToStorage(userId, jobId, zipPath) {
  const { createReadStream } = await import('fs');
  const storagePath = `${userId}/${jobId}/delivery.zip`;
  const stream = createReadStream(zipPath);

  const { error } = await supabase.storage
    .from('migration-outputs')
    .upload(storagePath, stream, {
      contentType: 'application/zip',
      upsert: true
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storagePath;
}

/**
 * Records the download entry in Supabase after upload.
 * @param {string} jobId
 * @param {string} userId
 * @param {string} storagePath
 */
async function recordDownload(jobId, userId, storagePath) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('downloads')
    .insert({ job_id: jobId, user_id: userId, storage_path: storagePath, expires_at: expiresAt });

  if (error) throw new Error(`Failed to record download: ${error.message}`);
}

/**
 * BullMQ worker — processes extraction jobs one at a time (concurrency 1).
 * Full pipeline: recon → extract → download → format → validate → CSV → zip → upload → record.
 */
export const extractionWorker = new Worker(
  QUEUE_NAME,
  async (bullJob) => {
    const { jobId, storeUrl, userId, format: formatArg = 'shopify' } = bullJob.data;

    let browser = null;
    let page = null;
    const fs = (await import('fs')).default;
    const path = (await import('path')).default;

    try {
      // Launch browser for TLS fingerprint hiding
      browser = await launchBrowser();
      page = await getPage(browser);

      // Phase 1: Recon
      await job.updateStatus(jobId, 'recon');
      const reconData = await recon(storeUrl, page);
      await job.updateReconData(jobId, reconData).catch(() => {});

      // Phase 3: Extract
      await job.updateStatus(jobId, 'extracting');
      const rawData = await extract(storeUrl, reconData.store_id, jobId, page);

      // Close browser before download phase (not needed for image download)
      await closeBrowser(browser);
      browser = null;
      page = null;

      // Phase 4a: Download images
      await job.updateStatus(jobId, 'downloading');
      const imageDir = path.join(OUTPUT_ROOT, jobId, 'images');
      fs.mkdirSync(imageDir, { recursive: true });
      const manifest = await downloadAllImages(rawData.products, jobId, imageDir);

      // Phase 4b: Format + Validate + Write JSON
      const jobMeta = { jobId, accountId: userId, startTime: Date.now(), verificationMethod: 'consent_v1' };
      const folderPath = path.join(OUTPUT_ROOT, jobId);
      const formatted = format(rawData, manifest, reconData, jobMeta);
      const validated = validate(formatted);
      writeStoreData(validated, folderPath);

      // Phase 4c: CSV
      const csvResult = await mapToCsv(validated, formatArg, { autoApprove: true });
      fs.writeFileSync(path.join(folderPath, 'store_data.csv'), csvResult.csv, 'utf8');

      // Phase 4d: Zip
      const jobMetadata = {
        job_id: jobId, store_url: storeUrl, store_name: validated.store_meta.name,
        products_count: validated.products.length, images_count: manifest.succeeded.length,
        csv_format: formatArg, status: 'extracted'
      };
      generateMigrationReport(validated, folderPath, {
        unmappedColumns: csvResult.unmappedColumns,
        noSourceColumns: csvResult.noSourceColumns,
        formatName: csvResult.formatName,
        rowCount: csvResult.rowCount
      });
      const { zipPath } = await createDeliveryZip(folderPath, jobMetadata, validated);

      // Phase 5: Upload to Supabase Storage
      const storagePath = await uploadToStorage(userId, jobId, zipPath);
      await recordDownload(jobId, userId, storagePath);

      // Mark complete
      await job.completeJob(jobId);

      // Cleanup local files
      fs.rmSync(folderPath, { recursive: true, force: true });

      return { storagePath };

    } catch (err) {
      await job.failJob(jobId, err.message).catch(() => {});
      throw err;
    } finally {
      if (browser) await closeBrowser(browser).catch(() => {});
    }
  },
  { connection, concurrency: 1 }
);

extractionWorker.on('completed', (bullJob) => {
  console.log(`✅ Job ${bullJob.id} completed — Supabase path: ${bullJob.returnvalue?.storagePath}`);
});

extractionWorker.on('failed', (bullJob, err) => {
  console.error(`❌ Job ${bullJob?.id} failed: ${err.message}`);
});
