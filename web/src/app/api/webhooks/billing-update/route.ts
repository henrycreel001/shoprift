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
    // Internal validation error — return 200 to stop Shopify retries; log for investigation
    console.error({ phase: 'webhooks/billing-update', error: 'validate() threw', detail: err instanceof Error ? err.message : err });
    return NextResponse.json({ ok: true });
  }

  if (!result.valid) {
    // Invalid signature — return 200 to stop Shopify retries (retries won't fix a bad signature)
    console.error({ phase: 'webhooks/billing-update', error: 'invalid_signature' });
    return NextResponse.json({ ok: true });
  }

  // Mark as processed — check for duplicate key (concurrent delivery)
  if (webhookId) {
    const { error: insertError } = await supabase
      .from('webhook_idempotency')
      .insert({ webhook_id: webhookId });
    if (insertError) {
      if (insertError.code === '23505') {
        // Unique constraint: another concurrent delivery already inserted — already processed
        return NextResponse.json({ ok: true });
      }
      // Other DB error: log but continue processing
      console.error({ phase: 'webhooks/billing-update', error: 'idempotency_insert_failed', detail: insertError.message });
    }
  }

  let payload: { id?: number; status?: string } = {};
  try {
    payload = JSON.parse(rawBody) as { id?: number; status?: string };
  } catch {
    return NextResponse.json({ ok: true }); // malformed body — ack and ignore
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
    console.error({ phase: 'webhooks/billing-update', jobId: job.id, chargeStatus: normalizedStatus });
  }

  return NextResponse.json({ ok: true });
}
