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

- **Date:** 2026-05-28
- **Session topic:** Phase 2 complete — rate limiting + error response hardening.
- **Branch:** main (clean)

---

## CURRENT PHASE STATUS

| Group | Phase | Status | Notes |
|-------|-------|--------|-------|
| A — Engine | 0–10 | ✅ Passing | kiwiishop: 25 products, 5 collections, 63 images ✅ |
| B — CSV mapper | 11 | ✅ Complete | Shopify + generic preset shipped |
| C — Web app | T1–T7 | ✅ Complete | Full flow incl. Shopify Billing (AppPurchaseOneTime). 9 products + 3 collections confirmed live in Shopify via paid test charge. |
| D — Launch | Phase 1 | ✅ Complete | GDPR webhooks, App Bridge, JWT auth, GraphQL billing, dynamic CSP. |
| D — Launch | Phase 2 | ✅ Complete | Rate limiting (3/hr on verify/start) + error response hardening (no raw messages in response bodies). |
| D — Launch | Phase 3–6 | 🟡 In progress | Sentry → Legal → Pre-submission ops → App Store submission. |

---

## LAST 5 ACTIONS (most recent first)

1. **Phase 2 complete** — Rate limiting on verify/start (3 per shop per hour, 429 response). Error hardening: raw DB/worker error.message stripped from all response bodies across verify/start, verify/check, import/start, billing/create — full detail logged to console.error only. Deployed to Vercel production.
2. **Phase 1 complete** — GDPR webhooks (compliance/route.ts + toml), App Bridge v3 (meta tag in layout + createApp/getSessionToken in migrate/page.tsx), JWT HS256 verification (lib/auth.ts applied to 5 routes + account_id guards), billing/callback REST→GraphQL, dynamic CSP middleware. Deployed to Vercel production.
3. **Phase 0 complete** — Vercel production deploy, OAuth smoke test passed, Supabase migration 004 run. shoprift-4 active in Dev Dashboard at `https://project-pjqwm.vercel.app`.
4. **Refund & Cancellation Policy drafted** — `docs/legal/refund-policy.md` v1.0.
5. **Billing flow confirmed E2E** — AppPurchaseOneTime wired, test charge approved, 9 products + 3 collections confirmed in Shopify.

---

## ACTIVE BLOCKERS

| Blocker | Blocks | Notes |
|---------|--------|-------|
| Domain not purchased | Legal / branding | All legal docs use personal email `001henrycreel@gmail.com`. Replace with domain email after purchase. 17 occurrences across 5 files. |
| Sentry not installed | Observability | No error tracking. Phase 3. |

---

## UNCOMMITTED CHANGES

None.

---

## NEXT TASKS (in priority order)

1. **Phase 3 — Sentry** — `@sentry/nextjs` on web + `@sentry/node` on Railway worker; add `SENTRY_DSN` to Vercel + Railway env vars
2. **Phase 4 — Legal** — AUP + DMCA drafting (`/shoprift-legal`), refund policy link before billing step
3. **Buy domain** — replace `001henrycreel@gmail.com` in 5 legal files (17 occurrences)
4. **Phase 5 — Pre-submission ops** — PostHog analytics, billing-update webhook, webhook dedup table, production E2E test
5. **Phase 6 — App Store submission** — listing assets, demo video, privacy page at /privacy, submit

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
