# DEVLOG.md — Engineering Change Log

> Every change recorded here: date, time (IST), files touched, and why.
> Most recent entry first.
> Use this to audit history, understand decisions, or reconstruct context.
> Update this file every session — add entry before committing.

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
