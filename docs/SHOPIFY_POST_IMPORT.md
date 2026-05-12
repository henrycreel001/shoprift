# Shopify Post-Import Guide

After you import your Shoprift CSV into Shopify, four small steps complete your migration. Each takes 2-5 minutes.

## 1. Restore your collections

Your dm2buy collections are preserved as **tags** on each product. Turn them into Shopify collections:

1. In Shopify admin, go to **Products → Collections → Create collection**
2. Enter the collection title (use the exact same name as on dm2buy)
3. Under "Collection type," select **Smart** (not Manual)
4. Under "Conditions," set:
   - Product tag — is equal to — [your collection name]
5. Click **Save**

Repeat for every collection. Shopify will automatically pull every product with that tag into the collection. New products you add with that tag will also be included automatically.

## 2. Set inventory quantities

All products are imported with inventory quantity = 1. To set your real stock levels:

1. In Shopify admin, go to **Products**
2. Select all products (checkbox at top of list)
3. Click **Edit products** (this opens the bulk editor)
4. Add the column **Available** if it isn't shown
5. Edit quantities for each product/variant
6. Click **Save**

## 3. Assign variant images (if you have variant products)

All your product images are already uploaded. For products with variants (e.g., colors), link each color to its image:

1. Open a product with variants in Shopify admin
2. Scroll to the "Variants" section
3. Click a variant (e.g., "Pink")
4. Click the image dropdown → select the matching uploaded image
5. Save
6. Repeat for each variant

## 4. Add SKUs (optional)

dm2buy didn't store SKUs, so your products imported without them. Shopify auto-generates internal IDs, so this is optional. If you want human-readable SKUs:

- Use Shopify's bulk editor (same as step 2) to add SKUs manually
- Or install a free SKU generator app from the Shopify App Store

## What about product descriptions?

dm2buy didn't store product descriptions, so they're not in your import. To add descriptions:

1. Open each product in Shopify admin
2. Click in the "Description" field
3. Write or paste your description
4. Save

Or use the bulk editor to do many at once.

---

Questions? Reply to the WhatsApp thread you received your delivery on.
