/**
 * GET /api/import/status/[jobId]
 * Returns the current status + progress of a Shopify import job.
 * Client polls this until status is 'complete' or 'failed'.
 *
 * Response shape:
 *   { jobId, status, progress, error, result, createdAt, updatedAt }
 *   status: 'pending' | 'importing' | 'complete' | 'failed'
 *   progress: { current, total, phase, message } | null
 *   result: { productsCreated, productsFailed, collectionsCreated, errors } | null
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await params;

  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('import_jobs')
    .select('id, status, progress, error, recon_data, created_at, updated_at')
    .eq('id', jobId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: data.id,
    status: data.status,
    progress: data.progress ?? null,
    error: data.error ?? null,
    result: data.recon_data ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}
