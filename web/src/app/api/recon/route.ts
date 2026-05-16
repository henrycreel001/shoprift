import { NextRequest, NextResponse } from 'next/server'

// Node runtime — not Edge. Supabase client requires Node APIs.
export const runtime = 'nodejs'

/**
 * POST /api/recon
 *
 * Accepts: { storeUrl: string }
 * Returns: {
 *   jobId: string
 *   storeName: string
 *   productCount: number
 *   imageCount: number
 *   collectionCount: number
 * }
 *
 * Architecture note:
 * The actual Playwright-based recon runs on Railway (not Vercel).
 * This route forwards the request to the Railway worker and returns
 * the response. The web app is a thin API gateway — no engine code here.
 *
 * TODO: call Railway worker
 *   const workerUrl = process.env.RAILWAY_WORKER_URL
 *   const res = await fetch(`${workerUrl}/recon`, { method: 'POST', body: ... })
 *   const data = await res.json()
 *   if (!res.ok) return NextResponse.json({ error: data.error }, { status: res.status })
 *   return NextResponse.json(data)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeUrl } = body as { storeUrl: string }

    if (!storeUrl || typeof storeUrl !== 'string') {
      return NextResponse.json(
        { error: 'storeUrl is required.' },
        { status: 400 }
      )
    }

    if (!storeUrl.includes('dm2buy.com')) {
      return NextResponse.json(
        { error: 'URL must be a dm2buy.com store.' },
        { status: 400 }
      )
    }

    // ── TODO: call Railway worker ──────────────────────────────────────────
    // const workerUrl = process.env.RAILWAY_WORKER_URL
    // if (!workerUrl) {
    //   return NextResponse.json({ error: 'Worker not configured.' }, { status: 503 })
    // }
    // const upstream = await fetch(`${workerUrl}/recon`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ storeUrl }),
    // })
    // const data = await upstream.json()
    // if (!upstream.ok) {
    //   return NextResponse.json({ error: data.error ?? 'Recon failed.' }, { status: upstream.status })
    // }
    // return NextResponse.json(data)
    // ──────────────────────────────────────────────────────────────────────

    // ── STUB — returns mock recon data for UI development ──────────────────
    // Remove this block once Railway worker is wired up.
    const mockJobId = `job_${Date.now()}_stub`
    const mockResponse = {
      jobId: mockJobId,
      storeName: 'Kiwii Shop (stub)',
      storeUrl,
      productCount: 4,
      imageCount: 18,
      collectionCount: 2,
    }
    return NextResponse.json(mockResponse)
    // ──────────────────────────────────────────────────────────────────────

  } catch (err) {
    console.error('[/api/recon] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
