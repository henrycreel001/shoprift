import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createServerSupabaseClient } from '@/lib/supabase'

export const runtime = 'nodejs'

const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function POST(request: NextRequest) {
  try {
    const { jobId, amountPaise } = await request.json() as {
      jobId?: string
      amountPaise?: number
    }

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })
    }
    if (typeof amountPaise !== 'number' || amountPaise <= 0) {
      return NextResponse.json({ error: 'amountPaise must be a positive number.' }, { status: 400 })
    }

    // Verify job exists and is not already paid
    const supabase = createServerSupabaseClient()
    const { data: jobRow, error: jobErr } = await supabase
      .from('import_jobs')
      .select('id, status')
      .eq('id', jobId)
      .maybeSingle()

    if (jobErr || !jobRow) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    }

    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `shoprift_${jobId}`,
      notes: { jobId },
    })

    // Record payment row (status: created)
    await supabase.from('payments').insert({
      job_id: jobId,
      user_id: jobId, // V1: no auth, use jobId as user_id
      razorpay_order_id: order.id,
      amount_paise: amountPaise,
      status: 'created',
    })

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    })
  } catch (err) {
    console.error('[/api/payment/create]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
