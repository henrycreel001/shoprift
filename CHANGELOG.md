# CHANGELOG.md

All notable changes to Shoprift are documented here.
Format: `[Version] — Date — Summary`

---

## [1.0.0] — 2026-05-12 — Initial Release

### Added
- dm2buy storefront scraping via Playwright headless Chrome
- Phase 1: Recon module — fast store scan, product/collection/image count
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
- Playwright Chromium (headless)
- Supabase JS client
- Zod schema validation
- Axios for image streaming

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
