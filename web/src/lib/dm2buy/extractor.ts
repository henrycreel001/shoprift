/**
 * web/src/lib/dm2buy/extractor.ts — Full store extraction via dm2buy API.
 * Browser port of src/extractor.js. Uses fetch() — dm2buy CORS is open (*).
 * No Playwright, no Axios, no random delays (seller's browser, own IP).
 * DOM fallback removed — Playwright-only, not applicable in browser context.
 */

import type { Product, ProductVariants, StoreMeta, Category, StoreData, ProgressCallback } from './types';

const DM2BUY_API = 'https://api.dm2buy.com';

async function apiFetch<T>(url: string, params?: Record<string, string>): Promise<T> {
  const fullUrl = params ? `${url}?${new URLSearchParams(params)}` : url;
  const res = await fetch(fullUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`dm2buy API error: ${res.status} ${res.statusText} — ${fullUrl}`);
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      (err as Error & { permanent: boolean }).permanent = true;
    }
    throw err;
  }
  return res.json() as Promise<T>;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 800): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts || (err as { permanent?: boolean }).permanent) throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * i));
    }
  }
  throw new Error('withRetry: exhausted');
}

const BOILERPLATE_PATTERNS = [
  /shipping/i, /delivery/i, /dispatch/i, /return policy/i,
  /exchange/i, /dm (us|for)/i, /whatsapp/i, /for (more )?details/i,
  /cod available/i, /cash on delivery/i, /prepaid/i,
];

function isBoilerplate(description: string | null): boolean {
  if (!description || description.trim().length < 10) return true;
  const matchCount = BOILERPLATE_PATTERNS.filter(p => p.test(description)).length;
  return matchCount >= 3 && description.trim().length < 200;
}

const SIZE_PATTERN = /^(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|free size|\d+\s*(ml|cm|mm|g|kg|oz|inch|in))$/i;
const COLOR_KEYWORDS = [
  'pink', 'purple', 'blue', 'red', 'green', 'yellow', 'black', 'white', 'mint',
  'orange', 'grey', 'gray', 'brown', 'beige', 'cream', 'navy', 'teal', 'gold',
  'silver', 'rose', 'lavender', 'coral', 'nude', 'maroon', 'olive', 'peach',
  'multicolor', 'multi',
];

function classifyVariants(variantOptions: Array<{ isActive?: boolean; name?: string }>): ProductVariants {
  const sizes: string[] = [];
  const colors: string[] = [];
  const other: string[] = [];

  for (const v of variantOptions) {
    if (!v.isActive) continue;
    const name = v.name?.trim() ?? '';
    if (SIZE_PATTERN.test(name)) {
      sizes.push(name);
    } else if (COLOR_KEYWORDS.some(c => name.toLowerCase().includes(c))) {
      colors.push(name);
    } else {
      other.push(name);
    }
  }

  return { sizes, colors, other };
}

function computeDiscount(price: number, originalPrice: number | null): number | null {
  if (!originalPrice || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 100);
}

function computeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

type ApiProduct = {
  id: string;
  name?: string;
  price: number;
  mrp?: number | null;
  productPhotos?: string[];
  otherPhotos?: string[];
  collectionV2?: Array<{ name: string }>;
  variantOptions?: Array<{ isActive?: boolean; name?: string }>;
  availableStock?: number;
};

type ApiDetailData = {
  name?: string;
  description?: string;
};

function mapProduct(
  apiProduct: ApiProduct,
  detailData: ApiDetailData,
  id: number,
  subdomain: string,
): Product {
  const name = apiProduct.name ?? detailData.name ?? 'Untitled Product';
  const description = detailData.description ?? null;
  const images = [...new Set([
    ...(apiProduct.productPhotos ?? []),
    ...(apiProduct.otherPhotos ?? []),
  ])];
  const category = apiProduct.collectionV2?.[0]?.name ?? null;
  const all_categories = (apiProduct.collectionV2 ?? []).map(c => c.name);
  const variants = classifyVariants(apiProduct.variantOptions ?? []);
  const stock = apiProduct.availableStock;

  return {
    id,
    name,
    description,
    needs_description: isBoilerplate(description),
    price: apiProduct.price,
    original_price: apiProduct.mrp ?? null,
    discount_percentage: computeDiscount(apiProduct.price, apiProduct.mrp ?? null),
    currency: 'INR',
    category,
    all_categories,
    is_uncategorized: !category,
    variants,
    stock_status: stock !== undefined && stock > 0 ? 'in_stock' : stock === 0 ? 'out_of_stock' : 'unknown',
    images_cdn: images,
    images_local: [],
    images_failed: [],
    product_url: `https://${subdomain}.dm2buy.com/product/${apiProduct.id}`,
    tags: [],
    selected_for_import: true,
  };
}

function extractStoreMeta(storeData: Record<string, unknown>): StoreMeta {
  const prefs = storeData.storePrefs as Record<string, unknown> | undefined;
  const homePage = storeData.homePage as Record<string, unknown> | undefined;
  return {
    name: (storeData.storeName as string) ?? 'Unknown Store',
    description: (homePage?.heroDescription as string) ?? null,
    instagram: (storeData.instagramHandle as string) ?? null,
    contact: {
      phone: (storeData.phone as string) ?? (storeData.supportPhone as string) ?? null,
      email: (storeData.supportEmail as string) ?? null,
      whatsapp: (storeData.phone as string) ?? null,
      support_note: null,
    },
    location: (storeData.locationString as string) ?? null,
    shipping: {
      processing_time: storeData.dispatchTime
        ? `Within ${storeData.dispatchTime} working days`
        : null,
      delivery_time: null,
      shipping_regions: 'India',
      minimum_order_value: (storeData.minOrderValue as number) ?? null,
      shipping_charges: (storeData.shippingCharge as number) ?? null,
      ships_within_days: storeData.dispatchTime
        ? parseInt(storeData.dispatchTime as string, 10)
        : null,
    },
    payment_methods: (prefs?.allowedPaymentMethods as string[]) ?? [],
    policies: {
      cancellations_accepted: false,
      returns_accepted: false,
      exchanges_accepted: false,
      damage_claim_note: null,
    },
  };
}

async function fetchStoreMeta(subdomain: string): Promise<Record<string, unknown>> {
  return withRetry(async () => {
    const data = await apiFetch<{ success: boolean; data: Record<string, unknown> }>(
      `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
      { select: 'internationalPayment,proplan,legalInfo' },
    );
    if (!data.success) {
      const err = new Error(`[extractor] Store not found: ${subdomain}`);
      (err as Error & { permanent: boolean }).permanent = true;
      throw err;
    }
    return data.data;
  });
}

async function fetchCollections(storeId: string): Promise<Array<{ name: string }>> {
  return withRetry(async () => {
    const data = await apiFetch<{ collections?: Array<{ name: string }> }>(
      `${DM2BUY_API}/v3/collection/store/${storeId}`,
    );
    return data.collections ?? [];
  });
}

async function fetchAllProducts(storeId: string): Promise<ApiProduct[]> {
  const products: ApiProduct[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const docs = await withRetry(async () => {
      const data = await apiFetch<{ data?: { docs?: ApiProduct[] } }>(
        `${DM2BUY_API}/v3/product/store/${storeId}/collectionv2`,
        { page: String(page), limit: String(limit), source: 'web' },
      );
      return data.data?.docs ?? [];
    });

    products.push(...docs);
    if (docs.length < limit) break;
    page++;
  }

  return products;
}

async function fetchProductDetail(productId: string): Promise<ApiDetailData> {
  return withRetry(async () => {
    const data = await apiFetch<{ data?: ApiDetailData }>(
      `${DM2BUY_API}/v3/product/${productId}`,
    );
    return data.data ?? {};
  });
}

/**
 * Extracts all products and store data from a dm2buy store.
 * @param storeUrl — full URL e.g. https://kiwiishop.dm2buy.com
 * @param storeId — from recon() result
 * @param onProgress — optional callback fired after each product
 * @returns StoreData per SCHEMA.md
 */
export async function extract(
  storeUrl: string,
  storeId: string,
  onProgress?: ProgressCallback,
): Promise<StoreData> {
  const subdomain = new URL(storeUrl).hostname.split('.')[0];

  const [storeData, listProducts, collections] = await Promise.all([
    fetchStoreMeta(subdomain),
    fetchAllProducts(storeId),
    fetchCollections(storeId),
  ]);

  const store_meta = extractStoreMeta(storeData);
  const total = listProducts.length;
  const products: Product[] = [];

  for (let i = 0; i < listProducts.length; i++) {
    const apiProduct = listProducts[i];
    const current = i + 1;

    onProgress?.({ phase: 'extraction', current, total, message: `Extracting product ${current} of ${total}` });

    let detailData: ApiDetailData = {};
    try {
      detailData = await fetchProductDetail(apiProduct.id);
    } catch {
      // detail fetch failed — use listing data only
    }

    products.push(mapProduct(apiProduct, detailData, current, subdomain));
  }

  const categories: Category[] = collections.map(col => ({
    name: col.name,
    url: `https://${subdomain}.dm2buy.com/?collection=${encodeURIComponent(col.name)}`,
    product_count: products.filter(p => p.all_categories.includes(col.name)).length,
    slug: computeSlug(col.name),
  }));

  return { store_meta, products, categories };
}
