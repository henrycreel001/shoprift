# Shoprift

> dm2buy store migration engine. Powers the import feature of [App Name].

Shoprift scrapes a dm2buy storefront, verifies store ownership, extracts all product and store data, downloads all images, and produces a structured import package ready for [App Name].

---

## WHAT IT DOES

```
Input:  https://yourstore.dm2buy.com
Output: store_data.json + migration_report.md + /images folder
```

1. **Recon** — scans the store in ~15 seconds, counts products, collections, images
2. **Verify** — confirms you own the store before touching any data
3. **Extract** — pulls every product, variant, price, image URL, and store policy
4. **Download** — saves all product images locally
5. **Format** — structures everything to a clean schema ready for import

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
node src/index.js --test
# Should log: ✅ Setup verified. Shoprift is ready.
```

---

## USAGE

```bash
node src/index.js <dm2buy-store-url> [account-id]
```

**Example:**
```bash
node src/index.js https://kiwiishop.dm2buy.com user_123
```

**What happens:**
1. Shoprift scans the store and shows a summary
2. You confirm you want to continue
3. Shoprift walks you through ownership verification
4. Extraction and download run automatically
5. Output lands in `/output/`

---

## OUTPUT

```
output/
├── store_data.json        ← Structured store data (import this into [App Name])
├── migration_report.md    ← Human readable summary + action items
└── images/
    ├── 1/                 ← Product 1 images
    │   ├── 0.jpg
    │   └── 1.jpg
    ├── 2/
    └── ...
```

---

## OWNERSHIP VERIFICATION

Shoprift will not extract any store data until you prove you own it.

**Method A — Instagram Story (Primary)**
Post a generated story template to your Instagram. Shoprift checks for your unique code automatically. The story is your store's announcement that it is moving to [App Name] — subtle, aesthetic, and gets you free visibility.

**Method B — dm2buy Product (Fallback)**
If Method A is not possible, add a ₹1 product to your dm2buy store with a specific name Shoprift generates. Shoprift scans for it and verifies you. You can delete the product after.

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
