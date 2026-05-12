# Shopify Platform Knowledge

> READ THIS BEFORE GENERATING OR MODIFYING ANY SHOPIFY IMPORT CSV.
> READ THIS BEFORE DIAGNOSING ANY SHOPIFY-RELATED BUG.
> UPDATE THIS FILE WHENEVER YOU LEARN SOMETHING NEW FROM REAL-WORLD TESTING.

## STATUS

- **Last verified:** 2026-05-12
- **Verification method:** Manual import of kiwiishop fixture into demo Shopify store (https://2y5ynn-cd.myshopify.com)
- **Verification result:** ✅ All 4 products, 7 variants, 18 images, 2 collections migrated successfully
- **Known issues:** None
- **Spec changes by Shopify since last verified:** None observed

## QUICK FACTS

- CSV format: 51 columns, exact order matters
- Row strategy: max(variants, images) rows per product
- Tags column = collection mapping (via Smart Collections)
- Inventory default: 1 (seller updates via bulk edit)
- Required statics on variant rows: Status=active (anchor only), Published=TRUE (anchor only), Variant Inventory Policy=deny, Variant Fulfillment Service=manual

## VERIFIED FIXTURES

| Fixture | Source store | Products | Variants | Images | Verified date | Notes |
|---|---|---|---|---|---|---|
| `fixtures/kiwiishop.expected.csv` | kiwiishop.dm2buy.com | 4 | 7 | 18 | 2026-05-12 | Imported into demo Shopify, all assertions pass |

## THE FIVE THINGS THAT BROKE LAST TIME

1. **Used display names instead of import names.** The Shopify admin UI shows columns like "URL handle," "Description," "Price." The CSV import requires "Handle," "Body (HTML)," "Variant Price." Display names ≠ import names. Shopify silently drops rows with unrecognized columns.

2. **Crammed all variants into one cell.** Wrote "Pink,Purple,Blue,Mint,Black" into a single Option1 Value cell. Shopify treated it as one product with one variant literally named "Pink,Purple,Blue,Mint,Black." Variants must be one per row.

3. **Crammed all images into one cell.** Same problem. Shopify expects one image URL per Image Src cell, with multiple rows per product to attach multiple images.

4. **Left Status, Variant Inventory Policy, and Variant Fulfillment Service blank.** Shopify rejected the rows during import preview with errors about these missing fields. Always populate them per the field reference below.

5. **Set inventory qty to 10.** Seller had to bulk-edit anyway because the default was wrong for their actual stock. Default to 1 to make the "you need to update inventory" instruction obvious without making products unavailable for testing.

## FIELD-BY-FIELD REFERENCE

| Column | Required? | Value | Notes |
|---|---|---|---|
| Handle | Yes | URL-safe slug of product name | Lowercase, hyphens, no special chars |
| Title | Anchor row only | Product name as displayed | Variant/image rows leave blank |
| Body (HTML) | Anchor row only | HTML description | dm2buy has no descriptions; leave blank |
| Vendor | Anchor row only | Store name | From `store_meta.name` |
| Product Category | Anchor row only | Google taxonomy | Leave blank for now; sellers configure later |
| Type | Anchor row only | Product type | Use `product.category` if categorized; blank if uncategorized |
| Tags | Anchor row only | Collection name + product tags, comma-separated | See TAG CONVENTION below |
| Published | Anchor row only | TRUE | Always TRUE for migrated products |
| Option1 Name | Anchor row only | Color, Size, or Title | Title used when no variants exist |
| Option1 Value | Per variant row | Variant value | "Default Title" for products without variants |
| Option2/3 Name+Value | As needed | For multi-axis variants | Only used if product has both colors AND sizes |
| Variant SKU | All product+variant rows | (blank) | Shopify auto-generates; dm2buy has no SKUs |
| Variant Grams | All product+variant rows | 0 | Shopify accepts 0 |
| Variant Inventory Tracker | All product+variant rows | shopify | Enables Shopify-side inventory tracking |
| Variant Inventory Qty | All product+variant rows | 1 | Placeholder; seller updates via bulk edit |
| Variant Inventory Policy | All product+variant rows | deny | Prevents overselling |
| Variant Fulfillment Service | All product+variant rows | manual | Seller fulfills, not 3PL |
| Variant Price | All product+variant rows | Bare number (e.g., `120`) | No currency symbol, no commas |
| Variant Compare At Price | All product+variant rows | Bare number or blank | Used for sale pricing |
| Variant Requires Shipping | All product+variant rows | TRUE | Physical products |
| Variant Taxable | All product+variant rows | TRUE | Seller configures tax rates in Shopify |
| Variant Barcode | All product+variant rows | (blank) | dm2buy has no barcodes |
| Image Src | Each row that has an image | Full HTTPS URL | Shopify pulls from this URL into its own CDN |
| Image Position | Each row that has an image | Sequential number starting at 1 per product | Determines display order |
| Image Alt Text | Anchor row only | Product title | Accessibility |
| Gift Card | Anchor row only | FALSE | Not gift cards |
| SEO Title/Description | Anchor row only | (blank) | Seller configures later |
| All Google Shopping / * | All rows | (blank) | Seller configures later if using Google Shopping |
| Variant Image | All rows | (blank) | Sellers assign per-variant images in Shopify UI after import |
| Variant Weight Unit | All rows | (blank) | dm2buy has no weight data |
| Variant Tax Code | All rows | (blank) | Seller configures |
| Cost per item | All rows | (blank) | Seller configures |
| All Included / * and Price / * (Markets) | All rows | (blank) | Seller configures Markets feature |
| Status | Anchor row only | active | CRITICAL: NOT draft, NOT inactive |

## ROW EMISSION RULES

For each product:

```
total_rows = max(variant_count, image_count)
where variant_count = max(1, number_of_color_or_size_variants)
```

Three row types per product:

**Anchor row (row 1):** All product-level fields populated (Title, Body, Vendor, Tags, Published, Option1 Name, Status, Gift Card, Image Alt Text). Variant fields populated (prices, inventory, etc.). First image attached.

**Variant rows (rows 2..V if variants exist):** Product-level fields blank. Variant fields populated with this variant's values. One image per row attached (if available).

**Image-only rows (rows V+1..max if image_count > variant_count):** Everything blank except Handle, Image Src, Image Position.

## TAG → COLLECTION CONVENTION

This is how dm2buy collections survive the migration.

- `product.category` (collection name) is written to the `Tags` column on the anchor row
- If `product.tags` array has additional tags, append comma-separated after the category
- If `product.is_uncategorized` is true OR `product.category` is null/empty → leave Tags blank

Format examples:
- category=`Hair Accessories`, tags=`["sale"]` → `Tags` = `"Hair Accessories, sale"`
- category=`Crochet`, tags=`[]` → `Tags` = `"Crochet"`
- category=null, tags=`["bestseller"]` → `Tags` = `"bestseller"`
- category=null, tags=`[]` → `Tags` = `""` (blank)

Sellers then create Shopify Smart Collections with the condition "Product tag is equal to [collection name]" — the products auto-populate.

This convention is critical to migration completeness. Do not change it without updating both the emitter and the seller-facing documentation.

## KNOWN UNSUPPORTED FIELDS

These are fields dm2buy doesn't have. We leave them blank rather than fabricating data:

- **SKU** — Shopify auto-generates internal product IDs. Sellers can add real SKUs via Shopify apps (free options available) if needed.
- **Description (Body HTML)** — dm2buy has no description field. Sellers add post-import via Shopify admin (single product edit or bulk editor).
- **Variant Image** — Image-to-variant assignment happens in Shopify UI after import (all images upload via Image Src column on rows; seller assigns them to colors after).
- **Barcode, Weight, Tax Code, Cost per item** — Not in dm2buy. Seller configures if needed.
- **Google Shopping fields** — Seller configures if using Google Shopping integration.

## SILENT FAILURES — IMPORT SUCCEEDS BUT PRODUCT IS WRONG

These are the dangerous ones. Shopify accepts the import without errors, but the result is broken. Document new ones here every time you discover them.

| Symptom | Cause | Fix |
|---|---|---|
| Product imports but doesn't appear on storefront | `Status=draft` instead of `active` | Always set `Status=active` for migrated products |
| All variants merge into one variant named "Red,Blue,Green" | Same Option1 Value across rows, or comma-joined into one cell | Each variant row needs unique Option1 Value, one per row |
| Images don't appear | Image Src is HTTP instead of HTTPS, OR URL is not publicly accessible | Use HTTPS URLs. Azure CDN (dm2buy's CDN) works. Auth-protected URLs do not. |
| Price shows as 0 or "free" | Variant Price contains currency symbol (e.g., "₹120" or "Rs. 120") | Bare numbers only |
| Product appears but no "Add to cart" button | Variant Inventory Qty is 0 AND Variant Inventory Policy is `deny` | Set Qty to at least 1, or set Policy to `continue` (allow overselling) |
| Variants exist but all have same price | Variant Price only set on anchor row, blank on variant rows | Set Variant Price on every variant row, even if identical |

## COMPATIBILITY NOTES — SHOPIFY QUIRKS

- Shopify trims leading/trailing whitespace from cells. Don't rely on whitespace for layout.
- Shopify accepts up to 100 variants per product. Most dm2buy products are well under this.
- Image URLs must be publicly accessible from Shopify's servers. dm2buy Azure CDN works. Self-hosted or auth-protected images do not.
- Shopify retries failed image downloads for up to 24 hours after import. If an image is still missing after that, it's permanently failed and the seller must re-upload manually.
- Shopify supports up to 3 option axes per product (Option1, Option2, Option3). Each can have up to 100 values. Total variant combinations capped at 100.
- Shopify CSV import does NOT create collections. Collections must be created separately (manually or via API). This is why we use the tag → Smart Collection convention.
- Shopify accepts both `TRUE`/`FALSE` and `true`/`false` for boolean columns. We use uppercase for consistency with their official documentation.

## DECISION LOG

Decisions made about Shopify-specific behavior. Explains *why* current choices are what they are.

**2026-05-12 — Default Variant Inventory Qty = 1**
Considered 0 and 10. Chose 1 because: 0 makes the product unavailable for purchase (hiding the "you need to set inventory" problem from the seller). 10 looks intentional — the seller may not realize they need to update it. 1 is small enough to feel like a placeholder and triggers the "update this!" instinct. Documented in seller-facing post-import guide.

**2026-05-12 — Tags column carries collection name first, then product tags**
When seller creates Smart Collection by tag match, exact-equals matching is most reliable. Putting collection name first makes it the prominent identifier in Shopify admin. Order matters for human readability.

**2026-05-12 — Leave Variant SKU blank**
Shopify auto-generates internal IDs. dm2buy didn't have SKUs. Forcing fake SKUs (e.g., generated UUIDs) would create import noise the seller has to clean up. Better to leave blank. Seller adds real SKUs later via Shopify apps if needed.

**2026-05-12 — Use HTTPS URLs from Azure CDN directly (no re-hosting)**
Shopify pulls images from URLs in the CSV into its own CDN. Re-hosting images before import is unnecessary work and slows the migration. Direct CDN URLs work and Shopify takes over hosting after ingestion.

## PLATFORM CHANGELOG

When Shopify changes their import spec, add an entry here. When you re-verify fixtures after a spec change, update the STATUS section at the top.

- (none observed yet)

## UPDATE PROTOCOL

**Read this file before any Shopify-related work.** No exceptions.

**Update this file after any Shopify-related work.** Specifically:

- If you discovered a new silent failure → add to the silent failures table
- If you made a non-obvious decision → add to the decision log
- If Shopify changed their spec → add to platform changelog + update status
- If you re-verified the fixture → update "Last verified" date
- If nothing new was learned → state this explicitly in your commit message: `docs(shopify): no new platform knowledge (verified existing behavior holds)`

**The worst version of this file is a stale one.** A confidently-misleading knowledge file is worse than no knowledge file. Treat updates as non-optional.
