/**
 * POST /api/verify/start
 * Body: { shop, storeUrl }
 * Generates a verification code, stores it in verification_attempts, returns { code, attemptId }.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { verifySessionToken } from '@/lib/auth';

function genCode(): string {
  // No I, O, 0, 1 — easy to read aloud or type
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const ts = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  return `SHR-${part1}-${ts}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  let shop: string;
  try {
    shop = await verifySessionToken(request);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    return NextResponse.json({ error: 'Unauthorized' }, { status });
  }

  let body: { storeUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { storeUrl } = body;
  if (!storeUrl || typeof storeUrl !== 'string' || !storeUrl.includes('dm2buy.com')) {
    return NextResponse.json({ error: 'storeUrl is required and must be a dm2buy.com URL' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('verification_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', shop)
    .gte('created_at', oneHourAgo);

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'Too many verification attempts. Try again in an hour.' },
      { status: 429 },
    );
  }

  const code = genCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('verification_attempts')
    .insert({ account_id: shop, store_url: storeUrl, code, method: 'dm2buy_product', expires_at: expiresAt })
    .select('id')
    .single();

  if (error || !data) {
    console.error({ phase: 'verify/start', shop, error });
    return NextResponse.json({ error: 'Failed to start verification' }, { status: 500 });
  }

  return NextResponse.json({ code, attemptId: data.id });
}
