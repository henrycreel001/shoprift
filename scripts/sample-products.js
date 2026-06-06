/**
 * scripts/sample-products.js — Fetch first N products for client preview.
 * Usage: node scripts/sample-products.js <store-url> [count=5]
 */

import 'dotenv/config';
import axios from 'axios';
import { httpsAgent } from '../src/api.js';

const DM2BUY_API = 'https://api.dm2buy.com';
const storeUrl = process.argv[2];
const N = parseInt(process.argv[3] || '5', 10);

if (!storeUrl) {
  console.error('Usage: node scripts/sample-products.js <store-url> [count]');
  process.exit(1);
}

const subdomain = new URL(storeUrl).hostname.split('.')[0];

async function fetchStoreMeta() {
  const res = await axios.get(
    `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
    { params: { select: 'internationalPayment,proplan,legalInfo' }, httpsAgent }
  );
  if (!res.data?.success) throw new Error('Store not found');
  return res.data.data;
}

async function fetchFirstPage(storeId) {
  const res = await axios.get(
    `${DM2BUY_API}/v3/product/store/${storeId}/collectionv2`,
    { params: { page: 1, limit: N, source: 'web' }, httpsAgent }
  );
  return res.data?.data?.docs || [];
}

async function main() {
  const storeMeta = await fetchStoreMeta();
  const products = await fetchFirstPage(storeMeta.id);
  const sample = products.slice(0, N);

  console.log(`\n📦  ${storeMeta.storeName} — First ${sample.length} Products\n`);
  console.log('='.repeat(60));

  sample.forEach((p, i) => {
    const price = p.discountedPrice ?? p.price ?? p.sellingPrice ?? '?';
    const original = p.price ?? p.mrp ?? null;
    const images = [...(p.productPhotos || []), ...(p.otherPhotos || [])];
    const variants = [];
    if (p.colors?.length)  variants.push(`Colors: ${p.colors.join(', ')}`);
    if (p.sizes?.length)   variants.push(`Sizes: ${p.sizes.join(', ')}`);

    console.log(`\n#${i + 1} — ${p.name || p.productName || 'Unnamed'}`);
    console.log(`  Price:       ₹${price}${original && original !== price ? ` (MRP ₹${original})` : ''}`);
    console.log(`  Category:    ${p.collectionName || p.category || 'Uncategorized'}`);
    console.log(`  Stock:       ${p.available === false ? 'Out of stock' : p.stock ?? 'In stock'}`);
    if (variants.length)   console.log(`  Variants:    ${variants.join(' | ')}`);
    console.log(`  Images:      ${images.length} photo${images.length !== 1 ? 's' : ''}`);
    if (images[0])         console.log(`  First image: ${images[0]}`);
    if (p.description)     console.log(`  Description: ${String(p.description).slice(0, 120)}${p.description.length > 120 ? '…' : ''}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`\nStore ID: ${storeMeta.id}`);
  console.log(`Instagram: @${storeMeta.instagramHandle || 'not found'}`);
}

main().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
