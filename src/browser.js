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
 * Creates a configured page with full Chrome header set.
 * extraHTTPHeaders mirrors what a real macOS Chrome 124 browser sends,
 * making requests indistinguishable from a genuine browser session.
 * @param {import('playwright').Browser} browser
 * @returns {Promise<import('playwright').Page>}
 */
export async function getPage(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"macOS"',
      'Connection': 'keep-alive'
    }
  });
  return context.newPage();
}

/**
 * Navigates the page to the store's home URL to establish a real session.
 * Builds genuine cookies and referrer history before any API calls are made.
 * This prevents the bare API-call pattern that Cloudflare can detect.
 * @param {import('playwright').Page} page
 * @param {string} storeUrl — e.g. https://kiwiishop.dm2buy.com
 * @returns {Promise<void>}
 */
export async function visitStorefront(page, storeUrl) {
  try {
    await page.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  } catch (err) {
    // Non-fatal — store might time out or redirect; session cookies still set
    console.warn(`⚠️  Storefront pre-visit incomplete: ${err.message}`);
  }
}

/**
 * Closes the browser safely. Call in finally block — never skip.
 * @param {import('playwright').Browser} browser
 * @returns {Promise<void>}
 */
export async function closeBrowser(browser) {
  if (browser) await browser.close();
}
