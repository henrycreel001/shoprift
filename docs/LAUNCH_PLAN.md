# LAUNCH_PLAN.md — Shoprift Shopify App Store

> Owner: Mayank Malik
> Created: 2026-05-21
> Pace: 8 hrs/day
> Target: Shopify App Store submission in ~14 working days
> Update this file whenever a track completes or a decision changes.
> Cross-reference: CONTEXT.md (session state) · CLAUDE.md (rules) · PRE_LAUNCH_CHECKLIST.md

---

## ARCHITECTURE DECISION (locked)

```
Shopify Admin (embedded app)
  → Seller's browser runs extraction JS
  → fetch() calls to api.dm2buy.com   ← CORS confirmed: access-control-allow-origin: *
  → Extracted data POSTed to server
  → Server calls Shopify Admin API (OAuth token) → products created directly in store
  → Done. No image download. Images uploaded to Shopify from dm2buy CDN URLs.
```

**What Playwright is used for:** CLI / concierge only. Never in the web app.
**Why client-side:** dm2buy CORS is open. Seller's IP. No proxy cost. Infinitely scalable.
**Why no Razorpay:** Shopify App Store mandates Shopify Billing API for paid apps.

---

## CONCIERGE TRACK (parallel — starts NOW)

Concierge mode is **live**. Engine passed mmshop e2e (21s, 5 products, clean zip).
Run manual jobs via CLI while app is in review. Collect real-world data. Revenue from Day 1.

```bash
echo y | node src/index.js https://<store>.dm2buy.com --client <slug> --format shopify --zip
```

Deliver zip via WhatsApp/email. Collect payment via UPI.
Each job = practice + signal for what the app needs.

---

## TRACKS + TASKS

### TRACK 1 — Engine Sign-Off
**Goal:** Full confidence the CLI engine is production-grade before pivoting to app.
**Estimate:** Day 1 (4 hrs)
**Skill:** `/caveman` for code audit

| # | Task | Done |
|---|------|------|
| T1.1 | Run kiwiishop e2e — `echo y \| node src/index.js https://kiwiishop.dm2buy.com` — confirm 4 products, 2 collections, 18 images | [ ] |
| T1.2 | Code audit — run `/caveman` reviewer on `src/extractor.js`, `src/recon.js`, `src/formatter.js` — fix any severity issues | [ ] |
| T1.3 | Test edge cases: invalid URL, store with 0 products, network timeout mid-extraction | [ ] |
| T1.4 | Commit all uncommitted changes (`src/server.js`, `worker.js`, `CLAUDE.md`, etc.) | [ ] |

---

### TRACK 2 — Legal Completion
**Goal:** All legal docs done before any money changes hands.
**Estimate:** Day 1-2 (4 hrs)
**Skill:** `/shoprift-legal`

| # | Task | Done |
|---|------|------|
| T2.1 | Write Refund & Cancellation Policy (Consumer Protection E-Commerce Rules 2020) — use `/shoprift-legal` | [ ] |
| T2.2 | Review Shopify App Store policies — confirm nothing in our flow violates their terms | [ ] |
| T2.3 | Update ToS + Privacy Policy for Shopify context (OAuth access, Shopify store data handling) | [ ] |
| T2.4 | Tick all remaining PRE_LAUNCH_CHECKLIST items | [ ] |

---

### TRACK 3 — Shopify App Infrastructure
**Goal:** Working Shopify embedded app shell with OAuth.
**Estimate:** Days 2-3 (12 hrs)
**Skill:** None (manual Shopify setup + engineering)

| # | Task | Done |
|---|------|------|
| T3.1 | Create Shopify Partner account at partners.shopify.com | [ ] |
| T3.2 | Create app in Partner dashboard — App name: Shoprift · Type: Public | [ ] |
| T3.3 | Set OAuth scopes: `write_products,read_products,write_product_listings` | [ ] |
| T3.4 | Install `@shopify/shopify-app-remix` or `@shopify/shopify-app-next` — pick stack | [ ] |
| T3.5 | Implement OAuth install flow: `/api/auth` → Shopify → `/api/auth/callback` → store token in Supabase | [ ] |
| T3.6 | Set up `app/uninstalled` webhook → delete session from Supabase | [ ] |
| T3.7 | Test install on Shopify dev store — confirm embedded app loads in admin | [ ] |

**Decision needed at T3.4:** Shopify recommends Remix for new apps. But we're already on Next.js.
Use `@shopify/shopify-app-next` + `@shopify/shopify-api` (Node) to stay on Next.js.

---

### TRACK 4 — Client-Side Extraction Module
**Goal:** Browser JS that replicates what extractor.js + recon.js do, callable from the app.
**Estimate:** Days 4-5 (10 hrs)
**Skill:** None (engineering — port existing logic)

**CORS confirmed open:** `api.dm2buy.com` returns `access-control-allow-origin: *`. Direct browser fetch works.

| # | Task | Done |
|---|------|------|
| T4.1 | Create `web/src/lib/dm2buy/recon.ts` — port `src/recon.js` to browser fetch (no Playwright, no Axios) | [ ] |
| T4.2 | Create `web/src/lib/dm2buy/extractor.ts` — port `src/extractor.js` core logic | [ ] |
| T4.3 | Create `web/src/lib/dm2buy/types.ts` — TypeScript types matching SCHEMA.md | [ ] |
| T4.4 | Progress callback pattern — extraction emits `{ phase, current, total }` events for UI | [ ] |
| T4.5 | Test in browser console against kiwiishop — confirm same data as CLI | [ ] |

**Note:** No image download in web flow. Images go from dm2buy CDN → Shopify via Admin API.
No delay randomization needed for client-side (seller's own browser, own IP, one store).

---

### TRACK 5 — Server-Side Shopify Import API
**Goal:** Endpoint that takes extracted store data and creates products in the seller's Shopify store.
**Estimate:** Days 5-7 (16 hrs)
**Skill:** None (engineering)

| # | Task | Done |
|---|------|------|
| T5.1 | Create `web/src/app/api/import/start/route.ts` — accepts store data JSON, returns jobId | [ ] |
| T5.2 | Build `web/src/lib/shopify/products.ts` — `createProduct(shopifyClient, product)` via Admin API | [ ] |
| T5.3 | Image handling — use `product_images` with `src` pointing to dm2buy CDN. Shopify fetches + re-hosts. | [ ] |
| T5.4 | Variant handling — map extracted variants to Shopify `options` + `variants` fields | [ ] |
| T5.5 | Collection handling — create Smart Collections or Custom Collections from extracted categories | [ ] |
| T5.6 | Progress tracking — update Supabase job after each product created. Client polls `/api/import/status/[jobId]` | [ ] |
| T5.7 | Rate limit handling — Shopify API: 2 req/s (REST) or leaky bucket (GraphQL). Add delay between creates. | [ ] |
| T5.8 | Error recovery — if one product fails, continue with rest. Surface failures in job result. | [ ] |
| T5.9 | Test import with kiwiishop data → real Shopify dev store. Confirm all 4 products appear correctly. | [ ] |

**API choice:** Use Shopify REST Admin API for V1 (simpler, well-documented). GraphQL in V2.

---

### TRACK 6 — Embedded Polaris UI
**Goal:** 5-step migration wizard inside Shopify admin.
**Estimate:** Days 7-9 (16 hrs)
**Skill:** `/emil-design-eng` for UI implementation · `/ui-ux-pro-max` for UX decisions

**Flow:**
```
Step 1: Enter URL        → validate dm2buy URL format, show "Check store" button
Step 2: Recon Preview    → show product/image count, store name, estimated time. "Start migration" button.
Step 3: Extraction       → progress bar, "Don't close this tab" banner, live count
Step 4: Billing gate     → show price, Shopify payment sheet
Step 5: Import progress  → product-by-product progress, Shopify links as they appear
Step 6: Done             → summary card, "View your products" button, migration report download
```

| # | Task | Done |
|---|------|------|
| T6.1 | App shell — `@shopify/polaris` AppProvider, App Bridge, page layout | [ ] |
| T6.2 | Step 1 — URL input + client-side `isDm2buyUrl()` validation | [ ] |
| T6.3 | Step 2 — Recon card (call `recon.ts` in browser, render summary) | [ ] |
| T6.4 | Step 3 — Extraction progress (call `extractor.ts` in browser, progress callback → UI) | [ ] |
| T6.5 | Billing gate — trigger Shopify Billing API charge before import starts | [ ] |
| T6.6 | Step 4 — Import progress (poll `/api/import/status/[jobId]`) | [ ] |
| T6.7 | Step 5 — Done state (success card, links, report download) | [ ] |
| T6.8 | Error states — network fail, store not found, payment declined, import partial | [ ] |
| T6.9 | "Don't close this tab" banner (visible during Steps 3-4 only) | [ ] |

---

### TRACK 7 — Billing (Shopify Billing API)
**Goal:** Seller pays before import runs. Shopify handles the charge.
**Estimate:** Day 10 (6 hrs)
**Skill:** `/shoprift-accountant` for pricing · No external skill for implementation

| # | Task | Done |
|---|------|------|
| T7.1 | Pricing decision — use `/shoprift-accountant`. Propose: Free (≤5 products) / ₹199 flat / ₹499 flat | [ ] |
| T7.2 | Implement `AppPurchaseOneTime` via Shopify Billing API | [ ] |
| T7.3 | Store charge record in Supabase `payments` table (existing schema) | [ ] |
| T7.4 | Gate import behind confirmed charge — never import without payment confirmed | [ ] |
| T7.5 | Test billing in Shopify dev store test mode | [ ] |

**Note:** Shopify Billing API is mandatory for paid apps on the App Store.
Razorpay can still be used for concierge (off-app payments).

---

### TRACK 8 — QA + Hardening
**Goal:** No crashes, no silent failures, no broken flows with real stores.
**Estimate:** Days 11-12 (12 hrs)
**Skill:** `/verification-quality`

| # | Task | Done |
|---|------|------|
| T8.1 | Full e2e: install app on dev store → migrate kiwiishop → confirm 4 products in Shopify admin | [ ] |
| T8.2 | Full e2e: migrate mmshop (5 products, 0 collections) | [ ] |
| T8.3 | Large store test: find a dm2buy store with 20+ products. Test full flow. | [ ] |
| T8.4 | Error scenarios: invalid URL, private store, store with 0 products, network drop mid-extraction | [ ] |
| T8.5 | Billing flow test: test charge, decline, refund | [ ] |
| T8.6 | Shopify App Store requirements audit — run through official checklist | [ ] |
| T8.7 | Performance: extraction + import for 10-product store should complete in <2 min | [ ] |

---

### TRACK 9 — App Store Submission
**Goal:** Approved app live on Shopify App Store.
**Estimate:** Days 13-14 prep + 5-7 days Shopify review
**Skill:** `/shoprift-content` for listing copy · `/marketing-skills:launch-strategy` for GTM

| # | Task | Done |
|---|------|------|
| T9.1 | App listing copy — name, tagline, description, feature bullets — use `/shoprift-content` | [ ] |
| T9.2 | App icon — 1200×1200 PNG, simple, recognisable at 50px | [ ] |
| T9.3 | Screenshots — 5 screenshots showing the migration flow (required by Shopify) | [ ] |
| T9.4 | Demo video — 30-60s screen recording of full migration (optional but boosts approval speed) | [ ] |
| T9.5 | Privacy policy URL — host at `shoprift.com/privacy` or Vercel deploy | [ ] |
| T9.6 | Fill in Partner dashboard app listing form — categories: Store management, Migration | [ ] |
| T9.7 | Submit for Shopify review | [ ] |
| T9.8 | Respond to review feedback (typically 1-2 rounds) | [ ] |
| T9.9 | Launch post — Instagram + Reddit `r/shopify` — use `/shoprift-content` | [ ] |

**Shopify review SLA:** 5-7 business days. Submit as soon as T9.7 is ready.
Run concierge jobs during review window for revenue + feedback.

---

## TIMELINE (8 hrs/day)

```
Day 1   T1 Engine sign-off + T2 Legal start
Day 2   T2 Legal finish + T3 Shopify infra start
Day 3   T3 Shopify infra (OAuth + embedded shell working)
Day 4   T4 Client-side extraction module start
Day 5   T4 Client-side extraction done + T5 Import API start
Day 6   T5 Import API (products + images + variants)
Day 7   T5 Import API (collections + progress + error handling)
Day 8   T6 Polaris UI (steps 1-3)
Day 9   T6 Polaris UI (steps 4-6 + error states)
Day 10  T7 Billing
Day 11  T8 QA start
Day 12  T8 QA finish + fixes
Day 13  T9 App Store submission prep
Day 14  T9 Submit ← Shopify review clock starts (5-7 days)
─────────────────────────────────────────────────
Day 19-21  Approved + live (estimated)
```

---

## SESSION RULES

1. **One task at a time.** Start a new session per task group (track).
2. **Update CONTEXT.md** at end of every session — no exceptions. Zero context loss.
3. **Update this file** when a track completes (tick the Done column).
4. **Create todos** at session start for the day's tasks.
5. **Trigger skills** at the right moment — see skills column per track.
6. **Run concierge jobs** whenever a real store request comes in — don't pause the build.

---

## SKILLS REFERENCE

| Track | Skill to invoke |
|-------|----------------|
| T1 code audit | `/caveman` (review mode) |
| T2 legal docs | `/shoprift-legal` |
| T6 UI build | `/emil-design-eng` |
| T6 UX decisions | `/ui-ux-pro-max` |
| T7 pricing | `/shoprift-accountant` |
| T8 QA | `/verification-quality` |
| T9 copy | `/shoprift-content` |
| T9 GTM | `/marketing-skills:launch-strategy` |
| Architecture decisions | `/c-level-skills:cto-advisor` |
| Any brainstorm | `/superpowers:brainstorm` |

---

## KNOWN RISKS

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Shopify review rejects app | Medium | Follow checklist exactly. Have demo video ready. |
| dm2buy changes API structure | Low | Engine is resilient (DOM fallback). Monitor post-launch. |
| dm2buy adds auth to API | Low | CORS open now. Client-side extraction breaks first — add server proxy. |
| Large stores hit Shopify rate limits | Medium | Leaky bucket + 500ms delay between product creates. |
| Seller closes tab during extraction | Low | "Don't close tab" banner. Extraction is 5-10s. |

---

*Created: 2026-05-21 | Owner: Mayank Malik | Next update: after Track 1 completes*
