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

- **Date:** 2026-06-08
- **Session topic:** Telegram bot major polish — UI overhaul, Drive folder delivery, parallel uploads/downloads, payment ledger, reports, persistent keyboard.
- **Branch:** main (last commit: `1b1c784` — uncommitted changes exist, see below)

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

1. **Persistent reply keyboard + close button** — 8 buttons at bottom of chat: Recon, Extract, Receipt, Weekly, Monthly, History, Jobs, Help, ✖ Close. Tapping closes keyboard; `/start` restores it.
2. **Payment ledger + `/history` + `/report`** — Supabase `payment_receipts` table. Every `/receipt` writes a row. `/history` = last 10 transactions. `/report` = weekly, `/report month` = monthly. Revenue, avg, highest per period.
3. **Full bot UI overhaul** — HTML formatting, single live-editing status message during extraction, emoji progress bar (`▓▓▓░░░ 48%`), noise removed (no more "Staged →" / "Generating receipt..." / "Recon starting..."), after-recon `[▶️ Full Extract]` button, `/jobs` inline cancel buttons, retry upload button on Drive fail, client delivery message, receipt prompt auto-generated after extraction.
4. **Drive delivers folder not ZIP** — `uploadFolderToDrive()` in `drive-uploader.js`. Skips ZIPs, uploads all files + `images/` subfolder. Parallel upload (8 concurrent). Folder URL sent in Telegram.
5. **Parallel image download** — `src/downloader.js` rewritten with `_pool(10, ...)`. Was sequential nested loops. Now 10 concurrent downloads. ~6–10× faster for large stores.

---

## ACTIVE BLOCKERS

- **T8/T9 Shopify app QA** — remaining items are manual browser tasks, only Mayank can do them.
- **Telegram bot Mac-dependent** — Railway deployment not done; bot dies when Mac sleeps.
- **Uncommitted changes** — `bot.js`, `drive-uploader.js`, `src/downloader.js` all modified, not committed.

---

## UNCOMMITTED CHANGES

| File | What changed |
|------|-------------|
| `apps/telegram-bot/bot.js` | Full UI overhaul, keyboard, history/report commands, ledger write, delivery message, receipt prompt, progress bar, live status card |
| `apps/telegram-bot/src/drive-uploader.js` | `uploadFolderToDrive()` added; `_uploadDirContents` parallelised (8 concurrent) |
| `src/downloader.js` | `downloadAllImages` parallelised with `_pool(10)` |

---

## NEXT TASKS

### 1 — Commit all uncommitted changes
Three modified files need committing before next session.

### 2 — `/quote <url>` command
Runs recon, calculates price by tier (₹500 base + ₹10/product), outputs ready-to-send quote message. Saves time before every job. ~20 min.

### 3 — `/redeliver <receipt-no>`
Looks up Drive folder for past job, resends link. Useful when client loses link. ~30 min.

### 4 — Railway deployment for Telegram bot (24/7 uptime)
- New Railway service, same build config as existing worker (`npx playwright install chromium --with-deps` already solved)
- Start command: `node apps/telegram-bot/bot.js`
- Env vars: all from `.env` + `GOOGLE_OAUTH_*` + `GOOGLE_DRIVE_FOLDER_ID`
- Estimate: 20–30 min (Playwright already solved in existing worker)

### 5 — Shopify app T8 manual QA (browser required)
- T8.1 kiwiishop E2E — install app on dev store → migrate kiwiishop → confirm products in Shopify admin
- T8.2 mmshop E2E — migrate mmshop (13 products, 3 collections)
- T8.5 billing flow — test charge, decline, confirm
- T8.18 browser console check — DevTools open during full flow

### 6 — Shopify app T9 + submit
- T9.2 app icon, T9.3 screenshots, T9.4 demo video, T9.6 Partner Dashboard listing
- Submit after all QA passes

---

## TELEGRAM BOT — CURRENT FEATURE SET

| Command | What it does |
|---------|-------------|
| `/recon <url>` | Store scan → photo summary + CSV + `[▶️ Full Extract]` button |
| `/extract <url>` | Full extraction → Drive folder → client delivery message + receipt prompt |
| `/receipt "Name" url amount upi-ref` | PDF receipt → writes to Supabase `payment_receipts` |
| `/history` | Last 10 transactions from Supabase |
| `/report` | Last 7 days revenue summary |
| `/report month` | Current month revenue summary |
| `/jobs` | Active jobs with inline `[❌ Cancel]` buttons |
| `/cancel <url>` | Cancel specific job |
| `/clearjobs` | Kill all + reset stuck Supabase rows |
| `/help` | Styled command reference |
| Keyboard buttons | Recon, Extract, Receipt, Weekly, Monthly, History, Jobs, Help, ✖ Close |

**Supabase table:** `payment_receipts` — created this session. Test row inserted manually.

---

## DEFERRED TASKS (post-App Store submission)

| Task | Notes |
|------|-------|
| **Phase 2 — URL page welcome context** | Small welcome banner above step tracker on URL step only. |
| **Phase 3 — Landing page light theme** | Convert `shoprift-landing-v5.html` from dark to light. |
| **Future marketing website** | Full site at `shoprift.app`. Do not build until app is live + generating revenue. |
| **Gmail "Send mail as"** | Configure `support@shoprift.app` alias in Gmail SMTP. Routing already live. |
| **Polaris refactor** | Post-approval V1.1 — refactor `migrate/page.tsx` to Shopify Polaris. |
| **Shoplit platform** | Separate India-first storefront concept. Do not start until Shoprift revenue. |
| **Client CRM** | `/client add` store client details, auto-fill receipt. ~1 hr. |
| **`/watch <url>`** | Daily recon on a store, alert if product count changes. |
| **Batch queue** | `/queue add <url>` multiple stores, run sequentially overnight. |

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
- **Shopify app embedded** — loads inside Shopify admin iframe. `shop` param arrives via URL query string. CSP `frame-ancestors` set.
- **Trial detection architecture** — `is_trial` and `trial_product_urls` are top-level DB columns set at job INSERT time, never written by the Railway worker.
- **Verification method** — Method B: dm2buy product injection. One verified record per (shop, store_url) pair — stays verified permanently.
- **RAILWAY_WORKER_URL** — `https://shoprift-production.up.railway.app` (production + local .env.local).
- **dm2buy server-side TLS** — All server-side API calls to `api.dm2buy.com` MUST use `axios + httpsAgent` with `rejectUnauthorized: false`. Never use native `fetch` for dm2buy API calls from Node.js.
- **Shopify Billing currency** — `AppPurchaseOneTime` created with `currencyCode: 'INR'`. Test mode: `isTest = NODE_ENV !== 'production'`.
- **Razorpay routes deleted** — `/api/payment/create` and `/api/payment/verify` deleted. Remove `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` from Vercel if not needed.
- **dm2buy API outage pattern** — non-CORS 502 → `TypeError: Failed to fetch`. Both `recon.ts` and `extractor.ts` catch and show "dm2buy is unreachable right now."
- **shopify app deploy version** — currently shoprift-8 (deployed 2026-06-01). Scope: `read_products,write_products` only.
- **Drive delivery** — uploads unzipped folder (not ZIP). ZIPs skipped in upload. Folder URL shared with client. Auth: OAuth2 refresh token (`GOOGLE_OAUTH_REFRESH_TOKEN`).
- **Payment ledger** — Supabase `payment_receipts` table. Written on every `/receipt` send. Queried by `/history` and `/report`.

---

## SESSION NOTES

> Dev setup: `cd web && npm run dev` (port 3000) + ngrok forwarding to 3000 + Railway worker on port 3001 (`node worker.js`).
> Bot: `npm run bot` from project root.
> Test store: `https://kiwiishop.dm2buy.com` — 25 products, 5 collections, 63 images.
> Test Shopify store: `shoprift-dev.myshopify.com`.
> mmshop (`https://mmshop.dm2buy.com`) is Mayank's test dm2buy store — 13 products, 3 collections.
