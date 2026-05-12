/**
 * tests/shopify-preset.test.js — Unit tests for the Shopify preset emitter.
 * Run: node tests/shopify-preset.test.js
 * Does NOT require network access — uses inline fixture data matching kiwiishop.dm2buy.com.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { emitShopifyCsv } from '../presets/shopify/emitter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, '..', 'presets', 'shopify', 'fixtures', 'kiwiishop.expected.csv');

// Inline fixture: kiwiishop.dm2buy.com store data as extracted by Shoprift
const KIWIISHOP = {
  store_meta: { name: 'The Kiwii Shop' },
  products: [
    {
      id: 1, name: 'Gingham Scrunchies', price: 120, original_price: 199,
      category: 'Hair Accessories', is_uncategorized: false, tags: [],
      variants: { colors: ['Pink', 'Purple', 'Blue', 'Mint', 'Black'], sizes: [] },
      images_cdn: [
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/XjVB6AP8I8pF.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/tugPnAa5boDY.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/zTRJCUdP6ltm.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/uOhZGMH5yWSd.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/7sjOxz3AImU5.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/GBamQp4zPupI.jpg',
      ],
    },
    {
      id: 2, name: 'Tomato mini Charm', price: 250, original_price: 299,
      category: 'Crochet', is_uncategorized: false, tags: [],
      variants: { colors: [], sizes: [] },
      images_cdn: [
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/rPTWxv7w7dbU.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/ejesixTCUBFP.jpg',
      ],
    },
    {
      id: 3, name: 'Pudding Crochet Charm', price: 350, original_price: 399,
      category: 'Crochet', is_uncategorized: false, tags: [],
      variants: { colors: [], sizes: [] },
      images_cdn: [
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/ZFoCBPiuRBgb.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/2EcYXsEIoHmt.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/qVvUua9yTjCq.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/DMiu6S1tiR3Y.jpg',
      ],
    },
    {
      id: 4, name: 'The Forever Flowers', price: 250, original_price: 299,
      category: null, is_uncategorized: true, tags: [],
      variants: { colors: ['Pink', 'Purple'], sizes: [] },
      images_cdn: [
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/dm2image1778426081252.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/dm2image1778424727140.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/dm2image1778424555337.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/dm2image1778425156609.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/dm2image1778424555707.jpg',
        'https://dm2buy-aqbqh9cwb5cwb9he.z02.azurefd.net/dm2buy/dm2image1778424556072.jpg',
      ],
    },
  ],
  categories: [
    { name: 'Hair Accessories', slug: 'hair-accessories' },
    { name: 'Crochet', slug: 'crochet' },
  ],
};

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

function run() {
  console.log('=== Shopify preset unit tests ===\n');

  const csv = emitShopifyCsv(KIWIISHOP);
  const lines = csv.split('\n');
  const dataLines = lines.filter(l => l.trim());
  const parsed = Papa.parse(csv, { header: true }).data.filter(r => Object.values(r).some(v => v !== ''));

  // 1. Row count
  assert('Row count = 18', dataLines.length - 1 === 18, `got ${dataLines.length - 1}`);

  // 2. Column count
  const headers = lines[0].split(',');
  assert('Column count = 51', headers.length === 51, `got ${headers.length}`);

  // 3. Column header order matches fixture
  const fixture = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const fixtureHeaders = fixture.split('\n')[0];
  assert('Column header order matches fixture', lines[0] === fixtureHeaders,
    `emitted: ${lines[0].slice(0, 80)}...`);

  // 4. Per-product row counts = max(variants, images)
  const expectedCounts = {
    'Gingham Scrunchies':    Math.max(5, 6),  // 6
    'Tomato mini Charm':     Math.max(1, 2),  // 2
    'Pudding Crochet Charm': Math.max(1, 4),  // 4
    'The Forever Flowers':   Math.max(2, 6),  // 6
  };
  const productRows = {};
  for (const row of parsed) {
    const handle = row['Handle'];
    productRows[handle] = (productRows[handle] ?? 0) + 1;
  }
  assert('Gingham Scrunchies: 6 rows',    productRows['gingham-scrunchies']    === 6, `got ${productRows['gingham-scrunchies']}`);
  assert('Tomato mini Charm: 2 rows',     productRows['tomato-mini-charm']     === 2, `got ${productRows['tomato-mini-charm']}`);
  assert('Pudding Crochet Charm: 4 rows', productRows['pudding-crochet-charm'] === 4, `got ${productRows['pudding-crochet-charm']}`);
  assert('The Forever Flowers: 6 rows',   productRows['the-forever-flowers']   === 6, `got ${productRows['the-forever-flowers']}`);

  // 5 + 6. All anchor rows: Status=active, Published=TRUE, Gift Card=FALSE
  const anchorRows = parsed.filter(r => r['Title'] !== '');
  assert('All anchor rows have Status=active',
    anchorRows.every(r => r['Status'] === 'active'),
    anchorRows.filter(r => r['Status'] !== 'active').map(r => r['Title']).join(', '));
  assert('All anchor rows have Published=TRUE',
    anchorRows.every(r => r['Published'] === 'TRUE'),
    anchorRows.filter(r => r['Published'] !== 'TRUE').map(r => r['Title']).join(', '));
  assert('All anchor rows have Gift Card=FALSE',
    anchorRows.every(r => r['Gift Card'] === 'FALSE'),
    anchorRows.filter(r => r['Gift Card'] !== 'FALSE').map(r => r['Title']).join(', '));

  // 7. All rows with Variant Price set also have Policy=deny and Fulfillment=manual
  const rowsWithPrice = parsed.filter(r => r['Variant Price'] !== '');
  assert('All priced rows have Variant Inventory Policy=deny',
    rowsWithPrice.every(r => r['Variant Inventory Policy'] === 'deny'),
    `${rowsWithPrice.filter(r => r['Variant Inventory Policy'] !== 'deny').length} violations`);
  assert('All priced rows have Variant Fulfillment Service=manual',
    rowsWithPrice.every(r => r['Variant Fulfillment Service'] === 'manual'),
    `${rowsWithPrice.filter(r => r['Variant Fulfillment Service'] !== 'manual').length} violations`);

  // 8. Gingham Scrunchies anchor Tags = "Hair Accessories"
  const ginghamAnchor = parsed.find(r => r['Handle'] === 'gingham-scrunchies' && r['Title'] !== '');
  assert('Gingham Scrunchies Tags = Hair Accessories',
    ginghamAnchor?.['Tags'] === 'Hair Accessories',
    `got "${ginghamAnchor?.['Tags']}"`);

  // 9. Tomato mini Charm and Pudding Crochet Charm Tags = "Crochet"
  const tomatoAnchor  = parsed.find(r => r['Handle'] === 'tomato-mini-charm' && r['Title'] !== '');
  const puddingAnchor = parsed.find(r => r['Handle'] === 'pudding-crochet-charm' && r['Title'] !== '');
  assert('Tomato mini Charm Tags = Crochet',
    tomatoAnchor?.['Tags'] === 'Crochet', `got "${tomatoAnchor?.['Tags']}"`);
  assert('Pudding Crochet Charm Tags = Crochet',
    puddingAnchor?.['Tags'] === 'Crochet', `got "${puddingAnchor?.['Tags']}"`);

  // 10. The Forever Flowers Tags = blank (uncategorized)
  const flowersAnchor = parsed.find(r => r['Handle'] === 'the-forever-flowers' && r['Title'] !== '');
  assert('The Forever Flowers Tags = blank',
    flowersAnchor?.['Tags'] === '', `got "${flowersAnchor?.['Tags']}"`);

  // 11. All Variant Inventory Qty values = 1 (not 10)
  const qtyValues = rowsWithPrice.map(r => r['Variant Inventory Qty']);
  assert('All Variant Inventory Qty = 1',
    qtyValues.every(v => String(v) === '1'),
    `found non-1 values: ${qtyValues.filter(v => String(v) !== '1').join(', ')}`);

  // 12. Byte-level diff against fixture
  const fixtureContent = fs.readFileSync(FIXTURE_PATH, 'utf8');
  if (csv === fixtureContent) {
    assert('Byte-level match with fixture', true);
  } else {
    const eLines = csv.split('\n');
    const fLines = fixtureContent.split('\n');
    const diffs = [];
    for (let i = 0; i < Math.max(eLines.length, fLines.length); i++) {
      if (eLines[i] !== fLines[i]) diffs.push(`line ${i + 1}`);
    }
    assert('Byte-level match with fixture', false, `diffs at: ${diffs.slice(0, 5).join(', ')}`);
    // Stop here on byte-level failure — diff is the signal, not a reason to update fixture
    console.log('\n⛔ STOP: Byte-level diff failed. Do not update the fixture — investigate the emitter.');
  }

  console.log('');
  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run();
