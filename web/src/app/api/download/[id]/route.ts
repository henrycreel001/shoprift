import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// Node runtime — Supabase client requires Node APIs.
export const runtime = 'nodejs'

/** Signed URL expiry in seconds — 7 days as per CLAUDE.md */
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 7

/**
 * GET /api/download/[id]
 *
 * Generates a Supabase Storage signed URL for the job's delivery ZIP.
 * URL is valid for 7 days (per CLAUDE.md § Definition of Done V2).
 *
 * The storage path convention is: `deliveries/{jobId}/{storeName}_shoprift_delivery.zip`
 * This must match exactly what the Railway worker writes to Supabase Storage.
 *
 * Accepts: job ID in URL path
 * Returns: { signedUrl: string }
 *
 * Security: anyone with the job ID can download. Job IDs are UUIDs.
 * In V2, add user-scoped auth before generating the signed URL.
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

    // 1. Confirm job is complete and retrieve the storage path
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('status, store_url')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    }

    if (job.status !== 'complete') {
      return NextResponse.json(
        { error: `Job is not complete yet. Current status: ${job.status}` },
        { status: 409 }
      )
    }

    // 2. Look up the delivery record for the storage path
    //    The `downloads` table is created in Phase 13 (web app schema).
    //    Until then, derive path from job ID directly.
    const storagePath = `deliveries/${jobId}/shoprift_delivery.zip`

    // 3. Generate signed URL from Supabase Storage
    const { data: urlData, error: urlError } = await supabase
      .storage
      .from('shoprift-deliveries')           // bucket name — configure in Supabase dashboard
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)

    if (urlError || !urlData?.signedUrl) {
      console.error('[/api/download] Storage signed URL error:', urlError)
      return NextResponse.json(
        { error: 'Could not generate download link. The file may not be ready yet.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ signedUrl: urlData.signedUrl })

  } catch (err) {
    console.error('[/api/download] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
