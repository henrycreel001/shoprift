# CLAUDE.md — Shoprift Agent Instructions

> This is the primary instruction file for Claude Code.
> Read this file first before touching any other file.
> Every decision, every module, every output must align with what is written here.
> Cross-reference: ARCHITECTURE.md → TASKS.md → SCHEMA.md → ERRORS.md

---

## WHAT IS SHOPRIFT

Shoprift is a backend migration engine. It scrapes a dm2buy storefront, verifies the requester owns that store, extracts all product and store data, downloads all images, and produces a perfectly structured import package ready to load into the [App Name] platform database.

Shoprift is never user-facing. Users interact with [App Name]. Shoprift runs silently in the background. Nobody outside the engineering context needs to know Shoprift exists.

---

## YOUR ROLE AS AGENT

You are the sole builder of this project. You will:

1. Read ALL documents in `/docs` before writing a single line of code
2. Follow TASKS.md as your strict build checklist — tick items in order
3. Follow SCHEMA.md for every data structure — no improvisation
4. Follow ERRORS.md for every failure mode — no silent failures ever
5. Follow ARCHITECTURE.md for every technical decision
6. Write clean, modular, well-commented code
7. Test every module against `kiwiishop.dm2buy.com` before marking it done

If anything is unclear — stop and flag it. Do not guess. Do not improvise structure.

---

## TECH STACK

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | v24.14.0 |
| Browser automation | Playwright | Latest |
| HTTP client | Axios | Latest |
| Image downloading | Axios + fs streams | — |
| Data validation | Zod | Latest |
| Output formatting | fs + JSON.stringify | Built-in |
| Job tracking | Supabase (fresh project) | Latest JS client |
| Environment | dotenv | Latest |
| CLI runner | Native Node.js | — |

No unnecessary dependencies. Every package must earn its place.

---

## PROJECT STRUCTURE

```
shoprift/
│
├── CLAUDE.md                  ← You are here. Read first.
├── README.md                  ← Setup and usage guide
├── CHANGELOG.md               ← Version history
│
├── docs/
│   ├── ARCHITECTURE.md        ← Technical decisions and data flow
│   ├── SCHEMA.md              ← Every data structure defined
│   ├── TASKS.md               ← Build checklist (follow in order)
│   ├── ROADMAP.md             ← V1 → V2 → V3 vision
│   └── ERRORS.md              ← Every failure mode and handler
│
├── src/
│   ├── index.js               ← CLI entry point
│   ├── browser.js             ← Playwright browser lifecycle
│   ├── recon.js               ← Phase 1: fast store scan
│   ├── extractor.js           ← Phase 2: full product extraction
│   ├── verifier.js            ← Ownership verification logic
│   ├── downloader.js          ← Image downloading and saving
│   ├── formatter.js           ← Structures raw data to schema
│   ├── validator.js           ← Zod schema validation
│   ├── job.js                 ← Supabase job status tracking
│   └── utils.js               ← Shared helpers
│
├── schemas/
│   └── store.schema.json      ← Canonical import schema
│
├── output/                    ← gitignored — all generated files land here
│   ├── store_data.json
│   ├── migration_report.md
│   └── images/
│
├── tests/
│   └── kiwiishop.test.js      ← Primary test against known store
│
├── .env.example               ← Required environment variables
├── .gitignore
└── package.json
```

---

## BUILD PHASES

Shoprift operates in four sequential phases. Build and test each phase fully before moving to the next. Never merge phases.

### PHASE 1 — RECON
**File:** `src/recon.js`
**Time:** ~15 seconds per store
**Purpose:** Fast scan to count products, collections, images. Powers the pre-import summary card shown to users before they confirm import.

Must return:
```json
{
  "store_name": "",
  "store_url": "",
  "instagram_handle": "",
  "product_count": 0,
  "collection_count": 0,
  "image_count": 0,
  "estimated_import_seconds": 0,
  "recon_timestamp": ""
}
```

### PHASE 2 — VERIFICATION
**File:** `src/verifier.js`
**Purpose:** Confirm the requesting user owns the dm2buy store before any full extraction runs.

Two methods in priority order:

**Method A — Instagram Story (Primary)**
1. Generate a unique session-locked code: `SHR-{accountId}-{random4}-{timestamp}`
2. Generate a downloadable story image template with the code and `[App Name]` branding
3. Poll the store's Instagram page every 30 seconds for up to 10 minutes
4. Search page source / visible text for the exact code
5. Found → verified. Not found after 10 min → timeout, prompt fallback

**Method B — dm2buy Product Injection (Fallback)**
1. Use same session-locked code format
2. Instruct user to add a ₹1 product to their dm2buy store named exactly with the code
3. After user confirms, run Playwright on the store URL
4. Search all product names for the exact code
5. Found → verified. Not found → error with clear message

Security rules:
- Code is always tied to: accountId + storeUrl + timestamp
- Code expires after 10 minutes
- A code verified for store A cannot unlock store B
- Store all verification attempts in Supabase with timestamp

### PHASE 3 — EXTRACTION
**File:** `src/extractor.js`
**Purpose:** Full product and store data extraction after verification passes.

Extraction targets (based on confirmed kiwiishop audit):
- Store meta: name, description, instagram, shipping, policies, payment methods
- All products: name, price, original_price, discount_pct, category, variants, stock_status, all image URLs, product URL, tags
- All collections: name, URL, product count
- Navigation structure
- URL patterns

dm2buy-specific knowledge:
- Framework: Next.js static export
- Image CDN: `dm2buy-drop-resized-gga4c6azekgcgngp.z02.azurefd.net`
- Product URL pattern: `/product/<32-char-hex-id>`
- Collection filter pattern: `/?collection=<Name>`
- Content is client-side hydrated — always wait for full render before extracting
- Use `page.waitForSelector()` for product grid before scraping
- Add 800ms delay between page navigations — never hammer the server
- If a product has no description beyond shipping text — flag it as `needs_description: true`

### PHASE 4 — DOWNLOAD + OUTPUT
**File:** `src/downloader.js` + `src/formatter.js`
**Purpose:** Download all images locally. Format everything to schema. Write output files.

Image downloading rules:
- Download every image URL found during extraction
- Save to `/output/images/{productId}/{filename}.jpg`
- Verify each download completed (check file size > 0)
- If an image 404s — log it in `migration_report.md` under "Failed Images"
- Never skip a failed image silently

Output files to generate:
1. `/output/store_data.json` — full structured data matching store.schema.json
2. `/output/migration_report.md` — human readable summary
3. `/output/images/` — all downloaded product images

---

## PLAYWRIGHT RULES

These rules are non-negotiable:

```javascript
// Always launch with these settings
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  viewport: { width: 1280, height: 800 }
});

// Always wait for network idle before extracting
await page.waitForLoadState('networkidle');

// Always add delay between navigations
await page.waitForTimeout(800);

// Always close browser in finally block — never leave hanging processes
```

---

## SUPABASE JOB TRACKING

Every import job must be tracked in Supabase. This enables the "check back later" UX and prevents duplicate imports.

Table: `import_jobs`
```sql
id            uuid primary key
account_id    text not null
store_url     text not null
status        text not null  -- 'recon' | 'verifying' | 'extracting' | 'downloading' | 'complete' | 'failed'
recon_data    jsonb          -- populated after Phase 1
progress      jsonb          -- { current: 0, total: 0, phase: '' }
error         text           -- populated if status = 'failed'
created_at    timestamp
updated_at    timestamp
```

Rules:
- One active job per account at a time — enforce at insert time
- Update `status` and `progress` after every meaningful step
- Never delete a job — mark as complete or failed

---

## CODE QUALITY RULES

- Every function must have a JSDoc comment explaining what it does, its params, and return value
- Every async function must have try/catch — no unhandled promise rejections
- Every error must be logged with context: which phase, which URL, what failed
- No hardcoded values — all configurable items live in `.env`
- No console.log in production paths — use a structured logger
- Every module exports a single clear function or class — no god files

---

## TESTING RULES

- Primary test store: `https://kiwiishop.dm2buy.com`
- Known product count: 4
- Known collection count: 2
- Known image count: 18
- Test passes only if all 4 products extracted with correct prices and image URLs
- Run tests after completing each phase — not just at the end

---

## DEFINITION OF DONE

Shoprift V1 is complete when:

- [ ] `node src/index.js https://kiwiishop.dm2buy.com` runs without errors
- [ ] Recon returns correct product/collection/image count
- [ ] Verification flow works (both methods)
- [ ] All 4 products extracted with correct data
- [ ] All 18 images downloaded to `/output/images/`
- [ ] `store_data.json` validates against `store.schema.json` with zero errors
- [ ] `migration_report.md` is human readable and complete
- [ ] Supabase job tracked from start to finish
- [ ] All errors handled gracefully — no crashes on bad input
- [ ] Test file passes

---

*Cross-reference: See ARCHITECTURE.md for data flow diagrams. See TASKS.md for step-by-step build order. See ERRORS.md for all failure handlers. See SCHEMA.md for exact data structures.*
