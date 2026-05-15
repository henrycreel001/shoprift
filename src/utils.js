/**
 * src/utils.js — Shared helpers used across all Shoprift modules.
 */

import crypto from 'crypto';

/**
 * Generates a session-locked verification code.
 * Format: SHR-{accountId}-{rand4}-{unixTimestamp}
 * @param {string} accountId
 * @param {string} storeUrl
 * @returns {string}
 */
export function generateCode(accountId, storeUrl) {
  const rand4 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const ts = Math.floor(Date.now() / 1000);
  return `SHR-${accountId}-${rand4}-${ts}`;
}

/**
 * Promise-based delay.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff and a per-attempt timeout.
 * @param {() => Promise<any>} fn
 * @param {{ attempts?: number, baseDelayMs?: number, timeoutMs?: number }} [options]
 * @returns {Promise<any>}
 */
export async function withRetry(fn, { attempts = 3, baseDelayMs = 1000, timeoutMs = 15000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await Promise.race([
        fn(),
        sleep(timeoutMs).then(() => { throw new Error(`[withRetry] Timed out after ${timeoutMs}ms`); })
      ]);
    } catch (err) {
      if (i === attempts || err.permanent) throw err;
      console.warn(`⚠️  Attempt ${i}/${attempts} failed: ${err.message}. Retrying in ${baseDelayMs * i}ms...`);
      await sleep(baseDelayMs * i);
    }
  }
}

/**
 * Converts a string to a filesystem-safe filename.
 * Strips special chars, collapses spaces to hyphens.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Estimates import time based on product and image counts.
 * Formula: (productCount × 8s) + (imageCount × 2s)
 * @param {number} productCount
 * @param {number} imageCount
 * @returns {{ seconds: number, label: string }}
 */
export function estimateTime(productCount, imageCount) {
  const seconds = (productCount * 8) + (imageCount * 2);
  let label;
  if (seconds < 60) {
    label = `About ${seconds} seconds`;
  } else {
    const minutes = Math.ceil(seconds / 60);
    label = `About ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return { seconds, label };
}

/**
 * Validates that a URL matches the *.dm2buy.com pattern.
 * @param {string} url
 * @returns {boolean}
 */
export function isDm2buyUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.endsWith('.dm2buy.com');
  } catch {
    return false;
  }
}

/**
 * Converts a display name to a URL-safe slug.
 * "Hair Accessories" → "hair-accessories"
 * @param {string} name
 * @returns {string}
 */
export function computeSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Converts any string to a filesystem-safe slug (lowercase, alphanumeric + hyphens).
 * "Beautiful Things!" → "beautiful-things"
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Derives a client slug from a dm2buy store URL.
 * "https://kiwiishop.dm2buy.com" → "kiwiishop"
 * @param {string} storeUrl
 * @returns {string}
 */
export function deriveClientSlug(storeUrl) {
  const { hostname } = new URL(storeUrl);
  return slugify(hostname.split('.')[0]);
}

/**
 * Returns an ISO 8601 string adjusted to IST (UTC+5:30).
 * @param {Date} date
 * @returns {string} e.g. "2026-05-12T18:15:00.000+05:30"
 */
export function toISTISOString(date) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + istOffset);
  return ist.toISOString().replace('Z', '+05:30');
}

/**
 * Builds the job folder name: {clientSlug}_{YYYY-MM-DD}_{HHMM} in IST.
 * @param {string} clientSlug
 * @param {Date} date
 * @returns {string} e.g. "kiwiishop_2026-05-12_1815"
 */
export function makeJobFolderName(clientSlug, date) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + istOffset);
  const YYYY = ist.getUTCFullYear();
  const MM = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(ist.getUTCDate()).padStart(2, '0');
  const HH = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${clientSlug}_${YYYY}-${MM}-${DD}_${HH}${mm}`;
}

/**
 * Computes discount percentage from current and original price.
 * Returns null if no original price or no discount exists.
 * @param {number} price
 * @param {number | null} originalPrice
 * @returns {number | null}
 */
export function computeDiscount(price, originalPrice) {
  if (!originalPrice || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 100);
}
