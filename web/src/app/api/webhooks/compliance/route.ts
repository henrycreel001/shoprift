export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getShopify, sessionStorage } from '@/lib/shopify';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function POST(request: NextRequest): Promise<Response> {
  const shopify = getShopify();
  const rawBody = await request.text();
  const webhookId = request.headers.get('x-shopify-webhook-id') ?? '';

  // Deduplication — Shopify may retry the same webhook
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
    console.error('[webhooks/compliance] Validation error:', err);
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 });
  }

  if (!result.valid) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  if (webhookId) {
    await supabase.from('webhook_idempotency').insert({ webhook_id: webhookId }).select().maybeSingle();
  }

  const topic = request.headers.get('x-shopify-topic') ?? '';
  const shop = result.domain;

  if (topic === 'customers/data_request' || topic === 'customers/redact') {
    // Shoprift stores no customer order data — no-op response is compliant
    return NextResponse.json({ ok: true });
  }

  if (topic === 'shop/redact') {
    // Merchant uninstalled and 48h passed — delete all shop data
    await Promise.all([
      supabase.from('shopify_sessions').delete().eq('shop', shop),
      supabase.from('import_jobs').delete().eq('account_id', shop),
      supabase.from('verification_attempts').delete().eq('account_id', shop),
    ]);
    const sessions = await sessionStorage.findSessionsByShop(shop);
    if (sessions.length > 0) {
      await sessionStorage.deleteSessions(sessions.map(s => s.id));
    }
    console.log(`[webhooks/compliance] shop/redact: deleted all data for ${shop}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
