/**
 * POST /api/webhooks/billing-update
 * Shopify sends APP_PURCHASES_ONE_TIME_UPDATE when charge status changes.
 * Handles CANCELLED/DECLINED states that bypass the billing callback
 * (e.g. merchant declines directly in Shopify admin, or charge expires).
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getShopify } from '@/lib/shopify';
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
    if (existing) {
      return NextResponse.json({ ok: true }); // already processed
    }
  }

  let result;
  try {
    result = await shopify.webhooks.validate({ rawBody, rawRequest: request });
  } catch (err) {
    console.error('[webhooks/billing-update] Validation error:', err);
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 });
  }

  if (!result.valid) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  // Mark as processed (best-effort — if insert fails, still process the webhook)
  if (webhookId) {
    await supabase.from('webhook_idempotency').insert({ webhook_id: webhookId }).select().maybeSingle();
  }

  let payload: { id?: number; status?: string } = {};
  try {
    payload = JSON.parse(rawBody) as { id?: number; status?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id: chargeNumericId, status } = payload;
  if (!chargeNumericId || !status) {
    return NextResponse.json({ ok: true }); // unexpected shape — ack and ignore
  }

  const normalizedStatus = status.toUpperCase();
  if (normalizedStatus === 'ACTIVE' || normalizedStatus === 'PENDING') {
    return NextResponse.json({ ok: true }); // handled by billing callback
  }

  // For DECLINED / CANCELLED — find job by charge GID and mark failed
  const chargeGid = `gid://shopify/AppPurchaseOneTime/${chargeNumericId}`;
  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, status')
    .eq('charge_id', chargeGid)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ ok: true }); // charge not associated with a known job
  }

  // Only update if still waiting — don't override a completed job
  if (job.status === 'pending_payment' || job.status === 'pending') {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: `Charge ${normalizedStatus.toLowerCase()} via webhook` })
      .eq('id', job.id);
    console.log(`[webhooks/billing-update] Job ${job.id} marked failed — charge ${normalizedStatus}`);
  }

  return NextResponse.json({ ok: true });
}
