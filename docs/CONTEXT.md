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
- **Session topic:** Phase 0 complete — Vercel production deploy, migration 004, smoke test passing.
- **Branch:** main (clean)

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

1. **Phase 0 complete — Vercel production deploy** — App live at `https://project-pjqwm.vercel.app`. OAuth smoke test passed: `shoprift-dev.myshopify.com` installs and loads embedded app correctly. Supabase migration 004 run. shopify.app.toml updated to Vercel URLs (shoprift-4 active in Dev Dashboard).
2. **Verification product bug fixed** — `.select('id, code')` + `setVerifyCode(va.code)` on short-circuit path in migrate/page.tsx.
3. **Refund & Cancellation Policy drafted** — `docs/legal/refund-policy.md` v1.0.
4. **Billing flow confirmed E2E** — AppPurchaseOneTime wired, test charge approved, 9 products + 3 collections confirmed in Shopify.
5. **T7 Billing API shipped** — `POST /api/payment/billing/create` + `GET /api/payment/billing/callback`.

---

## ACTIVE BLOCKERS

| Blocker | Blocks | Notes |
|---------|--------|-------|
| Domain not purchased | Legal / branding | All legal docs use personal email `001henrycreel@gmail.com`. Replace with domain email after purchase. 17 occurrences across 5 files. |
| GDPR webhooks absent | App Store listing | `customers/data_request`, `customers/redact`, `shop/redact` not in toml. Phase 1 Task 1.1. |
| App Bridge not installed | App Store listing | No `@shopify/app-bridge` package, no meta tag in layout. Phase 1 Task 1.2. |
| JWT session token auth missing | Security | All API routes trust `shop` from request body. Phase 1 Task 1.3. |
| Billing callback uses REST | App Store rule 2.2.4 | Must use GraphQL for public apps. Phase 1 Task 1.4. |
| CSP static wildcard | Security | `*.myshopify.com` must be per-shop dynamic. Phase 1 Task 1.5. |

---

## UNCOMMITTED CHANGES

None.

---

## NEXT TASKS (in priority order)

1. **Phase 1 — GDPR webhooks** — add `compliance_topics` to `shopify.app.toml` + create `web/src/app/api/webhooks/compliance/route.ts`
2. **Phase 1 — App Bridge** — `npm install @shopify/app-bridge` + meta tag in layout + session token on API calls
3. **Phase 1 — JWT auth** — create `web/src/lib/auth.ts` + apply to 6 API routes
4. **Phase 1 — Billing callback REST→GraphQL** — `web/src/app/api/payment/billing/callback/route.ts:55`
5. **Phase 1 — Dynamic CSP middleware** — `web/src/middleware.ts`
6. **Buy domain** — replace `001henrycreel@gmail.com` in 5 legal files (17 occurrences)

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
