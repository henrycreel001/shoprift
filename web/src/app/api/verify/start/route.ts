/**
 * POST /api/verify/start
 * Body: { shop, storeUrl }
 * Generates a verification code, stores it in verification_attempts, returns { code, attemptId }.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

function genCode(): string {
  // No I, O, 0, 1 — easy to read aloud or type
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const ts = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  return `SHR-${part1}-${ts}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { shop?: unknown; storeUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { shop, storeUrl } = body;
  if (!shop || typeof shop !== 'string' || !shop.endsWith('.myshopify.com')) {
    return NextResponse.json({ error: 'shop is required and must end with .myshopify.com' }, { status: 400 });
  }
  if (!storeUrl || typeof storeUrl !== 'string' || !storeUrl.includes('dm2buy.com')) {
    return NextResponse.json({ error: 'storeUrl is required and must be a dm2buy.com URL' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const code = genCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('verification_attempts')
    .insert({ account_id: shop, store_url: storeUrl, code, expires_at: expiresAt })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create verification attempt' },
      { status: 500 },
    );
  }

  return NextResponse.json({ code, attemptId: data.id });
}
