# CLAUDE.md — Shoprift Agent Instructions

> Read this file first. Every decision must align with it.
> Cross-reference: ARCHITECTURE.md → TASKS.md → SCHEMA.md → ERRORS.md → PRE_LAUNCH_CHECKLIST.md
> **Project skills:** `/shoprift-pm` · `/shoprift-legal` · `/shoprift-accountant` · `/shoprift-content` · `/caveman`

## SESSION CONTINUITY

**At session start:** Read `docs/CONTEXT.md` immediately after this file. It tells you exactly where things stand.

**When user says "update context":** Rewrite `docs/CONTEXT.md` — update Last Updated, Last 5 Actions, Active Blockers, Uncommitted Changes, and Next Tasks. Keep Known Decisions stable unless something changed. Do NOT write to memory files — this is a project state save, not a memory save.

**When context window is getting large:** Remind user to say "update context" before starting a new session.

---

## WHAT IS SHOPRIFT

Shoprift is a dm2buy store migration tool. It scrapes a dm2buy storefront, verifies ownership, extracts all product and store data, downloads all images, and produces a structured import package (JSON + CSV + images) ready for any target platform. Standalone product first; will later power the import feature of a companion platform ([App Name] — TBD).

---

## CURRENT BUILD STATUS

| Group | Phases | Status | Blocker / Note |
|-------|--------|--------|----------------|
| A — Engine | 0–10 | In progress | kiwiishop end-to-end test not yet confirmed passing |
| B — CSV mapper | 11 | ✅ Complete | Shopify preset + generic preset shipped |
| C — Web app | 12–14 | 🟡 Scaffolded | API routes exist; blocked on PRE_LAUNCH_CHECKLIST |
| D — Launch | 15 | Not started | Blocked on C |

**Do not ship Group C until every item in `docs/PRE_LAUNCH_CHECKLIST.md` is ticked.**

---

## GO-TO-MARKET

| Mode | Who runs it | Delivery | Status |
|------|------------|----------|--------|
| **Concierge** | Founder manually runs CLI, delivers zip via WhatsApp/email, collects UPI/Razorpay | CSV + images zip | Live once Group A passes kiwiishop test |
| **Self-serve web app** | Seller pastes URL → recon → verify → pay → download | Automated | After ≥5 real concierge jobs + PRE_LAUNCH_CHECKLIST complete |

Concierge detail: `docs/CONCIERGE.md` [planned — not yet written]
Web app spec: `docs/WEB_APP.md` [planned — not yet written]

---

## PRE-LAUNCH GAPS — WEB APP ONLY

Read `docs/PRE_LAUNCH_CHECKLIST.md` before any Phase 12 work beyond current scaffold:

1. **Anti-detection** — TLS fingerprint, header set, delay randomization, Playwright DOM fallback
2. **Scaling** — single Railway IP insufficient; job queue + proxy rotation required
3. **Legal** — Migration Consent, ToS, Privacy Policy, Grievance Officer notice, lawyer review before taking web app payments

---

## YOUR ROLE AS AGENT

1. Follow TASKS.md as strict build checklist — phases in order
2. Follow SCHEMA.md for every data structure — no improvisation
3. Follow ERRORS.md for every failure mode — no silent failures
4. Follow ARCHITECTURE.md for every technical decision
5. Test every module against `kiwiishop.dm2buy.com` before marking done
6. Flag anything unclear — do not guess, do not improvise structure

---

## PLATFORM KNOWLEDGE PROTOCOL

Each target platform lives under `presets/<platform>/`:
- `<PLATFORM>.md` — lessons, gotchas, decisions, silent failures
- `preset.json` — machine-readable format spec
- `emitter.js` — platform-specific output code
- `fixtures/` — verified working examples

**Before platform work:** Read `presets/<platform>/<PLATFORM>.md` + relevant fixture in full.

**After platform work:** Update `<PLATFORM>.md` with anything learned:
- New silent failure → add to Silent Failures table
- Non-obvious decision → add to Decision Log
- Spec change → add to Platform Changelog + update Status
- If nothing learned: commit message must say `docs(<platform>): no new platform knowledge (verified existing behavior holds)`

The knowledge file is the single source of truth. Code, tests, and seller-facing docs align with it — never the reverse.

### Convention: Collections as tags

dm2buy collections → Tags column on anchor row in output CSV. Format: `"Collection Name, tag1, tag2"` (collection name first). Products with `is_uncategorized: true` have no collection tag. Do not change this without updating all platform emitters, all platform knowledge files, and seller-facing post-import docs.

---

## TECH STACK

### Engine (Phase 0–10)

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | v24.14.0 |
| Browser automation | Playwright | Latest |
| HTTP client | Axios | Latest |
| Data validation | Zod | Latest |
| Job tracking | Supabase | Latest JS client |
| Job queue | BullMQ + ioredis | Installed |
| Zip packaging | archiver | Installed |
| CSV | papaparse | Installed |
| Environment | dotenv | Latest |

### Web app (Phase 12+)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Frontend host | Vercel |
| Engine host | Railway.app |
| Auth | Supabase Auth |
| Payments | Razorpay (UPI-first) |
| File delivery | Supabase Storage (signed URLs, 7-day expiry) |

No unnecessary dependencies. Every package must earn its place.

---

## PROJECT STRUCTURE

```
shoprift/
├── CLAUDE.md                         ← You are here. Read first.
├── README.md
├── CHANGELOG.md
├── worker.js                         ← BullMQ worker process (Railway)
│
├── docs/
│   ├── ARCHITECTURE.md               ← Engine decisions + data flow (frozen)
│   ├── SCHEMA.md                     ← All engine data structures (frozen)
│   ├── TASKS.md                      ← Build checklist — Phase 0–15
│   ├── ROADMAP.md                    ← V1 → V2 → V3 roadmap
│   ├── ERRORS.md                     ← All failure modes
│   ├── PRE_LAUNCH_CHECKLIST.md       ← Must pass before web app ships
│   ├── SHOPIFY_POST_IMPORT.md        ← Seller-facing post-import guide
│   ├── SKILLS.md                     ← Project skills reference
│   ├── legal/                        ← Legal docs (do not edit without /shoprift-legal)
│   │   ├── terms-of-service.md
│   │   ├── privacy-policy.md
│   │   ├── migration-consent.md
│   │   └── grievance-officer.md
│   │
│   │   [Planned — not yet written:]
│   ├── CONCIERGE.md                  ← Manual delivery workflow
│   ├── WEB_APP.md                    ← Self-serve web app spec
│   ├── PAYMENTS.md                   ← Razorpay + UPI integration spec
│   ├── PRICING.md                    ← Concierge + self-serve tiers + refund policy
│   ├── CSV_MAPPER.md                 ← CSV format mapping spec
│   └── PIVOT_NOTE.md                 ← Standalone-product pivot rationale
│
├── src/                              ← Engine (Phase 0–11)
│   ├── index.js                      ← CLI entry point
│   ├── api.js                        ← HTTP API surface (web app mode)
│   ├── browser.js                    ← Playwright browser lifecycle
│   ├── recon.js                      ← Phase 1: fast store scan
│   ├── extractor.js                  ← Phase 3: full product extraction
│   ├── verifier.js                   ← Phase 2: ownership verification
│   ├── downloader.js                 ← Image downloading
│   ├── formatter.js                  ← Raw data → schema
│   ├── validator.js                  ← Zod schema validation
│   ├── job.js                        ← Supabase job status tracking
│   ├── queue.js                      ← BullMQ job queue
│   ├── csv-mapper.js                 ← Phase 11: schema → CSV in any format
│   ├── csv-synonyms.js               ← Phase 11: fuzzy-match column synonym dict
│   ├── ledger.js                     ← Phase 11: append-only job ledger
│   ├── zipper.js                     ← Phase 11: delivery zip packaging
│   ├── prompt.js                     ← Shared readline singleton
│   └── utils.js                      ← Shared helpers
│
├── schemas/
│   └── store.schema.json             ← Canonical import schema (frozen)
│
├── presets/
│   ├── shopify/                      ← Shopify platform knowledge + emitter
│   │   ├── SHOPIFY.md
│   │   ├── preset.json
│   │   ├── emitter.js
│   │   └── fixtures/
│   └── generic.json                  ← Generic one-row-per-product export
│
├── web/                              ← Phase 12+ Next.js app (Vercel)
│   └── src/app/api/
│       ├── recon/
│       ├── job/
│       ├── payment/
│       └── download/
│
├── clients/                          ← gitignored — per-client template files
├── output/                           ← gitignored — all generated output
│   ├── _ledger.csv
│   ├── _archive/
│   └── {client}_{date}_{HHMM}/
│       ├── store_data.json
│       ├── store_data.csv
│       ├── migration_report.md
│       ├── job_metadata.json
│       ├── {store}_shoprift_delivery.zip
│       └── images/
│
├── tests/
│   └── kiwiishop.test.js
├── .env.example
├── .gitignore
└── package.json
```

---

## PLAYWRIGHT RULES (non-negotiable)

```javascript
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }
});

await page.waitForLoadState('networkidle');
await page.waitForTimeout(800); // between navigations

// Always close in finally block — no hanging processes
```

---

## SUPABASE JOB TRACKING

Table: `import_jobs`
```sql
id            uuid primary key
account_id    text not null
store_url     text not null
status        text not null  -- 'recon' | 'verifying' | 'extracting' | 'downloading' | 'complete' | 'failed'
recon_data    jsonb
progress      jsonb          -- { current: 0, total: 0, phase: '' }
error         text
created_at    timestamp
updated_at    timestamp
```

Additional tables (web app mode):
- `verification_attempts` — Phase 0.7 SQL
- `payments` — Phase 13
- `downloads` — Phase 13 (signed URL tracking)

Rules: one active job per account at insert time; update status + progress after every meaningful step; never delete — mark complete or failed.

---

## CODE QUALITY RULES

- **JSDoc on every exported function** — params, return, throws. No prose docblocks.
- **No inline comments** unless the WHY is non-obvious (hidden constraint, platform quirk, workaround). What the code does is self-evident from naming.
- Every async function has try/catch — no unhandled rejections
- Every error logged with context: `{ phase, url, error }` — structured JSON to stderr via `console.error()`
- No bare `console.log` in production paths — use `console.error({ phase, url, ... })` pattern
- No hardcoded values — all config via `.env`
- Every module exports one clear function or class — no god files
- `process.exit()` only in `src/index.js`

---

## TESTING RULES

- Test store: `https://kiwiishop.dm2buy.com`
- Expected: 4 products · 2 collections · 18 images
- Pass = all 4 products extracted with correct prices and image URLs
- Run tests after every phase — not just at end

---

## DEFINITION OF DONE — V1 (CONCIERGE-READY)

- [ ] `node src/index.js https://kiwiishop.dm2buy.com` runs without errors
- [ ] Recon returns 4 products / 2 collections / 18 images
- [ ] Verification flow works (Method A: Instagram story; Method B: product injection)
- [ ] All 4 products extracted with correct data
- [ ] All 18 images downloaded to `output/images/`
- [ ] `store_data.json` validates against `store.schema.json` — zero errors
- [x] `store_data.csv` exports in Shopify preset format ✅
- [ ] `migration_report.md` human-readable and complete
- [ ] Supabase job tracked start to finish
- [ ] All errors handled gracefully — no crashes on bad input
- [ ] Test file passes

---

## DEFINITION OF DONE — V2 (WEB APP)

- [ ] Next.js web app deployed to Vercel
- [ ] Engine deployed to Railway
- [ ] Razorpay payment integration live
- [ ] User flow: paste URL → recon → verify → pay → download
- [ ] Payment ledger in Supabase
- [ ] Signed download URLs — 7-day expiry
- [ ] End-to-end tested with one real paid transaction

---

## CRITICAL RULES — NEVER VIOLATE

1. Never extract without ownership verification passing
2. Never produce partial output that looks complete
3. Never leave Playwright browser open — always close in finally block
4. Never hardcode values — everything via `.env`
5. Never swallow errors — every failure logged + Supabase updated
6. Never write `store_data.json` if Zod validation fails
7. Never start a new phase until current phase fully works
8. Always test against kiwiishop before marking any phase done
9. One active job per account at a time — enforce at insert
10. Never ship Group C (web app) until PRE_LAUNCH_CHECKLIST is fully ticked
11. Never take web app payment for extraction that hasn't completed — refund first

---

## PROJECT SKILLS

- `/shoprift-accountant` — invoicing, GST, TDS, expenses, pricing, books. MALIQ ENTERPRISES / sole prop / Delhi 07.
- `/shoprift-legal` — ToS, Privacy Policy, DPA, migration consent, competitor ToS review. India-first (DPDP, IT Act), GDPR/CCPA layered on. **Required before editing `docs/legal/`.**
- `/shoprift-pm` — specs, user stories, tickets, prioritisation, roadmap. No code.
- `/shoprift-content` — Instagram carousels, posts, Reels scripts, YouTube, Reddit, DM replies. Output → `./output/content/`.
