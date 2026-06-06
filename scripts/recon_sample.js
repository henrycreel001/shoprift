/**
 * scripts/recon_sample.js
 * Concierge helper: recon summary + N-product Shopify CSV sample (all variants).
 * Usage: node scripts/recon_sample.js <dm2buy-store-url> [--count 5]
 */

import 'dotenv/config';
import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { recon } from '../src/recon.js';
import { emitShopifyCsv } from '../presets/shopify/emitter.js';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const DM2BUY_API = 'https://api.dm2buy.com';

const args = process.argv.slice(2);
const storeUrl = args.find(a => !a.startsWith('--'));
const countIdx = args.indexOf('--count');
const SAMPLE_COUNT = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 5;

if (!storeUrl) {
  console.error('Usage: node scripts/recon_sample.js <dm2buy-store-url> [--count N]');
  process.exit(1);
}

const subdomain = new URL(storeUrl).hostname.split('.')[0];

const SIZE_PATTERNS = /^(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|free size|\d+\s*(ml|cm|mm|g|kg|oz|inch|in))$/i;
const COLOR_KEYWORDS = ['pink','purple','blue','red','green','yellow','black','white','mint',
  'orange','grey','gray','brown','beige','cream','navy','teal','gold','silver','rose',
  'lavender','coral','nude','maroon','olive','peach','multicolor','multi'];

function classifyVariants(variantOptions = []) {
  const sizes = [], colors = [], other = [];
  const all = [];
  for (const v of variantOptions) {
    if (!v.isActive) continue;
    const name = v.name?.trim() || '';
    all.push({ name, price: v.price ?? null, mrp: v.mrp ?? null });
    if (SIZE_PATTERNS.test(name)) sizes.push(name);
    else if (COLOR_KEYWORDS.some(c => name.toLowerCase().includes(c))) colors.push(name);
    else other.push(name);
  }
  return { sizes, colors, other, all };
}

/** Maps raw listing + detail API objects to Shoprift schema */
function mapToSchema(listing, detail, id) {
  const name = listing.name || detail.name || 'Untitled Product';
  const images = [...new Set([
    ...(listing.productPhotos || []),
    ...(listing.otherPhotos || [])
  ])];
  const category = listing.collectionV2?.[0]?.name || null;

  return {
    id,
    name,
    description: detail.description || null,
    needs_description: false,
    price: listing.price ?? null,
    original_price: listing.mrp || null,
    discount_percentage: null,
    currency: 'INR',
    category,
    all_categories: (listing.collectionV2 || []).map(c => c.name),
    is_uncategorized: !category,
    variants: classifyVariants(listing.variantOptions || []),
    stock_status: listing.availableStock > 0 ? 'in_stock' : 'unknown',
    images_cdn: images,
    images_local: [],
    images_failed: [],
    product_url: `https://${subdomain}.dm2buy.com/product/${listing.id}`,
    tags: [],
    selected_for_import: true
  };
}

async function fetchSampleProducts(storeId, n) {
  const res = await axios.get(
    `${DM2BUY_API}/v3/product/store/${storeId}/collectionv2`,
    { params: { page: 1, limit: n + 10, source: 'web' }, httpsAgent }
  );
  const listings = (res.data?.data?.docs || []).slice(0, n);

  const withDetails = await Promise.all(listings.map(async (listing, i) => {
    try {
      const d = await axios.get(`${DM2BUY_API}/v3/product/${listing.id}`, { httpsAgent });
      return mapToSchema(listing, d.data?.product || d.data || {}, i + 1);
    } catch {
      return mapToSchema(listing, {}, i + 1);
    }
  }));

  return withDetails;
}

async function main() {
  console.log(`\n🔍 Recon: ${storeUrl}\n`);

  const reconData = await recon(storeUrl, null).catch(err => {
    console.error(`❌ Recon failed: ${err.message}`);
    process.exit(1);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Store:       ${reconData.store_name}`);
  console.log(`  URL:         ${storeUrl}`);
  console.log(`  Instagram:   @${reconData.instagram_handle || 'not found'}`);
  console.log(`  Products:    ${reconData.product_count}`);
  console.log(`  Collections: ${reconData.collection_count}`);
  console.log(`  Images:      ${reconData.image_count}`);
  console.log(`  Est. import: ${reconData.estimated_import_label}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`📦 Fetching first ${SAMPLE_COUNT} products (all variants)...`);

  const products = await fetchSampleProducts(reconData.store_id, SAMPLE_COUNT).catch(err => {
    console.error(`❌ Product fetch failed: ${err.message}`);
    process.exit(1);
  });

  const storeData = {
    store_meta: { name: reconData.store_name },
    products
  };

  const csv = emitShopifyCsv(storeData);

  fs.mkdirSync('./output', { recursive: true });
  const filename = `${subdomain}_sample_${SAMPLE_COUNT}products.csv`;
  const outPath = path.join('./output', filename);
  fs.writeFileSync(outPath, csv, 'utf8');

  const rowCount = csv.split('\n').filter(Boolean).length - 1;
  console.log(`✅ Sample CSV → output/${filename} (${rowCount} data rows)\n`);

  products.forEach((p, i) => {
    const varCount = p.variants.all.length || 1;
    const imgs = p.images_cdn.length;
    const cat = p.category || '—';
    console.log(`   ${i + 1}. ${p.name}`);
    console.log(`      ₹${p.price}${p.original_price ? ` (MRP ₹${p.original_price})` : ''} · ${varCount} variant(s) · ${imgs} image(s) · ${cat}`);
    if (p.variants.all.length > 0) {
      console.log(`      Variants: ${p.variants.all.map(v => v.name).join(', ')}`);
    }
  });
  console.log('');
}

main().catch(err => {
  console.error(`❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
