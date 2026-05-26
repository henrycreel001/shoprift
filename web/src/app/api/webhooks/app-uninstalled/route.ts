/**
 * POST /api/webhooks/app-uninstalled
 * Shopify calls this when a merchant uninstalls the app.
 * Validates the HMAC signature then deletes all sessions for that shop.
 *
 * Register this URL in Partner dashboard:
 *   App setup → Webhooks → app/uninstalled → https://yourapp.com/api/webhooks/app-uninstalled
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getShopify, sessionStorage } from '@/lib/shopify';

export async function POST(request: NextRequest): Promise<Response> {
  const shopify = getShopify();

  // Read raw body before any parsing — required for HMAC validation
  const rawBody = await request.text();

  let result;
  try {
    result = await shopify.webhooks.validate({ rawBody, rawRequest: request });
  } catch (err) {
    console.error('[webhooks/app-uninstalled] Validation error:', err);
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 });
  }

  if (!result.valid) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  // result.domain is only present when result.valid === true (discriminated union)
  const domain = result.domain;

  // Delete all sessions for the uninstalled shop
  const sessions = await sessionStorage.findSessionsByShop(domain);
  if (sessions.length > 0) {
    await sessionStorage.deleteSessions(sessions.map(s => s.id));
    console.log(`[webhooks/app-uninstalled] Deleted ${sessions.length} session(s) for ${domain}`);
  }

  return NextResponse.json({ ok: true });
}
