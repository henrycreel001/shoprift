/**
 * POST /api/verify/check
 * Body: { attemptId, shop, storeUrl }
 * Forwards to Railway worker GET /verify/check. Marks attempt verified on success.
 * Returns { verified: boolean }.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { verifyRequest } from '@/lib/auth';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { attemptId?: unknown; storeUrl?: unknown; shop?: unknown };
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
    console.error({ phase: 'verify/check', error: (err as Error).message });
    return NextResponse.json({ error: 'Session expired. Please refresh and try again.' }, { status });
  }

  const { attemptId, storeUrl } = body;
  if (!attemptId || typeof attemptId !== 'string') {
    return NextResponse.json({ error: 'attemptId is required' }, { status: 400 });
  }
  if (!storeUrl || typeof storeUrl !== 'string') {
    return NextResponse.json({ error: 'storeUrl is required' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: attempt, error: fetchError } = await supabase
    .from('verification_attempts')
    .select('code, expires_at, status')
    .eq('id', attemptId)
    .eq('account_id', shop)
    .single();

  if (fetchError || !attempt) {
    return NextResponse.json({ error: 'Verification attempt not found' }, { status: 404 });
  }
  if (attempt.status === 'verified') {
    return NextResponse.json({ verified: true });
  }
  if (new Date(attempt.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Your verification code has expired. Click "Get new code" to start again.', verified: false, expired: true },
      { status: 410 },
    );
  }

  let workerUrl: string;
  try {
    workerUrl = requireEnv('RAILWAY_WORKER_URL');
  } catch {
    return NextResponse.json({ error: 'Worker not configured', verified: false }, { status: 500 });
  }

  let verified = false;
  try {
    const r = await fetch(`${workerUrl}/verify/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeUrl, code: attempt.code }),
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json() as { verified?: boolean; error?: string };
    verified = d.verified === true;
  } catch (err) {
    console.error({ phase: 'verify/check', shop, attemptId, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ error: 'Verification check is temporarily unavailable. Please try again.', verified: false }, { status: 502 });
  }

  if (verified) {
    await supabase
      .from('verification_attempts')
      .update({ status: 'verified', verified_at: new Date().toISOString() })
      .eq('id', attemptId);
  }

  return NextResponse.json({ verified });
}
