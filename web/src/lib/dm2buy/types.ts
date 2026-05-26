/** TypeScript types for the dm2buy extraction pipeline. Matches SCHEMA.md exactly. */

export type ReconData = {
  store_name: string;
  store_url: string;
  store_id: string;
  subdomain: string;
  instagram_handle: string | null;
  product_count: number;
  collection_count: number;
  image_count: number;
  estimated_import_seconds: number;
  estimated_import_label: string;
  recon_timestamp: string;
};

export type ContactInfo = {
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  support_note: string | null;
};

export type ShippingInfo = {
  processing_time: string | null;
  delivery_time: string | null;
  shipping_regions: string;
  minimum_order_value: number | null;
  shipping_charges: number | null;
  ships_within_days: number | null;
};

export type Policies = {
  cancellations_accepted: boolean;
  returns_accepted: boolean;
  exchanges_accepted: boolean;
  damage_claim_note: string | null;
};

export type StoreMeta = {
  name: string;
  description: string | null;
  instagram: string | null;
  contact: ContactInfo;
  location: string | null;
  shipping: ShippingInfo;
  payment_methods: string[];
  policies: Policies;
};

export type ProductVariants = {
  sizes: string[];
  colors: string[];
  other: string[];
};

export type Product = {
  id: number;
  name: string;
  description: string | null;
  needs_description: boolean;
  price: number;
  original_price: number | null;
  discount_percentage: number | null;
  currency: 'INR';
  category: string | null;
  all_categories: string[];
  is_uncategorized: boolean;
  variants: ProductVariants;
  stock_status: 'in_stock' | 'out_of_stock' | 'unknown';
  images_cdn: string[];
  images_local: string[];
  images_failed: string[];
  product_url: string;
  tags: string[];
  selected_for_import: boolean;
};

export type Category = {
  name: string;
  url: string;
  product_count: number;
  slug: string;
};

export type StoreData = {
  store_meta: StoreMeta;
  products: Product[];
  categories: Category[];
};

export type ProgressEvent = {
  phase: 'recon' | 'extraction';
  current: number;
  total: number;
  message: string;
};

export type ProgressCallback = (event: ProgressEvent) => void;
