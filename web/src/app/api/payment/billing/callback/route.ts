/**
 * GET /api/payment/billing/callback
 * Query params: jobId, charge_id (added by Shopify), shop (added by Shopify)
 * Called by Shopify after merchant approves the AppPurchaseOneTime charge.
 * Verifies charge is active, triggers Railway import, redirects to Shopify admin.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getValidAccessToken } from '@/lib/shopify';

const SHOPIFY_API_VERSION = '2026-04';

function adminRedirect(shop: string, params: Record<string, string>): Response {
  const qs = new URLSearchParams(params).toString();
  return NextResponse.redirect(`https://${shop}/admin/apps/shoprift?${qs}`);
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const jobId   = searchParams.get('jobId');
  const chargeId = searchParams.get('charge_id');
  const shop    = searchParams.get('shop');

  if (!jobId || !chargeId || !shop) {
    const fallbackShop = shop ?? '';
    return fallbackShop
      ? adminRedirect(fallbackShop, { billing_error: 'missing_params' })
      : NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, status, store_data, skip_urls')
    .eq('id', jobId)
    .single();

  if (!job) {
    return adminRedirect(shop, { billing_error: 'job_not_found' });
  }

  const accessToken = await getValidAccessToken(shop);
  if (!accessToken) {
    return adminRedirect(shop, { billing_error: 'no_session' });
  }

  // Verify charge status via Shopify GraphQL (required for public apps)
  let charge: { status: string } | null = null;
  try {
    const res = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: `{ node(id: "gid://shopify/AppPurchaseOneTime/${chargeId}") { ... on AppPurchaseOneTime { status } } }`,
        }),
      },
    );
    if (res.ok) {
      const body = await res.json() as { data?: { node?: { status?: string } } };
      const status = body.data?.node?.status;
      if (status) charge = { status: status.toLowerCase() };
    }
  } catch {
    // fall through to status check
  }

  if (!charge || charge.status !== 'active') {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: `Charge not active: ${charge?.status ?? 'unknown'}` })
      .eq('id', jobId);
    return adminRedirect(shop, { billing_error: 'charge_not_active' });
  }

  // Charge confirmed — update job to pending and trigger import
  await supabase
    .from('import_jobs')
    .update({ status: 'pending' })
    .eq('id', jobId);

  const workerUrl = process.env.RAILWAY_WORKER_URL;
  if (!workerUrl) {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: 'RAILWAY_WORKER_URL not configured' })
      .eq('id', jobId);
    return adminRedirect(shop, { billing_error: 'worker_not_configured' });
  }

  const workerBody: Record<string, unknown> = { jobId, shop, storeData: job.store_data };
  if (Array.isArray(job.skip_urls) && job.skip_urls.length > 0) {
    workerBody.skipUrls = job.skip_urls;
  }

  try {
    const workerRes = await fetch(`${workerUrl}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workerBody),
    });
    if (!workerRes.ok) {
      const err = await workerRes.json().catch(() => ({ error: 'Worker error' })) as { error?: string };
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', error: err.error ?? 'Worker error' })
        .eq('id', jobId);
      return adminRedirect(shop, { billing_error: 'worker_failed' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Worker unreachable';
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: msg })
      .eq('id', jobId);
    return adminRedirect(shop, { billing_error: 'worker_unreachable' });
  }

  return adminRedirect(shop, { billing_job_id: jobId });
}
