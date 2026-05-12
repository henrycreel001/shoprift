# TASKS.md — Shoprift Build Checklist

> Part of the Shoprift document suite.
> This is the step-by-step build order for Claude Code.
> Follow tasks in exact order. Do not skip. Do not reorder.
> Mark each task complete before moving to the next.
> Cross-reference: CLAUDE.md for context. ARCHITECTURE.md for module details.

---

## HOW TO USE THIS FILE

Work through each task in order.
After completing a task, verify it works before moving on.
If a task fails, check ERRORS.md for the relevant handler.
Never start a new phase until all tasks in the current phase pass.

---

## PHASE 0 — PROJECT SETUP

- [ ] **0.1** Initialise Node.js project
  ```bash
  npm init -y
  ```

- [ ] **0.2** Install all dependencies in one command
  ```bash
  npm install playwright axios zod dotenv @supabase/supabase-js
  npx playwright install chromium
  ```

- [ ] **0.3** Create `.env` file from `.env.example`
  ```
  SUPABASE_URL=your_supabase_url
  SUPABASE_ANON_KEY=your_supabase_anon_key
  OUTPUT_DIR=./output
  IMAGE_DIR=./output/images
  HEADLESS=true
  SHOPRIFT_VERSION=1.0.0
  VERIFICATION_EXPIRY_MINUTES=10
  NAV_DELAY_MS=800
  ```

- [ ] **0.4** Create directory structure
  ```bash
  mkdir -p src docs schemas output/images tests
  ```

- [ ] **0.5** Add `.gitignore`
  ```
  node_modules/
  output/
  .env
  .DS_Store
  ```

- [ ] **0.6** Create Supabase project at supabase.com
  - Project name: `shoprift`
  - Region: South Asia (Mumbai) — closest to target users
  - Copy URL and anon key to `.env`

- [ ] **0.7** Run Supabase SQL to create tables
  ```sql
  -- Import jobs table
  CREATE TABLE import_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id TEXT NOT NULL,
    store_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'recon',
    recon_data JSONB,
    progress JSONB DEFAULT '{"current": 0, "total": 0, "phase": "", "phase_label": ""}',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Verification attempts table
  CREATE TABLE verification_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id TEXT NOT NULL,
    store_url TEXT NOT NULL,
    instagram_handle TEXT,
    code TEXT NOT NULL,
    method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Index for fast job lookup
  CREATE INDEX idx_import_jobs_account ON import_jobs(account_id);
  CREATE INDEX idx_verification_code ON verification_attempts(code);
  ```

- [ ] **0.8** Verify Supabase connection works
  ```javascript
  // Quick test — run and confirm it logs the table list
  import { createClient } from '@supabase/supabase-js'
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data, error } = await supabase.from('import_jobs').select('id').limit(1)
  console.log({ data, error }) // should log { data: [], error: null }
  ```

---

## PHASE 1 — CORE UTILITIES

- [ ] **1.1** Build `src/utils.js`
  - `generateCode(accountId, storeUrl)` — generates SHR-xxx code
  - `sleep(ms)` — promise delay
  - `sanitizeFilename(str)` — safe filenames
  - `estimateTime(productCount, imageCount)` — returns seconds + label
  - `isDm2buyUrl(url)` — validates URL matches *.dm2buy.com pattern
  - `computeSlug(name)` — converts "Hair Accessories" to "hair-accessories"
  - `computeDiscount(price, originalPrice)` — returns percentage or null
  - Test each function with a console.log before moving on

- [ ] **1.2** Build `src/job.js`
  - `createJob(accountId, storeUrl)` — inserts job, returns jobId
  - `updateStatus(jobId, status)` — updates status field
  - `updateProgress(jobId, current, total, phase, phaseLabel)` — updates progress
  - `updateReconData(jobId, reconData)` — stores recon result
  - `failJob(jobId, errorMessage)` — sets status to 'failed', stores error
  - `completeJob(jobId)` — sets status to 'complete'
  - `getActiveJob(accountId)` — returns active job if one exists (for duplicate prevention)

- [ ] **1.3** Test `src/job.js`
  - Create a test job
  - Update its status
  - Mark it complete
  - Verify all changes appear in Supabase dashboard

---

## PHASE 2 — BROWSER MODULE

- [ ] **2.1** Build `src/browser.js`
  - `launchBrowser()` — launches Playwright Chromium with correct settings
  - `getPage(browser)` — creates configured page with userAgent and viewport
  - `closeBrowser(browser)` — closes browser safely
  - Settings: headless from env, userAgent as Mac Chrome, viewport 1280x800

- [ ] **2.2** Test browser launches and navigates
  ```javascript
  const browser = await launchBrowser()
  const page = await getPage(browser)
  await page.goto('https://kiwiishop.dm2buy.com')
  await page.waitForLoadState('networkidle')
  const title = await page.title()
  console.log(title) // should log store name
  await closeBrowser(browser)
  ```

---

## PHASE 3 — RECON MODULE

- [ ] **3.1** Build `src/recon.js`
  - Navigate to store home URL
  - Wait for product grid: `page.waitForSelector('[data-testid="product-card"], .product-card, article')`
  - If no selector works — try waiting for any image with dm2buy CDN URL
  - Count all product cards visible
  - Scroll to bottom to trigger any lazy loading
  - Count again after scroll
  - Extract all navigation links that look like collections
  - Find Instagram handle in page source or footer
  - Count all unique image URLs on the page
  - Compute estimated time using `utils.estimateTime()`
  - Return `recon_data` object per SCHEMA.md

- [ ] **3.2** Test recon against kiwiishop
  - Expected: 4 products, 2 collections, ~18 images
  - Log full recon_data output
  - Verify counts match audit report

---

## PHASE 4 — VERIFICATION MODULE

- [ ] **4.1** Build `src/verifier.js` — code generator
  - `generateVerificationCode(accountId, storeUrl)` — creates SHR code
  - `storeVerificationAttempt(accountId, storeUrl, code, method)` — saves to Supabase
  - `checkVerificationExpiry(code)` — returns true if expired

- [ ] **4.2** Build Method A — Instagram Story verification
  - `generateStoryTemplate(code, appName)` — returns story image data (SVG or PNG)
  - `pollInstagramForCode(instagramHandle, code)` — checks Instagram page
  - Poll every 30 seconds, max 10 minutes (20 attempts)
  - Search page HTML/text for exact code string
  - Return `{ verified: true, method: 'instagram_story' }` if found

- [ ] **4.3** Build Method B — dm2buy Product Injection fallback
  - `pollDm2buyForCode(storeUrl, code)` — scans store product list
  - Check every product name for exact code match
  - Poll every 30 seconds, max 10 minutes
  - Return `{ verified: true, method: 'dm2buy_product' }` if found

- [ ] **4.4** Build `verify(accountId, storeUrl, instagramHandle)` — main function
  - Generate code
  - Store attempt in Supabase
  - Try Method A first
  - If Method A times out → prompt fallback to Method B
  - If Method B times out → fail with clear error
  - On success → mark verification as verified in Supabase

- [ ] **4.5** Test verification flow
  - Test with a real dm2buy store where you can add a product
  - Verify code detection works for Method B
  - Verify expiry works correctly

---

## PHASE 5 — EXTRACTION MODULE

- [ ] **5.1** Build `src/extractor.js` — store meta extraction
  - `extractStoreMeta(page)` — extracts all store_meta fields from home page
  - Look for store name in `<title>`, `<h1>`, or meta tags
  - Look for Instagram handle in footer links or bio text
  - Look for shipping info in footer or policy sections
  - Return partial store_meta — nulls for anything not found

- [ ] **5.2** Build product URL collector
  - `collectProductUrls(page, storeUrl)` — returns array of all product page URLs
  - Navigate to home page
  - Find all links matching `/product/{32-char-hex-id}` pattern
  - Scroll page fully to capture lazy-loaded products
  - Deduplicate URLs
  - Return array

- [ ] **5.3** Build single product extractor
  - `extractProduct(page, productUrl, id)` — extracts one product
  - Navigate to product URL
  - Wait for load: `page.waitForLoadState('networkidle')`
  - Extract: name, description, price, original price, variants, images, tags, stock
  - Check if description is only boilerplate — set `needs_description: true`
  - Compute `discount_percentage` using `utils.computeDiscount()`
  - Add `800ms` delay after extraction before returning
  - Return single product object per SCHEMA.md

- [ ] **5.4** Build collection extractor
  - `extractCollections(page, storeUrl)` — returns array of categories
  - Navigate to each collection URL from recon data
  - Count products in each collection
  - Build category object per SCHEMA.md
  - Compute slug using `utils.computeSlug()`

- [ ] **5.5** Build product-to-category mapper
  - `mapProductsToCategories(products, categories, page, storeUrl)` — assigns category to each product
  - For each product URL — check which collection filter URL includes it
  - Products not in any collection → `is_uncategorized: true`

- [ ] **5.6** Build `extract(page, storeUrl, productUrls)` — main extraction orchestrator
  - Calls all sub-extractors in correct order
  - Updates Supabase job progress after each product
  - Returns full `raw_store_data` object

- [ ] **5.7** Test extraction against kiwiishop
  - All 4 products extracted
  - Correct prices: 120, 250, 350, 250
  - Correct variants: Gingham Scrunchies has 5 colors
  - The Forever Flowers marked as uncategorized

---

## PHASE 6 — IMAGE DOWNLOADER

- [ ] **6.1** Build `src/downloader.js`
  - `downloadImage(url, savePath)` — downloads single image using Axios stream
  - Retry once on failure
  - Verify file size > 0 after download
  - Return `{ success: true, path }` or `{ success: false, url, error }`

- [ ] **6.2** Build `downloadAllImages(products)` — batch downloader
  - Creates `/output/images/{productId}/` directory for each product
  - Downloads each image in `images_cdn` array
  - Saves as `{productId}/{index}.jpg`
  - Updates Supabase progress after each image
  - Returns download manifest: succeeded[], failed[]

- [ ] **6.3** Test image downloader against kiwiishop
  - All 18 images downloaded
  - Check `/output/images/` directory structure
  - Verify no file has size 0

---

## PHASE 7 — FORMATTER + VALIDATOR

- [ ] **7.1** Build `src/formatter.js`
  - `format(rawStoreData, downloadManifest, reconData, jobMeta)` — main formatter
  - Maps raw data to exact SCHEMA.md structure
  - Adds `images_local` paths from download manifest
  - Adds `images_failed` from download manifest
  - Computes all `migration_flags`
  - Builds `scrape_meta` block
  - Returns formatted object ready for validation

- [ ] **7.2** Build `generateMigrationReport(formattedData)` — markdown report generator
  - Writes human readable `/output/migration_report.md`
  - Sections: Store Overview, Product Table, Migration Flags, Next Steps
  - Product table format: Name | Price | Original | Discount | Variants | Category | Images | Needs Description
  - Migration flags section: lists every flag with severity and action required
  - Next steps section: ordered checklist for the user

- [ ] **7.3** Build `src/validator.js`
  - Imports `StoreSchema` from Zod definition
  - `validate(formattedData)` — runs Zod parse
  - On success: logs "✅ Schema validation passed"
  - On failure: logs each failing field with reason, throws error

- [ ] **7.4** Test formatter + validator
  - Run against kiwiishop extracted data
  - Confirm Zod validation passes with zero errors
  - Confirm migration_report.md is readable and complete

---

## PHASE 8 — ENTRY POINT + INTEGRATION

- [ ] **8.1** Build `src/index.js`
  ```javascript
  // Usage: node src/index.js <dm2buy-store-url> [account-id]
  // Example: node src/index.js https://kiwiishop.dm2buy.com user_123
  ```
  - Parse CLI args
  - Validate URL with `utils.isDm2buyUrl()`
  - Check for active job with `job.getActiveJob()` — error if one exists
  - Create Supabase job record
  - Launch browser
  - Run Phase 1: Recon → log summary to terminal
  - Prompt: "Continue with import? (y/n)"
  - Run Phase 2: ~~Verification~~ → **Skipped in V1.** Print "ℹ️  Verification skipped (V1 concierge mode — ownership confirmed via DM)"
  - Run Phase 3: Extraction
  - Run Phase 4: Download + Format + Validate
  - Log completion summary to terminal
  - Close browser in finally block always

- [ ] **8.2** Add progress logging to terminal
  - Use clear terminal output showing current phase and progress
  - Example:
    ```
    🔍 Shoprift starting...
    ✅ Recon complete — 4 products, 2 collections, 18 images
    ⏳ Verifying ownership...
    ✅ Ownership verified via Instagram story
    ⏳ Extracting products... (1/4)
    ⏳ Extracting products... (2/4)
    ⏳ Extracting products... (3/4)
    ⏳ Extracting products... (4/4)
    ✅ Extraction complete
    ⏳ Downloading images... (12/18)
    ✅ All images downloaded
    ✅ Schema validation passed
    ✅ Migration report written
    
    🎉 Shoprift complete in 2m 14s
    Output: ./output/store_data.json
    Report: ./output/migration_report.md
    Images: ./output/images/ (18 files)
    
    ⚠️  3 items need attention — see migration_report.md
    ```

---

## PHASE 9 — TESTING

- [ ] **9.1** Build `tests/kiwiishop.test.js`
  - Test recon returns exactly 4 products
  - Test recon returns exactly 2 collections
  - Test all 4 product names match known values
  - Test Gingham Scrunchies has 5 color variants
  - Test The Forever Flowers is marked uncategorized
  - Test all prices match: 120, 250, 350, 250
  - Test 18 images downloaded
  - Test Zod validation passes
  - Test migration_report.md exists and is not empty

- [ ] **9.2** Run full end-to-end test
  ```bash
  node src/index.js https://kiwiishop.dm2buy.com test_account
  ```
  - Confirm all terminal output matches expected format
  - Confirm all output files created
  - Confirm Supabase job marked complete

---

## PHASE 10 — CLEANUP + DOCUMENTATION

- [ ] **10.1** Write `README.md`
- [ ] **10.2** Write `CHANGELOG.md` with V1.0.0 entry
- [ ] **10.3** Write `.env.example`
- [ ] **10.4** Review all code for hardcoded values — move to env
- [ ] **10.5** Review all error handlers — confirm nothing fails silently
- [ ] **10.6** Final git commit with message: `feat: Shoprift V1.0.0 — dm2buy migration engine`
- [ ] **10.7** Push to private GitHub repo

---

## PHASE 11 — CSV MAPPER + CLIENT FOLDERS + DELIVERY ZIP ✅ COMPLETE

> Built 2026-05-12. All E1–E9 integration tests pass.

- [x] **11.1** Install `papaparse` and `archiver` dependencies
- [x] **11.2** Create `src/csv-synonyms.js` — fuzzy-match synonym dictionary + `NO_SOURCE_DATA_FIELDS`
- [x] **11.3** Create `src/csv-mapper.js` — template loading, fuzzy matching, interactive approval (y/e/c), edit mode, unmatched resolution, mapping cache with MD5 hash invalidation, `--auto-approve` support, row strategies, transforms
- [x] **11.4** Create `presets/shopify.json` — Shopify product import (one-row-per-variant, 24 columns)
- [x] **11.5** Create `presets/generic.json` — generic export (one-row-per-product, 12 columns)
- [x] **11.6** Create `src/ledger.js` — append-only `_ledger.csv` at `output/` root, papaparse read/write, pending fallback when file locked
- [x] **11.7** Create `src/zipper.js` — delivery zip with `store_data.csv`, `migration_report.md`, `images/`, `README.txt`
- [x] **11.8** Create `src/prompt.js` — singleton readline with line buffer (fixes piped stdin drain across multiple prompts)
- [x] **11.9** Update `src/index.js` — per-job `{client}_{date}_{HHMM}` folders, collision-safe suffix, `--client`, `--format`, `--zip`, `--auto-approve` flags, `ensureRootStructure()`, `job_metadata.json` write, ledger append, Phase 4c/4d/4e ordering
- [x] **11.10** Update `src/downloader.js` — accept explicit `imageDir` param
- [x] **11.11** Update `src/formatter.js` — accept `outputDir` and `csvInfo` params; unmapped-columns section in migration report
- [x] **11.12** Add `clients/` to `.gitignore`

### CLI flags added

```bash
node src/index.js <url> [--client <slug>] [--format shopify|generic|./path.csv] [--zip] [--auto-approve]
```

### Row count for kiwiishop (Shopify preset)

| Product | Variants | Images | Total rows |
|---------|----------|--------|------------|
| Gingham Scrunchies | 5 colors | 6 | 10 |
| Tomato mini Charm | — | 2 | 2 |
| Pudding Crochet Charm | — | 4 | 4 |
| The Forever Flowers | 2 colors | 6 | 7 |
| **Total** | | | **23** |

Formula per product: `1 (full row) + (variants − 1) + (images − 1)`

---

## DEFINITION OF DONE

All tasks above checked. Plus:

```bash
node src/index.js https://kiwiishop.dm2buy.com test_account
```

Produces:
- `/output/store_data.json` — valid against schema, 4 products
- `/output/migration_report.md` — readable, complete
- `/output/images/` — 18 image files, all non-zero size
- Supabase job record — status: complete

Zero crashes. Zero silent failures. Zero schema validation errors.

---

*Cross-reference: CLAUDE.md for module specifications. ARCHITECTURE.md for data flow. SCHEMA.md for field definitions. ERRORS.md for failure handlers.*
