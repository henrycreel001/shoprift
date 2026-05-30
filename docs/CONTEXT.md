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

- **Date:** 2026-05-29
- **Session topic:** Full publishing status audit — read all 4 planning docs, reconciled stale checkboxes, added T8.8-T8.18 + T9.10-T9.12 to LAUNCH_PLAN.md, fixed LAUNCH_STABILITY_CHECKLIST.md Section 9, marked PRE_LAUNCH_CHECKLIST.md complete, slimmed CONTEXT.md NEXT TASKS to point at LAUNCH_PLAN.md.
- **Branch:** main — clean (last commit: `315308e`)

---

## CURRENT PHASE STATUS

| Group | Phase | Status | Notes |
|-------|-------|--------|-------|
| A — Engine | 0–10 | ✅ Complete | kiwiishop: 25 products, 5 collections, 63 images ✅ |
| B — CSV mapper | 11 | ✅ Complete | Shopify + generic preset shipped |
| C — Web app | T1–T7 | ✅ Complete | Full flow incl. Shopify Billing (AppPurchaseOneTime). 9 products + 3 collections confirmed live in Shopify via paid test charge. Railway wiring done. |
| D — Launch | Phase 1 | ✅ Complete | GDPR webhooks, App Bridge, JWT auth, GraphQL billing, dynamic CSP. |
| D — Launch | Phase 2 | ✅ Complete | Rate limiting (3/hr on verify/start) + error response hardening. |
| D — Launch | Phase 3 | ✅ Complete | Sentry on web (@sentry/nextjs v10) + Railway worker (@sentry/node). SENTRY_DSN set in Vercel + Railway. |
| D — Launch | Phase 4 | ✅ Complete | AUP + DMCA drafted. /terms /privacy /refund-policy pages live. Footer + pre-billing refund link in migrate UI. |
| D — Launch | Phase 5 | 🟡 Code done, 2 manual deploys pending | PostHog ✅, billing-update webhook ✅, webhook dedup ✅, domain ✅, email replaced ✅. See Active Blockers. |
| D — Launch | Phase 6 | ⬜ Not started | App Store submission — all manual tasks. |
| UI quality | Pre-launch review | ✅ Complete | All 17 issues resolved and committed. |
| PRE_LAUNCH_CHECKLIST | All items | ✅ Complete | Anti-detection ✅, scaling ✅, legal ✅, domain/email replaced ✅ |

---

## LAST 5 ACTIONS (most recent first)

1. **Pre-launch review — 6 remaining fixes** — `web/src/app/migrate/page.tsx` commit `315308e`: #7 step back-navigation (completed steps clickable), #11 duplicate migration warning, #12 "Checking account…" button state, #13 verification code countdown timer, #14 "View collections" button in done step, #17 focus management on step transitions.
2. **Pre-launch review — first 9 fixes** — same file: error banner, zero-product guard, progress fast-start, cancel buttons, import error dismissal fix, back-nav on results, poll cleanup, App Bridge redirect for billing, trial→full extraction dedup.
3. **In-app UI redesign** — `web/src/app/migrate/page.tsx` full rewrite: custom Tailwind dark-theme (`bg-void #0A0B0F`), Geist + Geist Mono, custom Btn/StepTrack/ProgressTrack/Alert components, inline SVGs. `tailwind.config.ts`, `globals.css`, `layout.tsx` updated with brand tokens.
4. **Landing page content overhaul** — `shoprift-landing-v5.html`: 15 edits — CSV→direct import model, `Dm2buy`→`dm2buy` casing, hero/steps/FAQs rewritten. All CTA/pricing/email/legal link/handle fixes already done prior session.
5. **Phase 5 + domain migration** — PostHog analytics (10 events), billing-update webhook, webhook dedup (migration 005 written), all URLs → shoprift.app, support@shoprift.app routing live, all 26 occurrences replaced across 7 files.

---

## ACTIVE BLOCKERS

None. Phase 5 deploys completed 2026-05-30 (migration 005 + shopify app deploy → shoprift-7).

---

## UNCOMMITTED CHANGES

None. Working tree clean as of `315308e`.

---

## NEXT TASKS

**All remaining work is tracked in `docs/LAUNCH_PLAN.md` (T8 + T9). This section shows only the immediate next actions.**

### 1 — Phase 5 deploys (Mayank — unblock everything else)
1. Run `supabase/migrations/005_charge_id_and_webhook_dedup.sql` in Supabase production SQL editor
2. Run `shopify app deploy` from project root

### 2 — T8 code hardening (Claude — next coding session, after deploys)
T8.8 billing callback idempotency · T8.9 decline message · T8.10 double-charge button · T8.11 webhook HMAC · T8.12 GraphQL rate limit backoff · T8.13 offline token expiry · T8.14 jobId in logs · T8.15 mutation batching verify · T8.16 api_version · T8.17 NEXT_PUBLIC_ audit

### 3 — T8 manual QA (Mayank — after code hardening committed)
T8.1 kiwiishop E2E · T8.2 mmshop E2E · T8.3 large store test · T8.4 error scenarios · T8.5 billing flow · T8.7 perf test · T8.18 browser console check

### 4 — T9 pre-submission (Mayank — can do in parallel with QA)
T9.2 app icon · T9.3 screenshots · T9.4 demo video · T9.10 emergency contact in Partner Dashboard · T9.11 test credentials for reviewers · T9.12 listing language rule 1.1.13 audit

### 5 — Submit
Confirm distribution = Public (**IRREVERSIBLE — only after QA passes**) → T9.6 fill listing form → T9.7 submit

---

## DEFERRED TASKS (post-App Store submission)

These were explicitly saved for later — not blockers for submission, but queued for future sessions.

| Task | Notes |
|------|-------|
| **Phase 2 — URL page welcome context** | Small welcome banner above step tracker on URL step only. Shows Shoprift name/tagline + 3 bullets (Products · Images · Collections → Shopify). Collapses after step 1. Gives new users context. |
| **Phase 3 — Landing page light theme** | Convert `Shoprift Designs and Brand/shoprift-landing-v5.html` from dark (`#0A0B0F`) to light (white/light-gray bg, dark text, keep `#00E5A0` mint). Same layout and content. |
| **Future marketing website** | Full interactive site at `shoprift.app` with docs subdomain, demos, screenshots, pricing. Legal pages currently on Vercel app URL are temporary — move them here when site is built. Do not build until app is live and generating revenue. |
| **Gmail "Send mail as"** | Configure `support@shoprift.app` as send-from alias in Gmail SMTP settings. Routing already live (Cloudflare → `001henrycreel@gmail.com`). |
| **Polaris refactor** | In-app UI currently custom Tailwind dark theme. Post-approval V1.1 — refactor `migrate/page.tsx` to Shopify Polaris for native admin look. |
| **Shoplit platform** | Separate India-first storefront concept. Prototype at `prototype/shoplit.html`. Market research at `writing_outputs/ecommerce_smb_india_2025/final/`. Do not start until Shoprift is generating revenue. |

---

## VERCEL ENV VARS (complete list)

| Variable | Source |
|----------|--------|
| `SHOPIFY_API_KEY` | Shopify Partner dashboard → App setup |
| `SHOPIFY_API_SECRET` | Shopify Partner dashboard → App setup |
| `SHOPIFY_APP_URL` | `https://shoprift.app` |
| `SHOPIFY_SCOPES` | `read_products,write_products` (+ others per toml) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase project → Settings → API (service_role) |
| `RAILWAY_WORKER_URL` | `https://shoprift-production.up.railway.app` |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project settings |
| `RAZORPAY_KEY_ID` | Scaffolded, not yet active |
| `RAZORPAY_KEY_SECRET` | Scaffolded, not yet active |

---

## KNOWN DECISIONS / CONTEXT

- **Extraction: client-side** — seller's browser runs extraction against dm2buy API (CORS open). Server only handles Shopify Admin API import. No proxy rotation needed.
- **Shopify app embedded** — loads inside Shopify admin iframe. `shop` param arrives via URL query string (`?shop=shoprift-dev.myshopify.com`). CSP `frame-ancestors` set.
- **Trial detection architecture** — `is_trial` and `trial_product_urls` are top-level DB columns set at job INSERT time, never written by the Railway worker. Worker only writes `recon_data` (import results), `progress`, `status`, `error`.
- **Verification method** — Method B: dm2buy product injection. User adds a product named `SHR-XXXX-XXXXXX` to their dm2buy store. Railway worker checks via dm2buy public API (paginated, axios+httpsAgent for expired TLS cert bypass). One verified record per (shop, store_url) pair — stays verified permanently.
- **RAILWAY_WORKER_URL** — `https://shoprift-production.up.railway.app` (production + local .env.local). Must be set in Vercel env vars.
- **dm2buy TLS cert expired** — All server-side API calls to `api.dm2buy.com` MUST use `axios + httpsAgent` with `rejectUnauthorized: false`. Pattern in `src/api.js`. Never use native `fetch` for dm2buy API calls from Node.js.
- **Shopify Billing currency** — `AppPurchaseOneTime` created with `currencyCode: 'INR'`. Test mode: `isTest = NODE_ENV !== 'production'`.
- **Razorpay scaffolded but unused** — `/api/payment/create` exists. Shopify Billing API is the actual payment path.
- **PRE_LAUNCH_CHECKLIST** — effectively complete. The domain/email checkbox was left unticked but work was done (domain purchased, all 26 email occurrences replaced).

---

## SESSION NOTES

> Dev setup: `cd web && npm run dev` (port 3000) + ngrok forwarding to 3000 + Railway worker on port 3001 (`node worker.js`).
> Test store: `https://kiwiishop.dm2buy.com` — 25 products, 5 collections, 63 images.
> Test Shopify store: `shoprift-dev.myshopify.com`.
> mmshop (`https://mmshop.dm2buy.com`) is Mayank's test dm2buy store — 13 real products + verification artifacts.
