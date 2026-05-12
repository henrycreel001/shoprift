/**
 * src/validator.js — Zod schema validation.
 * Validates formatted store data against the canonical schema before writing output.
 * Fails loudly — never writes output on validation failure.
 */

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
    verification_method: z.enum(['instagram_story', 'dm2buy_product', 'skipped_v1_concierge']),
    confidence_scores: z.object({
      store_meta: z.number().min(0).max(100),
      products: z.number().min(0).max(100),
      categories: z.number().min(0).max(100)
    }),
    migration_flag_count: z.number(),
    notes: z.string().nullable()
  })
});

/**
 * Validates formatted store data against the Shoprift schema.
 * Logs each failing field with its reason.
 * Throws on failure — caller must handle and not write output.
 * @param {object} formattedData
 * @returns {object} parsed data (type-safe)
 */
export function validate(formattedData) {
  const result = StoreSchema.safeParse(formattedData);

  if (result.success) {
    console.log('✅ Schema validation passed');
    return result.data;
  }

  console.error('❌ Schema validation failed. Failing fields:');
  for (const err of result.error.errors) {
    console.error(`   Path: ${err.path.join('.')} — ${err.message}`);
  }
  console.error('');
  console.error('   Output files NOT written. Fix extraction logic before retrying.');

  throw new Error(`Schema validation failed: ${result.error.errors.length} error(s)`);
}
