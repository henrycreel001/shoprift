# SCHEMA.md — Shoprift Data Schema

> Part of the Shoprift document suite.
> This is the single source of truth for every data structure in Shoprift.
> CLAUDE.md references this. ARCHITECTURE.md references this.
> The store.schema.json file is generated from this document.
> Any field not defined here does not exist in the output.

---

## CANONICAL OUTPUT SCHEMA

This is the exact structure of `/output/store_data.json`.
Every field is defined below with its type, whether it is required,
and what value to use if the source data is missing.

```json
{
  "store_meta": { ... },
  "products": [ ... ],
  "categories": [ ... ],
  "migration_flags": [ ... ],
  "scrape_meta": { ... }
}
```

---

## STORE META

```json
{
  "store_meta": {
    "name": "string — required — store display name",
    "description": "string | null — store tagline or description",
    "instagram": "string | null — handle without @ symbol",
    "contact": {
      "phone": "string | null",
      "email": "string | null",
      "whatsapp": "string | null",
      "support_note": "string | null — any support text found on site"
    },
    "location": "string | null — city or region if visible",
    "shipping": {
      "processing_time": "string | null — e.g. 'Within 2 working days'",
      "delivery_time": "string | null",
      "shipping_regions": "string | null — e.g. 'India only'",
      "minimum_order_value": "number | null — in INR",
      "shipping_charges": "number | null — in INR",
      "ships_within_days": "number | null"
    },
    "payment_methods": ["string array — list of accepted methods"],
    "policies": {
      "cancellations_accepted": "boolean",
      "returns_accepted": "boolean",
      "exchanges_accepted": "boolean",
      "damage_claim_note": "string | null"
    }
  }
}
```

**Field rules:**
- `name` is the only truly required field. If missing, fail the job.
- All null fields must be explicitly set to `null` — never omit them.
- `instagram` must not include the `@` symbol.
- `shipping_charges` and `minimum_order_value` must be numbers (INR), not strings.

---

## PRODUCTS ARRAY

Each item in the `products` array:

```json
{
  "id": "number — sequential, starts at 1",
  "name": "string — required — exact product name as displayed",
  "description": "string | null — full product description text",
  "needs_description": "boolean — true if no real description found",
  "price": "number — required — current selling price in INR",
  "original_price": "number | null — crossed-out price if discount shown",
  "discount_percentage": "number | null — computed from price vs original_price",
  "currency": "string — always 'INR' for dm2buy stores",
  "category": "string | null — collection name this product belongs to",
  "is_uncategorized": "boolean — true if not in any collection",
  "variants": {
    "sizes": ["string array — all size options, empty array if none"],
    "colors": ["string array — all color options, empty array if none"],
    "other": ["string array — any other variant type"]
  },
  "stock_status": "string — 'in_stock' | 'out_of_stock' | 'unknown'",
  "images_cdn": ["string array — original CDN URLs from dm2buy Azure"],
  "images_local": ["string array — local paths after download e.g. /output/images/1/0.jpg"],
  "images_failed": ["string array — CDN URLs that failed to download"],
  "product_url": "string — full URL of individual product page",
  "tags": ["string array — e.g. ['sale', 'bestseller', 'new']"],
  "selected_for_import": "boolean — default true, user can set false in pre-import editor"
}
```

**Field rules:**
- `name` and `price` are required. If either is missing, skip product and log warning.
- `discount_percentage` must be computed: `Math.round((1 - price/original_price) * 100)`
- `needs_description` is `true` if description only contains shipping/support boilerplate text
- `stock_status` defaults to `'unknown'` if no explicit stock indicator found
- `images_cdn` must never be empty — if no images found, log as migration flag
- `images_local` is populated after Phase 4 download completes
- `selected_for_import` defaults to `true` — pre-import editor can toggle this to `false`
- Products with `selected_for_import: false` are excluded from final import

---

## CATEGORIES ARRAY

```json
{
  "name": "string — required — collection display name",
  "url": "string — full collection filter URL",
  "product_count": "number — how many products in this collection",
  "slug": "string — URL-safe version of name e.g. 'hair-accessories'"
}
```

**Field rules:**
- `slug` is computed from `name`: lowercase, spaces replaced with hyphens, special chars removed
- Do not include the catch-all "All Products" as a category — it is not a real category

---

## MIGRATION FLAGS ARRAY

An array of flag objects identifying items that need human attention after import.

```json
[
  {
    "type": "string — flag type (see types below)",
    "severity": "string — 'warning' | 'info'",
    "product_id": "number | null — which product this applies to",
    "message": "string — human readable explanation",
    "action_required": "string — what the user should do"
  }
]
```

**Flag types:**

| Type | Severity | Trigger | Action Required |
|------|----------|---------|----------------|
| `missing_description` | warning | Product has no real description | Write product description |
| `uncategorized_product` | warning | Product not in any collection | Assign to a category |
| `image_download_failed` | warning | One or more images failed to download | Re-upload images manually |
| `no_contact_info` | info | No phone/email/WhatsApp found | Add contact details to store |
| `no_shipping_charges` | info | Shipping charge not specified | Add shipping charge |
| `images_on_cdn` | info | Images still on dm2buy CDN | Re-host images before CDN expires |

---

## SCRAPE META

```json
{
  "scrape_meta": {
    "source_url": "string — the dm2buy store URL that was scraped",
    "shoprift_version": "string — Shoprift version used e.g. '1.0.0'",
    "timestamp": "string — ISO 8601 timestamp of extraction",
    "duration_seconds": "number — total time taken for full extraction",
    "total_products_found": "number — products found on store",
    "total_products_selected": "number — products user chose to import",
    "total_categories": "number",
    "total_images_found": "number",
    "total_images_downloaded": "number",
    "total_images_failed": "number",
    "verification_method": "string — 'instagram_story' | 'dm2buy_product'",
    "confidence_scores": {
      "store_meta": "number — 0 to 100",
      "products": "number — 0 to 100",
      "categories": "number — 0 to 100"
    },
    "migration_flag_count": "number",
    "notes": "string | null — any additional observations"
  }
}
```

---

## RECON DATA SCHEMA

This is the lightweight object returned after Phase 1 (Recon).
It is shown to the user as the pre-import preview card.
It is NOT the same as the full output schema.

```json
{
  "store_name": "string",
  "store_url": "string",
  "instagram_handle": "string | null",
  "product_count": "number",
  "collection_count": "number",
  "image_count": "number",
  "estimated_import_seconds": "number",
  "estimated_import_label": "string — e.g. 'About 2 minutes'",
  "recon_timestamp": "string — ISO 8601"
}
```

`estimated_import_label` computation:
```javascript
const seconds = estimated_import_seconds;
if (seconds < 60) return `About ${seconds} seconds`;
const minutes = Math.ceil(seconds / 60);
return `About ${minutes} minute${minutes > 1 ? 's' : ''}`;
```

---

## VERIFICATION RECORD SCHEMA

Stored in Supabase `verification_attempts` table.

```json
{
  "id": "uuid",
  "account_id": "string",
  "store_url": "string",
  "instagram_handle": "string | null",
  "code": "string — the generated SHR-xxx code",
  "method": "string — 'instagram_story' | 'dm2buy_product'",
  "status": "string — 'pending' | 'verified' | 'expired' | 'failed'",
  "expires_at": "timestamp — 10 minutes from created_at",
  "verified_at": "timestamp | null",
  "created_at": "timestamp"
}
```

---

## JOB SCHEMA

Stored in Supabase `import_jobs` table.

```json
{
  "id": "uuid",
  "account_id": "string",
  "store_url": "string",
  "status": "string — 'recon' | 'verifying' | 'extracting' | 'downloading' | 'complete' | 'failed'",
  "recon_data": "jsonb — populated after Phase 1",
  "progress": {
    "current": "number",
    "total": "number",
    "phase": "string",
    "phase_label": "string — human readable e.g. 'Downloading images (12/18)'"
  },
  "error": "string | null",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

## ZOD VALIDATION SCHEMA

This is the Zod schema used in `src/validator.js`.
Copy this exactly — do not modify field names.

```javascript
import { z } from 'zod';

const VariantsSchema = z.object({
  sizes: z.array(z.string()),
  colors: z.array(z.string()),
  other: z.array(z.string())
});

const ProductSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  description: z.string().nullable(),
  needs_description: z.boolean(),
  price: z.number().positive(),
  original_price: z.number().nullable(),
  discount_percentage: z.number().nullable(),
  currency: z.literal('INR'),
  category: z.string().nullable(),
  is_uncategorized: z.boolean(),
  variants: VariantsSchema,
  stock_status: z.enum(['in_stock', 'out_of_stock', 'unknown']),
  images_cdn: z.array(z.string().url()).min(1),
  images_local: z.array(z.string()),
  images_failed: z.array(z.string()),
  product_url: z.string().url(),
  tags: z.array(z.string()),
  selected_for_import: z.boolean()
});

const CategorySchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  product_count: z.number(),
  slug: z.string()
});

const MigrationFlagSchema = z.object({
  type: z.string(),
  severity: z.enum(['warning', 'info']),
  product_id: z.number().nullable(),
  message: z.string(),
  action_required: z.string()
});

export const StoreSchema = z.object({
  store_meta: z.object({
    name: z.string().min(1),
    description: z.string().nullable(),
    instagram: z.string().nullable(),
    contact: z.object({
      phone: z.string().nullable(),
      email: z.string().nullable(),
      whatsapp: z.string().nullable(),
      support_note: z.string().nullable()
    }),
    location: z.string().nullable(),
    shipping: z.object({
      processing_time: z.string().nullable(),
      delivery_time: z.string().nullable(),
      shipping_regions: z.string().nullable(),
      minimum_order_value: z.number().nullable(),
      shipping_charges: z.number().nullable(),
      ships_within_days: z.number().nullable()
    }),
    payment_methods: z.array(z.string()),
    policies: z.object({
      cancellations_accepted: z.boolean(),
      returns_accepted: z.boolean(),
      exchanges_accepted: z.boolean(),
      damage_claim_note: z.string().nullable()
    })
  }),
  products: z.array(ProductSchema).min(1),
  categories: z.array(CategorySchema),
  migration_flags: z.array(MigrationFlagSchema),
  scrape_meta: z.object({
    source_url: z.string().url(),
    shoprift_version: z.string(),
    timestamp: z.string(),
    duration_seconds: z.number(),
    total_products_found: z.number(),
    total_products_selected: z.number(),
    total_categories: z.number(),
    total_images_found: z.number(),
    total_images_downloaded: z.number(),
    total_images_failed: z.number(),
    verification_method: z.enum(['instagram_story', 'dm2buy_product']),
    confidence_scores: z.object({
      store_meta: z.number().min(0).max(100),
      products: z.number().min(0).max(100),
      categories: z.number().min(0).max(100)
    }),
    migration_flag_count: z.number(),
    notes: z.string().nullable()
  })
});
```

---

*Cross-reference: CLAUDE.md for field usage in modules. ARCHITECTURE.md for how data flows between phases. TASKS.md for when validation runs. ERRORS.md for schema validation failures.*
