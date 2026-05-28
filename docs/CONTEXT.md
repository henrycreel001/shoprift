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
- **Session topic:** In-app UI redesign (migrate/page.tsx — full Tailwind dark theme, no AI slop), brand/landing page content overhaul (CSV→direct import model, dm2buy casing, all stale copy fixed).
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

1. **In-app UI redesign** — `web/src/app/migrate/page.tsx` fully rewritten from Polaris visual components to custom Tailwind dark-theme UI (`bg-void #0A0B0F`). Geist + Geist Mono fonts, custom Btn/StepTrack/ProgressTrack/Alert components, inline SVG icons. All business logic preserved. AppProvider retained (required for App Bridge). `tailwind.config.ts`, `globals.css`, `layout.tsx` updated with brand tokens. Zero TS errors, 200 on /migrate route confirmed.
2. **Landing page content overhaul** — `shoprift-landing-v5.html`: 15 edits fixing all stale CSV-delivery-model content (hero sub, output meta, how-it-works steps, terminal, 4 FAQs) + `Dm2buy` → `dm2buy` casing throughout. All 6 original planned fixes (CTAs, pricing, email, legal links, handle, ticker) were already done in a prior session.
3. **Brand/voice files audited** — `shoprift-brand-guidelines.html` and `shoprift-voice-messaging.html` already clean — no Dukaan references, correct handle (@mayankmalikx), correct domain (shoprift.app), direct-import delivery model already present. No changes needed.
4. **Domain + email migration** — shoprift.app purchased, connected to Vercel. `support@shoprift.app` Cloudflare Email Routing → `001henrycreel@gmail.com`. All 26 occurrences replaced across 7 files.
5. **Phase 5 partial** — PostHog analytics (10 events), billing-update webhook, webhook dedup (migration 005), all URLs → shoprift.app.

---

## ACTIVE BLOCKERS

| Blocker | Blocks | Notes |
|---------|--------|-------|
| Migration 005 not run | Billing webhook + dedup | Run `supabase/migrations/005_charge_id_and_webhook_dedup.sql` in Supabase production SQL editor. |
| `shopify app deploy` not run | Billing-update webhook registration | New webhook subscription in shopify.app.toml must be pushed to Shopify Partner API. |

---

## UNCOMMITTED CHANGES

- `web/src/app/migrate/page.tsx` — full UI redesign (dark theme, custom components, analytics, email) + 10 PostHog events
- `web/src/lib/analytics.ts` — PostHog wrapper (new)
- `web/tailwind.config.ts` — brand tokens (void, mint, portal) + Geist/Geist Mono vars + shimmer animation
- `web/src/app/globals.css` — shimmer keyframe + Polaris frame override
- `web/src/app/layout.tsx` — Geist + Geist Mono replacing Inter
- `web/src/app/api/payment/billing/create/route.ts` — stores charge_id GID after charge creation
- `web/src/app/api/webhooks/billing-update/route.ts` — APP_PURCHASES_ONE_TIME_UPDATE handler (new)
- `web/src/app/api/webhooks/compliance/route.ts` — deduplication added
- `web/src/app/api/webhooks/app-uninstalled/route.ts` — deduplication added
- `shopify.app.toml` — billing-update webhook subscription + URLs updated to shoprift.app
- `supabase/migrations/005_charge_id_and_webhook_dedup.sql` — charge_id column + webhook_idempotency table (NOT YET RUN in production)
- `docs/legal/*.md` — email replaced with support@shoprift.app (6 files)
- `Shoprift Designs and Brand/shoprift-landing-v5.html` — 15 content edits (CSV→direct import, dm2buy casing, FAQ rewrites)
- `docs/CONTEXT.md` — updated

---

## NEXT TASKS (in priority order)

1. **Run migration 005** — execute `supabase/migrations/005_charge_id_and_webhook_dedup.sql` in Supabase production SQL editor
2. **`shopify app deploy`** — push toml changes to register billing-update webhook with Shopify
3. **Commit + deploy** — commit all Phase 5 + UI redesign changes, push to Vercel
4. **Phase 5.4** — confirm distribution = Public in Partner Dashboard (irreversible — production app only)
5. **Phase 5.5** — production E2E payment test (install → recon → verify → pay → import → complete)
6. **Phase 6 — App Store submission** — app icon (1200×1200 PNG, manual Canva), 5 screenshots (manual capture), 30–60s demo video (manual record), submit via Partner Dashboard
7. **"Send mail as" in Gmail** — configure `support@shoprift.app` as send-from alias in Gmail SMTP settings (deferred)

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
