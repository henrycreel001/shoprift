/**
 * GET /api/auth/callback
 * Shopify redirects here after merchant approves the OAuth consent screen.
 * Validates HMAC, exchanges code for access token, stores session, redirects to embedded app.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getShopify, sessionStorage } from '@/lib/shopify';

export async function GET(request: NextRequest): Promise<Response> {
  const shopify = getShopify();

  let session;
  try {
    const callbackResult = await shopify.auth.callback({ rawRequest: request });
    session = callbackResult.session;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[auth/callback] OAuth callback failed:', message);
    return NextResponse.json(
      { error: 'OAuth failed', message },
      { status: 500 }
    );
  }

  // Persist session to Supabase
  const stored = await sessionStorage.storeSession(session);
  if (!stored) {
    console.error('[auth/callback] Failed to store session for shop:', session.shop);
    return NextResponse.json({ error: 'Session storage failed' }, { status: 500 });
  }

  // Redirect to the embedded app inside Shopify Admin
  const apiKey = process.env.SHOPIFY_API_KEY!;
  return NextResponse.redirect(`https://${session.shop}/admin/apps/${apiKey}`);
}
