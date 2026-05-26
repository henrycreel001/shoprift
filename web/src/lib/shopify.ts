/**
 * web/src/lib/shopify.ts — Shopify API client singleton.
 * Adapter: web-api (Fetch API) — works in Next.js App Router (Node + Edge).
 * Session storage: Supabase `shopify_sessions` table.
 */

import '@shopify/shopify-api/adapters/web-api';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import { SupabaseSessionStorage } from './shopify-session';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

// Exported so auth/callback and webhook routes can import it directly
// (shopify.config.sessionStorage is not exposed in the v13 TypeScript types)
export const sessionStorage = new SupabaseSessionStorage();

let _shopify: ReturnType<typeof shopifyApi> | null = null;

/**
 * Returns the Shopify API singleton.
 * Lazy-initialized so missing env vars fail at runtime (not build time).
 */
export function getShopify() {
  if (_shopify) return _shopify;

  _shopify = shopifyApi({
    apiKey: requireEnv('SHOPIFY_API_KEY'),
    apiSecretKey: requireEnv('SHOPIFY_API_SECRET'),
    scopes: requireEnv('SHOPIFY_SCOPES').split(',').map(s => s.trim()),
    hostName: requireEnv('SHOPIFY_APP_URL').replace(/^https?:\/\//, ''),
    apiVersion: ApiVersion.April26,
    isEmbeddedApp: true,
    sessionStorage,
  });

  return _shopify;
}
