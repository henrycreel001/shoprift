/**
 * scripts/generate_receipt.js
 * Renders receipt template via Playwright → PDF (A5).
 * Usage: node scripts/generate_receipt.js '<json-data>'
 * JSON: { receiptNo, date, clientName, storeUrl, amount, upiRef, products, collections, images }
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
  receiptNo   = 'SRFT/2026-27/R001',
  date        = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  clientName  = 'Client',
  storeUrl    = '',
  amount      = '0',
  upiRef      = '',
  products    = 0,
  collections = 0,
  images      = 0,
} = data;

const counts = [
  products    ? `${products} products`      : null,
  collections ? `${collections} collections` : null,
  images      ? `${images} images`           : null,
].filter(Boolean).join(' · ') || 'Store Migration';

const templatePath = path.resolve(__dirname, '../templates/receipt-template.html');
let html = fs.readFileSync(templatePath, 'utf8');

html = html
  .replace(/\{\{RECEIPT_NO\}\}/g,   receiptNo)
  .replace(/\{\{DATE\}\}/g,          date)
  .replace(/\{\{CLIENT_NAME\}\}/g,   clientName)
  .replace(/\{\{STORE_URL\}\}/g,     storeUrl)
  .replace(/\{\{AMOUNT\}\}/g,        String(amount))
  .replace(/\{\{UPI_REF\}\}/g,       upiRef)
  .replace(/\{\{COUNTS\}\}/g,        counts);

const slug = receiptNo.split('/').pop().toLowerCase();
const outDir = './output/receipts';
fs.mkdirSync(outDir, { recursive: true });
const pdfPath = path.resolve(`${outDir}/shoprift-receipt-${slug}.pdf`);

const tmpHtml = path.resolve(`${outDir}/.receipt_tmp.html`);
fs.writeFileSync(tmpHtml, html, 'utf8');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'A5',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
  });
  console.log(pdfPath);
} finally {
  await browser.close();
  try { fs.unlinkSync(tmpHtml); } catch {}
}
