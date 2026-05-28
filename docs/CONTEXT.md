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
- **Session topic:** Phase 5 in progress — PostHog (10 events), billing-update webhook, webhook dedup, shoprift.app domain live, email replaced in all legal docs.
- **Branch:** main (uncommitted changes)

---

## CURRENT PHASE STATUS

| Group | Phase | Status | Notes |
|-------|-------|--------|-------|
| A — Engine | 0–10 | ✅ Passing | kiwiishop: 25 products, 5 collections, 63 images ✅ |
| B — CSV mapper | 11 | ✅ Complete | Shopify + generic preset shipped |
| C — Web app | T1–T7 | ✅ Complete | Full flow incl. Shopify Billing (AppPurchaseOneTime). 9 products + 3 collections confirmed live in Shopify via paid test charge. |
| D — Launch | Phase 1 | ✅ Complete | GDPR webhooks, App Bridge, JWT auth, GraphQL billing, dynamic CSP. |
| D — Launch | Phase 2 | ✅ Complete | Rate limiting (3/hr on verify/start) + error response hardening (no raw messages in response bodies). |
| D — Launch | Phase 3 | ✅ Complete | Sentry on web (@sentry/nextjs v10) + Railway worker (@sentry/node). onRequestError + global-error boundary. SENTRY_DSN set in Vercel + Railway. |
| D — Launch | Phase 4 | ✅ Complete | AUP + DMCA drafted. /terms /privacy /refund-policy pages live. Footer + pre-billing refund link in migrate UI. |
| D — Launch | Phase 5 | 🟡 In progress | PostHog ✅, billing-update webhook ✅, webhook dedup ✅, domain ✅, email replaced ✅. Pending: migration 005, `shopify app deploy`, public distribution confirm, E2E test. |
| D — Launch | Phase 6 | ⬜ Not started | App Store submission. |

---

## LAST 5 ACTIONS (most recent first)

1. **Domain + email migration** — shoprift.app purchased, connected to Vercel. `support@shoprift.app` Cloudflare Email Routing → `001henrycreel@gmail.com`. All 26 occurrences of `001henrycreel@gmail.com` replaced with `support@shoprift.app` across 7 files (legal docs + migrate page mailto links).
2. **Phase 5 partial** — PostHog analytics (10 events wired in migrate/page.tsx, lazy init, memory persistence, no autocapture). `APP_PURCHASES_ONE_TIME_UPDATE` webhook handler (billing-update/route.ts). Webhook deduplication (migration 005: charge_id column + webhook_idempotency table; all 3 webhook handlers dedup on X-Shopify-Webhook-Id). All URLs updated to shoprift.app.
3. **Phase 4 complete** — `docs/legal/acceptable-use.md` + `docs/legal/dmca.md` drafted (IT Act §79 safe-harbour). Three legal pages created: `/terms`, `/privacy`, `/refund-policy`. Footer + pre-billing refund link in migrate UI. Deployed to Vercel production.
4. **Phase 3 complete** — @sentry/nextjs (v10) wired: sentry.{client,server,edge}.config.ts + src/instrumentation.ts (onRequestError hook) + global-error.tsx boundary + withSentryConfig in next.config.ts. @sentry/node added to worker.js. SENTRY_DSN set in Vercel + Railway.
5. **Phase 2 complete** — Rate limiting on verify/start (3 per shop per hour, 429 response). Error hardening: raw DB/worker error.message stripped from all response bodies. Full detail logged to console.error only.

---

## ACTIVE BLOCKERS

| Blocker | Blocks | Notes |
|---------|--------|-------|
| Migration 005 not run | Billing webhook + dedup | Run `supabase/migrations/005_charge_id_and_webhook_dedup.sql` in Supabase production SQL editor. |
| `shopify app deploy` not run | Billing-update webhook registration | New webhook subscription in shopify.app.toml must be pushed to Shopify Partner API. |

---

## UNCOMMITTED CHANGES

- `web/src/lib/analytics.ts` — PostHog wrapper (new)
- `web/src/app/migrate/page.tsx` — 10 analytics events + email replaced
- `web/src/app/api/payment/billing/create/route.ts` — stores charge_id GID after charge creation
- `web/src/app/api/webhooks/billing-update/route.ts` — APP_PURCHASES_ONE_TIME_UPDATE handler (new)
- `web/src/app/api/webhooks/compliance/route.ts` — deduplication added
- `web/src/app/api/webhooks/app-uninstalled/route.ts` — deduplication added
- `shopify.app.toml` — billing-update webhook subscription + URLs updated to shoprift.app
- `supabase/migrations/005_charge_id_and_webhook_dedup.sql` — charge_id column + webhook_idempotency table (new, NOT YET RUN in production)
- `docs/legal/*.md` — email replaced with support@shoprift.app (6 files)
- `docs/CONTEXT.md` — updated

---

## NEXT TASKS (in priority order)

1. **Run migration 005** — execute `supabase/migrations/005_charge_id_and_webhook_dedup.sql` in Supabase production SQL editor
2. **`shopify app deploy`** — push toml changes to register billing-update webhook with Shopify
3. **Commit + deploy** — commit all Phase 5 changes, push to Vercel
4. **Phase 5.4** — confirm distribution = Public in Partner Dashboard (irreversible — production app only)
5. **Phase 5.5** — production E2E payment test (install → recon → verify → pay → import → complete)
6. **Phase 6 — App Store submission** — listing assets (`/shoprift-content`), demo video (30–60s), test credentials for reviewers, submit
7. **"Send mail as" in Gmail** — configure `support@shoprift.app` as send-from alias in Gmail SMTP settings (deferred by user)

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

## FUTURE WEBSITE / LANDING PAGE PLAN

**When built, move legal pages there.** Currently `/terms`, `/privacy`, `/refund-policy` live on the Vercel app URL (temporary). Once a proper Shoprift website exists, these pages should live there instead and links in the app should point to the new domain.

The future website should include:
- Full interactive modern aesthetic landing page
- Demos and screenshots of the migration flow
- Documentation at a `docs.` subdomain
- All legal pages (ToS, Privacy, Refund, AUP, DMCA, Grievance Officer)
- Pricing section

This is post-App Store submission scope. Do not build until app is live and generating revenue.

---

## SESSION NOTES

> Dev setup: `cd web && npm run dev` (port 3000) + ngrok forwarding to 3000 + Railway worker on port 3001 (`node worker.js`).
> Test store: `https://kiwiishop.dm2buy.com` — 25 products, 5 collections, 63 images.
> Test Shopify store: `shoprift-dev.myshopify.com`.
> mmshop (`https://mmshop.dm2buy.com`) is Mayank's test dm2buy store — 13 real products + verification artifacts.
