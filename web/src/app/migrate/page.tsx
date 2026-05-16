'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReconData {
  storeName: string
  storeUrl: string
  productCount: number
  imageCount: number
  collectionCount: number
  priceTier: PriceTier
}

interface PriceTier {
  plan: string
  amountPaise: number    // 0 = free preview
  label: string          // human-readable: "₹599"
  isFree: boolean
}

interface JobProgress {
  status: 'recon' | 'verifying' | 'extracting' | 'downloading' | 'complete' | 'failed'
  progress: {
    current: number
    total: number
    phase: string
  }
  error: string | null
}

type Step = 1 | 2 | 3 | 4 | 5

// ─── Pricing logic ──────────────────────────────────────────────────────────

/**
 * Derive the price tier from a product count.
 * Free: 0–3 (preview only, no download).
 * Tiers mirror PRICING.md exactly.
 */
function getPriceTier(productCount: number): PriceTier {
  if (productCount <= 3) {
    return { plan: 'Preview', amountPaise: 0, label: 'Free (preview only)', isFree: true }
  }
  if (productCount <= 25) {
    return { plan: 'Starter', amountPaise: 59900, label: '₹599', isFree: false }
  }
  if (productCount <= 100) {
    return { plan: 'Standard', amountPaise: 99900, label: '₹999', isFree: false }
  }
  if (productCount <= 500) {
    return { plan: 'Pro', amountPaise: 199900, label: '₹1,999', isFree: false }
  }
  return { plan: 'Enterprise', amountPaise: 0, label: 'Contact us', isFree: false }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Step indicator bar at the top */
function StepIndicator({ current }: { current: Step }) {
  const steps = ['URL', 'Recon', 'Consent', 'Payment', 'Download']
  return (
    <div className="flex items-center gap-1 mb-10" role="list" aria-label="Migration steps">
      {steps.map((label, i) => {
        const stepNum = (i + 1) as Step
        const isComplete = stepNum < current
        const isActive = stepNum === current
        return (
          <div key={label} className="flex items-center gap-1 flex-1" role="listitem">
            <div
              className={[
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                isComplete ? 'bg-green-500 text-white' :
                isActive   ? 'bg-brand-600 text-white' :
                             'bg-gray-100 text-gray-400',
              ].join(' ')}
              aria-current={isActive ? 'step' : undefined}
            >
              {isComplete ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                stepNum
              )}
            </div>
            <span className={[
              'hidden text-xs sm:block',
              isActive ? 'font-medium text-gray-900' : 'text-gray-400',
            ].join(' ')}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={[
                'h-px flex-1 mx-1',
                isComplete ? 'bg-green-400' : 'bg-gray-200',
              ].join(' ')} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Inline error message — never toasts */
function InlineError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div role="alert" className="mt-3 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}

/** Spinner + label */
function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-500">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  )
}

// ─── Migration Consent text ──────────────────────────────────────────────────

const CONSENT_TEXT = `By proceeding, you confirm that you own this dm2buy store and all content within it, and that you authorise Shoprift to extract this data on your behalf. You accept sole responsibility for compliance with dm2buy's terms of service. Shoprift's liability is limited to the amount paid for this job. Full terms: [Migration Consent Agreement]`

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * MigratePage — 5-step client-side state machine.
 *
 * State transitions:
 *   1 (URL input) → 2 (Recon preview) → 3 (Consent) → 4 (Payment) → 5 (Progress + Download)
 *
 * All API calls go to /api/* routes which call the Railway worker.
 * No direct Playwright/engine calls from the browser.
 */
export default function MigratePage() {
  // ── State machine ──────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1)
  const [storeUrl, setStoreUrl] = useState('')
  const [reconData, setReconData] = useState<ReconData | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [consentChecked, setConsentChecked] = useState(false)
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  // ── Loading / error per step ───────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Polling ref — cleared on unmount ──────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => clearPoll(), [clearPoll])

  // ─────────────────────────────────────────────────────────────────
  // STEP 1 → STEP 2 : Scan store
  // ─────────────────────────────────────────────────────────────────

  async function handleScan() {
    setError('')
    const trimmed = storeUrl.trim()
    if (!trimmed) {
      setError('Please enter your dm2buy store URL.')
      return
    }
    // Basic format guard — real validation happens in the API route
    if (!trimmed.includes('dm2buy.com')) {
      setError('URL must be a dm2buy store (e.g. https://yourstore.dm2buy.com).')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/recon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeUrl: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Scan failed. Please try again.')

      const tier = getPriceTier(data.productCount)
      setReconData({
        storeName: data.storeName,
        storeUrl: trimmed,
        productCount: data.productCount,
        imageCount: data.imageCount,
        collectionCount: data.collectionCount ?? 0,
        priceTier: tier,
      })
      setJobId(data.jobId ?? null)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 2 → STEP 3 : Proceed to consent
  // ─────────────────────────────────────────────────────────────────

  function handleProceedToConsent() {
    setError('')
    // Enterprise tier — no self-serve payment
    if (reconData?.priceTier.plan === 'Enterprise') {
      setError('For 500+ product stores, please contact us directly via email or WhatsApp.')
      return
    }
    setStep(3)
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 3 → STEP 4 : Consent agreed
  // ─────────────────────────────────────────────────────────────────

  function handleConsentContinue() {
    setError('')
    if (!consentChecked) {
      setError('Please read and accept the Migration Consent to continue.')
      return
    }
    // Free tier skips payment — go straight to extraction
    if (reconData?.priceTier.isFree) {
      startExtraction()
      return
    }
    setStep(4)
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 4 : Create Razorpay order + trigger payment
  // ─────────────────────────────────────────────────────────────────

  async function handlePayWithRazorpay() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          amountPaise: reconData?.priceTier.amountPaise,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create payment order.')

      setPaymentOrderId(data.orderId)

      // ── Open Razorpay checkout ──
      // Razorpay JS is loaded via <Script> on client; window.Razorpay available here.
      // TODO (Phase 14): load <Script src="https://checkout.razorpay.com/v1/checkout.js"> in layout.tsx
      //                  then replace the stub below with real Razorpay options object.
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
        amount: data.amount,
        currency: data.currency,
        name: 'Shoprift',
        description: `Store migration — ${reconData?.priceTier.plan} plan`,
        order_id: data.orderId,
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          // Verify payment server-side, then start extraction
          await verifyPaymentAndExtract(response)
        },
        prefill: {},
        theme: { color: '#0284c7' },
      }

      // @ts-expect-error — Razorpay global loaded via external script
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment setup failed.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyPaymentAndExtract(response: {
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  }) {
    setLoading(true)
    try {
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...response, jobId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Payment verification failed.')

      // Payment confirmed — start extraction
      startExtraction()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment verification error.')
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 5 : Poll job status + download
  // ─────────────────────────────────────────────────────────────────

  function startExtraction() {
    setStep(5)
    setLoading(false)
    // Start polling immediately, then every 5 seconds
    pollJobStatus()
    pollRef.current = setInterval(pollJobStatus, 5000)
  }

  async function pollJobStatus() {
    if (!jobId) return
    try {
      const res = await fetch(`/api/job/${jobId}`)
      const data: JobProgress = await res.json()
      setJobProgress(data)

      if (data.status === 'complete') {
        clearPoll()
        fetchDownloadUrl()
      } else if (data.status === 'failed') {
        clearPoll()
        setError(data.error ?? 'Extraction failed. Please contact support.')
      }
    } catch {
      // Network blip — keep polling, don't surface error yet
    }
  }

  async function fetchDownloadUrl() {
    if (!jobId) return
    try {
      const res = await fetch(`/api/download/${jobId}`)
      const data = await res.json()
      if (res.ok && data.signedUrl) {
        setDownloadUrl(data.signedUrl)
      } else {
        setError('Could not generate download link. Please contact support.')
      }
    } catch {
      setError('Could not fetch download link. Please try refreshing.')
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Progress helpers
  // ─────────────────────────────────────────────────────────────────

  const progressPercent =
    jobProgress && jobProgress.progress.total > 0
      ? Math.round((jobProgress.progress.current / jobProgress.progress.total) * 100)
      : 0

  const statusLabel: Record<string, string> = {
    recon:       'Scanning store...',
    verifying:   'Verifying ownership...',
    extracting:  'Extracting products...',
    downloading: 'Downloading images...',
    complete:    'Complete',
    failed:      'Failed',
  }

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-8">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            &larr; Shoprift
          </a>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">
            Migrate your store
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Complete all steps to extract and download your store data.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Step panels */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 sm:p-8">

          {/* ── STEP 1: URL input ─────────────────────────────────── */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Enter your store URL</h2>
              <p className="text-sm text-gray-500 mb-6">
                Paste your full dm2buy store URL. Example:{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                  https://yourstore.dm2buy.com
                </code>
              </p>

              <label htmlFor="store-url" className="block text-sm font-medium text-gray-700 mb-1.5">
                dm2buy store URL
              </label>
              <input
                id="store-url"
                type="url"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleScan()}
                placeholder="https://yourstore.dm2buy.com"
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                aria-describedby="url-hint"
                disabled={loading}
              />
              <p id="url-hint" className="mt-1.5 text-xs text-gray-400">
                Must be a dm2buy.com subdomain. We don&apos;t store your URL beyond this session.
              </p>

              <InlineError message={error} />

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={loading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Spinner label="Scanning..." /> : 'Scan store'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Recon preview ──────────────────────────────── */}
          {step === 2 && reconData && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Store found</h2>
              <p className="text-sm text-gray-500 mb-6">
                Confirm this is your store before proceeding.
              </p>

              {/* Store card */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-0.5">Store name</p>
                  <p className="font-semibold text-gray-900">{reconData.storeName}</p>
                  <p className="text-xs text-gray-400 mt-0.5 break-all">{reconData.storeUrl}</p>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-200">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{reconData.productCount}</p>
                    <p className="text-xs text-gray-500">Products</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{reconData.imageCount}</p>
                    <p className="text-xs text-gray-500">Images</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{reconData.collectionCount}</p>
                    <p className="text-xs text-gray-500">Collections</p>
                  </div>
                </div>

                {/* Price tier */}
                <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Plan</p>
                    <p className="font-semibold text-gray-900">{reconData.priceTier.plan}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Price</p>
                    <p className="text-xl font-bold text-brand-600">{reconData.priceTier.label}</p>
                  </div>
                </div>

                {reconData.priceTier.isFree && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    Preview mode: with 3 or fewer products, recon is free but download is not available.
                  </div>
                )}
              </div>

              <InlineError message={error} />

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleProceedToConsent}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  Proceed &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => { setStep(1); setReconData(null); setError('') }}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Change URL
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Migration consent ──────────────────────────── */}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Migration Consent</h2>
              <p className="text-sm text-gray-500 mb-5">
                Please read and agree before we proceed.
              </p>

              {/* Scrollable consent block */}
              <div
                className="h-40 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 leading-relaxed"
                role="region"
                aria-label="Migration Consent Agreement"
                tabIndex={0}
              >
                {CONSENT_TEXT}
              </div>

              {/* Checkbox */}
              <label className="mt-4 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
                <span className="text-sm text-gray-700">
                  I have read and agree to the Migration Consent Agreement. I confirm I own this dm2buy store.
                </span>
              </label>

              <InlineError message={error} />

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleConsentContinue}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Spinner label="Processing..." /> : (
                    reconData?.priceTier.isFree ? 'Start extraction (free)' : 'Continue to payment'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep(2); setError('') }}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Payment ────────────────────────────────────── */}
          {step === 4 && reconData && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Payment</h2>
              <p className="text-sm text-gray-500 mb-6">
                Your extraction starts immediately after payment is confirmed.
              </p>

              {/* Order summary */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 space-y-3 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Plan</span>
                  <span className="font-medium text-gray-900">{reconData.priceTier.plan}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Products</span>
                  <span className="font-medium text-gray-900">{reconData.productCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-3">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-xl font-bold text-brand-600">{reconData.priceTier.label}</span>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-5">
                Powered by Razorpay &middot; UPI, credit/debit cards, net banking accepted &middot;
                Full refund if extraction fails.
              </p>

              <InlineError message={error} />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePayWithRazorpay}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Spinner label="Setting up payment..." /> : (
                    <>
                      Pay {reconData.priceTier.label} with Razorpay
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep(3); setError('') }}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 5: Progress + Download ────────────────────────── */}
          {step === 5 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {jobProgress?.status === 'complete'
                  ? 'Your migration is ready'
                  : jobProgress?.status === 'failed'
                  ? 'Extraction failed'
                  : 'Extracting your store...'}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {jobProgress?.status === 'complete'
                  ? 'Download your migration package below. Link is valid for 7 days.'
                  : jobProgress?.status === 'failed'
                  ? 'Something went wrong during extraction.'
                  : 'This usually takes 2–5 minutes depending on your store size. You can keep this tab open.'}
              </p>

              {/* Progress bar */}
              {jobProgress && jobProgress.status !== 'complete' && jobProgress.status !== 'failed' && (
                <div className="mb-6">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>{statusLabel[jobProgress.status] ?? 'Processing...'}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 progress-pulse transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                      role="progressbar"
                      aria-valuenow={progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  {jobProgress.progress.phase && (
                    <p className="mt-1.5 text-xs text-gray-400">{jobProgress.progress.phase}</p>
                  )}
                </div>
              )}

              {/* Waiting state (no progress data yet) */}
              {!jobProgress && (
                <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
                  <span className="spinner" aria-hidden="true" />
                  Starting extraction...
                </div>
              )}

              {/* Job ID for support */}
              {jobId && (
                <p className="text-xs text-gray-300 mb-4">
                  Job ID: <code className="font-mono">{jobId}</code>
                </p>
              )}

              <InlineError message={error} />

              {/* Download button */}
              {downloadUrl && (
                <div className="mt-6">
                  <a
                    href={downloadUrl}
                    download
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download migration package (.zip)
                  </a>
                  <p className="mt-2 text-xs text-gray-400">
                    Contains your CSV + all product images. Import the CSV directly into Shopify.
                  </p>
                </div>
              )}

              {/* Retry contact for failures */}
              {jobProgress?.status === 'failed' && (
                <div className="mt-4 text-sm text-gray-500">
                  Please email{' '}
                  <a href="mailto:support@shoprift.in" className="text-brand-600 underline">
                    support@shoprift.in
                  </a>{' '}
                  with your Job ID. We&apos;ll refund or rerun your extraction.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trust footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Shoprift by MALIQ ENTERPRISES &middot; Delhi, India &middot; Questions?{' '}
          <a href="mailto:support@shoprift.in" className="hover:text-gray-600 underline">
            support@shoprift.in
          </a>
        </p>
      </div>
    </main>
  )
}
