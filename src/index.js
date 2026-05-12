/**
 * src/index.js — CLI entry point.
 * Usage: node src/index.js <dm2buy-store-url> [account-id]
 * Example: node src/index.js https://kiwiishop.dm2buy.com user_123
 */

import 'dotenv/config';
import readline from 'readline';
import fs from 'fs';
import { isDm2buyUrl } from './utils.js';
import * as job from './job.js';
import { recon } from './recon.js';
import { extract } from './extractor.js';
import { downloadAllImages } from './downloader.js';
import { format, writeStoreData, generateMigrationReport } from './formatter.js';
import { validate } from './validator.js';

/** Prompts the user for a yes/no answer. Returns true if yes. */
async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/** Ensures output directories exist. Exits if not writable. */
function ensureOutputDirectories() {
  const dirs = [process.env.OUTPUT_DIR || './output', process.env.IMAGE_DIR || './output/images'];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(`❌ Cannot create output directory: ${dir}`);
      console.error(`   Error: ${err.message}`);
      process.exit(1);
    }
  }
}

async function main() {
  const storeUrl = process.argv[2];
  const accountId = process.argv[3] || 'default';
  const startTime = Date.now();

  ensureOutputDirectories();

  // --- Validate URL ---
  if (!storeUrl || !isDm2buyUrl(storeUrl)) {
    console.error('❌ Invalid URL. Shoprift only works with dm2buy stores.');
    console.error('   Expected format: https://yourstore.dm2buy.com');
    console.error('   Usage: node src/index.js https://yourstore.dm2buy.com [account-id]');
    process.exit(1);
  }

  // --- Check for active job ---
  const activeJob = await job.getActiveJob(accountId).catch(() => null);
  if (activeJob) {
    console.error('❌ You already have an import in progress.');
    console.error(`   Status: ${activeJob.status}`);
    console.error(`   Store: ${activeJob.store_url}`);
    console.error('   Check back when it completes before starting a new import.');
    process.exit(1);
  }

  console.log('');
  console.log('🔍 Shoprift starting...');
  console.log(`   Store: ${storeUrl}`);

  // --- Phase 1: Recon ---
  let jobId = null;
  let reconData;

  try {
    jobId = await job.createJob(accountId, storeUrl).catch(() => null);
    reconData = await recon(storeUrl);

    if (jobId) await job.updateReconData(jobId, reconData).catch(() => {});

    console.log('');
    console.log(`✅ Recon complete — ${reconData.product_count} products, ${reconData.collection_count} collections, ${reconData.image_count} images`);
    console.log(`   Store: ${reconData.store_name}`);
    console.log(`   Instagram: @${reconData.instagram_handle || 'not found'}`);
    console.log(`   Estimated time: ${reconData.estimated_import_label}`);
    console.log('');

  } catch (err) {
    console.error(`❌ Recon failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }

  // --- Confirm import ---
  const confirmed = await prompt('Continue with import? (y/n): ');
  if (!confirmed) {
    console.log('Import cancelled.');
    if (jobId) await job.failJob(jobId, 'Cancelled by user').catch(() => {});
    process.exit(0);
  }

  // --- V1: Verification skipped (concierge mode — ownership confirmed via DM) ---
  const verificationMethod = 'skipped_v1_concierge';
  console.log('ℹ️  Verification skipped (V1 concierge mode — ownership confirmed via DM)');

  // --- Phase 3: Extraction ---
  let rawData;

  try {
    if (jobId) await job.updateStatus(jobId, 'extracting').catch(() => {});
    console.log('');
    rawData = await extract(storeUrl, reconData.store_id, jobId);
    console.log('✅ Extraction complete');

  } catch (err) {
    console.error(`❌ Extraction failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }

  // --- Phase 4a: Download ---
  let manifest;

  try {
    if (jobId) await job.updateStatus(jobId, 'downloading').catch(() => {});
    console.log('');
    manifest = await downloadAllImages(rawData.products, jobId);
    console.log(`✅ Images downloaded — ${manifest.succeeded.length} succeeded, ${manifest.failed.length} failed`);

  } catch (err) {
    console.error(`❌ Image download phase failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }

  // --- Phase 4b: Format + Validate + Write ---
  try {
    const jobMeta = { jobId, accountId, startTime, verificationMethod };
    const formatted = format(rawData, manifest, reconData, jobMeta);
    const validated = validate(formatted);

    writeStoreData(validated);
    generateMigrationReport(validated);

    if (jobId) await job.completeJob(jobId).catch(() => {});

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const flagCount = validated.migration_flags.filter(f => f.severity === 'warning').length;

    console.log('');
    console.log(`🎉 Shoprift complete in ${durationLabel}`);
    console.log(`   Output: ${process.env.OUTPUT_DIR || './output'}/store_data.json`);
    console.log(`   Report: ${process.env.OUTPUT_DIR || './output'}/migration_report.md`);
    console.log(`   Images: ${process.env.IMAGE_DIR || './output/images'}/ (${manifest.succeeded.length} files)`);
    if (flagCount > 0) {
      console.log('');
      console.log(`⚠️  ${flagCount} item${flagCount > 1 ? 's' : ''} need${flagCount === 1 ? 's' : ''} attention — see migration_report.md`);
    }

  } catch (err) {
    console.error(`❌ Output phase failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Unexpected error during import:');
  console.error(`   ${err.message}`);
  process.exit(1);
});
