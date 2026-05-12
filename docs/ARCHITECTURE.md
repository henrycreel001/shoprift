# ARCHITECTURE.md — Shoprift Technical Architecture

> Part of the Shoprift document suite.
> Read after CLAUDE.md. Cross-reference SCHEMA.md for data structures.
> This document explains every technical decision and why it was made.

---

## SYSTEM OVERVIEW

Shoprift is a four-phase migration engine:

```
INPUT                    SHOPRIFT ENGINE                         OUTPUT
─────                    ───────────────                         ──────

dm2buy store URL  ──▶  Phase 1: RECON          ──▶  Preview summary
                  ──▶  Phase 2: VERIFICATION   ──▶  Ownership confirmed
                  ──▶  Phase 3: EXTRACTION     ──▶  Raw store data
                  ──▶  Phase 4: DOWNLOAD       ──▶  store_data.json
                                                    migration_report.md
                                                    /images folder
```

Each phase is independent. Each phase must succeed before the next begins. Each phase writes its status to Supabase so the job can be resumed or monitored.

---

## DATA FLOW — DETAILED

```
User provides dm2buy store URL
            │
            ▼
┌─────────────────────────┐
│     src/index.js        │  Entry point. Validates URL format.
│     CLI Entry Point     │  Initialises Supabase job record.
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│     src/browser.js      │  Launches headless Playwright browser.
│     Browser Manager     │  Single browser instance reused across phases.
│                         │  Closes in finally block always.
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│     src/recon.js        │  Fast scan. Counts products, collections,
│     Phase 1: Recon      │  images. Identifies Instagram handle.
│                         │  Returns recon_data. Updates Supabase.
└──────────┬──────────────┘
           │
           ▼  recon_data returned to caller (shown to user as preview)
           │
           ▼  user confirms import
           │
┌─────────────────────────┐
│     src/verifier.js     │  Generates session-locked code.
│     Phase 2: Verify     │  Attempts Method A (Instagram story).
│                         │  Falls back to Method B (product injection).
│                         │  Stores verification record in Supabase.
└──────────┬──────────────┘
           │
           ▼  verified = true
           │
┌─────────────────────────┐
│     src/extractor.js    │  Full Playwright extraction.
│     Phase 3: Extract    │  Visits every product page.
│                         │  Extracts all fields per SCHEMA.md.
│                         │  Flags missing descriptions.
│                         │  Returns raw_store_data object.
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│     src/downloader.js   │  Downloads every image URL.
│     Phase 4a: Download  │  Saves to /output/images/{productId}/
│                         │  Verifies file integrity.
│                         │  Logs failures to report.
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│     src/formatter.js    │  Maps raw_store_data to store.schema.json
│     Phase 4b: Format    │  Adds local image paths alongside CDN URLs.
│                         │  Computes migration_flags.
│                         │  Writes store_data.json.
│                         │  Writes migration_report.md.
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│     src/validator.js    │  Runs Zod validation against schema.
│     Final Validation    │  Fails loudly if any required field missing.
│                         │  Updates Supabase job to 'complete'.
└─────────────────────────┘
           │
           ▼
OUTPUT: /output/store_data.json
        /output/migration_report.md
        /output/images/**
```

---

## MODULE RESPONSIBILITIES

### `src/index.js` — Entry Point
- Accepts URL as CLI argument: `node src/index.js <url>`
- Validates URL matches dm2buy pattern: `*.dm2buy.com`
- Initialises Supabase job record
- Orchestrates all four phases in sequence
- Handles top-level errors gracefully
- Prints final status to terminal

### `src/browser.js` — Browser Manager
- Launches single Playwright Chromium instance
- Exposes `getPage()` — returns a configured page ready to navigate
- Exposes `closeBrowser()` — always call in finally block
- Sets consistent userAgent and viewport
- Never creates multiple browser instances

### `src/recon.js` — Recon Module
- Navigates to store home URL
- Waits for product grid to render
- Counts all visible products (including paginated/scrolled)
- Identifies all collection names from navigation
- Finds Instagram handle in store meta
- Counts total unique image URLs without downloading
- Estimates import time: (product_count × 8s) + (image_count × 2s)
- Returns `recon_data` object — see SCHEMA.md

### `src/verifier.js` — Verification Module
- Generates session-locked verification code
- Code format: `SHR-{accountId}-{rand4}-{unixTimestamp}`
- Stores pending verification in Supabase
- Method A: polls Instagram page for code in story/bio
- Method B: scans dm2buy store product list for code
- Sets expiry: 10 minutes from code generation
- Returns `verified: true/false` with method used

### `src/extractor.js` — Extraction Module
- Iterates every product URL found during recon
- For each product navigates to its detail page
- Waits for full render before extracting
- Extracts all fields defined in SCHEMA.md
- 800ms delay between product page navigations
- Flags `needs_description: true` if only shipping text present
- Returns `raw_store_data` — unformatted, unvalidated

### `src/downloader.js` — Image Downloader
- Accepts array of image URLs
- Downloads each using Axios stream
- Saves to `/output/images/{productId}/{index}.jpg`
- Checks file size > 0 after download
- Retries once on failure
- Returns download manifest: which succeeded, which failed

### `src/formatter.js` — Output Formatter
- Maps `raw_store_data` to exact `store.schema.json` structure
- Adds `images_local` paths alongside original `images_cdn` URLs
- Computes `migration_flags` array
- Writes `/output/store_data.json`
- Writes `/output/migration_report.md`
- Never mutates input data — always creates new structured object

### `src/validator.js` — Schema Validator
- Loads `schemas/store.schema.json`
- Runs Zod validation against formatter output
- Throws detailed error if any required field missing
- Logs full validation report to terminal
- Does NOT write output — only validates

### `src/job.js` — Job Tracker
- Wraps all Supabase job operations
- `createJob(accountId, storeUrl)` — creates job record
- `updateStatus(jobId, status)` — updates job status
- `updateProgress(jobId, current, total, phase)` — updates progress
- `failJob(jobId, error)` — marks job failed with error message
- `completeJob(jobId)` — marks job complete

### `src/utils.js` — Shared Utilities
- `generateCode(accountId, storeUrl)` — verification code generator
- `sleep(ms)` — promise-based delay
- `sanitizeFilename(str)` — safe filenames for images
- `estimateTime(productCount, imageCount)` — import time estimator
- `isDm2buyUrl(url)` — URL validator

---

## TECHNICAL DECISIONS — AND WHY

### Why Playwright over Cheerio/Axios scraping?
dm2buy storefronts are Next.js static exports with client-side hydration. Raw HTML fetch returns only 4 meta tags — no product data. Playwright runs a real browser, executes JavaScript, and sees the fully rendered DOM. Confirmed by kiwiishop audit.

### Why Node.js over Python?
Claude Code runs in the project environment. Node.js v24 is already installed and confirmed. No additional runtime setup needed.

### Why Supabase for job tracking?
The [App Name] platform already uses Supabase. Shoprift's job table lives in the same database. When Shoprift is integrated into the platform, job status is immediately queryable from the frontend with zero additional infrastructure.

### Why Railway.app for production?
Playwright requires a persistent server environment. Vercel serverless functions have a 5-minute execution timeout — insufficient for large stores. Railway provides a persistent Node.js server on a free tier with no timeout limit.

### Why Axios for image downloading over Playwright?
Playwright is a browser — using it to download 18+ images is wasteful and slow. Axios streams images directly from CDN URLs to disk, which is faster, lighter, and more reliable for binary file downloads.

### Why Zod for validation?
Runtime schema validation catches any mismatch between what was extracted and what the import schema expects. Zod errors are detailed and actionable — they name exactly which field failed and why. This prevents corrupt data from entering the platform database.

---

## dm2buy PLATFORM KNOWLEDGE

This section documents everything confirmed about dm2buy's technical architecture from the kiwiishop audit. Use this to guide extraction logic.

| Property | Value |
|----------|-------|
| Framework | Next.js (static export) |
| Rendering | Client-side hydrated |
| Build ID confirmed | `V-Y028xWkbqBa9sniRa0M` |
| Image CDN | Azure Front Door |
| Image CDN domain | `dm2buy-drop-resized-gga4c6azekgcgngp.z02.azurefd.net` |
| Image path pattern | `/dm2buy/{filename}.jpg` |
| Product URL pattern | `/product/{32-char-hex-id}` |
| Collection filter | `/?collection={Name}` |
| Analytics | New Relic Browser |
| Fonts | Google Fonts — Roboto |
| robots.txt | Not present (404) |
| sitemap.xml | Not present (404) |
| API endpoints | None surfaced during audit |

**Known quirks:**
- Products may have no real description — only shipping/support boilerplate
- Some products may be uncategorized (not in any collection filter)
- Contact page (`/contact`) may 404 and redirect to home
- All products observed as "in stock" — no out-of-stock state seen yet

---

## INTEGRATION PATH INTO [APP NAME] PLATFORM

When Shoprift is embedded into the [App Name] platform:

```
[App Name] Frontend
      │
      │  POST /api/import/start { storeUrl, accountId }
      ▼
[App Name] Backend API
      │
      │  Calls Shoprift engine directly (same codebase)
      │  OR calls Railway Shoprift service via HTTP
      ▼
Shoprift Engine runs
      │
      │  Writes job status to shared Supabase
      ▼
[App Name] Frontend polls Supabase for job status
      │
      │  Shows progress to user in real time
      ▼
Job complete → [App Name] reads store_data.json
      │
      │  Inserts products into platform database
      │  Uploads images to Supabase Storage
      ▼
User's store is populated
```

The `store.schema.json` is the contract between Shoprift and [App Name]. Shoprift always outputs to this schema. [App Name] always reads from this schema. Changing the schema requires updating both sides.

---

*Cross-reference: CLAUDE.md for agent instructions. SCHEMA.md for exact field definitions. TASKS.md for build order. ERRORS.md for failure handling.*
