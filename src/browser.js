/**
 * src/browser.js — Playwright browser lifecycle manager.
 * Single browser instance reused across all phases.
 * Always call closeBrowser() in a finally block.
 */

import { chromium } from 'playwright';
import 'dotenv/config';

/**
 * Launches a headless Chromium browser with dm2buy-compatible settings.
 * @returns {Promise<import('playwright').Browser>}
 */
export async function launchBrowser() {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  return browser;
}

/**
 * Creates a configured page with correct userAgent and viewport.
 * @param {import('playwright').Browser} browser
 * @returns {Promise<import('playwright').Page>}
 */
export async function getPage(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true
  });
  return context.newPage();
}

/**
 * Closes the browser safely. Call in finally block — never skip.
 * @param {import('playwright').Browser} browser
 * @returns {Promise<void>}
 */
export async function closeBrowser(browser) {
  if (browser) await browser.close();
}
