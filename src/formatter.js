/**
 * src/formatter.js — Maps raw extraction data to store.schema.json structure.
 * Adds local image paths, computes migration_flags, writes output files.
 */

import fs from 'fs';
import path from 'path';
import 'dotenv/config';

/**
 * Computes the migration_flags array from extracted data.
 * @param {object} storeMeta
 * @param {object[]} products
 * @param {object[]} failed — failed image downloads
 * @returns {object[]} migration flags per SCHEMA.md
 */
function computeMigrationFlags(storeMeta, products, failed) {
  const flags = [];

  for (const product of products) {
    if (product.needs_description) {
      flags.push({
        type: 'missing_description',
        severity: 'warning',
        product_id: product.id,
        message: `"${product.name}" has no real product description`,
        action_required: 'Write a product description before publishing to your new store'
      });
    }

    if (product.is_uncategorized) {
      flags.push({
        type: 'uncategorized_product',
        severity: 'warning',
        product_id: product.id,
        message: `"${product.name}" is not assigned to any collection`,
        action_required: 'Assign this product to a category in your new store'
      });
    }

    if (product.images_cdn.length > 0) {
      flags.push({
        type: 'images_on_cdn',
        severity: 'info',
        product_id: product.id,
        message: `"${product.name}" images are still hosted on dm2buy's Azure CDN`,
        action_required: 'Re-host images on your new platform before the dm2buy CDN expires'
      });
    }
  }

  // Failed image downloads
  for (const f of failed) {
    flags.push({
      type: 'image_download_failed',
      severity: 'warning',
      product_id: f.productId,
      message: `Image download failed: ${f.url}`,
      action_required: 'Re-upload this image manually to your new store'
    });
  }

  // Store-level flags
  if (!storeMeta.contact.phone && !storeMeta.contact.email && !storeMeta.contact.whatsapp) {
    flags.push({
      type: 'no_contact_info',
      severity: 'info',
      product_id: null,
      message: 'No phone, email, or WhatsApp contact info found on the store',
      action_required: 'Add contact details to your new store'
    });
  }

  if (!storeMeta.shipping.shipping_charges) {
    flags.push({
      type: 'no_shipping_charges',
      severity: 'info',
      product_id: null,
      message: 'Shipping charges not found or set to zero',
      action_required: 'Configure shipping charges in your new store'
    });
  }

  return flags;
}

/**
 * Attaches local image paths to products from the download manifest.
 * @param {object[]} products
 * @param {object} manifest — { succeeded, failed }
 * @returns {object[]} products with images_local and images_failed populated
 */
function attachLocalPaths(products, manifest) {
  const successMap = {};
  for (const item of manifest.succeeded) {
    if (!successMap[item.productId]) successMap[item.productId] = [];
    successMap[item.productId][item.index] = item.path;
  }

  const failedMap = {};
  for (const item of manifest.failed) {
    if (!failedMap[item.productId]) failedMap[item.productId] = [];
    failedMap[item.productId].push(item.url);
  }

  return products.map(p => ({
    ...p,
    images_local: (successMap[p.id] || []).filter(Boolean),
    images_failed: failedMap[p.id] || []
  }));
}

/**
 * Formats raw extraction data into the canonical store.schema.json structure.
 * @param {object} rawData — from extractor.extract()
 * @param {object} manifest — from downloader.downloadAllImages()
 * @param {object} reconData — from recon.recon()
 * @param {object} jobMeta — { jobId, accountId, startTime, verificationMethod }
 * @returns {object} formatted store data ready for validation
 */
export function format(rawData, manifest, reconData, jobMeta) {
  const { store_meta, products: rawProducts, categories } = rawData;
  const products = attachLocalPaths(rawProducts, manifest);
  const migration_flags = computeMigrationFlags(store_meta, products, manifest.failed);
  const durationSeconds = Math.round((Date.now() - jobMeta.startTime) / 1000);

  const totalImagesFound = products.reduce((s, p) => s + p.images_cdn.length, 0);
  const totalDownloaded = manifest.succeeded.length;
  const totalFailed = manifest.failed.length;
  const totalSelected = products.filter(p => p.selected_for_import).length;

  const productScore = products.length > 0
    ? Math.round((products.filter(p => p.name && p.price).length / products.length) * 100)
    : 0;
  const categoryScore = categories.length > 0 ? 90 : 50;
  const storeMetaScore = store_meta.name ? 80 : 20;

  const formatted = {
    store_meta,
    products,
    categories,
    migration_flags,
    scrape_meta: {
      source_url: reconData.store_url,
      shoprift_version: process.env.SHOPRIFT_VERSION || '1.0.0',
      timestamp: new Date().toISOString(),
      duration_seconds: durationSeconds,
      total_products_found: products.length,
      total_products_selected: totalSelected,
      total_categories: categories.length,
      total_images_found: totalImagesFound,
      total_images_downloaded: totalDownloaded,
      total_images_failed: totalFailed,
      verification_method: jobMeta.verificationMethod || 'dm2buy_product',
      confidence_scores: {
        store_meta: storeMetaScore,
        products: productScore,
        categories: categoryScore
      },
      migration_flag_count: migration_flags.length,
      notes: null
    }
  };

  return formatted;
}

/**
 * Writes store_data.json to the given output directory.
 * @param {object} formattedData
 * @param {string} outputDir — job folder path
 */
export function writeStoreData(formattedData, outputDir = process.env.OUTPUT_DIR || './output') {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'store_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(formattedData, null, 2), 'utf8');
  console.log(`✅ store_data.json written → ${outputPath}`);
}

/**
 * Builds the "Completing Your Migration" section for Shopify imports.
 * Personalizes collection list and skips variant-image step when no variants exist.
 */
function buildShopifyNextSteps(products, categories) {
  const hasVariants = products.some(
    p => (p.variants?.colors?.length ?? 0) > 0 || (p.variants?.sizes?.length ?? 0) > 0
  );

  const collectionStep = categories.length > 0
    ? `1. **Restore your collections** — Your dm2buy collections are preserved as tags on each product.\n   Create a Smart Collection in Shopify admin for each collection below.\n   Set condition: Product tag → is equal to → [collection name].\n   Collections to recreate:\n${categories.map(c => `   - ${c.name}`).join('\n')}`
    : '1. **Collections** — Your store had no collections on dm2buy, so no collections to recreate.';

  const variantImageStep = hasVariants
    ? '3. **Assign variant images** — Images are uploaded. In Shopify admin, open each variant product and link each color/size variant to its matching image.'
    : '3. **Variant images** — Not needed (your products have no color/size variants).';

  return [
    '## Completing Your Migration',
    '',
    'After importing store_data.csv into Shopify, complete these four steps:',
    '',
    collectionStep,
    '',
    '2. **Set inventory quantities** — All products are imported with quantity = 1.',
    '   Go to Products → select all → Edit products → update the Available column.',
    '',
    variantImageStep,
    '',
    '4. **Add SKUs (optional)** — dm2buy had no SKUs. Shopify auto-generates internal IDs.',
    '   Use the bulk editor or a Shopify app to add real SKUs if needed.',
    '',
    '---',
    '',
    '**Other items to configure:** product descriptions (dm2buy had none), shipping zones,',
    'tax settings, payment methods, and store contact info.',
  ].join('\n');
}

/**
 * Generates a human-readable migration report in Markdown.
 * @param {object} formattedData
 * @param {string} outputDir — job folder path
 */
export function generateMigrationReport(formattedData, outputDir = process.env.OUTPUT_DIR || './output', csvInfo = {}) {
  const { store_meta, products, categories, migration_flags, scrape_meta } = formattedData;
  const { unmappedColumns = [], noSourceColumns = [], formatName = '' } = csvInfo;
  const isShopify = formatName === 'Shopify Product Import';

  const warnings = migration_flags.filter(f => f.severity === 'warning');
  const infos = migration_flags.filter(f => f.severity === 'info');

  const productTable = [
    '| # | Name | Price | Original | Discount | Category | Images | Needs Description |',
    '|---|------|-------|----------|----------|----------|--------|-------------------|',
    ...products.map(p =>
      `| ${p.id} | ${p.name} | ₹${p.price} | ${p.original_price ? '₹'+p.original_price : '—'} | ${p.discount_percentage ? p.discount_percentage+'%' : '—'} | ${p.category || '_Uncategorized_'} | ${p.images_cdn.length} | ${p.needs_description ? '⚠️ Yes' : 'No'} |`
    )
  ].join('\n');

  const flagSection = migration_flags.length === 0
    ? '_No migration flags — store data looks complete._'
    : [
        ...warnings.map(f => `- ⚠️ **${f.type}** (${f.product_id != null ? 'Product #' + f.product_id : 'Store'}): ${f.message}\n  → ${f.action_required}`),
        ...infos.map(f => `- ℹ️ **${f.type}** (${f.product_id != null ? 'Product #' + f.product_id : 'Store'}): ${f.message}\n  → ${f.action_required}`)
      ].join('\n');

  const nextSteps = isShopify
    ? buildShopifyNextSteps(products, categories)
    : [
        '1. Review all ⚠️ warnings above and complete missing descriptions',
        '2. Upload product images to your new store (CDN URLs will expire)',
        '3. Configure shipping, taxes, and payment methods',
        '4. Assign uncategorized products to collections',
        '5. Set up contact info and store policies',
        '6. Do a test checkout before going live'
      ].join('\n');

  const hasUnmappedSection = unmappedColumns.length > 0 || noSourceColumns.length > 0;
  const unmappedSection = hasUnmappedSection ? `
---

## Unmapped CSV Columns

The following columns from the template could not be populated. Verify before delivering:

${noSourceColumns.map(h => `- **${h}** — Shoprift has no source data for this field (column left blank)`).join('\n')}
${unmappedColumns.map(h => `- **${h}** — skipped (column left blank in output)`).join('\n')}
`.trim() : '';

  const report = `# Shoprift Migration Report
**Store:** ${store_meta.name}
**Source:** ${scrape_meta.source_url}
**Generated:** ${scrape_meta.timestamp}
**Duration:** ${scrape_meta.duration_seconds}s

---

## Store Overview

| Property | Value |
|----------|-------|
| Store Name | ${store_meta.name} |
| Instagram | ${store_meta.instagram ? '@' + store_meta.instagram : '—'} |
| Location | ${store_meta.location || '—'} |
| Shipping Charge | ${store_meta.shipping.shipping_charges ? '₹' + store_meta.shipping.shipping_charges : '—'} |
| Processing Time | ${store_meta.shipping.processing_time || '—'} |
| Products | ${products.length} |
| Collections | ${categories.length} |
| Images Downloaded | ${scrape_meta.total_images_downloaded} / ${scrape_meta.total_images_found} |

---

## Products

${productTable}

---

## Migration Flags (${migration_flags.length} total — ${warnings.length} warnings, ${infos.length} info)

${flagSection}
${unmappedSection ? '\n' + unmappedSection + '\n' : ''}
---

${isShopify ? nextSteps : `## Next Steps\n\n${nextSteps}`}

---

_Generated by Shoprift v${scrape_meta.shoprift_version}_
`;

  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, 'migration_report.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`✅ Migration report written → ${reportPath}`);
}
