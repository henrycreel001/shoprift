# CONTEXT.md — Session Handoff File

> Claude reads this at the start of every new session.
> Claude updates this whenever a phase completes, a blocker hits, or user says **"update context"**.
> Do not use this for architecture decisions — those live in CLAUDE.md / ARCHITECTURE.md.

---

## HOW TO USE

**Starting a new session:** Read this file. You now know where things stand.
**Ending / compacting a session:** User says "update context" → rewrite the sections below with current state.
**Multiple parallel sessions:** Each session should note its topic in the Last Worked On section.

---

## LAST UPDATED

- **Date:** 2026-05-27
- **Session topic:** Billing flow confirmed E2E. Verification product bug fixed. Legal docs complete. Production readiness in progress.
- **Branch:** main (working, uncommitted changes in migrate/page.tsx)

---

## CURRENT PHASE STATUS

| Group | Phase | Status | Notes |
|-------|-------|--------|-------|
| A — Engine | 0–10 | ✅ Passing | kiwiishop: 25 products, 5 collections, 63 images ✅ |
| B — CSV mapper | 11 | ✅ Complete | Shopify + generic preset shipped |
| C — Web app | T1–T7 | ✅ Complete | Full flow incl. Shopify Billing (AppPurchaseOneTime). 9 products + 3 collections confirmed live in Shopify via paid test charge. |
| D — Launch | 15 | 🟡 In progress | PRE_LAUNCH_CHECKLIST ✅ (except domain/email). Blocked on Vercel prod deploy + migration 004. |

---

## LAST 5 ACTIONS (most recent first)

1. **Verification product bug fixed** — When a store was already verified (short-circuit path in recon handler), `verifyCode` state was never set → filter at extraction skipped → `SHR-XXXX` product included in `storeData` sent to billing. Fix: `.select('id, code')` + `setVerifyCode(va.code)` on the short-circuit path (migrate/page.tsx ~line 262).
2. **Refund & Cancellation Policy drafted** — `docs/legal/refund-policy.md` v1.0. Consumer Protection (E-Commerce) Rules 2020 compliant. Covers pre-extraction cancellation, complete failure auto-refund, 70% threshold partial refund, Shopify Billing + UPI timelines.
3. **PRE_LAUNCH_CHECKLIST updated** — Proxy rotation + client-side decision ticked (N/A, client-side confirmed). Domain/email item added: 17 occurrences of personal email across 5 legal files to replace after domain purchase.
4. **Billing flow confirmed E2E** — AppPurchaseOneTime wired. Test charge approved. Import progress screen (step 6/7) and migration complete screen (9 products + 3 collections) confirmed working. `page.tsx` bug fixed: was dropping `billing_job_id` param on redirect to `/migrate`.
5. **T7 Billing API shipped** — `POST /api/payment/billing/create` + `GET /api/payment/billing/callback` wired. Shopify `AppPurchaseOneTime` mutation, charge verification, Railway worker trigger.

---

## ACTIVE BLOCKERS

| Blocker | Blocks | Notes |
|---------|--------|-------|
| Vercel production deploy not done | Real users | App still runs via ngrok → localhost:3000. Needs Vercel deploy with all env vars set + Shopify Partner app URL updated. |
| Migration 004 not run on production | Session refresh | `004_session_refresh_token.sql` adds `refresh_token` + `refresh_token_expires_at` to `shopify_sessions`. Must run in Supabase SQL editor before prod launch. |
| Domain not purchased | Legal / branding | All legal docs use personal email `001henrycreel@gmail.com`. Replace with domain email after purchase. |

---

## UNCOMMITTED CHANGES

- `web/src/app/migrate/page.tsx` — verification product filter fix (`.select('id, code')` + `setVerifyCode(va.code)` on short-circuit path)

---

## NEXT TASKS (in priority order)

1. **Commit current changes** — migrate/page.tsx verification fix.
2. **Deploy to Vercel** — set all env vars (see list below), update Shopify Partner app URL + redirect URL to Vercel domain.
3. **Run migration 004** — `supabase/migrations/004_session_refresh_token.sql` in Supabase SQL editor (production project).
4. **Test one full paid flow on production** — real Shopify store, Vercel URL, real test charge, full E2E.
5. **Buy domain** — then replace `001henrycreel@gmail.com` with domain email in all 5 legal files (17 occurrences).
6. **Add refund policy link to checkout UI** — must be visible before payment per Consumer Protection Rules 2020.

---

## VERCEL ENV VARS (complete list)

| Variable | Source |
|----------|--------|
| `SHOPIFY_API_KEY` | Shopify Partner dashboard → App setup |
| `SHOPIFY_API_SECRET` | Shopify Partner dashboard → App setup |
| `SHOPIFY_APP_URL` | Vercel production URL (e.g. `https://shoprift.vercel.app`) |
| `SHOPIFY_SCOPES` | e.g. `read_products,write_products` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase project → Settings → API (service_role) |
| `RAILWAY_WORKER_URL` | `https://shoprift-production.up.railway.app` |
| `RAZORPAY_KEY_ID` | Razorpay dashboard (scaffolded, not yet active) |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard (scaffolded, not yet active) |

---

## KNOWN DECISIONS / CONTEXT

- **Extraction: client-side** — seller's browser runs extraction against dm2buy API (CORS open). Server only handles Shopify Admin API import. No proxy rotation needed.
- **Shopify app embedded** — loads inside Shopify admin iframe. `shop` param arrives via URL query string (`?shop=shoprift-dev.myshopify.com`). CSP `frame-ancestors` set.
- **Trial detection architecture** — `is_trial` and `trial_product_urls` are top-level DB columns set at job INSERT time, never written by the Railway worker. Worker only writes `recon_data` (import results), `progress`, `status`, `error`.
- **Verification method** — Method B: dm2buy product injection. User adds a product named `SHR-XXXX-XXXXXX` to their dm2buy store. Railway worker checks via dm2buy public API (paginated, axios+httpsAgent for expired TLS cert bypass). One verified record per (shop, store_url) pair — stays verified permanently.
- **RAILWAY_WORKER_URL** — `https://shoprift-production.up.railway.app` (production + local .env.local). Must be set in Vercel env vars.
- **dm2buy TLS cert expired** — All server-side API calls to `api.dm2buy.com` MUST use `axios + httpsAgent` with `rejectUnauthorized: false`. Pattern lives in `src/api.js`. Never use native `fetch` for dm2buy API calls from Node.js.
- **Shopify Billing currency** — `AppPurchaseOneTime` created with `currencyCode: 'INR'`. Test mode: `isTest = NODE_ENV !== 'production'`.
- **Razorpay scaffolded but unused** — `/api/payment/create` exists. Shopify Billing API (`AppPurchaseOneTime`) is the actual payment path for the embedded app.

---

## SESSION NOTES

> Dev setup: `cd web && npm run dev` (port 3000) + ngrok forwarding to 3000 + Railway worker on port 3001 (`node worker.js`).
> Test store: `https://kiwiishop.dm2buy.com` — 25 products, 5 collections, 63 images.
> Test Shopify store: `shoprift-dev.myshopify.com`.
> mmshop (`https://mmshop.dm2buy.com`) is Mayank's test dm2buy store — 13 real products + verification artifacts.
