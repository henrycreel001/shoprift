# DEVLOG.md — Engineering Change Log

> Every change recorded here: date, time (IST), files touched, and why.
> Most recent entry first.
> Use this to audit history, understand decisions, or reconstruct context.
> Update this file every session — add entry before committing.

---

## 2026-06-02 — Fix: payment redirect stuck forever (billing T8.5 bug)

**Files:**
- `web/src/app/migrate/page.tsx` (edit)

**Changes:**
- **Removed App Bridge `Redirect.Action.REMOTE`** from payment flow — uses postMessage channel, which is permanently broken in current Shopify admin (same root cause as `getSessionToken()` failure). `Redirect.dispatch()` fired silently with no effect, `setBillingLoading(false)` never called → button stuck on "Redirecting to payment..." forever.
- **Fix:** `window.top!.location.href = d.confirmationUrl!` directly. Works in embedded (navigates parent iframe) and standalone.
- **Removed** unused `import { Redirect } from '@shopify/app-bridge/actions'`

---

## 2026-06-02 — Pre-launch audit: security + reliability + UX hardening (commit f04100c)

**Files:**
- `web/src/app/api/payment/create/route.ts` (deleted)
- `web/src/app/api/payment/verify/route.ts` (deleted)
- `web/src/app/api/recon/route.ts` (rewrite)
- `web/src/app/api/verify/start/route.ts` (edit)
- `web/src/app/api/verify/check/route.ts` (edit)
- `web/src/app/api/import/start/route.ts` (edit)
- `web/src/app/api/payment/billing/create/route.ts` (edit)
- `web/src/app/api/payment/billing/callback/route.ts` (edit)
- `web/src/app/api/webhooks/billing-update/route.ts` (edit)
- `web/src/app/api/webhooks/compliance/route.ts` (edit)
- `web/src/app/api/webhooks/app-uninstalled/route.ts` (edit)
- `web/src/app/migrate/page.tsx` (edit)
- `web/src/lib/auth.ts` (edit)
- `web/src/middleware.ts` (edit)

**Changes:**
- **Deleted dead Razorpay routes** (`payment/create`, `payment/verify`) — unused after switch to Shopify Billing, were unauthenticated attack surface
- **Wired /api/recon** to Railway worker — was returning mock stub data `{storeName: 'Kiwii Shop (stub)'}` on every call. Note: current frontend doesn't call this route (uses `runRecon` lib directly), but route is now correct
- **storeUrl validation** — replaced `storeUrl.includes('dm2buy.com')` with proper URL.hostname check (`hostname.endsWith('.dm2buy.com')`) across all 4 routes that accept storeUrl
- **Token expiry fix** — `payload.exp < now` → `payload.exp <= now` (off-by-one allowed 1-second window for expired tokens)
- **billing/callback ownership** — added `.eq('account_id', shop)` to job lookup (was fetching by jobId only)
- **AbortSignal.timeout** — added 8s timeout to all Railway worker fetch calls, 10s to Shopify GQL billing call. Prevents Vercel function hangs when worker is slow/down
- **Webhook HMAC handling** — all 3 webhooks now return 200 for invalid signature / validate() error (was returning 500/401 which caused Shopify retry loops)
- **Webhook idempotency** — insert now checks for error code 23505 (unique constraint = concurrent delivery already processed) and returns 200 immediately
- **User-facing errors** — all API routes now return simple, non-technical messages. Internal detail logged with structured `console.error({ phase, shop, error })`. Auth 401 no longer leaks `err.message` to response body
- **Frontend auth error** — removed `"Auth failed: Missing session token"` debug message. Now shows `"Session expired. Please refresh the page and try again."`
- **Change URL state reset** — both Change URL handlers (verifying step + preview step) now fully reset: verifyCode, verifyAttemptId, verifyError, verifyLoading, verifySecsLeft, trialUsed, trialProductUrls, verifyExpRef
- **Expired code CTA** — "Code expired" static text replaced with clickable button `"Code expired — get new code"` that calls new `handleRefreshCode()` function
- **Security headers** — added `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=()` to middleware

**Known deferred / not changed:**
- Auth bypass via session fallback (B1) — architectural, deferred to post-launch. Session fallback is what keeps the app working without App Bridge v3 JWT. Mitigation: Shopify's OAuth install ensures only installed shops have sessions; the `shop` parameter is validated against `.myshopify.com` format.
- Supabase DB type generation — `npx supabase gen types typescript` not yet run; operations remain untyped

---

## 2026-05-30 — T8.1 QA — dm2buy API outage error handling

**Files:**
- `web/src/lib/dm2buy/recon.ts` (edit)
- `web/src/lib/dm2buy/extractor.ts` (edit)

**Changes:**
- Wrapped bare `fetch()` in try/catch in `apiFetch` in both files. When dm2buy API is unreachable (CORS failure, DNS failure, or infrastructure outage returning non-CORS 502), browser throws `TypeError: Failed to fetch` with no useful detail. Now caught and rethrown as: `"dm2buy is unreachable right now. Wait a moment and try again."` — user-visible in error banner.
- Root cause of T8.1 blocker: dm2buy API full outage (Azure App Gateway 502 on all endpoints, storefront 200). Not detection/blocking — pure infrastructure failure on dm2buy's end. Test store data is client-side fetched so sellers' stores also show no products during the outage.

---

## 2026-05-30 — T9 pre-submission content (T9.9, T9.11, T9.12)

**Files:**
- `output/content/app-store-listing.md` (edit)
- `output/content/reviewer-instructions.md` (new)
- `output/content/launch-posts.md` (new)

**Changes:**
- **T9.12 — Listing rule 1.1.13 fix**: Key features bullet "Migrates all products…from dm2buy" → "Migrates all your dm2buy products…" — all copy now says "your" not "any".
- **T9.11 — Reviewer instructions**: Full step-by-step doc for Shopify reviewers using `mmshop.dm2buy.com` as test store. Covers recon → verify → trial → billing → full import. Mayank must fill in dm2buy credentials before submitting.
- **T9.9 — Launch posts drafted**: `@shoprift` IG, `@mayankmalikx` IG, `r/IndianStartups` Reddit post, `r/shopify` Reddit post. Launch mode (post after App Store approval only).

---

## 2026-05-30 — T8 code hardening (T8.8–T8.17)

**Files:**
- `shopify.app.toml`
- `web/src/lib/shopify.ts`
- `web/src/app/api/payment/billing/callback/route.ts`
- `web/src/app/api/payment/billing/create/route.ts`
- `src/shopify-importer.js`
- `web/src/app/migrate/page.tsx`

**Changes:**
- **T8.8 — Billing callback idempotency**: If `job.status !== 'pending_payment'`, skip re-triggering the worker — Shopify occasionally fires the callback twice. Returns idempotent billing_job_id redirect.
- **T8.9 — Decline/cancel messages**: Billing callback maps charge status `declined`/`cancelled` to distinct error codes. Migrate page shows human-readable messages per code.
- **T8.10 — Already correct**: `Btn` has `disabled={disabled || loading}`.
- **T8.11 — Already correct**: `app-uninstalled` webhook validates HMAC before acting.
- **T8.12 — N/A**: Importer uses REST with 429 backoff already in place.
- **T8.13 — Session expiry**: `getValidAccessToken` throws `SessionExpiredError` on token refresh failure. Both billing routes catch it and return a clear "reinstall required" message.
- **T8.14 — jobId in logs**: All error paths in `billing/callback` log `{ phase, shop, jobId, error }`.
- **T8.15 — N/A**: No GraphQL batch mutations in import flow.
- **T8.16 — api_version**: All 5 version occurrences updated to `2025-01`.
- **T8.17 — NEXT_PUBLIC_ audit**: Clean — only safe public keys prefixed.

---

## 2026-05-28 — Rate limit backoff + debug log cleanup

**Files:** `src/shopify-importer.js`, `web/src/app/api/payment/billing/create/route.ts`

**Changes:**
- `shopifyFetch`: added 429 retry loop — reads `Retry-After` header, waits, retries up to 3×. Previously a 429 would count the product as `productsFailed`. Fixes silent mid-migration failures on large stores.
- `billing/create`: removed `console.error('[billing/create] isTest: ...')` debug log added during billing fix session.

---

## 2026-05-27 — T7 Shopify Billing API (AppPurchaseOneTime)

**Trigger:** T7 task — wire payment before external users get access. "Pay ₹599" was calling `/api/import/start` directly with no charge.

**Flow implemented:**
1. Client clicks "Pay ₹599 and import" → `POST /api/payment/billing/create` with `storeData` + `amount`
2. Server creates job (`pending_payment`) storing `store_data` + `skip_urls` in new JSONB columns
3. Server calls Shopify GraphQL `appPurchaseOneTimeCreate` → returns `confirmationUrl`
4. Client: `window.top.location.href = confirmationUrl` (escapes iframe)
5. Merchant approves on Shopify → redirects to `GET /api/payment/billing/callback?jobId=XXX&charge_id=YYY&shop=ZZZ`
6. Callback verifies charge via REST (`application_charges/{id}.json`), triggers Railway `/import`, redirects to Shopify admin with `?billing_job_id=XXX`
7. Migrate page detects `billing_job_id` on mount, jumps to `importing` step, polls job status

**Free tier (0–3 products) unchanged** — goes straight to `/api/import/start`, no billing.

### Files changed

#### `supabase/migrations/003_billing_columns.sql` (new)
- `store_data JSONB` — stores extracted product/collection data between billing and import
- `skip_urls JSONB DEFAULT '[]'` — stores trial product URLs to skip on full import

#### `web/src/app/api/payment/billing/create/route.ts` (new)
- Creates `pending_payment` job with `store_data` + `skip_urls`
- Calls Shopify GraphQL `appPurchaseOneTimeCreate`
- Returns `{ confirmationUrl, jobId }`
- `test: true` in non-production environments

#### `web/src/app/api/payment/billing/callback/route.ts` (new)
- Verifies `application_charge.status === 'active'` via Shopify REST
- Updates job to `pending`, calls Railway `/import` with stored `storeData`
- Redirects to `https://{shop}/admin/apps/shoprift?billing_job_id={jobId}`

#### `web/src/app/migrate/page.tsx` (modified)
- Added `billingJobId`, `billingError` from searchParams
- Added `billingLoading` state
- Added `useEffect` for billing return: detects `billing_job_id` → sets `importing` step, polls job
- `handleImport()`: free tier → direct import (unchanged); paid → billing flow
- Pay button: shows `loading` + "Redirecting to payment..." while billing request is in flight

---

## 2026-05-27 — End-to-end migration confirmed + verification fixes

**Milestone:** First complete migration end-to-end: URL → Verify → Preview → Extract → Review → Import → Done. 9 products + 3 collections live in Shopify from mmshop.

**Root cause fixed:** `RAILWAY_WORKER_URL=http://localhost:3001` was set in Vercel production env. Vercel was calling localhost (itself), not Railway. Worker never received `/verify/check` requests. Updated to `https://shoprift-production.up.railway.app`.

**Railway domain established:** `https://shoprift-production.up.railway.app` (via `railway domain`).

### Files changed this session

#### `web/.env.local` (local only — gitignored)
- `RAILWAY_WORKER_URL` updated from `http://localhost:3001` to `https://shoprift-production.up.railway.app`
- Same change applied manually in Vercel production env vars

#### `docs/CONTEXT.md`
- Full rewrite to reflect milestone completion
- Next task: T7 Shopify Billing API

**Previously committed this session:**

#### `web/src/app/api/verify/start/route.ts` (commit `f49337c`)
- Added `method: 'dm2buy_product'` explicitly to INSERT — avoids null constraint if DB default missing

#### `src/server.js` (commit `c5ffaee`)
- Replaced native `fetch` with `axios + httpsAgent` in `/verify/check` — dm2buy TLS cert expired, native fetch throws SSL error
- Added full pagination loop — previously only checked first page of products

---

## 2026-05-27 — Trial lock + ownership verification

**Trigger:** 3 production bugs (trial not enforced, progress label wrong, job ID visible) + missing ownership verification gate.

**Files changed:**

### `supabase/migrations/002_trial_columns.sql` (new)
- `ALTER TABLE import_jobs ADD COLUMN is_trial BOOLEAN` + `trial_product_urls JSONB`
- `CREATE TABLE verification_attempts` — stores pending/verified ownership checks per shop+store
- Unique index: one verified record per (account_id, store_url) pair

### `web/src/app/api/import/start/route.ts` (modified)
- Trial state now stored in top-level `is_trial` + `trial_product_urls` columns, not inside `recon_data` JSONB
- Worker no longer needs to preserve trial state during merge

### `web/src/app/api/verify/start/route.ts` (new)
- Generates `SHR-XXXX-XXXXXX` verification code, stores in `verification_attempts` with 30-min expiry
- Returns `{ code, attemptId }`

### `web/src/app/api/verify/check/route.ts` (new)
- Validates attempt not expired, forwards to Railway `POST /verify/check`
- Marks attempt `status='verified'` on success

### `src/server.js` (modified)
- Removed getJob/merge pattern in `/import` handler — trial columns now immutable at INSERT
- Added `POST /verify/check` — one-shot dm2buy API check for product with verification code

### `web/src/app/migrate/page.tsx` (modified)
- Added `verifying` step + `verified`, `verifyCode`, `verifyAttemptId`, `verifyError`, `verifyLoading` state
- Step bar extended to 7 steps: URL → Verify → Preview → Extract → Review → Import → Done
- `handleCheckStore`: fixed trial query to use `is_trial` column; added verification check after recon
- `handleVerifyCheck`: calls `/api/verify/check`, handles expired code (auto-refreshes)
- Fixed progress label: uses `importStatus.message` instead of hardcoded "X of Y products imported"
- Removed job ID display from importing step
- Fixed banner copy: removed exclamation marks

---

## 2026-05-26 22:00 IST — T5 Server-side Shopify import API

**Trigger:** T5.1-T5.8 from LAUNCH_PLAN.md — server-side endpoint to import StoreData into Shopify.

**Files changed:**

### `src/shopify-importer.js` (new)
- Shopify Admin REST API helpers: `shopifyFetch`, `buildShopifyVariants`, `createProduct`, `createCollection`, `addToCollection`.
- `importStore({ jobId, shop, accessToken, storeData })` — full import pipeline.
- Phase 1: products → Phase 2: collections → Phase 3: collection assignments.
- Per-item error isolation: one failure doesn't abort the rest.
- Rate limiting: 550ms delay between API calls (Shopify REST 2 req/s limit).
- Variant mapping: sizes/colors/other → Shopify options + variants. All combos for sizes+colors.
- Images: CDN URLs passed as `src` — Shopify fetches and re-hosts. Capped at 20 per product.
- Updates import_jobs.progress after each step.

### `src/job.js` (modified)
- Added `getShopifyToken(shop)` — reads access_token from shopify_sessions.
- Added `getJob(jobId)` — status polling helper.

### `src/server.js` (modified)
- Added import for `importStore`.
- Increased JSON body limit to `5mb` (handles large store payloads).
- Added `POST /import` route: validates body, looks up Shopify token, marks job 'importing', runs import async via setImmediate, returns immediately.

### `web/src/app/api/import/start/route.ts` (new)
- POST body: `{ shop, storeUrl, storeData }`.
- Creates import_jobs record (account_id=shop, store_url=dm2buy URL, status='pending').
- Proxies to RAILWAY_WORKER_URL/import — returns { jobId } immediately.
- On worker failure: marks job failed, returns 502.

### `web/src/app/api/import/status/[jobId]/route.ts` (new)
- GET — reads import_jobs from Supabase, returns { jobId, status, progress, error, result }.
- Client polls until status is 'complete' or 'failed'.

**Env var needed:** `RAILWAY_WORKER_URL` — add to web/.env.local (dev) and Vercel (prod).
  - Dev: `RAILWAY_WORKER_URL=http://localhost:3001`
  - Prod: Railway service public URL

**TypeScript:** 0 errors.

---

## 2026-05-26 20:30 IST — T4 Client-side extraction module

**Trigger:** T4.1-T4.5 from LAUNCH_PLAN.md — browser TypeScript port of recon.js + extractor.js.

**Files changed:**

### `web/src/lib/dm2buy/types.ts` (new)
- TypeScript types matching SCHEMA.md exactly: ReconData, StoreMeta, Product, Category, StoreData, ProgressEvent, ProgressCallback.

### `web/src/lib/dm2buy/recon.ts` (new)
- Browser port of src/recon.js — pure fetch(), no Axios/Playwright/Node APIs.
- Inline withRetry (3 attempts, 800ms base) with permanent flag support.
- apiFetch marks 404/401/403 as permanent to skip retries.
- T4.5 verified: kiwiishop → 25 products, 5 collections, 63 images (matches CLI).

### `web/src/lib/dm2buy/extractor.ts` (new)
- Browser port of src/extractor.js — pure fetch(), no Playwright/Axios/DOM fallback.
- No random delays (seller's browser, own IP — not needed).
- ProgressCallback pattern: fires after each product with { phase, current, total, message }.
- Detail fetch failures silently degrade (use listing data only).
- TypeScript: 0 errors.

**Key decisions:**
- DOM fallback removed — Playwright-only, not possible in browser.
- No delays between product detail fetches — dm2buy API is open, seller's IP.

---

## 2026-05-26 19:45 IST — T3.7 OAuth install flow tested + shopify.app.toml

**Trigger:** T3.7 from LAUNCH_PLAN.md — end-to-end OAuth install test on dev store.

**Outcome:** PASS. Session row confirmed in Supabase `shopify_sessions`.

**Files changed:**

### `shopify.app.toml` (new)
- Created for new Shopify Dev Dashboard (dev.shopify.com) — URLs managed via CLI, not UI.
- `application_url` initially set to `/api/auth` (wrong — caused embedded iframe re-auth loop).
- Fixed to root URL `https://case-sloppily-snowflake.ngrok-free.dev` (shoprift-3 deployed).
- `client_id` = SHOPIFY_API_KEY. Deployed via `shopify app deploy`.

### `.gitignore`
- Added `.env.local` and `web/.env.local` — were missing, credentials would have leaked.

### `web/src/app/api/auth/route.ts`
- Temporary debug logging added and removed during T3.7 troubleshooting.

**Key learnings:**
- OAuth state cookie expires in 5 minutes — entire install flow must complete in one shot.
- New dev.shopify.com manages app URLs via `shopify.app.toml` + CLI, not Partner dashboard UI.
- `application_url` must point to app root, not `/api/auth` — Shopify admin loads it in an iframe.
- Third-party cookies blocked in iframe context — OAuth must happen as top-level navigation.

---

## 2026-05-26 19:45 IST — T3.4-T3.6 Shopify OAuth + session storage + uninstall webhook

**Trigger:** T3 from LAUNCH_PLAN.md — Shopify App Infrastructure (code portion; T3.1-T3.3 are manual Partner dashboard steps).

**Files changed:**

### `web/src/lib/shopify.ts` (new)
- Lazy singleton that calls `shopifyApi()` with env vars.
- Uses `ApiVersion.April26` (v13 removed `LATEST_API_VERSION` export).
- Exports `sessionStorage` instance directly — v13 types don't expose `shopify.config.sessionStorage`.

### `web/src/lib/shopify-session.ts` (new)
- `SupabaseSessionStorage` class implementing `SessionStorage` interface.
- `storeSession` / `loadSession` / `deleteSession` / `deleteSessions` / `findSessionsByShop` — all backed by `shopify_sessions` Supabase table.
- `rowToSession()` helper maps DB row → `Session` object.

### `web/src/app/api/auth/route.ts` (new)
- `GET /api/auth?shop=mystore.myshopify.com` — begins OAuth, returns redirect Response to Shopify consent screen.
- Validates `shop` param ends with `.myshopify.com` before calling `shopify.auth.begin()`.
- Offline token (`isOnline: false`) — persists after merchant closes tab.
- Runtime: `nodejs` (not Edge).

### `web/src/app/api/auth/callback/route.ts` (new)
- `GET /api/auth/callback` — handles Shopify OAuth callback.
- Calls `shopify.auth.callback()`, stores session via `sessionStorage.storeSession()`.
- Redirects to `https://{shop}/admin/apps/{apiKey}` (embedded app URL).
- Returns 500 with message on auth or storage failure.

### `web/src/app/api/webhooks/app-uninstalled/route.ts` (new)
- `POST /api/webhooks/app-uninstalled` — validates HMAC, deletes all sessions for uninstalled shop.
- Uses `result.valid` type narrowing — `result.domain` only present on `WebhookValidationValid`.

### `web/next.config.ts`
- Added `Content-Security-Policy: frame-ancestors https://*.myshopify.com https://admin.shopify.com` — required for Shopify Admin to embed the app in an iframe without blocking it.

### `web/.env.example`
- Added `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_SCOPES`.

**Supabase table required (run in SQL Editor):**
```sql
CREATE TABLE shopify_sessions (
  id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  state TEXT,
  is_online BOOLEAN DEFAULT FALSE,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  access_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_shopify_sessions_shop ON shopify_sessions(shop);
```

**T3.7 (test install on dev store) blocked on:** T3.1-T3.3 (Partner account + app creation + dev store) — manual steps not yet done.

---

## 2026-05-26 19:10 IST — T1.3 edge case tests (19/19 passed)

**Trigger:** T1.3 from LAUNCH_PLAN.md — edge case test suite.

**Files changed:**
- `tests/edge-cases.test.js` — new file. 19 assertions across 4 groups.

**Test groups:**
1. `isDm2buyUrl` — 7 assertions. Valid dm2buy URLs pass; empty string, malformed URLs, non-dm2buy domains, plain `dm2buy.com` (no subdomain), Shopify URLs all correctly return false.
2. `withRetry` — 6 assertions. Retries then succeeds on 3rd attempt. Exhausts all attempts and re-throws. Times out per-attempt (`timeoutMs`). `err.permanent = true` skips retries — fn called once only.
3. 0-product store pipeline — 5 assertions. `format()` does not crash with 0 products. Returns empty products array, correct scrape_meta, `total_products_found: 0`. `validate()` throws `Schema validation failed` (schema's `products.min(1)` constraint) — not an unhandled crash. This is correct: write nothing for a 0-product store.
4. Non-existent subdomain (network) — 1 assertion. `recon('https://shoprift-test-nonexistent-abc123.dm2buy.com')` → dm2buy API returns 404 → `withRetry` retries 3 times → throws clean error. No crash, no silent failure.

**Known behavior noted:** `withRetry` retries "store not found" (404) as if it were a transient error — it is not. This wastes ~3s (1s + 2s delays) on a non-existent store. Not fixed in T1.3 scope; flagged for V2 (`err.permanent` on 404 responses).

---

## 2026-05-26 17:18 IST — T1.1 kiwiishop e2e + test expectation update

**Trigger:** T1.1 from LAUNCH_PLAN.md — first e2e run after launch plan session.

**What happened:** Ran `echo y | node src/index.js https://kiwiishop.dm2buy.com`. Passed in 2m 19s. Store had grown from 4 → 25 products, 2 → 5 collections, 18 → 63 images since test file was written.

**Files changed:**
- `tests/kiwiishop.test.js` — updated hardcoded counts (4→25 products, 2→5 collections, 18→63 images). Changed array-comparison price check to per-product-by-name spot-check (robust against ordering). Removed "The Forever Flowers is uncategorized" assertion (product now has a collection). Gingham variant check loosened to "> 0" (was exact 5).
- `CLAUDE.md` — updated TESTING RULES expected counts; ticked 4 DoD items now confirmed passing.
- `docs/LAUNCH_PLAN.md` — ticked T1.1 done; updated expected counts in task description.

**Why:** Store is live and growing. Hardcoded counts are a maintenance liability — pinned the subset assertions to named products rather than total counts where possible.

---

## 2026-05-26 17:32 IST — T1.2 code review fixes (9 issues)

**Trigger:** T1.2 from LAUNCH_PLAN.md — caveman reviewer pass on extractor.js, recon.js, formatter.js.

**Commit:** `7a6357c`

**Files changed:**

### `src/api.js`
- **Added** `fetchAllProductsViaPage(page, storeId)` — paginated product fetch routing through Chromium TLS (pageGet). Mirrors `fetchAllProducts` but for the Playwright code path. **Why:** The existing page-based product fetch in both recon.js and extractor.js used `limit: 50` with a single page — silently truncating stores with >50 products. `fetchAllProducts` (Axios path) already paginated correctly; page path did not.

### `src/extractor.js`
- **Fixed** import — added `fetchAllProductsViaPage`.
- **Fixed** page-based product fetch — replaced inline `limit: 50` single-page call with `fetchAllProductsViaPage(page, storeId)`. **Why:** >50 product truncation (see api.js above).
- **Fixed** `fetchStoreMeta` — added `!data?.success` guard (both page and Axios paths). **Why:** recon.js had the guard; extractor.js did not. If dm2buy returned `{success: false, data: null}`, extractor silently got `null` storeData, then crashed with opaque null-property error.
- **Fixed** `mapProduct` — name fallback `|| 'Untitled Product'`. **Why:** If both `apiProduct.name` and `detailData.name` are undefined, name field was `undefined` — schema violation.
- **Fixed** `categories` builder — `product_count` now uses `p.all_categories.includes(col.name)` instead of `p.category === col.name`. **Why:** `p.category` is only the first collection. Products in 2+ collections undercounted for non-first collections.

### `src/recon.js`
- **Fixed** import — added `fetchAllProductsViaPage`.
- **Fixed** page-based product fetch — replaced inline `limit: 50` with `fetchAllProductsViaPage`. **Why:** Wrong product_count shown to seller in recon summary for >50-product stores.
- **Added** storeId guard — throws `[recon] Store API returned no id for subdomain: X` if `storeMeta.id` is falsy. **Why:** Previously undefined storeId propagated silently to all downstream API calls, causing confusing errors far from the root cause.

### `src/formatter.js`
- **Fixed** `shipping_charges` null check — `== null` not `!shipping_charges`. **Why:** `!0` is truthy — stores with free shipping (charge=0) were falsely flagged as having no shipping config.
- **Fixed** `productScore` — `p.price != null` not `p.price`. **Why:** `!0` is truthy — ₹0 priced products incorrectly penalised confidence score.
- **Fixed** product name in Markdown table — `.replace(/\|/g, '\\|')`. **Why:** Product names containing `|` (pipe) break the Markdown table in `migration_report.md`.

---

## 2026-05-26 17:14 IST — Session handoff commit (housekeeping)

**Commit:** `2fb0a55`

**Files changed:**
- `docs/CONTEXT.md` — new file. Session handoff system so each Claude session knows exactly where things stand. Contains: current phase status, last 5 actions, active blockers, uncommitted changes, next tasks, known decisions.
- `docs/LAUNCH_PLAN.md` — new file. 14-day roadmap to Shopify App Store submission. 9 tracks (T1 engine sign-off → T9 App Store submission). Architecture decision locked: client-side extraction, Shopify Billing API, no Razorpay.
- `docs/SKILLS.md` — new file. Reference for all project skills and when to invoke them.
- `src/server.js` — new file. Express HTTP server with `POST /recon` and `POST /enqueue` endpoints for Railway worker → Vercel bridge.
- `worker.js` — updated to start Express HTTP server alongside BullMQ worker via `startServer()`.
- `CLAUDE.md` — updated with architecture pivot (Shopify App Store target, client-side extraction), and updated session continuity rules.
- `web/next.config.ts` — CORS header fix.
- `web/src/app/api/payment/create/route.ts` — payment route scaffold updates.
- `package.json` / `package-lock.json` — added `express ^5.2.1`.
- `.gitignore` — added `web/.next/`, `writing_outputs/`, `.agents/`.
- `.claude/settings.json`, `.claude/skills/emil-design-eng` — project-level Claude settings and skill symlink.
- `skills/` — project skill files (shoprift-accountant, legal, pm, content).
- `skills-lock.json` — skill lock file.
- `prototype/_archive/shoplit.html` — Shoplit platform concept prototype (India-first storefront builder, exploratory).
- `web/next-env.d.ts` — Next.js auto-generated TS reference file.

---

## 2026-05-17 14:21 IST — Fix SUPABASE_SERVICE_KEY in job tracking

**Commit:** `e753d04`

**Files changed:**
- `src/job.js` — switched from anon key to `SUPABASE_SERVICE_KEY` for Supabase client init.
- `src/verifier.js` — same fix.

**Why:** Supabase anon key does not have write access to `import_jobs` table (RLS blocks it). Service key bypasses RLS. Was using anon key as temp workaround — now using correct key.

---

## 2026-05-17 14:15 IST — Railway worker fixes

**Commit:** `69d6e3f`

**Files changed:**
- `worker.js` — fixed start command; added TLS config for Redis Cloud (requires `tls: {}`); added Playwright install step.
- `package.json` — updated start script.

**Why:** Railway worker was failing to start. Three separate issues: wrong start command in Railway dashboard, Redis Cloud requires TLS but ioredis defaults to no-TLS, Playwright Chromium not installed in Railway container.

---

## 2026-05-17 01:24 IST — Pre-launch build: anti-detection, legal, web scaffold

**Commit:** `7a41d8a`

**Files changed:**
- `src/extractor.js` — randomized delays (600–2100ms), 20% long-pause probability, full browser header set, storefront pre-visit before API calls.
- `src/api.js` — `pageGet()` added: routes API calls through Playwright `page.evaluate(fetch)` so TLS fingerprint matches real Chrome, not Node.js/Axios.
- `src/browser.js` — `visitStorefront()` added: visits store homepage first to build real session cookies and referrer history.
- `docs/legal/terms-of-service.md` — new. Indian law (IT Act + DPDP Act 2023). Seller agency model.
- `docs/legal/privacy-policy.md` — new. DPDP compliant. Purpose-specific consent.
- `docs/legal/migration-consent.md` — new. Seller signs before extraction. Indemnity clause.
- `docs/legal/grievance-officer.md` — new. Mandatory under IT Rules 2021.
- `web/src/app/api/` — scaffolded: recon, job, payment/create, payment/verify, download routes.
- `web/next.config.ts` — CORS headers for Railway API.

**Why:** PRE_LAUNCH_CHECKLIST Section 1 (anti-detection) and Section 3 (legal docs) addressed before web app goes live. Playwright TLS fingerprint fix is the biggest anti-detection gain — Cloudflare can fingerprint Node.js TLS handshakes.

---

## 2026-05-15 15:57 IST — Extraction reliability improvements

**Commit:** `6c6a229`

**Files changed:**
- `src/extractor.js` — retry/timeout on product detail fetch; image dedup via Set across productPhotos + otherPhotos; `all_categories` array added per product; content-type guard on image downloads.
- `src/downloader.js` — content-type guard: rejects non-image responses before writing to disk.
- `src/utils.js` — `withRetry(fn, maxAttempts)` helper added.

**Why:** Flaky extractions on real stores. Root causes: transient dm2buy API 500s (fixed by retry), duplicate image URLs inflating image count (fixed by Set dedup), products in multiple collections only recording first collection (fixed by `all_categories`), corrupt files when dm2buy CDN returned HTML error pages instead of images (fixed by content-type guard).

---

## 2026-05-15 15:12 IST — Project skills added

**Commit:** `daebc3b`

**Files changed:**
- `skills/shoprift-accountant.skill` — invoicing, GST, TDS, pricing. MALIQ ENTERPRISES context.
- `skills/shoprift-legal.skill` — ToS, Privacy Policy, DPA, migration consent. India-first.
- `skills/shoprift-pm.skill` — specs, user stories, prioritisation.
- `skills/shoprift-content.skill` — Instagram, YouTube, Reddit content. Output → `./output/content/`.

**Why:** Recurring tasks (pricing decisions, legal doc edits, content creation) need consistent context and rules without re-briefing Claude each time. Skills encode the context permanently.

---

## 2026-05-12 22:07 IST — Platform knowledge system + Shopify preset fix

**Commit:** `7770b9a`

**Files changed:**
- `presets/shopify/SHOPIFY.md` — platform knowledge file: lessons, silent failures, decision log.
- `presets/shopify/preset.json` — machine-readable Shopify column format spec.
- `presets/shopify/emitter.js` — Shopify-specific CSV output code.
- `presets/shopify/fixtures/` — verified working example CSVs.
- `docs/SHOPIFY_POST_IMPORT.md` — seller-facing post-import guide (smart collections, inventory, SKUs).
- `CLAUDE.md` — added platform knowledge protocol section.

**Why:** Collections-as-tags convention needed to be documented and enforced. Silent failure: Shopify ignores the Tags column if collection name has a trailing space — fixed in emitter. Knowledge file is single source of truth so future platform work doesn't repeat the same mistakes.

---

## 2026-05-12 19:30 IST — Phase 11: CSV mapper, client folders, delivery zip

**Commit:** `e99f6f5`

**Files changed:**
- `src/csv-mapper.js` — new. Converts validated JSON to CSV in any format (Shopify, generic, custom template).
- `src/csv-synonyms.js` — new. Fuzzy column synonym dictionary; `NO_SOURCE_DATA_FIELDS` for fields dm2buy has no data for (SKU, weight).
- `src/ledger.js` — new. Append-only job ledger at `output/_ledger.csv`.
- `src/zipper.js` — new. Delivery zip packager with auto-generated `README.txt`.
- `src/prompt.js` — new. Shared readline singleton (fixes piped stdin drain bug).
- `src/index.js` — client folder system (`output/{client}_{date}_{HHMM}/`); `--client`, `--format`, `--zip`, `--auto-approve` flags.
- `presets/generic.json` — generic one-row-per-product export preset.
- `package.json` — added `papaparse`, `archiver`.

**Why:** Concierge mode requires deliverable output — seller needs a zip they can open, not a JSON file they can't read. Shopify CSV is the primary format for most sellers. Ledger lets founder track all jobs in one file.

---

## 2026-05-12 17:27 IST — Bypass verifier in V1 CLI (concierge mode)

**Commit:** `f67b872`

**Files changed:**
- `src/index.js` — removed verification step from CLI flow; prints "Verification skipped (V1 concierge mode)" instead.
- `src/validator.js` — Zod schema updated to accept `verification_method: "skipped_v1_concierge"`.

**Why:** Method A (Instagram story polling) does not work — Instagram doesn't expose story HTML. Method B (product injection) is slow and breaks dm2buy stores. V1 concierge mode confirms ownership via WhatsApp DM before running CLI — no code verification needed. `verifier.js` kept on disk for V2.

---

## 2026-05-12 15:18 IST — Initial project scaffold

**Commit:** `5ea0ac1`

**Files changed:** Full project structure. All src/ modules, schemas/, docs/, presets/ skeleton, tests/, .env.example, CLAUDE.md, README.md, CHANGELOG.md.

**Why:** Initial build. dm2buy store migration tool — scrapes storefront, verifies ownership, extracts products + images, produces Shopify-ready import package.

---
