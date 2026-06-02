/**
 * POST /api/verify/start
 * Body: { shop, storeUrl }
 * Generates a verification code, stores it in verification_attempts, returns { code, attemptId }.
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

function genCode(): string {
  // No I, O, 0, 1 — easy to read aloud or type
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const ts = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  return `SHR-${part1}-${ts}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { storeUrl?: unknown; shop?: unknown };
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
    console.error({ phase: 'verify/start', error: (err as Error).message });
    return NextResponse.json({ error: 'Session expired. Please refresh and try again.' }, { status });
  }

  const { storeUrl } = body;
  if (!storeUrl || typeof storeUrl !== 'string' || !isValidDm2buyUrl(storeUrl)) {
    return NextResponse.json({ error: 'Please enter a valid dm2buy store URL.' }, { status: 400 });
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
    return NextResponse.json({ error: 'Could not start verification. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ code, attemptId: data.id });
}
