# ROADMAP.md — Shoprift Vision & Phases

> Part of the Shoprift document suite.
> This document defines what Shoprift is today, what it becomes, and where it fits
> in the larger [App Name] platform vision.
> Cross-reference: ARCHITECTURE.md for integration path.

---

## THE VISION

Shoprift starts as a migration engine — a tool that lifts a seller's complete store
data off a dying platform and packages it for a fresh start.

But Shoprift's real value is trust. When a small business owner sees that
[App Name] built a tool specifically to rescue their data, they trust the platform.
That trust is the acquisition strategy. The migration tool IS the marketing.

---

## V1 — THE MIGRATION ENGINE (NOW)

**Status:** Building today
**Scope:** dm2buy stores only
**Users:** Internal — powers [App Name] import feature
**Interface:** CLI + background job via Supabase

**What it does:**
- Accepts a dm2buy store URL
- Verifies ownership via Instagram story (primary) or product injection (fallback)
- Scrapes complete store data: products, variants, images, collections, policies
- Downloads all product images locally
- Outputs `store_data.json` and `migration_report.md`
- Tracks job status in Supabase for async UX

**Success criteria:**
- Works on any dm2buy store
- Zero data loss on extraction
- Ownership verification blocks fraud
- Complete in under 5 minutes for stores up to 50 products

---

## V2 — MULTI-PLATFORM SUPPORT

**Status:** After [App Name] platform ships
**Scope:** Multiple Instagram storefront platforms

**Platforms to add:**
- Instamojo storefronts
- Meesho seller pages (where public)
- Shopify (via their export CSV — different approach)
- DM2Order (dm2buy competitor — same architecture likely)
- Manual CSV import for any platform

**Changes required:**
- Platform detection module: identify which platform a URL belongs to
- Platform-specific extractors: each platform gets its own extractor module
- Unified output schema stays the same — only extractors change
- Ownership verification adapts per platform

**Architecture addition:**
```
src/
  platforms/
    dm2buy.js      ← V1 extractor moved here
    instamojo.js   ← V2
    meesho.js      ← V2
    shopify.js     ← V2 (CSV-based)
    dm2order.js    ← V2
  platform-detector.js  ← identifies platform from URL
```

---

## V3 — EMBEDDED IN [APP NAME] PLATFORM

**Status:** After V2
**Scope:** Shoprift runs as a background service inside [App Name]

**What changes:**
- Shoprift moves from CLI to a Railway.app Node.js service
- [App Name] frontend calls Shoprift via internal API
- User experience:
  - Paste URL in [App Name] import screen
  - Shoprift runs in background
  - User can close app — job persists
  - Live progress shown if app is open
  - "Check back in X minutes" if app is closed
  - Pre-import editor: select/deselect products, fix categories
  - One-click import after review

**Paid feature:**
- Free tier: import up to 10 products per month
- Pro tier: unlimited imports
- Import is a key differentiator — justifies subscription

**Infrastructure:**
```
[App Name] Vercel frontend
      ↕ REST API
[App Name] Next.js backend
      ↕ HTTP
Shoprift Railway service (persistent Node.js)
      ↕ Supabase (shared database)
```

---

## V4 — THE PUBLIC MIGRATION TOOL

**Status:** If/when [App Name] has significant user base
**Scope:** Shoprift as a standalone product or open API

**Concept:**
- Any seller on any platform can use Shoprift to migrate anywhere
- Not locked to [App Name]
- API-first: developers building their own platforms can integrate Shoprift
- Shoprift becomes infrastructure — like Stripe for payments but for store migration

**This is optional and far future.**
**Do not build for this. Just know it is possible.**

---

## WHAT SHOPRIFT IS NOT

- Not a web scraper for competitive intelligence
- Not a price monitoring tool
- Not a public tool for accessing other people's stores without verification
- Not a data reselling business
- Not a replacement for building a real product catalog

---

## GUIDING PRINCIPLES

**1. Ownership first**
Never extract data without verifying the requester owns the store.
This is not optional. This is not a V2 feature. This is always on.

**2. Complete or nothing**
A partial import is more dangerous than no import.
If extraction fails midway, the user gets a clear error — not a half-populated store.

**3. Schema stability**
The `store.schema.json` is a contract.
Once [App Name] reads from it, changing it breaks the platform.
Version the schema if it must change.

**4. Speed is trust**
Every second the import takes is a second the user doubts the platform.
Optimize extraction speed as a first-class concern, not an afterthought.

---

*Cross-reference: ARCHITECTURE.md for V3 integration details. CLAUDE.md for V1 build scope. TASKS.md for what to build today.*
