/**
 * POST /api/import/start
 * Body: { shop, storeUrl, storeData, isTrial?, trialProductUrls?, skipUrls? }
 * Creates a Supabase import job record, then delegates async processing to the
 * Railway Express worker (RAILWAY_WORKER_URL/import). Returns { jobId } immediately.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { verifyRequest } from '@/lib/auth';

function isValidDm2buyUrl(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.endsWith('.dm2buy.com');
  } catch {
    return false;
  }
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: {
    shop?: unknown
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

  let shop: string;
  try {
    shop = await verifyRequest(request, typeof body.shop === 'string' ? body.shop : null);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    console.error({ phase: 'import/start', error: (err as Error).message });
    return NextResponse.json({ error: 'Session expired. Please refresh and try again.' }, { status });
  }

  const { storeUrl, storeData, isTrial, trialProductUrls, skipUrls } = body;

  if (!storeUrl || typeof storeUrl !== 'string' || !isValidDm2buyUrl(storeUrl)) {
    return NextResponse.json(
      { error: 'Please enter a valid dm2buy store URL.' },
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
    console.error({ phase: 'import/start', shop, error: insertError });
    return NextResponse.json({ error: 'Could not start the import. Please try again.' }, { status: 500 });
  }

  const jobId: string = jobRow.id;

  let workerUrl: string;
  try {
    workerUrl = requireEnv('RAILWAY_WORKER_URL');
  } catch {
    console.error({ phase: 'import/start', shop, jobId, error: 'RAILWAY_WORKER_URL not configured' });
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: 'RAILWAY_WORKER_URL not configured' })
      .eq('id', jobId);
    return NextResponse.json({ error: 'Import service is temporarily unavailable. Please try again.' }, { status: 503 });
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
      signal: AbortSignal.timeout(8000),
    });

    if (!workerRes.ok) {
      const errBody = await workerRes.json().catch(() => ({ error: 'Worker error' }));
      const errMsg = (errBody as { error?: string }).error ?? 'Worker error';
      console.error({ phase: 'import/start', shop, jobId, workerError: errMsg });
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', error: errMsg })
        .eq('id', jobId);
      return NextResponse.json({ error: 'Import service returned an error. Please try again.' }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Worker unreachable';
    console.error({ phase: 'import/start', shop, jobId, error: message });
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: message })
      .eq('id', jobId);
    return NextResponse.json({ error: 'Import service is temporarily unavailable. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ jobId });
}
