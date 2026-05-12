/**
 * src/index.js — CLI entry point.
 * Usage: node src/index.js <dm2buy-store-url> [options]
 * Options:
 *   --client <slug>    Override auto-derived client slug
 *   --format <name>    shopify | generic | ./path/to/template.csv | ./path/to/preset.json (default: shopify)
 *   --zip              Create delivery.zip after extraction
 *   --auto-approve     Use cached .matching.json without prompting (requires prior approval run)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  isDm2buyUrl,
  deriveClientSlug,
  slugify,
  makeJobFolderName,
  toISTISOString
} from './utils.js';
import * as job from './job.js';
import { recon } from './recon.js';
import { extract } from './extractor.js';
import { downloadAllImages } from './downloader.js';
import { format, writeStoreData, generateMigrationReport } from './formatter.js';
import { validate } from './validator.js';
import { appendJob } from './ledger.js';
import { mapToCsv } from './csv-mapper.js';
import { createDeliveryZip } from './zipper.js';
import { ask, closePrompt } from './prompt.js';

const OUTPUT_ROOT = process.env.OUTPUT_DIR || './output';
const SHOPRIFT_VERSION = process.env.SHOPRIFT_VERSION || '1.0.0';
const LEDGER_PATH = path.join(OUTPUT_ROOT, '_ledger.csv');
const ARCHIVE_PATH = path.join(OUTPUT_ROOT, '_archive');
const LEDGER_HEADERS =
  'job_id,client_slug,client_display_name,store_url,store_name,' +
  'run_date,run_time_ist,duration_seconds,products,images,csv_format,' +
  'csv_template_path,unmapped_count,status,price_quoted_inr,price_paid_inr,' +
  'delivery_channel,client_contact,notes\n';

/**
 * Parses CLI arguments into a structured options object.
 * Supports both legacy positional args and named flags.
 * @param {string[]} argv — process.argv
 * @returns {{ storeUrl, accountId, client, format, zip, autoApprove }}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    storeUrl: null,
    accountId: 'default',
    client: null,
    format: 'shopify',
    zip: false,
    autoApprove: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--client' && next && !next.startsWith('--')) {
      result.client = args[++i];
    } else if (arg === '--format' && next && !next.startsWith('--')) {
      result.format = args[++i];
    } else if (arg === '--zip') {
      result.zip = true;
    } else if (arg === '--auto-approve') {
      result.autoApprove = true;
    } else if (!arg.startsWith('--')) {
      if (!result.storeUrl) result.storeUrl = arg;
      else if (result.accountId === 'default') result.accountId = arg;
    }
  }

  return result;
}

/** Prompts for a yes/no answer. Returns true if yes. */
async function prompt(question) {
  const answer = await ask(question);
  return answer.toLowerCase() === 'y';
}

/**
 * Creates root output structure on startup.
 * Creates output/, output/_archive/, and _ledger.csv with headers (if not present).
 */
function ensureRootStructure() {
  try {
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    fs.mkdirSync(ARCHIVE_PATH, { recursive: true });
    if (!fs.existsSync(LEDGER_PATH)) {
      fs.writeFileSync(LEDGER_PATH, LEDGER_HEADERS, 'utf8');
    }
  } catch (err) {
    console.error(`❌ Cannot initialize output directory: ${OUTPUT_ROOT}`);
    console.error(`   Error: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Creates the job folder and its images/ subdirectory.
 * @param {string} clientSlug
 * @param {Date} startTime
 * @returns {{ folderPath: string, folderName: string, imageDir: string }}
 */
function createJobFolder(clientSlug, startTime) {
  const baseName = makeJobFolderName(clientSlug, startTime);
  let folderName = baseName;
  let suffix = 2;
  while (fs.existsSync(path.join(OUTPUT_ROOT, folderName))) {
    folderName = `${baseName}_${suffix}`;
    suffix++;
  }
  const folderPath = path.join(OUTPUT_ROOT, folderName);
  const imageDir = path.join(folderPath, 'images');
  try {
    fs.mkdirSync(imageDir, { recursive: true });
  } catch (err) {
    console.error(`❌ Cannot create job folder: ${folderPath}`);
    console.error(`   Error: ${err.message}`);
    process.exit(1);
  }
  return { folderPath, folderName, imageDir };
}

/**
 * Writes job_metadata.json into the job folder.
 * @param {string} folderPath
 * @param {object} metadata
 */
function writeJobMetadata(folderPath, metadata) {
  const metaPath = path.join(folderPath, 'job_metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  console.log(`✅ job_metadata.json written → ${metaPath}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const { storeUrl, accountId, format: formatArg, zip, autoApprove } = args;
  const startTime = new Date();

  ensureRootStructure();

  if (!storeUrl || !isDm2buyUrl(storeUrl)) {
    console.error('❌ Invalid URL. Shoprift only works with dm2buy stores.');
    console.error('   Expected format: https://yourstore.dm2buy.com');
    console.error('   Usage: node src/index.js https://yourstore.dm2buy.com [--client slug] [--format shopify|generic|./path.csv] [--zip] [--auto-approve]');
    process.exit(1);
  }

  const clientSlug = args.client ? slugify(args.client) : deriveClientSlug(storeUrl);

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
  console.log(`   Store:  ${storeUrl}`);
  console.log(`   Client: ${clientSlug}`);
  console.log(`   Format: ${formatArg}`);

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

  // --- Create job folder (after confirmation to avoid orphaned empty folders) ---
  const { folderPath, folderName, imageDir } = createJobFolder(clientSlug, startTime);
  console.log(`\n📁 Job folder: output/${folderName}/`);

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
    manifest = await downloadAllImages(rawData.products, jobId, imageDir);
    console.log(`✅ Images downloaded — ${manifest.succeeded.length} succeeded, ${manifest.failed.length} failed`);
  } catch (err) {
    console.error(`❌ Image download phase failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }

  // --- Phase 4b: Format + Validate + Write JSON ---
  let validated;
  try {
    const jobMeta = { jobId, accountId, startTime: startTime.getTime(), verificationMethod };
    const formatted = format(rawData, manifest, reconData, jobMeta);
    validated = validate(formatted);
    writeStoreData(validated, folderPath);
  } catch (err) {
    console.error(`❌ Output phase failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }

  // --- Phase 4c: CSV export ---
  let csvResult = { csv: '', unmappedColumns: [], noSourceColumns: [], formatName: formatArg, rowCount: 0 };
  try {
    csvResult = await mapToCsv(validated, formatArg, { autoApprove });
    const csvPath = path.join(folderPath, 'store_data.csv');
    fs.writeFileSync(csvPath, csvResult.csv, 'utf8');
    console.log(`✅ CSV exported → output/${folderName}/store_data.csv (format: ${csvResult.formatName}, ${csvResult.rowCount} rows)`);
  } catch (err) {
    if (err.isCancellation) {
      if (jobId) await job.failJob(jobId, 'Mapping cancelled by user').catch(() => {});
      process.exit(1);
    }
    console.error(`❌ CSV export failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }

  // --- Phase 4d: Migration report + metadata + ledger ---
  try {
    generateMigrationReport(validated, folderPath, {
      unmappedColumns: csvResult.unmappedColumns,
      noSourceColumns: csvResult.noSourceColumns,
      formatName: csvResult.formatName,
      rowCount: csvResult.rowCount
    });

    if (jobId) await job.completeJob(jobId).catch(() => {});

    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const csvTemplatePath =
      (formatArg.endsWith('.csv') || formatArg.endsWith('.json'))
        ? path.resolve(formatArg)
        : null;

    const allUnmapped = [...csvResult.unmappedColumns, ...csvResult.noSourceColumns];

    const jobMetadata = {
      job_id: folderName,
      client_slug: clientSlug,
      client_display_name: null,
      store_url: storeUrl,
      store_name: validated.store_meta.name,
      instagram_handle: validated.store_meta.instagram,
      run_started_at: toISTISOString(startTime),
      run_completed_at: toISTISOString(endTime),
      duration_seconds: durationSeconds,
      products_count: validated.products.length,
      images_count: manifest.succeeded.length,
      csv_format: formatArg,
      csv_template_path: csvTemplatePath,
      unmapped_columns: allUnmapped,
      status: 'extracted',
      price_quoted_inr: null,
      price_paid_inr: null,
      delivery_channel: null,
      client_contact: null,
      notes: null,
      shoprift_version: SHOPRIFT_VERSION
    };

    writeJobMetadata(folderPath, jobMetadata);
    appendJob(jobMetadata);

    const flagCount = validated.migration_flags.filter(f => f.severity === 'warning').length;

    console.log('');
    console.log(`🎉 Shoprift complete in ${durationLabel}`);
    console.log(`   Folder: output/${folderName}/`);
    console.log(`   Data:   output/${folderName}/store_data.json`);
    console.log(`   CSV:    output/${folderName}/store_data.csv`);
    console.log(`   Report: output/${folderName}/migration_report.md`);
    console.log(`   Images: output/${folderName}/images/ (${manifest.succeeded.length} files)`);
    if (allUnmapped.length > 0) {
      console.log(`\n⚠️  ${allUnmapped.length} CSV column(s) left blank — see migration_report.md`);
    }
    if (flagCount > 0) {
      console.log(`⚠️  ${flagCount} item${flagCount > 1 ? 's' : ''} need${flagCount === 1 ? 's' : ''} attention — see migration_report.md`);
    }

    // --- Phase 4e: Delivery zip (optional) ---
    if (zip) {
      try {
        const { zipName, sizeMb } = await createDeliveryZip(folderPath, jobMetadata);
        console.log(`   Zip:    output/${folderName}/${zipName} (${sizeMb} MB)`);
      } catch (err) {
        console.warn(`⚠️  Delivery zip failed: ${err.message}`);
      }
    }

  } catch (err) {
    console.error(`❌ Output phase failed: ${err.message}`);
    if (jobId) await job.failJob(jobId, err.message).catch(() => {});
    process.exit(1);
  }
}

main()
  .then(() => closePrompt())
  .catch(err => {
    closePrompt();
    console.error('❌ Unexpected error during import:');
    console.error(`   ${err.message}`);
    process.exit(1);
  });
