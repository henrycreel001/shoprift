/**
 * src/zipper.js — Packages job output into a delivery zip for WhatsApp/email delivery.
 * Includes: store_data.csv, migration_report.md, images/, README.txt
 * Excludes: store_data.json (technical), job_metadata.json (founder-only), .matching.json files
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
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
 * @param {object} [formattedData] — optional, used to list category names for Shopify delivery
 * @returns {string}
 */
function buildReadme(jobMetadata, formattedData) {
  const { store_name, store_url, run_started_at, products_count, images_count, csv_format } = jobMetadata;
  const runDate = (run_started_at ?? '').slice(0, 10);
  const runTime = (run_started_at ?? '').slice(11, 16);
  const formatName = formatDisplayName(csv_format ?? '');
  const isShopify = csv_format === 'shopify';

  const categories = formattedData?.categories ?? [];
  const collectionList = categories.length > 0
    ? categories.map(c => `- ${c.name}`).join('\n')
    : '(No collections to recreate — your store had no collections on dm2buy.)';

  const hasVariantProducts = (formattedData?.products ?? []).some(
    p => (p.variants?.colors?.length ?? 0) > 0 || (p.variants?.sizes?.length ?? 0) > 0
  );

  const shopifySection = isShopify ? `
AFTER IMPORT — 4 SMALL STEPS
----------------------------
1. RESTORE COLLECTIONS — Your dm2buy collections are preserved as tags.
   Create Smart Collections in Shopify that match by tag.

2. SET INVENTORY — All products imported with quantity = 1.
   Update real stock via Shopify bulk editor.
${hasVariantProducts ? `
3. ASSIGN VARIANT IMAGES — Images are uploaded; link each variant
   (color/size) to its matching image in Shopify admin.
` : `
3. VARIANT IMAGES — Not needed (your store has no variant products).
`}
4. ADD SKUs (optional) — dm2buy didn't have SKUs.
   Shopify auto-generates IDs, or add SKUs via bulk editor.

YOUR COLLECTIONS TO RECREATE
----------------------------
${collectionList}

For detailed step-by-step instructions, open migration_report.md.
` : `
To use:
1. Open migration_report.md first — it lists items to fix before publishing
2. Import store_data.csv into your new platform
3. Upload images from the /images folder
`;

  return `Shoprift Delivery
=================

Hi! Here's everything you need to migrate to ${isShopify ? 'Shopify' : 'your new platform'}.

Store: ${store_name}
Source: ${store_url}
Generated: ${runDate} ${runTime}
Products: ${products_count}
Images: ${images_count}
Format: ${formatName}

WHAT'S IN THIS ZIP
------------------
- store_data.csv      → Upload this to ${isShopify ? 'Shopify (Products → Import)' : 'your new platform'}.
- migration_report.md → Detailed summary of what was extracted.
- images/             → Reference copies of your product images${isShopify ? ' (Shopify pulls these from URLs in the CSV)' : ''}.
${shopifySection}
Questions? Reply on WhatsApp.

— Shoprift
`;
}

/**
 * Creates the delivery zip at {folderPath}/{store_name_slug}_shoprift_delivery.zip.
 * @param {string} folderPath — absolute path to the job output folder
 * @param {object} jobMetadata — contents of job_metadata.json
 * @param {object} [formattedData] — optional validated store data (used for per-seller README content)
 * @returns {Promise<{ zipPath: string, zipName: string, sizeMb: string }>}
 */
export async function createDeliveryZip(folderPath, jobMetadata, formattedData) {
  const { store_name, job_id } = jobMetadata;
  const zipName = `${slugify(store_name)}_shoprift_delivery.zip`;
  const zipPath = path.join(folderPath, zipName);

  const readme = buildReadme(jobMetadata, formattedData);

  await new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

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
