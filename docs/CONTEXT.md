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

- **Date:** 2026-06-07
- **Session topic:** Telegram concierge bot — live, tested E2E. Google Drive delivery working. /clearjobs added.
- **Branch:** main (last commit: `6091bf0`)

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
| D — Launch | Phase 5 | ✅ Complete | PostHog ✅, billing-update webhook ✅, webhook dedup ✅, domain ✅, email replaced ✅. Migration 005 + shopify app deploy → shoprift-7 both done. |
| D — Launch | Phase 6 | 🟡 In progress | T8 code hardening ✅. T8.3/T8.4/T8.7 ✅. T8 manual QA (T8.1/T8.2/T8.5/T8.18) blocked on Mayank doing browser QA. T9 pre-submission partial. |
| UI quality | Pre-launch review | ✅ Complete | All 17 issues resolved and committed. |
| PRE_LAUNCH_CHECKLIST | All items | ✅ Complete | Anti-detection ✅, scaling ✅, legal ✅, domain/email replaced ✅ |

---

## LAST 5 ACTIONS (most recent first)

1. **Google Drive OAuth2 delivery** — `6091bf0`: switched from service account (no quota) to OAuth2 refresh token. `drive-uploader.js` uses `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`. `authorize_drive.js` one-time script to get token. All ZIPs (any size) upload to Drive → shareable link sent in Telegram. Tested and working.
2. **`/clearjobs` command** — `d754c12`: kills all local child processes + marks stuck Supabase `import_jobs` rows (recon/verifying/extracting/downloading) as `failed`. Supabase client initialised in bot using `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
3. **Google Drive folder ID + env wired** — `GOOGLE_DRIVE_FOLDER_ID=1OzWXKrV_zD4mlbAr491HsXPnFqj3NuN3` in `.env`. All ZIPs upload regardless of size (`driveEnabled` checks `GOOGLE_OAUTH_REFRESH_TOKEN`).
4. **Telegram bot live E2E** — BotFather setup done (`@shoprift_ops_bot`). `/start`, `/recon`, `/extract`, `/receipt`, `/jobs`, `/cancel`, `/clearjobs` all tested on real stores. `npm run bot` runs from project root.
5. **`/cancel` command + SIGTERM handling** — `ffbae25`: two-step `activeJobs` pattern. `cancelled` flag suppresses misleading "failed" output after kill.

---

## ACTIVE BLOCKERS

- **T8/T9 Shopify app QA** — remaining items are manual browser tasks, only Mayank can do them.
- **Telegram bot Mac-dependent** — Railway deployment not done yet; bot dies when Mac sleeps.

---

## UNCOMMITTED CHANGES

None. Working tree clean.

---

## NEXT TASKS

### 1 — Railway deployment for Telegram bot (24/7 uptime)
- Deploy `apps/telegram-bot/bot.js` as new Railway service
- Playwright browser deps via nixpacks
- Env vars: all from `.env` + `GOOGLE_OAUTH_*` + `GOOGLE_DRIVE_FOLDER_ID`
- Bot survives Mac sleep, works from iPhone anywhere

### 2 — Shopify app T8 manual QA (browser required)
- T8.1 kiwiishop E2E — install app on dev store → migrate kiwiishop → confirm products in Shopify admin
- T8.2 mmshop E2E — migrate mmshop (13 products, 3 collections)
- T8.5 billing flow — test charge, decline, confirm
- T8.18 browser console check — DevTools open during full flow

### 3 — Shopify app T9 manual tasks
- T9.2 app icon — 1200×1200 PNG, Shoprift mark on `#0A0B0F` bg (Canva)
- T9.3 screenshots — 5 screens per plan in `output/content/app-store-listing.md`
- T9.4 demo video — 30–60s screen recording
- T9.6 fill Partner Dashboard listing form

### 4 — Submit Shopify app (after all QA passes)
Confirm distribution = Public (**IRREVERSIBLE**) → T9.7 submit → T9.8 respond to review

### 5 — Verify in Partner Dashboard
`app/uninstalled` webhook URL must be `https://shoprift.app/api/webhooks/app-uninstalled` in Partner Dashboard → App setup → Webhooks.

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
| `SHOPIFY_SCOPES` | `read_products,write_products` |
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
- **Verification method** — Method B: dm2buy product injection. User adds a product named `SHR-XXXX-XXXXXX` to their dm2buy store. Railway worker checks via dm2buy public API (paginated, axios+httpsAgent). One verified record per (shop, store_url) pair — stays verified permanently.
- **RAILWAY_WORKER_URL** — `https://shoprift-production.up.railway.app` (production + local .env.local). Must be set in Vercel env vars.
- **dm2buy server-side TLS** — All server-side API calls to `api.dm2buy.com` MUST use `axios + httpsAgent` with `rejectUnauthorized: false`. Pattern in `src/api.js`. Never use native `fetch` for dm2buy API calls from Node.js. (Client-side browser fetch is fine — uses browser's TLS stack.)
- **Shopify Billing currency** — `AppPurchaseOneTime` created with `currencyCode: 'INR'`. Test mode: `isTest = NODE_ENV !== 'production'`.
- **Razorpay routes deleted** — `/api/payment/create` and `/api/payment/verify` deleted (commit `f04100c`). Were dead code after switch to Shopify Billing. Remove `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` env vars from Vercel if not needed for other purposes.
- **PRE_LAUNCH_CHECKLIST** — effectively complete. The domain/email checkbox was left unticked but work was done (domain purchased, all 26 email occurrences replaced).
- **dm2buy API outage pattern** — when API returns non-CORS 502, browser throws `TypeError: Failed to fetch` (CORS check fails before HTTP error is surfaced). Both `recon.ts` and `extractor.ts` catch this and show "dm2buy is unreachable right now." The outage is NOT detection/IP blocking — it's infrastructure. The storefront uses the same client-side API; if our extraction fails, the storefront also shows no products for real sellers.
- **Non-existent store error** — `recon.ts` and `extractor.ts` both catch 404 in `fetchStoreMeta` and show "Store not found. Check the URL and try again." Raw API URL no longer leaked to UI (fixed commit `8bd008b`).
- **shopify app deploy version** — currently shoprift-8 (deployed 2026-06-01). Scope: `read_products,write_products` only.

---

## SESSION NOTES

> Dev setup: `cd web && npm run dev` (port 3000) + ngrok forwarding to 3000 + Railway worker on port 3001 (`node worker.js`).
> Test store: `https://kiwiishop.dm2buy.com` — 25 products, 5 collections, 63 images.
> Test Shopify store: `shoprift-dev.myshopify.com`.
> mmshop (`https://mmshop.dm2buy.com`) is Mayank's test dm2buy store — 13 products, 3 collections.
