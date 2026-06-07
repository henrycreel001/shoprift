/**
 * scripts/generate_recon_summary.js
 * Renders recon summary card via Playwright → JPG (480×480).
 * Usage: node scripts/generate_recon_summary.js '<json-data>'
 * JSON: { storeName, instagram, storeUrl, products, collections, images, estTime, date }
 * Prints output path to stdout.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const data = JSON.parse(process.argv[2] || '{}');
const {
  storeName   = 'Store',
  instagram   = '',
  storeUrl    = '',
  products    = 0,
  collections = 0,
  images      = 0,
  estTime     = '—',
  date        = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
} = data;

const templatePath = path.resolve(__dirname, '../templates/recon-template.html');
let html = fs.readFileSync(templatePath, 'utf8');

html = html
  .replace(/\{\{STORE_NAME\}\}/g,   storeName)
  .replace(/\{\{INSTAGRAM\}\}/g,    instagram ? `@${instagram.replace(/^@/, '')}` : '')
  .replace(/\{\{STORE_URL\}\}/g,    storeUrl.replace(/^https?:\/\//, ''))
  .replace(/\{\{PRODUCTS\}\}/g,     String(products))
  .replace(/\{\{COLLECTIONS\}\}/g,  String(collections))
  .replace(/\{\{IMAGES\}\}/g,       String(images))
  .replace(/\{\{EST_TIME\}\}/g,     estTime)
  .replace(/\{\{DATE\}\}/g,         date);

const outDir = './output/summaries';
fs.mkdirSync(outDir, { recursive: true });

const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const jpgPath = path.resolve(`${outDir}/shoprift-store-${slug}.jpg`);

const tmpHtml = path.resolve(`${outDir}/.summary_tmp.html`);
fs.writeFileSync(tmpHtml, html, 'utf8');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 480, height: 480 });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: jpgPath, type: 'jpeg', quality: 96, fullPage: false });
  console.log(jpgPath);
} finally {
  await browser.close();
  try { fs.unlinkSync(tmpHtml); } catch {}
}
