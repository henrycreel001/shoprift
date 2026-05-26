/**
 * tests/shopify-import.test.js — T5.9 integration test.
 * Run: node tests/shopify-import.test.js
 * Requires: dev server running at localhost:3001 (npm run dev:server)
 *
 * Flow:
 *   1. Recon kiwiishop via dm2buy API (pure fetch — no Playwright)
 *   2. Extract all products via dm2buy API
 *   3. POST StoreData to localhost:3001/import
 *   4. Poll Supabase import_jobs until complete or failed
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const STORE_URL = 'https://kiwiishop.dm2buy.com';
const SHOP = 'shoprift-dev.myshopify.com';
const WORKER_URL = 'http://localhost:3001';
const DM2BUY_API = 'https://api.dm2buy.com';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// ─── dm2buy helpers (mirrors web/src/lib/dm2buy/recon.ts + extractor.ts) ─────

async function dm2buyFetch(path, params) {
  const url = params ? `${path}?${new URLSearchParams(params)}` : path;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`dm2buy ${url} → ${res.status}`);
  return res.json();
}

async function fetchStoreMeta(subdomain) {
  const d = await dm2buyFetch(
    `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
    { select: 'internationalPayment,proplan,legalInfo' },
  );
  if (!d.success) throw new Error(`Store not found: ${subdomain}`);
  return d.data;
}

async function fetchAllProducts(storeId) {
  const products = [];
  let page = 1;
  while (true) {
    const d = await dm2buyFetch(
      `${DM2BUY_API}/v3/product/store/${storeId}/collectionv2`,
      { page: String(page), limit: '50', source: 'web' },
    );
    const docs = d.data?.docs ?? [];
    products.push(...docs);
    if (docs.length < 50) break;
    page++;
  }
  return products;
}

async function fetchCollections(storeId) {
  const d = await dm2buyFetch(`${DM2BUY_API}/v3/collection/store/${storeId}`);
  return d.collections ?? [];
}

async function fetchDetail(productId) {
  try {
    const d = await dm2buyFetch(`${DM2BUY_API}/v3/product/${productId}`);
    return d.data ?? {};
  } catch {
    return {};
  }
}

function classifyVariants(variantOptions = []) {
  const SIZE_PATTERN = /^(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|free size|\d+\s*(ml|cm|mm|g|kg|oz|inch|in))$/i;
  const COLOR_KEYWORDS = ['pink','purple','blue','red','green','yellow','black','white','mint','orange','grey','gray','brown','beige','cream','navy','teal','gold','silver','rose','lavender','coral','nude','maroon','olive','peach','multicolor','multi'];
  const sizes = [], colors = [], other = [];
  for (const v of variantOptions) {
    if (!v.isActive) continue;
    const name = (v.name ?? '').trim();
    if (SIZE_PATTERN.test(name)) sizes.push(name);
    else if (COLOR_KEYWORDS.some(c => name.toLowerCase().includes(c))) colors.push(name);
    else other.push(name);
  }
  return { sizes, colors, other };
}

function isBoilerplate(desc) {
  if (!desc || desc.trim().length < 10) return true;
  const patterns = [/shipping/i,/delivery/i,/dispatch/i,/return policy/i,/exchange/i,/dm (us|for)/i,/whatsapp/i,/for (more )?details/i,/cod available/i,/cash on delivery/i,/prepaid/i];
  const matches = patterns.filter(p => p.test(desc)).length;
  return matches >= 3 && desc.trim().length < 200;
}

function mapProduct(api, detail, id, subdomain) {
  const images = [...new Set([...(api.productPhotos ?? []), ...(api.otherPhotos ?? [])])];
  const category = api.collectionV2?.[0]?.name ?? null;
  const description = detail.description ?? null;
  return {
    id, name: api.name ?? detail.name ?? 'Untitled Product',
    description, needs_description: isBoilerplate(description),
    price: api.price, original_price: api.mrp ?? null,
    discount_percentage: api.mrp && api.mrp > api.price ? Math.round((1 - api.price / api.mrp) * 100) : null,
    currency: 'INR', category,
    all_categories: (api.collectionV2 ?? []).map(c => c.name),
    is_uncategorized: !category,
    variants: classifyVariants(api.variantOptions),
    stock_status: api.availableStock > 0 ? 'in_stock' : api.availableStock === 0 ? 'out_of_stock' : 'unknown',
    images_cdn: images, images_local: [], images_failed: [],
    product_url: `https://${subdomain}.dm2buy.com/product/${api.id}`,
    tags: [], selected_for_import: true,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('─'.repeat(60));
console.log('T5.9 Shopify Import Integration Test');
console.log('Store:', STORE_URL);
console.log('Shop:', SHOP);
console.log('─'.repeat(60));

const subdomain = 'kiwiishop';

// Step 1: Recon
process.stdout.write('\n[1/4] Recon... ');
const storeMeta = await fetchStoreMeta(subdomain);
const storeId = storeMeta.id;
console.log(`store_id=${storeId}`);

// Step 2: Extract
process.stdout.write('[2/4] Extracting products... ');
const [listProducts, collections] = await Promise.all([
  fetchAllProducts(storeId),
  fetchCollections(storeId),
]);

const products = [];
for (let i = 0; i < listProducts.length; i++) {
  const detail = await fetchDetail(listProducts[i].id);
  products.push(mapProduct(listProducts[i], detail, i + 1, subdomain));
  process.stdout.write(`\r[2/4] Extracting products... ${i + 1}/${listProducts.length}`);
}
console.log(` ✓ (${products.length} products, ${collections.length} collections)`);

const storeData = {
  store_meta: {
    name: storeMeta.storeName ?? 'kiwiishop',
    description: null, instagram: storeMeta.instagramHandle ?? null,
    contact: { phone: storeMeta.phone ?? null, email: storeMeta.supportEmail ?? null, whatsapp: storeMeta.phone ?? null, support_note: null },
    location: storeMeta.locationString ?? null,
    shipping: { processing_time: null, delivery_time: null, shipping_regions: 'India', minimum_order_value: storeMeta.minOrderValue ?? null, shipping_charges: storeMeta.shippingCharge ?? null, ships_within_days: null },
    payment_methods: [], policies: { cancellations_accepted: false, returns_accepted: false, exchanges_accepted: false, damage_claim_note: null },
  },
  products,
  categories: collections.map(col => ({
    name: col.name,
    url: `https://${subdomain}.dm2buy.com/?collection=${encodeURIComponent(col.name)}`,
    product_count: products.filter(p => p.all_categories.includes(col.name)).length,
    slug: col.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-'),
  })),
};

// Step 3: Create Supabase job
process.stdout.write('[3/4] Creating import job... ');
const { data: jobRow, error: insertError } = await supabase
  .from('import_jobs')
  .insert({ account_id: SHOP, store_url: STORE_URL, status: 'pending' })
  .select('id')
  .single();

if (insertError) {
  console.error('\n❌ Failed to create job:', insertError.message);
  process.exit(1);
}
const jobId = jobRow.id;
console.log(`jobId=${jobId}`);

// Step 4: POST to dev server
process.stdout.write('[4/4] Posting to dev server... ');
const workerRes = await fetch(`${WORKER_URL}/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId, shop: SHOP, storeData }),
});

if (!workerRes.ok) {
  const body = await workerRes.json().catch(() => ({}));
  console.error('\n❌ Worker error:', body.error ?? workerRes.status);
  process.exit(1);
}
console.log('queued ✓');

// Poll Supabase for status
console.log('\nPolling Supabase for import progress...');
console.log('(check Shopify admin → Products while this runs)');
console.log('─'.repeat(60));

while (true) {
  await new Promise(r => setTimeout(r, 3000));

  const { data } = await supabase
    .from('import_jobs')
    .select('status, progress, error, recon_data')
    .eq('id', jobId)
    .single();

  if (!data) { console.log('No job row yet...'); continue; }

  const prog = data.progress;
  if (prog?.message) {
    process.stdout.write(`\r  ${prog.current}/${prog.total} — ${prog.message.slice(0, 60).padEnd(60)}`);
  }

  if (data.status === 'complete') {
    const r = data.recon_data;
    console.log('\n\n✅ Import complete!');
    console.log(`   Products created: ${r?.productsCreated}`);
    console.log(`   Products failed:  ${r?.productsFailed}`);
    console.log(`   Collections:      ${r?.collectionsCreated}`);
    if (r?.errors?.length) {
      console.log(`   Errors (${r.errors.length}):`);
      for (const e of r.errors.slice(0, 5)) console.log(`     • ${e}`);
    }
    console.log(`\n   View: https://${SHOP}/admin/products`);
    break;
  }

  if (data.status === 'failed') {
    console.log('\n\n❌ Import failed:', data.error);
    break;
  }
}
