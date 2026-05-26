/**
 * web/src/lib/dm2buy/recon.ts — Phase 1: Fast store scan.
 * Browser port of src/recon.js. Uses fetch() — dm2buy API has CORS open (*).
 * No Playwright, no Axios, no Node-only APIs.
 */

import type { ReconData } from './types';

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

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 800,
): Promise<T> {
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

function extractSubdomain(storeUrl: string): string {
  return new URL(storeUrl).hostname.split('.')[0];
}

async function fetchStoreMeta(subdomain: string): Promise<Record<string, unknown>> {
  return withRetry(async () => {
    const data = await apiFetch<{ success: boolean; data: Record<string, unknown> }>(
      `${DM2BUY_API}/v4/store/get-by-subdomain/${subdomain}`,
      { select: 'internationalPayment,proplan,legalInfo' },
    );
    if (!data.success) {
      const err = new Error(`[recon] Store not found: ${subdomain}`);
      (err as Error & { permanent: boolean }).permanent = true;
      throw err;
    }
    return data.data;
  });
}

async function fetchCollections(storeId: string): Promise<unknown[]> {
  return withRetry(async () => {
    const data = await apiFetch<{ collections?: unknown[] }>(
      `${DM2BUY_API}/v3/collection/store/${storeId}`,
    );
    return data.collections ?? [];
  });
}

async function fetchAllProducts(storeId: string): Promise<unknown[]> {
  const products: unknown[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const docs = await withRetry(async () => {
      const data = await apiFetch<{ data?: { docs?: unknown[] } }>(
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

function countImages(products: Array<{ productPhotos?: string[]; otherPhotos?: string[] }>): number {
  const urls = new Set<string>();
  for (const p of products) {
    for (const url of (p.productPhotos ?? [])) urls.add(url);
    for (const url of (p.otherPhotos ?? [])) urls.add(url);
  }
  return urls.size;
}

function estimateTime(productCount: number, imageCount: number): { seconds: number; label: string } {
  const seconds = productCount * 8 + imageCount * 2;
  if (seconds < 60) return { seconds, label: `About ${seconds} seconds` };
  const minutes = Math.ceil(seconds / 60);
  return { seconds, label: `About ${minutes} minute${minutes > 1 ? 's' : ''}` };
}

/**
 * Runs a fast recon scan against a dm2buy store URL.
 * @param storeUrl — full URL e.g. https://kiwiishop.dm2buy.com
 * @returns ReconData per SCHEMA.md
 */
export async function recon(storeUrl: string): Promise<ReconData> {
  const subdomain = extractSubdomain(storeUrl);

  const storeMeta = await fetchStoreMeta(subdomain);
  const storeId = storeMeta.id as string;
  if (!storeId) throw new Error(`[recon] API returned no id for subdomain: ${subdomain}`);

  const [products, collections] = await Promise.all([
    fetchAllProducts(storeId),
    fetchCollections(storeId),
  ]);

  const imageCount = countImages(products as Array<{ productPhotos?: string[]; otherPhotos?: string[] }>);
  const { seconds, label } = estimateTime(products.length, imageCount);

  return {
    store_name: (storeMeta.storeName as string) || 'Unknown Store',
    store_url: storeUrl,
    store_id: storeId,
    subdomain,
    instagram_handle: (storeMeta.instagramHandle as string) || null,
    product_count: products.length,
    collection_count: collections.length,
    image_count: imageCount,
    estimated_import_seconds: seconds,
    estimated_import_label: label,
    recon_timestamp: new Date().toISOString(),
  };
}
