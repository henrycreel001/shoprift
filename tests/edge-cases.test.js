/**
 * tests/edge-cases.test.js — Edge case tests per T1.3 of LAUNCH_PLAN.md
 *
 * Groups:
 *   [Unit] isDm2buyUrl — URL format validation (no network)
 *   [Unit] withRetry   — retry + timeout behavior (no network)
 *   [Unit] 0-product   — format() + validate() pipeline (no network)
 *   [Network] Non-existent subdomain — recon() throws clean error (~3s, 3 retries)
 *
 * Run: node tests/edge-cases.test.js
 */

import 'dotenv/config';
import { isDm2buyUrl, withRetry, sleep } from '../src/utils.js';
import { format } from '../src/formatter.js';
import { validate } from '../src/validator.js';
import { recon } from '../src/recon.js';

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

function assertThrows(label, fn, expectedMessageFragment = '') {
  try {
    fn();
    console.log(`  ❌ ${label} — expected throw, got none`);
    failed++;
  } catch (err) {
    const msgMatch = !expectedMessageFragment || err.message.includes(expectedMessageFragment);
    if (msgMatch) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label} — thrown but wrong message: "${err.message}"`);
      failed++;
    }
  }
}

async function assertRejects(label, asyncFn, expectedMessageFragment = '') {
  try {
    await asyncFn();
    console.log(`  ❌ ${label} — expected rejection, got none`);
    failed++;
  } catch (err) {
    const msgMatch = !expectedMessageFragment || err.message.includes(expectedMessageFragment);
    if (msgMatch) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label} — rejected but wrong message: "${err.message}"`);
      failed++;
    }
  }
}

// --- Minimal store data for 0-product pipeline test ---
const MINIMAL_STORE_META = {
  name: 'Empty Test Store',
  description: null,
  instagram: null,
  contact: { phone: null, email: null, whatsapp: null, support_note: null },
  location: null,
  shipping: {
    processing_time: null,
    delivery_time: null,
    shipping_regions: 'India',
    minimum_order_value: null,
    shipping_charges: null,
    ships_within_days: null
  },
  payment_methods: [],
  policies: {
    cancellations_accepted: false,
    returns_accepted: false,
    exchanges_accepted: false,
    damage_claim_note: null
  }
};

async function run() {
  console.log('=== Shoprift edge-case tests ===\n');

  // ---- [Unit] isDm2buyUrl -----------------------------------------------
  console.log('[Unit] isDm2buyUrl — URL format validation');

  assert('valid dm2buy URL', isDm2buyUrl('https://kiwiishop.dm2buy.com'));
  assert('valid dm2buy URL with path', isDm2buyUrl('https://shop.dm2buy.com/products'));
  assert('non-dm2buy domain returns false', !isDm2buyUrl('https://shopify.com'));
  assert('plain dm2buy.com (no subdomain) returns false', !isDm2buyUrl('https://dm2buy.com'));
  assert('empty string returns false', !isDm2buyUrl(''));
  assert('not a URL returns false', !isDm2buyUrl('notaurl'));
  assert('shopify store URL returns false', !isDm2buyUrl('https://mystore.myshopify.com'));

  // ---- [Unit] withRetry ------------------------------------------------
  console.log('\n[Unit] withRetry — retry + timeout behavior');

  // Retries then succeeds
  let callCount = 0;
  const result = await withRetry(async () => {
    callCount++;
    if (callCount < 3) throw new Error('transient error');
    return 'success';
  }, { attempts: 3, baseDelayMs: 10, timeoutMs: 5000 });
  assert('retries then succeeds — result correct', result === 'success', `got: ${result}`);
  assert('retries then succeeds — called 3 times', callCount === 3, `called ${callCount} times`);

  // Exhausts all attempts and re-throws
  await assertRejects(
    'exhausts all attempts and throws last error',
    () => withRetry(async () => { throw new Error('permanent-ish failure'); }, { attempts: 2, baseDelayMs: 10, timeoutMs: 5000 }),
    'permanent-ish failure'
  );

  // Times out per-attempt
  await assertRejects(
    'times out when fn takes longer than timeoutMs',
    () => withRetry(
      () => new Promise(() => {}), // never resolves
      { attempts: 2, baseDelayMs: 10, timeoutMs: 80 }
    ),
    'Timed out after 80ms'
  );

  // err.permanent flag — should NOT retry
  let permanentCallCount = 0;
  await assertRejects(
    'err.permanent skips retries',
    () => withRetry(async () => {
      permanentCallCount++;
      const err = new Error('permanent error');
      err.permanent = true;
      throw err;
    }, { attempts: 3, baseDelayMs: 10, timeoutMs: 5000 }),
    'permanent error'
  );
  assert('err.permanent — fn called only once (no retries)', permanentCallCount === 1, `called ${permanentCallCount} times`);

  // ---- [Unit] 0-product store — format + validate pipeline --------------
  console.log('\n[Unit] 0-product store — format() + validate() pipeline');

  const zeroProductRawData = {
    store_meta: MINIMAL_STORE_META,
    products: [],
    categories: [],
    raw_store_data: {}
  };
  const emptyManifest = { succeeded: [], failed: [] };
  const minimalReconData = { store_url: 'https://empty.dm2buy.com' };
  const minimalJobMeta = { jobId: null, accountId: 'test', startTime: Date.now(), verificationMethod: 'skipped_v1_concierge' };

  let formatted;
  try {
    formatted = format(zeroProductRawData, emptyManifest, minimalReconData, minimalJobMeta);
    assert('format() does not crash with 0 products', true);
    assert('format() returns empty products array', formatted.products.length === 0);
    assert('format() returns scrape_meta', !!formatted.scrape_meta);
    assert('format() total_products_found is 0', formatted.scrape_meta.total_products_found === 0);
  } catch (err) {
    assert('format() does not crash with 0 products', false, err.message);
    assert('format() returns empty products array', false, 'format() threw');
    assert('format() returns scrape_meta', false, 'format() threw');
    assert('format() total_products_found is 0', false, 'format() threw');
  }

  // validate() should throw a clear schema error (products.min(1)) — not crash
  if (formatted) {
    await assertRejects(
      'validate() throws schema error for 0-product store (not unhandled crash)',
      async () => validate(formatted),
      'Schema validation failed'
    );
  }

  // ---- [Network] Non-existent subdomain --------------------------------
  console.log('\n[Network] Non-existent subdomain — recon() error handling');
  console.log('  (makes real API calls — withRetry will attempt 3 times, ~3s)');

  await assertRejects(
    'recon() throws clean error for non-existent subdomain',
    () => recon('https://shoprift-test-nonexistent-abc123.dm2buy.com'),
    // Error will be from withRetry timeout or store-not-found — either is correct
  );

  // ---- Summary ---------------------------------------------------------
  console.log('');
  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('\n❌ Test runner crashed:', err.message);
  process.exit(1);
});
