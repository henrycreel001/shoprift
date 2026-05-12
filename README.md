# Shoprift

> dm2buy store migration engine. Powers the import feature of [App Name].

Shoprift scrapes a dm2buy storefront, verifies store ownership, extracts all product and store data, downloads all images, and produces a structured import package ready for [App Name].

---

## WHAT IT DOES

```
Input:  https://yourstore.dm2buy.com
Output: store_data.csv + migration_report.md + images/ + delivery.zip
```

1. **Recon** — scans the store in ~15 seconds, counts products, collections, images
2. **Extract** — pulls every product, variant, price, image URL, and store policy
3. **Download** — saves all product images locally
4. **Format** — structures everything to a clean schema
5. **CSV export** — outputs in Shopify format, generic format, or any custom template
6. **Zip** — packages everything into a delivery-ready zip

---

## REQUIREMENTS

- Node.js v18 or higher (v24 confirmed working)
- Mac or Linux (Windows not tested)
- Supabase account (free tier)
- Internet connection

---

## SETUP

**1. Clone the repo**
```bash
git clone https://github.com/yourusername/shoprift.git
cd shoprift
```

**2. Install dependencies**
```bash
npm install
npx playwright install chromium
```

**3. Configure environment**
```bash
cp .env.example .env
# Edit .env and add your Supabase URL and anon key
```

**4. Set up Supabase tables**

Run the SQL in `docs/TASKS.md` Phase 0, step 0.7 in your Supabase SQL editor.

**5. Verify setup**
```bash
node tests/kiwiishop.test.js
# Should log: 23 passed, 0 failed
```

---

## COMMON COMMANDS

```bash
# Default — Shopify format, full delivery zip
node src/index.js https://store.dm2buy.com --format shopify --zip

# Generic format
node src/index.js https://store.dm2buy.com --format generic --zip

# Custom client template (first time — triggers interactive approval)
node src/index.js https://store.dm2buy.com --format ./clients/client-template.csv --zip

# Same template, silent re-run after first approval
node src/index.js https://store.dm2buy.com --format ./clients/client-template.csv --auto-approve --zip

# Override auto-detected client slug
node src/index.js https://store.dm2buy.com --client beautiful-things --format shopify --zip
```

## USAGE

```bash
node src/index.js <dm2buy-store-url> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--client <slug>` | Override auto-derived client slug (default: subdomain) |
| `--format <name>` | `shopify` \| `generic` \| `./path/to/template.csv` \| `./path/to/preset.json` (default: `shopify`) |
| `--zip` | Create `{store}_shoprift_delivery.zip` after extraction |
| `--auto-approve` | Use cached `.matching.json` without prompting (requires prior approval run) |

**What happens:**
1. Shoprift scans the store and shows a summary
2. You confirm you want to continue
3. Extraction and download run automatically
4. CSV is exported in the requested format (interactive approval on first run with a custom template)
5. Output lands in `output/{client}_{date}_{HHMM}/`

---

## OUTPUT

```
output/
├── _ledger.csv                           ← All jobs — open in Excel
├── _archive/                             ← Reserved for archived jobs
└── kiwiishop_2026-05-12_1815/           ← {client}_{date}_{HHMM}
    ├── store_data.json                   ← Full structured data
    ├── store_data.csv                    ← Import-ready CSV
    ├── migration_report.md               ← Action items before going live
    ├── job_metadata.json                 ← Job record (edit price/notes by hand)
    ├── the-kiwii-shop_shoprift_delivery.zip  ← --zip flag
    └── images/
        ├── 1/                            ← Product 1 images
        │   ├── 0.jpg
        │   └── 1.jpg
        ├── 2/
        └── ...
```

---

## OWNERSHIP VERIFICATION (V2)

V1 concierge mode skips verification — ownership is confirmed via DM before the founder runs the CLI.

V2 (web app) will add:
- **Method A** — Instagram story with unique code (primary)
- **Method B** — dm2buy product injection (fallback)

---

## DOCUMENTS

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Agent instructions for Claude Code |
| `docs/ARCHITECTURE.md` | Technical decisions and data flow |
| `docs/SCHEMA.md` | Every data structure defined |
| `docs/TASKS.md` | Build checklist |
| `docs/ROADMAP.md` | V1 → V2 → V3 vision |
| `docs/ERRORS.md` | Failure modes and handlers |

---

## VERSION

**Current:** V1.0.0
See `CHANGELOG.md` for history.

---

## NOTES

- Shoprift is a private internal tool — not public
- Only works with dm2buy storefronts in V1
- One import job per account at a time
- Images on dm2buy's Azure CDN may expire — run Shoprift sooner rather than later
- See `docs/ROADMAP.md` for multi-platform support plans
