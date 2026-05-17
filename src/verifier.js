/**
 * src/verifier.js — Ownership verification.
 * Method A: Poll Instagram profile page for SHR code in bio/posts.
 * Method B: Poll dm2buy product list for product named with SHR code.
 * Code expires after VERIFICATION_EXPIRY_MINUTES (default 10).
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { generateCode, sleep } from './utils.js';
import { launchBrowser, getPage, closeBrowser } from './browser.js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const DM2BUY_API = 'https://api.dm2buy.com';
const EXPIRY_MINUTES = parseInt(process.env.VERIFICATION_EXPIRY_MINUTES || '10', 10);
const POLL_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = Math.ceil((EXPIRY_MINUTES * 60_000) / POLL_INTERVAL_MS);

/**
 * Stores a verification attempt in Supabase.
 * @param {string} accountId
 * @param {string} storeUrl
 * @param {string} code
 * @param {string} method — 'instagram_story' | 'dm2buy_product'
 * @returns {Promise<string>} attempt id
 */
export async function storeVerificationAttempt(accountId, storeUrl, code, method) {
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from('verification_attempts')
    .insert({ account_id: accountId, store_url: storeUrl, code, method, expires_at: expiresAt })
    .select('id')
    .single();

  if (error) throw new Error(`[verifier.storeVerificationAttempt] ${error.message}`);
  return data.id;
}

/**
 * Marks a verification attempt as verified.
 * @param {string} attemptId
 */
async function markVerified(attemptId) {
  await supabase
    .from('verification_attempts')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', attemptId);
}

/**
 * Marks a verification attempt as expired.
 * @param {string} attemptId
 */
async function markExpired(attemptId) {
  await supabase
    .from('verification_attempts')
    .update({ status: 'expired' })
    .eq('id', attemptId);
}

/**
 * Checks if a verification code has passed its expiry time.
 * @param {string} code — the SHR code (timestamp embedded in it)
 * @returns {boolean}
 */
export function checkVerificationExpiry(code) {
  // Code format: SHR-{accountId}-{rand4}-{unixTimestamp}
  const parts = code.split('-');
  const ts = parseInt(parts[parts.length - 1], 10);
  if (isNaN(ts)) return true;
  const expiresAt = ts + EXPIRY_MINUTES * 60;
  return Math.floor(Date.now() / 1000) > expiresAt;
}

/**
 * Method A: Polls Instagram profile page for the SHR code in page text.
 * Tries every 30 seconds for up to EXPIRY_MINUTES.
 * @param {string} instagramHandle
 * @param {string} code
 * @returns {Promise<boolean>}
 */
async function pollInstagramForCode(instagramHandle, code) {
  const url = `https://www.instagram.com/${instagramHandle}/`;
  let browser = null;

  try {
    browser = await launchBrowser();
    const page = await getPage(browser);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await page.goto(url, { timeout: 20000 });
        await page.waitForLoadState('networkidle', { timeout: 15000 });

        const pageText = await page.evaluate(() => document.body.innerText);
        const pageHtml = await page.content();

        if (pageText.includes(code) || pageHtml.includes(code)) {
          return true;
        }
      } catch {
        // Instagram may block — continue polling
      }

      if (attempt < MAX_ATTEMPTS) {
        console.log(`   Instagram check ${attempt}/${MAX_ATTEMPTS} — code not found yet. Next check in 30s...`);
        await sleep(POLL_INTERVAL_MS);
      }
    }

    return false;
  } finally {
    if (browser) await closeBrowser(browser);
  }
}

/**
 * Method B: Polls dm2buy product list for a product named with the SHR code.
 * Uses the dm2buy API directly — more reliable than DOM scraping.
 * @param {string} storeUrl
 * @param {string} code
 * @returns {Promise<boolean>}
 */
async function pollDm2buyForCode(storeUrl, code) {
  // Derive storeId from store URL via the API
  const subdomain = new URL(storeUrl).hostname.split('.')[0];
  const storeRes = await axios.get(
    `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
    { params: { select: 'internationalPayment,proplan,legalInfo' } }
  );
  const storeId = storeRes.data?.data?.id;
  if (!storeId) throw new Error('[verifier.pollDm2buyForCode] Could not resolve store ID');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await axios.get(
        `${DM2BUY_API}/v3/product/store/${storeId}/collectionv2`,
        { params: { page: 1, limit: 50, source: 'web' } }
      );

      const products = res.data?.data?.docs || [];
      const found = products.some(p => (p.name || '').includes(code));

      if (found) return true;
    } catch {
      // API hiccup — continue polling
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log(`   dm2buy check ${attempt}/${MAX_ATTEMPTS} — code not found yet. Next check in 30s...`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  return false;
}

/**
 * Main verification orchestrator.
 * Generates a SHR code, tries Method A (Instagram), falls back to Method B (dm2buy product).
 * Returns verified result or throws on complete failure.
 * @param {string} accountId
 * @param {string} storeUrl
 * @param {string | null} instagramHandle
 * @returns {Promise<{ verified: boolean, method: string, code: string }>}
 */
export async function verify(accountId, storeUrl, instagramHandle) {
  const code = generateCode(accountId, storeUrl);

  console.log('');
  console.log('🔐 Ownership Verification');
  console.log(`   Code: ${code}`);
  console.log('');

  // Method A — Instagram Story
  if (instagramHandle) {
    console.log('   Method A: Post this code in your Instagram bio or story:');
    console.log(`   → ${code}`);
    console.log(`   Instagram: @${instagramHandle}`);
    console.log(`   Checking every 30 seconds for up to ${EXPIRY_MINUTES} minutes...`);
    console.log('');

    const attemptId = await storeVerificationAttempt(accountId, storeUrl, code, 'instagram_story');

    const found = await pollInstagramForCode(instagramHandle, code);

    if (found) {
      await markVerified(attemptId);
      return { verified: true, method: 'instagram_story', code };
    }

    await markExpired(attemptId);
    console.warn('⚠️  Instagram story verification timed out after 10 minutes.');
    console.warn('   Switching to fallback verification method...');
  }

  // Method B — dm2buy Product Injection
  console.log('');
  console.log('   Method B: Add a ₹1 draft product to your dm2buy store named exactly:');
  console.log(`   → ${code}`);
  console.log('   Then wait — Shoprift will detect it automatically.');
  console.log(`   Checking every 30 seconds for up to ${EXPIRY_MINUTES} minutes...`);
  console.log('');

  const attemptId = await storeVerificationAttempt(accountId, storeUrl, code, 'dm2buy_product');

  const found = await pollDm2buyForCode(storeUrl, code);

  if (found) {
    await markVerified(attemptId);
    return { verified: true, method: 'dm2buy_product', code };
  }

  await markExpired(attemptId);

  // Both methods timed out
  throw new Error(
    'Verification failed — code not found via Instagram story or dm2buy product injection. ' +
    'Start a new import to try again with a fresh code.'
  );
}
