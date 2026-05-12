/**
 * presets/shopify/emitter.js — Converts Shoprift store data to Shopify Product Import CSV.
 * Reads column definitions from preset.json. Uses papaparse for serialization.
 * Implements the row strategy from SHOPIFY.md: max(variants, images) rows per product.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { slugify } from '../../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const preset = JSON.parse(fs.readFileSync(path.join(__dirname, 'preset.json'), 'utf8'));
const COLUMNS = preset.columns.map(c => c.name);

/** Builds the Tags cell value: category first, then product tags, comma-separated. */
function buildTags(product) {
  const parts = [];
  if (!product.is_uncategorized && product.category) {
    parts.push(product.category);
  }
  if (Array.isArray(product.tags) && product.tags.length > 0) {
    parts.push(...product.tags);
  }
  return parts.join(', ');
}

/** Determines Option1 Name based on variant types present. */
function getOption1Name(colors, sizes) {
  if (colors.length > 0) return 'Color';
  if (sizes.length > 0) return 'Size';
  return 'Title';
}

/** Returns a blank row object with all 51 columns initialized to empty string. */
function blankRow() {
  const row = {};
  for (const col of COLUMNS) row[col] = '';
  return row;
}

/**
 * Emits the anchor row (row 1) for a product.
 * Populates all product-level fields + first variant + first image.
 */
function emitAnchorRow(product, image, imagePosition, firstVariant, vendorName) {
  const colors = product.variants?.colors ?? [];
  const sizes = product.variants?.sizes ?? [];
  const option1Name = getOption1Name(colors, sizes);

  let option1Value = 'Default Title';
  if (colors.length > 0) option1Value = firstVariant?.color ?? colors[0] ?? '';
  else if (sizes.length > 0) option1Value = firstVariant?.size ?? sizes[0] ?? '';

  const row = blankRow();
  row['Handle']                   = slugify(product.name);
  row['Title']                    = product.name ?? '';
  row['Vendor']                   = vendorName ?? '';
  row['Type']                     = (!product.is_uncategorized && product.category) ? product.category : '';
  row['Tags']                     = buildTags(product);
  row['Published']                = 'TRUE';
  row['Option1 Name']             = option1Name;
  row['Option1 Value']            = option1Value;
  row['Variant Grams']            = 0;
  row['Variant Inventory Tracker']= 'shopify';
  row['Variant Inventory Qty']    = 1;
  row['Variant Inventory Policy'] = 'deny';
  row['Variant Fulfillment Service'] = 'manual';
  row['Variant Price']            = product.price ?? '';
  row['Variant Compare At Price'] = product.original_price ?? '';
  row['Variant Requires Shipping']= 'TRUE';
  row['Variant Taxable']          = 'TRUE';
  if (image) {
    row['Image Src']      = image;
    row['Image Position'] = imagePosition;
  }
  row['Image Alt Text'] = product.name ?? '';
  row['Gift Card']      = 'FALSE';
  row['Status']         = 'active';
  return row;
}

/**
 * Emits a variant row (rows 2..V).
 * Populates Handle, variant option value, inventory statics, price, and image if available.
 */
function emitVariantRow(product, image, imagePosition, variant) {
  const colors = product.variants?.colors ?? [];
  const sizes = product.variants?.sizes ?? [];
  const hasColors = colors.length > 0;
  const hasSizes = sizes.length > 0;

  const row = blankRow();
  row['Handle'] = slugify(product.name);

  if (hasColors && hasSizes) {
    row['Option1 Value'] = variant?.color ?? '';
    row['Option2 Value'] = variant?.size ?? '';
  } else if (hasColors) {
    row['Option1 Value'] = variant?.color ?? '';
  } else if (hasSizes) {
    row['Option1 Value'] = variant?.size ?? '';
  }

  row['Variant Grams']            = 0;
  row['Variant Inventory Tracker']= 'shopify';
  row['Variant Inventory Qty']    = 1;
  row['Variant Inventory Policy'] = 'deny';
  row['Variant Fulfillment Service'] = 'manual';
  row['Variant Price']            = product.price ?? '';
  row['Variant Compare At Price'] = product.original_price ?? '';
  row['Variant Requires Shipping']= 'TRUE';
  row['Variant Taxable']          = 'TRUE';
  if (image) {
    row['Image Src']      = image;
    row['Image Position'] = imagePosition;
  }
  return row;
}

/**
 * Emits an image-only row (rows V+1..max).
 * Populates only Handle, Image Src, Image Position.
 */
function emitImageOnlyRow(product, image, imagePosition) {
  const row = blankRow();
  row['Handle']         = slugify(product.name);
  row['Image Src']      = image;
  row['Image Position'] = imagePosition;
  return row;
}

/**
 * Converts Shoprift store data to a Shopify Product Import CSV string.
 * @param {object} storeData — validated store data (from store_data.json)
 * @returns {string} CSV content including header row
 */
export function emitShopifyCsv(storeData) {
  const vendorName = storeData.store_meta?.name ?? '';
  const rows = [];

  for (const product of storeData.products) {
    const colors = product.variants?.colors ?? [];
    const sizes = product.variants?.sizes ?? [];
    const images = product.images_cdn?.length ? product.images_cdn : [];

    // Build ordered variants list (cartesian of colors × sizes, or single default)
    let variants = [];
    if (colors.length > 0 && sizes.length > 0) {
      for (const color of colors) {
        for (const size of sizes) variants.push({ color, size });
      }
    } else if (colors.length > 0) {
      variants = colors.map(c => ({ color: c, size: null }));
    } else if (sizes.length > 0) {
      variants = sizes.map(s => ({ color: null, size: s }));
    } else {
      variants = [{ color: null, size: null }];
    }

    const totalRows = Math.max(variants.length, images.length, 1);

    for (let i = 0; i < totalRows; i++) {
      const image = images[i] ?? null;
      const imagePosition = image ? i + 1 : null;

      if (i === 0) {
        rows.push(emitAnchorRow(product, image, imagePosition, variants[0], vendorName));
      } else if (i < variants.length) {
        rows.push(emitVariantRow(product, image, imagePosition, variants[i]));
      } else {
        rows.push(emitImageOnlyRow(product, images[i], i + 1));
      }
    }
  }

  return Papa.unparse(rows, { header: true, newline: '\n' });
}
