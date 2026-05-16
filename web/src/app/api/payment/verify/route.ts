import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createServerSupabaseClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, jobId } = await request.json() as {
      razorpay_order_id?: string
      razorpay_payment_id?: string
      razorpay_signature?: string
      jobId?: string
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !jobId) {
      return NextResponse.json({ error: 'Missing required payment fields.' }, { status: 400 })
    }

    // Verify HMAC-SHA256 signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex')

    if (expectedSig !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Update payment record to paid
    await supabase
      .from('payments')
      .update({ razorpay_payment_id, status: 'paid', updated_at: new Date().toISOString() })
      .eq('razorpay_order_id', razorpay_order_id)

    // Transition job to extracting — Railway worker picks it up via BullMQ
    await supabase
      .from('import_jobs')
      .update({ status: 'queued', updated_at: new Date().toISOString() })
      .eq('id', jobId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/payment/verify]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
