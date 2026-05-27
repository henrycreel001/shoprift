/**
 * POST /api/import/start
 * Body: { shop, storeUrl, storeData, isTrial?, trialProductUrls?, skipUrls? }
 * Creates a Supabase import job record, then delegates async processing to the
 * Railway Express worker (RAILWAY_WORKER_URL/import). Returns { jobId } immediately.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { verifySessionToken } from '@/lib/auth';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export async function POST(request: NextRequest): Promise<Response> {
  let shop: string;
  try {
    shop = await verifySessionToken(request);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    return NextResponse.json({ error: 'Unauthorized' }, { status });
  }

  let body: {
    storeUrl?: unknown
    storeData?: unknown
    isTrial?: unknown
    trialProductUrls?: unknown
    skipUrls?: unknown
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { storeUrl, storeData, isTrial, trialProductUrls, skipUrls } = body;

  if (!storeUrl || typeof storeUrl !== 'string' || !storeUrl.includes('dm2buy.com')) {
    return NextResponse.json(
      { error: 'Invalid storeUrl — must be a dm2buy.com URL' },
      { status: 400 },
    );
  }
  if (!storeData || typeof storeData !== 'object') {
    return NextResponse.json({ error: 'storeData is required' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const insertPayload: Record<string, unknown> = {
    account_id: shop,
    store_url: storeUrl,
    status: 'pending',
  };
  if (isTrial === true) {
    insertPayload.is_trial = true;
    insertPayload.trial_product_urls = Array.isArray(trialProductUrls) ? trialProductUrls : [];
  }

  const { data: jobRow, error: insertError } = await supabase
    .from('import_jobs')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertError || !jobRow) {
    return NextResponse.json(
      { error: `Failed to create job: ${insertError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const jobId: string = jobRow.id;

  let workerUrl: string;
  try {
    workerUrl = requireEnv('RAILWAY_WORKER_URL');
  } catch (err) {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: 'RAILWAY_WORKER_URL not configured' })
      .eq('id', jobId);
    return NextResponse.json({ error: 'Worker not configured' }, { status: 500 });
  }

  const workerBody: Record<string, unknown> = { jobId, shop, storeData };
  if (Array.isArray(skipUrls) && skipUrls.length > 0) {
    workerBody.skipUrls = skipUrls;
  }

  try {
    const workerRes = await fetch(`${workerUrl}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workerBody),
    });

    if (!workerRes.ok) {
      const errBody = await workerRes.json().catch(() => ({ error: 'Worker error' }));
      const errMsg = (errBody as { error?: string }).error ?? 'Worker error';
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', error: errMsg })
        .eq('id', jobId);
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Worker unreachable';
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: message })
      .eq('id', jobId);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ jobId });
}
