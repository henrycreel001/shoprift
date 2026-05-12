# CHANGELOG.md

All notable changes to Shoprift are documented here.
Format: `[Version] — Date — Summary`

---

## [Unreleased] — 2026-05-12 — V1 verifier bypass

### Changed
- CLI flow (`src/index.js`) no longer calls verification in V1
- Job status sequence in Supabase shortened: `recon` → `extracting` (no `verifying` step)
- Zod validator updated to accept `verification_method: "skipped_v1_concierge"`

### Preserved
- `src/verifier.js` remains on disk for V2 web app use
- Phase 4 spec in TASKS.md unchanged — still documents what V2 will build

### Known issues
- Method A (Instagram story polling) does not work as built — Instagram does not expose story content in public page HTML. This is a V2 problem to solve when the web app is built. Not relevant to V1 concierge mode.

---

## [Unreleased] — 2026-05-12 — Phase 11: CSV mapper + client folders + delivery zip

### Added
- Client folder system: `output/{client_slug}_{date}_{HHMM}/` per job — never overwrites previous runs
- Collision-safe folder naming: appends `_2`, `_3`, etc. when same-minute runs collide
- Ledger CSV at `output/_ledger.csv` — one row per job, append-only, opens in Excel
- `src/csv-mapper.js` — converts validated JSON to CSV in any format
- `src/csv-synonyms.js` — synonym dictionary for fuzzy column matching; `NO_SOURCE_DATA_FIELDS` for sku/weight
- `presets/shopify.json` — Shopify product import preset (one-row-per-variant, 24 columns)
- `presets/generic.json` — generic export preset (one-row-per-product, 12 columns)
- Template upload: `--format ./path/to/template.csv` maps any custom header format
- Fuzzy column matching with high/medium confidence scoring and contains-ratio guard
- Interactive approval flow: review matches → approve / edit / cancel
- Unmapped column resolution: skip / map to field / set static value
- Mapping cache as `.matching.json` sidecar next to template (MD5 hash invalidation)
- `--auto-approve` flag: silent run when valid cache exists, clear error when missing
- Delivery zip via `--zip` flag: `{store}_shoprift_delivery.zip` with CSV, report, images, README.txt
- `src/ledger.js` — append-only ledger module with pending fallback for locked files
- `src/zipper.js` — zip packaging with auto-generated `README.txt`
- `src/prompt.js` — singleton readline with line buffer (fixes piped stdin drain)
- `job_metadata.json` written per job (founder-editable fields: price, channel, contact, notes)
- CLI flags: `--client`, `--format`, `--zip`, `--auto-approve`
- `clients/` directory (gitignored) for storing client template files

### Changed
- `src/index.js` writes all outputs to per-job folders instead of `output/` root
- Migration report includes `## Unmapped CSV Columns` section when applicable
- `src/downloader.js` accepts explicit `imageDir` parameter
- `src/formatter.js` accepts explicit `outputDir` and `csvInfo` parameters
- Default CSV format: `shopify`

### Dependencies
- Added: `papaparse` (CSV read/write), `archiver` v6 (zip creation)

---

## [1.0.0] — 2026-05-12 — Initial Release

### Added
- dm2buy store extraction via REST API (api.dm2buy.com) — faster and more reliable than DOM scraping
- Phase 1: Recon module — fast store scan via API, product/collection/image count in ~2s
- Phase 2: Ownership verification
  - Method A: Instagram story code (primary)
  - Method B: dm2buy product injection (fallback)
- Phase 3: Full extraction — products, variants, categories, store meta, policies
- Phase 4: Image downloader — all product images saved locally via Axios
- Phase 4: Formatter — raw data mapped to store.schema.json
- Phase 4: Validator — Zod schema validation before output write
- Supabase job tracking — status, progress, error logging
- CLI entry point — `node src/index.js <url> [account-id]`
- Migration report generation — human readable markdown
- Migration flags — identifies items needing manual attention
- Error handling for all 14 known failure modes
- Test suite against kiwiishop.dm2buy.com

### Technical
- Node.js v24.14.0
- Axios for dm2buy REST API calls and image streaming
- Playwright Chromium (retained for ownership verification polling)
- Supabase JS client for job tracking
- Zod schema validation

---

## UPCOMING

### [1.1.0] — Planned
- Railway.app deployment for production server use
- HTTP API wrapper around CLI for [App Name] integration
- Pre-import editor support (product selection JSON)

### [2.0.0] — Planned
- Multi-platform support (Instamojo, Meesho, DM2Order)
- Platform auto-detection from URL
- CSV import fallback for Shopify

---
