/**
 * POST /api/webhooks/app-uninstalled
 * Shopify calls this when a merchant uninstalls the app.
 * Validates the HMAC signature then deletes all sessions for that shop.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getShopify, sessionStorage } from '@/lib/shopify';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function POST(request: NextRequest): Promise<Response> {
  const shopify = getShopify();

  // Read raw body before any parsing — required for HMAC validation
  const rawBody = await request.text();
  const webhookId = request.headers.get('x-shopify-webhook-id') ?? '';

  // Deduplication
  const supabase = createServerSupabaseClient();
  if (webhookId) {
    const { data: existing } = await supabase
      .from('webhook_idempotency')
      .select('webhook_id')
      .eq('webhook_id', webhookId)
      .maybeSingle();
    if (existing) return NextResponse.json({ ok: true });
  }

  let result;
  try {
    result = await shopify.webhooks.validate({ rawBody, rawRequest: request });
  } catch (err) {
    console.error({ phase: 'webhooks/app-uninstalled', error: 'validate() threw', detail: err instanceof Error ? err.message : err });
    return NextResponse.json({ ok: true });
  }

  if (!result.valid) {
    console.error({ phase: 'webhooks/app-uninstalled', error: 'invalid_signature' });
    return NextResponse.json({ ok: true });
  }

  if (webhookId) {
    const { error: insertError } = await supabase
      .from('webhook_idempotency')
      .insert({ webhook_id: webhookId });
    if (insertError && insertError.code === '23505') {
      return NextResponse.json({ ok: true });
    }
  }

  const domain = result.domain;

  const sessions = await sessionStorage.findSessionsByShop(domain);
  if (sessions.length > 0) {
    await sessionStorage.deleteSessions(sessions.map(s => s.id));
    console.error({ phase: 'webhooks/app-uninstalled', shop: domain, sessionsDeleted: sessions.length });
  }

  return NextResponse.json({ ok: true });
}
