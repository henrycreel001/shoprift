/**
 * GET /api/auth?shop=mystore.myshopify.com
 * Entry point for Shopify OAuth install flow.
 * Shopify redirects here when a merchant clicks "Install" in the App Store.
 * Validates the shop param then redirects to Shopify's OAuth authorization page.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getShopify } from '@/lib/shopify';

export async function GET(request: NextRequest): Promise<Response> {
  const shop = request.nextUrl.searchParams.get('shop');

  if (!shop || !shop.endsWith('.myshopify.com')) {
    return NextResponse.json(
      { error: 'Missing or invalid shop parameter. Expected: yourstore.myshopify.com' },
      { status: 400 }
    );
  }

  const shopify = getShopify();

  // Returns a redirect Response to Shopify's OAuth consent screen.
  // shopify-api handles state generation and CSRF cookie automatically.
  return shopify.auth.begin({
    shop,
    callbackPath: '/api/auth/callback',
    isOnline: false, // offline token — persists after merchant closes tab
    rawRequest: request,
  });
}
