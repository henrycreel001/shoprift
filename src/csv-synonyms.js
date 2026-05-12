/**
 * src/csv-synonyms.js — Synonym dictionary for fuzzy column matching.
 * Maps Shoprift field names to common header variants across e-commerce platforms.
 * Add new variants freely — matchHeaders() handles any size dictionary.
 */

export const SYNONYMS = {
  "name": [
    "title", "product name", "product title", "name", "item name", "item title",
    "product", "listing title"
  ],
  "description": [
    "description", "body", "body (html)", "product description", "details",
    "long description", "summary", "content"
  ],
  "price": [
    "price", "variant price", "selling price", "sale price", "current price",
    "price (inr)", "amount", "cost", "retail price",
    "price usd", "price gbp", "price eur", "price aud", "price cad"
  ],
  "original_price": [
    "original price", "compare at price", "variant compare at price", "mrp",
    "msrp", "list price", "regular price", "was price", "strikethrough price"
  ],
  "discount_percentage": [
    "discount", "discount %", "discount percent", "off %", "savings %"
  ],
  "category": [
    "category", "type", "product type", "collection", "department", "group",
    "product category"
  ],
  "tags": [
    "tags", "labels", "keywords", "meta tags"
  ],
  "variants.colors": [
    "color", "colour", "variant color", "option1 value", "color variant",
    "available colors", "colours"
  ],
  "variants.sizes": [
    "size", "variant size", "option2 value", "size variant", "available sizes"
  ],
  "stock_status": [
    "stock", "stock status", "availability", "in stock", "inventory status"
  ],
  "images_cdn": [
    "image", "images", "image url", "image src", "photo", "photos",
    "product image", "image urls", "picture", "pictures",
    "photo url", "photo urls",
    "main image", "primary image", "default image", "featured image"
  ],
  "images_local": [
    "local image", "local images", "local image paths", "local photo",
    "downloaded image", "offline image"
  ],
  "product_url": [
    "source url", "product url", "original url", "link", "source link",
    "permalink", "source"
  ],
  "store_name": [
    "vendor", "store", "brand", "seller", "shop name", "merchant"
  ],
  "sku": [
    "sku", "product code", "vendor code", "item code", "stock code",
    "barcode", "variant sku"
  ],
  "weight": [
    "weight", "weight (g)", "weight (kg)", "product weight",
    "shipping weight", "item weight"
  ]
};

export const HIGH_CONFIDENCE_THRESHOLD = 0.85;
export const MEDIUM_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Fields that exist in the synonym dictionary for matching purposes
 * but have no corresponding data in Shoprift's extraction schema.
 * Columns mapped to these fields will be left blank in CSV output
 * and flagged in the migration report.
 */
export const NO_SOURCE_DATA_FIELDS = new Set(['sku', 'weight']);
