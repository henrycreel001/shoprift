# CLAUDE.md — Shoprift Agent Instructions

> This is the primary instruction file for Claude Code.
> Read this file first before touching any other file.
> Every decision, every module, every output must align with what is written here.
> Cross-reference: ARCHITECTURE.md → TASKS.md → SCHEMA.md → ERRORS.md → PIVOT_NOTE.md

---

## WHAT IS SHOPRIFT

Shoprift is a dm2buy store migration tool. It scrapes a dm2buy storefront, verifies the requester owns that store, extracts all product and store data, downloads all images, and produces a structured import package (JSON + CSV + images) ready to load into any other platform.

**Shoprift is now a standalone product**, not an internal tool buried inside another app. It is positioned to rescue the 15,000+ small businesses displaced by dm2buy's shutdown. Later, it will also power the import feature of the [App Name] platform — but standalone comes first.

---

## THE PIVOT — READ THIS BEFORE ANYTHING ELSE

The original plan was: build Shoprift as an internal CLI tool, embed it inside [App Name] later.

The new plan is: launch Shoprift as a standalone product first, [App Name] absorbs it later.

This change does NOT affect the engine build. Phase 0–10 in TASKS.md is unchanged. What changes is what gets built *after* the engine is proven.

Full pivot context: `docs/PIVOT_NOTE.md`

---

## TWO GO-TO-MARKET MODES

Shoprift will reach sellers through two motions, in this order:

### Mode 1 — Concierge (launches first)

The founder personally runs Shoprift for individual sellers as a paid service:
- Founder DMs warm contacts who lost dm2buy stores
- Quotes a custom price based on the seller's catalog size and complexity
- Runs the CLI engine manually
- Delivers a CSV + images zip via WhatsApp or email
- Collects payment via UPI or Razorpay payment link

This validates demand, pricing, and edge cases without building any web infrastructure.

Full concierge workflow: `docs/CONCIERGE.md`

### Mode 2 — Self-serve web app (launches second)

Once concierge mode has proven demand and surfaced edge cases:
- Public web app at the Shoprift domain
- Seller pastes URL, uploads a sample CSV format, pays, downloads
- Fully automated end-to-end
- Tiered pricing based on product count

Full web app spec: `docs/WEB_APP.md`

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
8. **Build the engine first (Phase 0–10). Do not start web app work until the engine is proven against kiwiishop.**

If anything is unclear — stop and flag it. Do not guess. Do not improvise structure.

---

## PLATFORM KNOWLEDGE PROTOCOL

Shoprift supports multiple target platforms (currently: Shopify; future: WooCommerce, Instamojo, others). Each platform has a knowledge folder under `presets/<platform>/` containing:

- `<PLATFORM>.md` — knowledge file (lessons, gotchas, decisions, silent failures)
- `preset.json` — machine-readable format spec
- `emitter.js` — code that produces platform-specific output
- `fixtures/` — verified working examples

### MANDATORY RULES

**Before any platform-related work:**
- Read `presets/<platform>/<PLATFORM>.md` in full
- Read the relevant fixture under `presets/<platform>/fixtures/` if applicable

**After any platform-related work:**
- Update `<PLATFORM>.md` with anything learned:
  - New silent failure discovered → add to Silent Failures table
  - Non-obvious decision made → add to Decision Log
  - Platform spec changed → add to Platform Changelog + update Status
  - Re-verified the fixture against a real platform import → update Status "Last verified" date
- If nothing was learned, state this explicitly in the commit message:
  `docs(<platform>): no new platform knowledge (verified existing behavior holds)`

**The knowledge file is the single source of truth.** Code, tests, and seller-facing docs must align with what the knowledge file says. If they diverge, the knowledge file wins — update the code, tests, and docs to match.

**A stale knowledge file is worse than no knowledge file.** Treat updates as non-optional. If you complete a phase without touching the knowledge file, you must explicitly confirm in your report: "No new platform knowledge to record."

### CONVENTION: Collections preserved as tags

dm2buy collections do not have a direct equivalent in many target platforms. To preserve them, Shoprift writes `product.category` to the Tags column on the anchor row of the output CSV. Sellers create platform-native "Smart Collections" (or equivalent) matching by tag to automatically restore their collection structure.

Format: `"Collection Name, tag1, tag2"` (collection name first, comma-separated with existing product tags).

Products with `is_uncategorized: true` have no collection tag.

Do not change this convention without updating: (a) all platform emitters, (b) all platform knowledge files, (c) seller-facing post-import documentation.

---

## TECH STACK

### Engine (Phase 0–10) — unchanged

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | v24.14.0 |
| Browser automation | Playwright | Latest |
| HTTP client | Axios | Latest |
| Image downloading | Axios + fs streams | — |
| Data validation | Zod | Latest |
| Output formatting | fs + JSON.stringify | Built-in |
| Job tracking | Supabase | Latest JS client |
| Environment | dotenv | Latest |
| CLI runner | Native Node.js | — |

### CSV mapper layer (Phase 11) — new

| Layer | Technology |
|-------|-----------|
| CSV parsing | papaparse |
| CSV writing | papaparse |
| Column mapping config | JSON in repo, with Shopify preset built in |

### Web app (Phase 12+) — new, builds later

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Frontend host | Vercel |
| Engine host | Railway.app (Playwright needs persistent server) |
| Auth | Supabase Auth (later — concierge mode skips this) |
| Payments | Razorpay (UPI-first) |
| File delivery | Supabase Storage (signed URLs, 7-day expiry) |

No unnecessary dependencies. Every package must earn its place.

---

## PROJECT STRUCTURE

```
shoprift/
│
├── CLAUDE.md                       ← You are here. Read first.
├── README.md                       ← Internal setup guide (NOT public yet)
├── CHANGELOG.md                    ← Version history
│
├── docs/
│   ├── ARCHITECTURE.md             ← Engine technical decisions and data flow (frozen)
│   ├── SCHEMA.md                   ← Every engine data structure defined (frozen)
│   ├── TASKS.md                    ← Build checklist — engine (Phase 0–10) + web app (Phase 11+)
│   ├── ROADMAP.md                  ← V1 (concierge) → V2 (web app) → V3 ([App Name])
│   ├── ERRORS.md                   ← Failure modes — engine + payment + CSV
│   ├── PIVOT_NOTE.md               ← The standalone-product pivot explained
│   ├── CONCIERGE.md                ← Manual delivery workflow
│   ├── PRICING.md                  ← Concierge tiers + self-serve tiers + refund policy
│   ├── CSV_MAPPER.md               ← CSV format mapping spec + Shopify preset
│   ├── WEB_APP.md                  ← Self-serve web app spec (build after engine)
│   └── PAYMENTS.md                 ← Razorpay + UPI integration spec
│
├── src/                            ← The engine (Phase 0–11)
│   ├── index.js                    ← CLI entry point
│   ├── browser.js                  ← Playwright browser lifecycle
│   ├── recon.js                    ← Phase 1: fast store scan
│   ├── extractor.js                ← Phase 2: full product extraction
│   ├── verifier.js                 ← Ownership verification logic (V2)
│   ├── downloader.js               ← Image downloading and saving
│   ├── formatter.js                ← Structures raw data to schema
│   ├── validator.js                ← Zod schema validation
│   ├── job.js                      ← Supabase job status tracking
│   ├── csv-mapper.js               ← Phase 11: maps schema to CSV in any format
│   ├── csv-synonyms.js             ← Phase 11: fuzzy-match synonym dictionary
│   ├── ledger.js                   ← Phase 11: append-only job ledger
│   ├── zipper.js                   ← Phase 11: delivery zip packaging
│   ├── prompt.js                   ← Phase 11: shared readline singleton
│   └── utils.js                    ← Shared helpers
│
├── schemas/
│   └── store.schema.json           ← Canonical import schema (frozen contract)
│
├── presets/                        ← Phase 11 — built-in CSV format configs
│   ├── shopify.json                ← Shopify product import (one-row-per-variant)
│   └── generic.json                ← Generic export (one-row-per-product)
│
├── clients/                        ← gitignored — client template files live here
│   └── (e.g. handbloom-template.csv + handbloom-template.matching.json)
│
├── web/                            ← Phase 12+, separate Next.js project
│   └── (built later — do not start yet)
│
├── output/                         ← gitignored — all generated files land here
│   ├── _ledger.csv                 ← Append-only job log, opens in Excel
│   ├── _archive/                   ← Reserved for archived job folders
│   └── kiwiishop_2026-05-12_1815/ ← Per-job folder: {client}_{date}_{HHMM}
│       ├── store_data.json
│       ├── store_data.csv
│       ├── migration_report.md
│       ├── job_metadata.json
│       ├── {store}_shoprift_delivery.zip  ← --zip flag
│       └── images/
│
├── tests/
│   └── kiwiishop.test.js           ← Primary test against known store
│
├── .env.example                    ← Required environment variables
├── .gitignore
└── package.json
```

---

## BUILD PHASES — OVERVIEW

Shoprift V1 ships in 4 build groups. Build each group fully before moving on.

### Group A — Engine (TASKS.md Phase 0–10)

The CLI extraction engine. Unchanged from original plan. This is the core.

When this group is done, the founder can run concierge jobs manually using the CLI. **This unblocks revenue.** Do not move to Group B until kiwiishop test passes end-to-end.

### Group B — CSV mapper (TASKS.md Phase 11) ✅ COMPLETE

Adds the ability to output a CSV file in a format the seller requests. Reads a sample CSV the user uploads, maps Shoprift's internal fields to the user's column names, writes the output CSV. Also adds a Shopify preset out of the box.

Concierge mode is now fully operational — the founder can deliver in whatever format the seller's destination platform needs.

### Group C — Web app (TASKS.md Phase 12–14)

Builds the public Next.js web app. Frontend, API, Razorpay integration, file delivery. Hosted on Vercel + Railway.

Do not start this until concierge mode has been run on real paying customers at least 5 times. The web app must be informed by what concierge taught you.

### Group D — Launch (TASKS.md Phase 15)

Production deploy, payment go-live, soft launch to warm audience.

---

## ENGINE BUILD PHASES (Group A, unchanged)

The four runtime phases of the engine are unchanged from the original plan:

### PHASE 1 — RECON
~15 seconds. Counts products, collections, images. Powers the pre-import summary.

### PHASE 2 — VERIFICATION
Ownership proof. Method A (Instagram story) primary, Method B (dm2buy product injection) fallback. Code is session-locked, expires in 10 minutes, stored in Supabase.

### PHASE 3 — EXTRACTION
Full Playwright extraction of every product page. 800ms delay between navigations. Flags missing descriptions.

### PHASE 4 — DOWNLOAD + FORMAT + VALIDATE
Downloads all images via Axios. Formats raw data to store.schema.json structure. Runs Zod validation before writing any output.

dm2buy-specific knowledge, ownership verification rules, and Playwright settings: see ARCHITECTURE.md.

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

Additional tables added later for web app mode:
- `verification_attempts` — already in Phase 0.7 SQL
- `payments` — added in Phase 13 (web app)
- `downloads` — added in Phase 13 (signed URL tracking)

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

## DEFINITION OF DONE — V1 (CONCIERGE-READY)

Shoprift V1 is ready for concierge launch when:

- [ ] `node src/index.js https://kiwiishop.dm2buy.com` runs without errors
- [ ] Recon returns correct product/collection/image count (4/2/18)
- [ ] Verification flow works (both methods)
- [ ] All 4 products extracted with correct data
- [ ] All 18 images downloaded to `/output/images/`
- [ ] `store_data.json` validates against `store.schema.json` with zero errors
- [x] `store_data.csv` exports in Shopify preset format (Phase 11) ✅
- [ ] `migration_report.md` is human readable and complete
- [ ] Supabase job tracked from start to finish
- [ ] All errors handled gracefully — no crashes on bad input
- [ ] Test file passes

After this, concierge mode is live. Web app is V2.

---

## DEFINITION OF DONE — V2 (WEB APP)

- [ ] Next.js web app deployed to Vercel
- [ ] Engine deployed to Railway
- [ ] Razorpay payment integration live
- [ ] User can: paste URL → see recon → verify → upload sample CSV → pay → download
- [ ] Payment ledger in Supabase
- [ ] Signed download URLs with 7-day expiry
- [ ] Tested end-to-end with one real paid transaction

---

## CRITICAL RULES — NEVER VIOLATE

1. Never extract data without ownership verification passing
2. Never produce partial output that looks complete
3. Never leave Playwright browser open — always close in finally block
4. Never hardcode values — everything via .env
5. Never swallow errors silently — every failure logged + Supabase updated
6. Never write store_data.json if Zod validation fails
7. Never start a new phase until current phase fully works
8. Always test against kiwiishop before marking any phase done
9. One active job per account at a time — enforce at insert
10. `process.exit()` only in `src/index.js` — never in modules
11. Never start web app work until engine passes the kiwiishop test
12. Never take a payment for an extraction that hasn't completed (refund first, deliver second)

---

*Cross-reference: PIVOT_NOTE.md for the standalone pivot story. CONCIERGE.md for manual delivery workflow. PRICING.md for tiers. CSV_MAPPER.md for the format mapping spec. WEB_APP.md and PAYMENTS.md for V2 specs. ARCHITECTURE.md for engine data flow. TASKS.md for step-by-step build order. ERRORS.md for failure handlers. SCHEMA.md for exact data structures.*
