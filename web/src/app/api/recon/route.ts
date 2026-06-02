/**
 * POST /api/recon
 * Body: { storeUrl: string }
 * Forwards to Railway worker /recon. Returns recon summary.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

function isValidDm2buyUrl(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.endsWith('.dm2buy.com');
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let body: { storeUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { storeUrl } = body;

  if (!storeUrl || typeof storeUrl !== 'string' || !isValidDm2buyUrl(storeUrl)) {
    return NextResponse.json({ error: 'Please enter a valid dm2buy store URL.' }, { status: 400 });
  }

  const workerUrl = process.env.RAILWAY_WORKER_URL;
  if (!workerUrl) {
    console.error({ phase: 'recon', error: 'RAILWAY_WORKER_URL not configured' });
    return NextResponse.json({ error: 'Service temporarily unavailable. Please try again.' }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${workerUrl}/recon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeUrl }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    console.error({ phase: 'recon', storeUrl, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ error: 'Could not reach the scan service. Please try again.' }, { status: 502 });
  }

  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    console.error({ phase: 'recon', storeUrl, status: upstream.status, workerError: data });
    return NextResponse.json({ error: 'Scan failed. Please try again.' }, { status: upstream.status >= 500 ? 502 : upstream.status });
  }

  return NextResponse.json(data);
}
