# Milestone: First End-to-End Migration

**Date:** 2026-05-27  
**Store migrated:** mmshop (`https://mmshop.dm2buy.com`) → `shoprift-dev.myshopify.com`  
**Result:** 9 products + 3 collections imported to Shopify

---

## What passed

All 7 wizard steps completed without error:

1. **URL** — `https://mmshop.dm2buy.com` entered and validated
2. **Verify** — Ownership confirmed via dm2buy product injection (code `SHR-DDM2-TFNVNY`)
3. **Preview** — Store scan: 13 products, 3 collections, 13 images. Plan: Starter ₹599
4. **Extract** — Client-side extraction pulled all product data via dm2buy public API
5. **Review** — 14 products collected, 5 trial products skipped (already in Shopify), ₹599 gate shown
6. **Import** — Railway worker created products + collections in Shopify Admin API
7. **Done** — 9 products + 3 collections confirmed live

---

## Key bugs fixed to get here

| Bug | Root cause | Fix |
|-----|-----------|-----|
| Verification always "Product not found" | `RAILWAY_WORKER_URL=http://localhost:3001` in Vercel — worker never called | Updated to `https://shoprift-production.up.railway.app` in Vercel |
| Verification failed even when Railway was called | `server.js` `/verify/check` used native `fetch` — throws SSL error on dm2buy's expired TLS cert | Replaced with `axios + httpsAgent` (same pattern as rest of engine) |
| Verification only checked page 1 | No pagination in verify loop | Added `while(true)` page loop, same as `fetchAllProducts` |
| `method` column null violation | `CREATE TABLE IF NOT EXISTS` skipped on existing table, no DEFAULT applied | Pass `method: 'dm2buy_product'` explicitly in INSERT |

---

## What's not wired yet

- **Payment (T7)** — "Pay ₹599" calls `/api/import/start` directly. No charge. Shopify `AppPurchaseOneTime` is the next task.
- **Verification product cleanup** — The dummy dm2buy product added for ownership verification gets extracted and imported to Shopify (e.g. "SHR-DDM2-TFNVNY" at ₹12). User should delete it from dm2buy before extraction. Future fix: filter it server-side.

---

## Architecture that made this work

- **Client-side extraction** — seller's browser calls dm2buy API directly (CORS open). No Railway cost for extraction.
- **Railway worker for import** — handles Shopify Admin API calls server-side (requires access token). Also handles verification checks (requires TLS bypass for dm2buy expired cert).
- **Trial lock** — first 5 products free, tracked in `is_trial` + `trial_product_urls` top-level columns in Supabase. Skipped correctly on full import.
- **Verification persistence** — one `verified` row per (shop, store_url) in `verification_attempts`. User never needs to re-verify the same store.
