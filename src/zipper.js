/**
 * src/zipper.js — Packages job output into a delivery zip for WhatsApp/email delivery.
 * Includes: store_data.csv, migration_report.md, images/, README.txt
 * Excludes: store_data.json (technical), job_metadata.json (founder-only), .matching.json files
 */

import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import { slugify } from './utils.js';

/**
 * Returns a clean display name for the CSV format.
 * @param {string} csvFormat — raw formatArg from job_metadata
 * @returns {string}
 */
function formatDisplayName(csvFormat) {
  if (csvFormat === 'shopify') return 'Shopify Product Import';
  if (csvFormat === 'generic') return 'Generic Product Export';
  if (csvFormat.endsWith('.json') || csvFormat.endsWith('.csv')) {
    return path.basename(csvFormat, path.extname(csvFormat));
  }
  return csvFormat;
}

/**
 * Builds the README.txt content from job metadata.
 * @param {object} jobMetadata
 * @returns {string}
 */
function buildReadme(jobMetadata) {
  const { store_name, store_url, run_started_at, products_count, images_count, csv_format } = jobMetadata;
  const runDate = (run_started_at ?? '').slice(0, 10);
  const runTime = (run_started_at ?? '').slice(11, 16);
  const formatName = formatDisplayName(csv_format ?? '');

  return `Your Store Data — Powered by Shoprift
=======================================

Store: ${store_name}
Source: ${store_url}
Generated: ${runDate} ${runTime}
Products: ${products_count}
Images: ${images_count}
Format: ${formatName}

What's in this folder:
- store_data.csv      → Your products in ${formatName} format. Import this to your new platform.
- migration_report.md → Summary + list of items needing attention before going live.
- images/             → All your product images, organized by product number.

To use:
1. Open migration_report.md first — it lists items to fix before publishing
2. Import store_data.csv into your new platform
3. Upload images from the /images folder

Questions? Reply to the message that delivered this file.
`;
}

/**
 * Creates the delivery zip at {folderPath}/{store_name_slug}_shoprift_delivery.zip.
 * @param {string} folderPath — absolute path to the job output folder
 * @param {object} jobMetadata — contents of job_metadata.json
 * @returns {Promise<{ zipPath: string, zipName: string, sizeMb: string }>}
 */
export async function createDeliveryZip(folderPath, jobMetadata) {
  const { store_name, job_id } = jobMetadata;
  const zipName = `${slugify(store_name)}_shoprift_delivery.zip`;
  const zipPath = path.join(folderPath, zipName);

  const readme = buildReadme(jobMetadata);

  await new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 6 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    // store_data.csv
    const csvPath = path.join(folderPath, 'store_data.csv');
    if (fs.existsSync(csvPath)) archive.file(csvPath, { name: 'store_data.csv' });

    // migration_report.md
    const reportPath = path.join(folderPath, 'migration_report.md');
    if (fs.existsSync(reportPath)) archive.file(reportPath, { name: 'migration_report.md' });

    // images/ directory
    const imagesDir = path.join(folderPath, 'images');
    if (fs.existsSync(imagesDir)) archive.directory(imagesDir, 'images');

    // README.txt (generated, not a file on disk)
    archive.append(readme, { name: 'README.txt' });

    archive.finalize();
  });

  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`✅ Delivery zip created → output/${job_id}/${zipName} (${sizeMb} MB)`);

  return { zipPath, zipName, sizeMb };
}
