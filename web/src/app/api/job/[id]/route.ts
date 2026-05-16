import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// Node runtime — Supabase client requires Node APIs.
export const runtime = 'nodejs'

/**
 * GET /api/job/[id]
 *
 * Polls Supabase `import_jobs` for the current status and progress of a job.
 *
 * Returns: {
 *   status: 'recon' | 'verifying' | 'extracting' | 'downloading' | 'complete' | 'failed'
 *   progress: { current: number; total: number; phase: string }
 *   error: string | null
 * }
 *
 * The migrate/page.tsx client polls this every 5 seconds during Step 5.
 * Row-level security on Supabase: anyone who knows the job ID can read it.
 * No auth in V1 — job IDs are UUIDs (unguessable).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Job ID is required.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('import_jobs')
      .select('status, progress, error')
      .eq('id', jobId)
      .single()

    if (error || !data) {
      console.error('[/api/job] Supabase error:', error)
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    }

    return NextResponse.json({
      status: data.status,
      progress: data.progress ?? { current: 0, total: 0, phase: '' },
      error: data.error ?? null,
    })

  } catch (err) {
    console.error('[/api/job] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
