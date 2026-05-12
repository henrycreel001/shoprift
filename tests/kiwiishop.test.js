/**
 * tests/kiwiishop.test.js — Primary integration test against kiwiishop.dm2buy.com
 * Run: node tests/kiwiishop.test.js
 * All assertions must pass before any phase is marked done.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { recon } from '../src/recon.js';
import { extract } from '../src/extractor.js';
import { downloadAllImages } from '../src/downloader.js';
import { format, writeStoreData, generateMigrationReport } from '../src/formatter.js';
import { validate } from '../src/validator.js';

const STORE_URL = 'https://kiwiishop.dm2buy.com';
const STORE_ID = 'ac020c50bc2be16740fa14ae5818e207';
const EXPECTED_PRODUCT_NAMES = [
  'Gingham Scrunchies',
  'Tomato mini Charm',
  'Pudding Crochet Charm',
  'The Forever Flowers'
];
const EXPECTED_PRICES = [120, 250, 350, 250];

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function run() {
  console.log('=== Shoprift kiwiishop integration test ===\n');

  // --- Recon ---
  console.log('Phase 1: Recon');
  const reconData = await recon(STORE_URL);
  assert('4 products found', reconData.product_count === 4, `got ${reconData.product_count}`);
  assert('2 collections found', reconData.collection_count === 2, `got ${reconData.collection_count}`);
  assert('18 images found', reconData.image_count === 18, `got ${reconData.image_count}`);
  assert('instagram handle found', !!reconData.instagram_handle);
  assert('store_id present', !!reconData.store_id);
  assert('estimate label present', !!reconData.estimated_import_label);

  // --- Extraction ---
  console.log('\nPhase 3: Extraction');
  const startTime = Date.now();
  const rawData = await extract(STORE_URL, STORE_ID, null);

  assert('4 products extracted', rawData.products.length === 4, `got ${rawData.products.length}`);
  assert('product names match', EXPECTED_PRODUCT_NAMES.every(n => rawData.products.some(p => p.name === n)));
  assert('prices match', JSON.stringify(rawData.products.map(p => p.price)) === JSON.stringify(EXPECTED_PRICES),
    `got ${JSON.stringify(rawData.products.map(p => p.price))}`);

  const gingham = rawData.products.find(p => p.name === 'Gingham Scrunchies');
  assert('Gingham has 5 color variants', gingham?.variants.colors.length === 5, `got ${gingham?.variants.colors.length}`);

  const flowers = rawData.products.find(p => p.name === 'The Forever Flowers');
  assert('The Forever Flowers is uncategorized', flowers?.is_uncategorized === true);

  assert('2 categories extracted', rawData.categories.length === 2, `got ${rawData.categories.length}`);
  assert('category slugs present', rawData.categories.every(c => !!c.slug));
  assert('all products have product_url', rawData.products.every(p => p.product_url.includes('/product/')));

  // --- Image Download ---
  console.log('\nPhase 4a: Image Download');
  const manifest = await downloadAllImages(rawData.products, null);

  assert('18 images downloaded', manifest.succeeded.length === 18, `got ${manifest.succeeded.length}`);
  assert('0 download failures', manifest.failed.length === 0, `${manifest.failed.length} failed`);

  const zeroBytes = manifest.succeeded.filter(item => {
    try { return fs.statSync(item.path).size === 0; } catch { return true; }
  });
  assert('no zero-byte image files', zeroBytes.length === 0, `${zeroBytes.length} zero-byte files`);

  // --- Format + Validate ---
  console.log('\nPhase 4b: Format + Validate');
  const jobMeta = { jobId: null, accountId: 'test', startTime, verificationMethod: 'dm2buy_product' };
  const formatted = format(rawData, manifest, reconData, jobMeta);
  let validated;
  try {
    validated = validate(formatted);
    assert('Zod schema validation passes', true);
  } catch (err) {
    assert('Zod schema validation passes', false, err.message);
    return finalize();
  }

  // --- Output Files ---
  console.log('\nOutput files');
  writeStoreData(validated);
  generateMigrationReport(validated);

  const reportPath = path.join(process.env.OUTPUT_DIR || './output', 'migration_report.md');
  const jsonPath = path.join(process.env.OUTPUT_DIR || './output', 'store_data.json');

  assert('store_data.json exists', fs.existsSync(jsonPath));
  assert('migration_report.md exists', fs.existsSync(reportPath));
  assert('migration_report.md is non-empty', fs.statSync(reportPath).size > 0);

  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert('store_data.json has 4 products', parsed.products?.length === 4, `got ${parsed.products?.length}`);
  assert('store_data.json passes re-parse', !!parsed.scrape_meta?.shoprift_version);

  finalize();
}

function finalize() {
  console.log('');
  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('\n❌ Test runner crashed:', err.message);
  process.exit(1);
});
