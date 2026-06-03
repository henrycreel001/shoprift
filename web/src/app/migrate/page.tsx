'use client'

import { useState, useEffect, useRef, useCallback, Suspense, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import enTranslations from '@shopify/polaris/locales/en.json'
import { AppProvider } from '@shopify/polaris'
import { recon as runRecon } from '@/lib/dm2buy/recon'
import { extract } from '@/lib/dm2buy/extractor'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { ReconData, StoreData, ProgressEvent } from '@/lib/dm2buy/types'
import createApp from '@shopify/app-bridge'
import { getSessionToken } from '@shopify/app-bridge/utilities'
import { track } from '@/lib/analytics'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | 'url'
  | 'reconning'
  | 'preview'
  | 'verifying'
  | 'trialing'
  | 'trial_done'
  | 'extracting'
  | 'results'
  | 'importing'
  | 'done'

interface ImportStatus {
  status: string
  current: number
  total: number
  message: string
  phase?: string
  collectionsTotal?: number
  collectionsCurrent?: number
  imagesTotal?: number
  imagesCurrent?: number
  assignsTotal?: number
  assignsCurrent?: number
}

interface ImportResult {
  productsCreated: number
  productsFailed: number
  collectionsCreated: number
  errors?: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priceTier(count: number) {
  if (count <= 3)   return { plan: 'Preview',    price: 'Free',      isFree: true }
  if (count <= 25)  return { plan: 'Starter',    price: '₹599',      isFree: false }
  if (count <= 100) return { plan: 'Standard',   price: '₹999',      isFree: false }
  if (count <= 500) return { plan: 'Pro',         price: '₹1,999',   isFree: false }
  return                    { plan: 'Enterprise', price: 'Contact us', isFree: false }
}

// Weighted composite progress across all 4 import phases.
// Products 25% · Images 40% · Collections 15% · Assigns 20%.
// Caps at 99 until status === 'complete' so bar never lies.
function calcImportProgress(s: ImportStatus): number {
  if (s.status === 'complete') return 100
  const pProd = s.total > 0 ? s.current / s.total : 0
  const imgTotal = s.imagesTotal ?? 0
  const pImg  = imgTotal > 0 ? (s.imagesCurrent ?? 0) / imgTotal : pProd
  const colTotal = s.collectionsTotal ?? 0
  const pCol  = colTotal > 0 ? (s.collectionsCurrent ?? 0) / colTotal : pProd
  const asgnTotal = s.assignsTotal ?? 0
  const pAsgn = asgnTotal > 0 ? (s.assignsCurrent ?? 0) / asgnTotal : pCol
  const weighted = pProd * 25 + pImg * 40 + pCol * 15 + pAsgn * 20
  return Math.min(99, Math.floor(weighted))
}

function isDm2buyUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    const parts = hostname.split('.')
    return parts.length >= 3 && parts.slice(-2).join('.') === 'dm2buy.com'
  } catch { return false }
}

// ─── Step tracking ────────────────────────────────────────────────────────────

const STEP_ORDER: Step[] = ['url', 'verifying', 'preview', 'extracting', 'results', 'importing', 'done']

const STEP_LABELS: Record<string, string> = {
  url: 'URL',
  verifying: 'Verify',
  preview: 'Preview',
  extracting: 'Extract',
  results: 'Review',
  importing: 'Import',
  done: 'Done',
}

function stepIndex(step: Step): number {
  const mapped: Partial<Record<Step, Step>> = {
    reconning: 'url',
    trialing: 'extracting',
    trial_done: 'results',
  }
  return STEP_ORDER.indexOf(mapped[step] ?? step)
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IcoArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2 6.5h9M7.5 3l3.5 3.5L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IcoCheck() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IcoCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4.5 8.5H2.5a1 1 0 01-1-1V2.5a1 1 0 011-1h5a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IcoDismiss() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost'

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
}

function Btn({ variant = 'primary', loading, size = 'md', children, className = '', disabled, ...rest }: BtnProps) {
  const base = [
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none',
    'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-mint/40 disabled:pointer-events-none',
  ].join(' ')

  const sizes: Record<string, string> = {
    sm:  'px-4 py-2 text-xs',
    md:  'px-5 py-2.5 text-sm',
    lg:  'px-5 py-[0.8125rem] text-[0.9375rem]',
  }

  const variants: Record<BtnVariant, string> = {
    primary:   'bg-mint text-void font-semibold hover:bg-mint-hover active:scale-[0.982] shadow-[0_1px_3px_rgba(0,229,160,0.25)] disabled:opacity-50',
    secondary: 'border border-wire-strong text-ink-2 hover:border-ink-4 hover:text-ink active:scale-[0.982] disabled:opacity-40',
    ghost:     'text-ink-4 hover:text-ink-2 px-2 py-1.5 disabled:opacity-30',
  }

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {loading && (
        <span className="w-[13px] h-[13px] border-[1.5px] border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
      {children}
    </button>
  )
}

interface LinkBtnProps {
  href: string
  external?: boolean
  variant?: BtnVariant
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children: React.ReactNode
}

function LinkBtn({ href, external, variant = 'secondary', size = 'md', className = '', children }: LinkBtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none transition-all duration-150'
  const sizes: Record<string, string> = {
    sm:  'px-4 py-2 text-xs',
    md:  'px-5 py-2.5 text-sm',
    lg:  'px-5 py-[0.8125rem] text-[0.9375rem]',
  }
  const variants: Record<BtnVariant, string> = {
    primary:   'bg-mint text-void font-semibold hover:bg-mint-hover active:scale-[0.982]',
    secondary: 'border border-wire-strong text-ink-2 hover:border-ink-4 hover:text-ink active:scale-[0.982]',
    ghost:     'text-ink-4 hover:text-ink-2 px-2 py-1.5',
  }
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </a>
  )
}

// #7 — StepTrack is now interactive: completed steps that have a valid back-nav target are clickable
interface StepTrackProps {
  current: Step
  navigableSteps?: Set<Step>
  onStepClick?: (step: Step) => void
}

function StepTrack({ current, navigableSteps, onStepClick }: StepTrackProps) {
  const idx = stepIndex(current)
  return (
    <nav aria-label="Migration steps" className="mb-10 select-none">
      <div className="flex items-start">
        {STEP_ORDER.map((s, i) => {
          const done      = i < idx
          const active    = i === idx
          const clickable = done && !!onStepClick && (navigableSteps?.has(s) ?? false)
          return (
            <Fragment key={s}>
              <div
                className={[
                  'flex flex-col items-center gap-1.5 flex-shrink-0',
                  clickable ? 'cursor-pointer group' : '',
                ].join(' ')}
                onClick={clickable ? () => onStepClick!(s) : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? `Go back to ${STEP_LABELS[s]}` : undefined}
                onKeyDown={clickable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStepClick!(s) }
                } : undefined}
              >
                <div className={[
                  'w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all duration-300',
                  done
                    ? `bg-emerald-50 border border-mint/40${clickable ? ' group-hover:bg-mint/10 group-hover:border-mint/60' : ''}`
                    : active
                    ? 'bg-mint shadow-[0_0_0_3px_rgba(0,229,160,0.20)]'
                    : 'bg-wire-subtle border border-wire',
                ].join(' ')}>
                  {done ? (
                    <span className="text-mint-dark flex items-center justify-center">
                      <IcoCheck />
                    </span>
                  ) : (
                    <span className={[
                      'font-mono text-[9px] font-bold leading-none',
                      active ? 'text-void' : 'text-ink-4',
                    ].join(' ')}>{i + 1}</span>
                  )}
                </div>
                <span className={[
                  'font-mono text-[8px] tracking-[0.09em] uppercase transition-colors duration-300 whitespace-nowrap',
                  active
                    ? 'text-ink font-semibold'
                    : done
                    ? `text-ink-3${clickable ? ' group-hover:text-ink' : ''}`
                    : 'text-ink-5',
                ].join(' ')}>{STEP_LABELS[s]}</span>
              </div>
              {i < STEP_ORDER.length - 1 && (
                <div className={[
                  'flex-1 h-px mt-[10px] mx-1 transition-colors duration-500',
                  i < idx ? 'bg-mint/35' : 'bg-wire-strong',
                ].join(' ')} />
              )}
            </Fragment>
          )
        })}
      </div>
    </nav>
  )
}

function ProgressTrack({ percent }: { percent: number }) {
  const pct = Math.min(Math.max(percent, 0), 100)
  const displayPct = pct === 0 ? 3 : pct  // fast-start: minimum fill so bar is never visibly empty
  return (
    <div className="relative h-[5px] bg-wire rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-mint rounded-full transition-all duration-700 ease-out"
        style={{ width: `${displayPct}%` }}
      />
      {pct > 2 && pct < 98 && (
        <div
          className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/40 to-transparent rounded-full animate-shimmer"
          style={{ left: `${pct - 12}%` }}
        />
      )}
    </div>
  )
}

function AlertWarn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
      <div className="w-1 h-1 rounded-full bg-amber-500 mt-[7px] flex-shrink-0" />
      <p className="font-mono text-[11px] text-amber-700 leading-relaxed">{children}</p>
    </div>
  )
}

function AlertErr({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6">
      <div className="w-1 h-1 rounded-full bg-red-500 mt-[7px] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] text-red-600 leading-relaxed">{message}</p>
        <p className="font-mono text-[10px] text-ink-4 mt-1.5">
          Need help?{' '}
          <a href="mailto:support@shoprift.app" className="text-portal hover:text-portal/80 transition-colors">
            support@shoprift.app
          </a>
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="text-ink-5 hover:text-ink-3 transition-colors flex-shrink-0 mt-0.5 p-0.5"
      >
        <IcoDismiss />
      </button>
    </div>
  )
}

function AlertOk({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-6">
      <div className="w-1 h-1 rounded-full bg-emerald-500 mt-[7px] flex-shrink-0" />
      <p className="font-mono text-[11px] text-emerald-700 leading-relaxed">{children}</p>
    </div>
  )
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 mb-1.5">
      {children}
    </p>
  )
}

function DataRow({
  label, value, accent, dim,
}: { label: string; value: React.ReactNode; accent?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className={`text-sm ${dim ? 'text-ink-5' : 'text-ink-3'}`}>{label}</span>
      <span className={`font-mono text-sm font-medium ${accent ? 'text-mint-dark' : dim ? 'text-ink-5' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

function MigrateWizard() {
  const searchParams      = useSearchParams()
  const shop              = searchParams.get('shop') ?? ''
  const host              = searchParams.get('host') ?? ''
  const billingJobId      = searchParams.get('billing_job_id')
  const billingError      = searchParams.get('billing_error')

  const [step,              setStep]             = useState<Step>('url')
  const [storeUrl,          setStoreUrl]          = useState('')
  const [urlError,          setUrlError]          = useState<string | undefined>()
  const [reconData,         setReconData]         = useState<ReconData | null>(null)
  const [storeData,         setStoreData]         = useState<StoreData | null>(null)
  const [extractProgress,   setExtractProgress]   = useState<ProgressEvent | null>(null)
  const [jobId,             setJobId]             = useState<string | null>(null)
  const [importStatus,      setImportStatus]      = useState<ImportStatus | null>(null)
  const [importResult,      setImportResult]      = useState<ImportResult | null>(null)
  const [error,             setError]             = useState<string | null>(null)
  const [trialUsed,         setTrialUsed]         = useState(false)
  const [trialProductUrls,  setTrialProductUrls]  = useState<string[]>([])
  const [remainingCount,    setRemainingCount]    = useState(0)
  const [verified,          setVerified]          = useState(false)
  const [verifyCode,        setVerifyCode]        = useState('')
  const [verifyAttemptId,   setVerifyAttemptId]   = useState<string | null>(null)
  const [verifyError,       setVerifyError]       = useState<string | null>(null)
  const [verifyLoading,     setVerifyLoading]     = useState(false)
  const [billingLoading,    setBillingLoading]    = useState(false)
  const [copied,            setCopied]            = useState(false)
  // #11 — duplicate migration detection
  const [hasPriorMigration, setHasPriorMigration] = useState(false)
  // #12 — intermediate state between recon complete and step transition
  const [checkingAccount,   setCheckingAccount]   = useState(false)
  // #13 — verification code expiry countdown
  const [verifySecsLeft,    setVerifySecsLeft]    = useState<number | null>(null)
  // session restore — set true when prior completed trial is found on mount
  const [sessionRestored,   setSessionRestored]   = useState(false)

  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const appBridgeRef    = useRef<ReturnType<typeof createApp> | null>(null)
  const tokenPromiseRef = useRef<Promise<string> | null>(null)
  // Once we confirm App Bridge token never works, skip the 500ms wait on all future calls.
  const appBridgeDeadRef = useRef<boolean>(false)
  const importStartRef  = useRef<number | null>(null)
  // #17 — focus target for step transitions
  const mainRef         = useRef<HTMLDivElement>(null)
  // #13 — when the current verification code expires
  const verifyExpRef    = useRef<number | null>(null)

  const clearPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])
  useEffect(() => () => clearPoll(), [clearPoll])

  // Track when first product is received so we can compute import ETA
  useEffect(() => {
    if (importStatus && importStatus.current > 0 && importStartRef.current === null) {
      importStartRef.current = Date.now()
    }
    if (!importStatus) {
      importStartRef.current = null
    }
  }, [importStatus])

  // #17 — shift keyboard focus to the content area on every step change
  useEffect(() => {
    mainRef.current?.focus()
  }, [step])

  // #13 — tick the verification code countdown every second while on the verifying step
  useEffect(() => {
    if (step !== 'verifying' || !verifyExpRef.current) {
      setVerifySecsLeft(null)
      return
    }
    const tick = () => {
      const left = Math.max(0, Math.round((verifyExpRef.current! - Date.now()) / 1000))
      setVerifySecsLeft(left)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [step])

  useEffect(() => {
    if (typeof window === 'undefined' || !host) return
    try {
      const apiKey = document.querySelector<HTMLMetaElement>('meta[name="shopify-api-key"]')?.content ?? ''
      if (apiKey) {
        const app = createApp({ apiKey, host })
        appBridgeRef.current = app
        // Pre-warm once. If token is empty, mark App Bridge dead so future calls skip the wait.
        const warmup = Promise.race([
          getSessionToken(app),
          new Promise<string>(r => setTimeout(() => r(''), 500)),
        ])
        warmup.then(t => { if (!t) appBridgeDeadRef.current = true })
        tokenPromiseRef.current = warmup
      }
    } catch { /* not in Shopify context */ }
  }, [host])

  // ── Session restore on mount ───────────────────────────────────────────────
  // Checks Supabase for prior jobs on load so the app remembers where the user
  // was if they navigated away or refreshed.
  useEffect(() => {
    if (!shop) return
    ;(async () => {
      const supabase = createBrowserSupabaseClient()

      // 1. Active import in progress — resume polling
      const { data: active } = await supabase
        .from('import_jobs')
        .select('id, status, store_url')
        .eq('account_id', shop)
        .not('status', 'in', '("complete","failed")')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (active) {
        setJobId(active.id)
        setStoreUrl(active.store_url)
        setStep('importing')
        setImportStatus({ status: active.status, current: 0, total: 0, message: 'Checking progress...' })
        const id = active.id
        const poll = async () => {
          try {
            const r = await fetch(`/api/import/status/${id}?shop=${encodeURIComponent(shop)}`)
            const d = await r.json() as { status: string; progress?: { current: number; total: number; message: string; phase?: string; collections_total?: number; collections_current?: number; images_total?: number; images_current?: number; assigns_total?: number; assigns_current?: number }; error?: string; result?: ImportResult }
            const prog = d.progress ?? { current: 0, total: 0, message: '' }
            setImportStatus({ status: d.status, current: prog.current, total: prog.total, message: prog.message, phase: prog.phase, collectionsTotal: prog.collections_total, collectionsCurrent: prog.collections_current, imagesTotal: prog.images_total, imagesCurrent: prog.images_current, assignsTotal: prog.assigns_total, assignsCurrent: prog.assigns_current })
            if (d.status === 'complete') {
              clearPoll()
              const result = d.result ?? { productsCreated: 0, productsFailed: 0, collectionsCreated: 0 }
              setImportResult(result)
              setStep('done')
            } else if (d.status === 'failed') {
              clearPoll()
              setError(d.error ?? 'Import failed. Contact support.')
              setStep('url')
            }
          } catch { /* network blip */ }
        }
        poll()
        clearPoll()
        pollRef.current = setInterval(poll, 3000)
        return
      }

      // 2. Completed full import — restore done step
      const { data: fullJob } = await supabase
        .from('import_jobs')
        .select('id, store_url, recon_data')
        .eq('account_id', shop)
        .eq('is_trial', false)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (fullJob?.recon_data) {
        const result = fullJob.recon_data as ImportResult
        if (result.productsCreated > 0) {
          setImportResult(result)
          setStep('done')
          return
        }
      }

      // 3. Completed trial — pre-fill URL so user can continue with one tap
      const { data: trialJob } = await supabase
        .from('import_jobs')
        .select('id, store_url, recon_data, trial_product_urls')
        .eq('account_id', shop)
        .eq('is_trial', true)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (trialJob?.recon_data) {
        const result = trialJob.recon_data as ImportResult
        if (result.productsCreated > 0) {
          setStoreUrl(trialJob.store_url)
          setTrialProductUrls(Array.isArray(trialJob.trial_product_urls) ? trialJob.trial_product_urls as string[] : [])
          setTrialUsed(true)
          setSessionRestored(true)
        }
      }
    })().catch(() => {})
  }, [shop]) // eslint-disable-line react-hooks/exhaustive-deps

  async function authHeaders(): Promise<Record<string, string>> {
    if (!appBridgeRef.current || appBridgeDeadRef.current) return {}
    try {
      // Use pre-warmed promise if still pending; otherwise get a fresh token.
      // Tokens are short-lived — always get a fresh one after the first use.
      const tokenPromise = tokenPromiseRef.current ?? getSessionToken(appBridgeRef.current)
      tokenPromiseRef.current = null
      const token = await Promise.race([
        tokenPromise,
        new Promise<string>(r => setTimeout(() => r(''), 500)),
      ])
      if (!token) { appBridgeDeadRef.current = true; throw new Error('empty token') }
      return { Authorization: `Bearer ${token}` }
    } catch { return {} }
  }

  function copyCode() {
    navigator.clipboard.writeText(verifyCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Return from Shopify billing ────────────────────────────────────────────
  useEffect(() => {
    if (billingError) {
      const billingErrorMessages: Record<string, string> = {
        charge_declined:   'Payment was declined. Please try a different payment method or contact your bank.',
        charge_cancelled:  'Payment was cancelled. Click below to try again.',
        session_expired:   'Your session expired. Please reinstall the app to continue.',
        no_session:        'Session not found. Please reinstall the app.',
        charge_not_active: 'Payment was not completed. Please try again or contact support@shoprift.app.',
      }
      setError(billingErrorMessages[billingError] ?? `Payment issue: ${billingError.replace(/_/g, ' ')}. Try again or contact support@shoprift.app.`)
    }
    if (!billingJobId) return
    const id = billingJobId
    setJobId(id)
    setStep('importing')
    track('payment_complete', { shop })
    const poll = async () => {
      try {
        const r = await fetch(`/api/import/status/${id}?shop=${encodeURIComponent(shop)}`, { headers: await authHeaders() })
        const d = await r.json() as {
          status: string
          progress?: { current: number; total: number; message: string; phase?: string; collections_total?: number; collections_current?: number; images_total?: number; images_current?: number; assigns_total?: number; assigns_current?: number }
          error?: string
          result?: ImportResult
        }
        const prog = d.progress ?? { current: 0, total: 0, message: '' }
        setImportStatus({ status: d.status, current: prog.current, total: prog.total, message: prog.message, phase: prog.phase, collectionsTotal: prog.collections_total, collectionsCurrent: prog.collections_current, imagesTotal: prog.images_total, imagesCurrent: prog.images_current, assignsTotal: prog.assigns_total, assignsCurrent: prog.assigns_current })
        if (d.status === 'complete') {
          clearPoll()
          const result = d.result ?? { productsCreated: 0, productsFailed: 0, collectionsCreated: 0 }
          setImportResult(result)
          track('migration_complete', { shop, products_created: result.productsCreated, collections_created: result.collectionsCreated })
          setStep('done')
        } else if (d.status === 'failed') {
          clearPoll()
          track('migration_failed', { shop, phase: 'import' })
          setError(d.error ?? 'Import failed. Contact support.')
          setStep('url')
        }
      } catch { /* network blip */ }
    }
    poll()
    clearPoll()
    pollRef.current = setInterval(poll, 3000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleCheckStore() {
    setUrlError(undefined)
    setError(null)
    setHasPriorMigration(false)
    const url = storeUrl.trim()
    if (!isDm2buyUrl(url)) {
      setUrlError('Enter a valid dm2buy store URL — e.g. https://yourstore.dm2buy.com')
      return
    }
    track('recon_started', { store_url: url, shop })
    setStep('reconning')
    try {
      const data = await runRecon(url)

      if (data.product_count === 0) {
        setError('This store has no products. Make sure the URL is correct and the store has published products.')
        setStep('url')
        return
      }

      setReconData(data)
      track('recon_complete', { store_url: data.store_url, product_count: data.product_count, shop })

      // #12 — recon complete; now doing account checks — show different label
      setCheckingAccount(true)

      if (shop) {
        const supabase = createBrowserSupabaseClient()
        const { data: trialRow } = await supabase
          .from('import_jobs')
          .select('trial_product_urls')
          .eq('account_id', shop)
          .eq('store_url', data.store_url)
          .eq('is_trial', true)
          .eq('status', 'complete')
          .maybeSingle()

        if (trialRow) {
          setTrialUsed(true)
          setTrialProductUrls(Array.isArray(trialRow.trial_product_urls) ? trialRow.trial_product_urls as string[] : [])
          setRemainingCount(Math.max(0, data.product_count - 5))
        }

        // #11 — check for a prior completed full migration of this store
        const { data: priorJob } = await supabase
          .from('import_jobs')
          .select('id')
          .eq('account_id', shop)
          .eq('store_url', data.store_url)
          .eq('is_trial', false)
          .eq('status', 'complete')
          .maybeSingle()

        if (priorJob) setHasPriorMigration(true)

        const { data: va } = await supabase
          .from('verification_attempts')
          .select('id, code')
          .eq('account_id', shop)
          .eq('store_url', data.store_url)
          .eq('status', 'verified')
          .maybeSingle()

        if (va) {
          setCheckingAccount(false)
          setVerified(true)
          if (va.code) setVerifyCode(va.code)
          setStep('preview')
        } else {
          const vRes = await fetch('/api/verify/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ shop, storeUrl: data.store_url }),
          })
          setCheckingAccount(false)
          const vData = await vRes.json() as { code?: string; attemptId?: string; error?: string }
          if (!vRes.ok || !vData.code) {
            const msg = vRes.status === 401
              ? 'Session expired. Please refresh the page and try again.'
              : vData.error ?? 'Could not start verification. Please try again.'
            throw new Error(msg)
          }
          setVerifyCode(vData.code)
          setVerifyAttemptId(vData.attemptId ?? null)
          // #13 — record when this code expires (~15 min)
          verifyExpRef.current = Date.now() + 15 * 60 * 1000
          setStep('verifying')
          track('verification_started', { store_url: data.store_url, shop })
        }
      } else {
        setCheckingAccount(false)
        setStep('preview')
      }
    } catch (err) {
      setCheckingAccount(false)
      setError(err instanceof Error ? err.message : 'Store scan failed. Check the URL and try again.')
      setStep('url')
    }
  }

  async function handleVerifyCheck() {
    setVerifyLoading(true)
    setVerifyError(null)
    try {
      const r = await fetch('/api/verify/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ shop, attemptId: verifyAttemptId, storeUrl: reconData!.store_url }),
      })
      const d = await r.json() as { verified?: boolean; error?: string; expired?: boolean }
      if (d.expired) {
        const vRes = await fetch('/api/verify/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ shop, storeUrl: reconData!.store_url }),
        })
        const vData = await vRes.json() as { code?: string; attemptId?: string }
        if (vData.code) {
          setVerifyCode(vData.code)
          setVerifyAttemptId(vData.attemptId ?? null)
          // #13 — reset expiry timer for new code
          verifyExpRef.current = Date.now() + 15 * 60 * 1000
          setVerifySecsLeft(null) // will retrigger countdown effect via verifyExpRef update
          setVerifyError('Code expired. A new one is ready — add the new product name and try again.')
        }
        return
      }
      if (d.verified) {
        setVerified(true)
        track('verification_complete', { store_url: reconData?.store_url, shop })
        setStep('preview')
      } else {
        setVerifyError('Product not found. Check the name matches exactly, then try again.')
      }
    } catch {
      setVerifyError('Check failed. Try again.')
    } finally {
      setVerifyLoading(false)
    }
  }

  async function handleRefreshCode() {
    if (!reconData) return
    setVerifyLoading(true)
    setVerifyError(null)
    try {
      const vRes = await fetch('/api/verify/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ shop, storeUrl: reconData.store_url }),
      })
      const vData = await vRes.json() as { code?: string; attemptId?: string; error?: string }
      if (!vRes.ok || !vData.code) {
        setVerifyError(vData.error ?? 'Could not get a new code. Please try again.')
        return
      }
      setVerifyCode(vData.code)
      setVerifyAttemptId(vData.attemptId ?? null)
      verifyExpRef.current = Date.now() + 15 * 60 * 1000
      setVerifySecsLeft(null)
      setVerifyError(null)
    } catch {
      setVerifyError('Could not get a new code. Please try again.')
    } finally {
      setVerifyLoading(false)
    }
  }

  async function handleTrialImport() {
    if (!reconData) return
    track('trial_import_started', { store_url: reconData.store_url, product_count: reconData.product_count, shop })
    setStep('trialing')
    setExtractProgress(null)
    setImportStatus(null)
    setError(null)
    try {
      const allData = await extract(reconData.store_url, reconData.store_id, (ev) => setExtractProgress(ev))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const realProducts  = verifyCode ? allData.products.filter((p: any) => !(p.name ?? '').includes(verifyCode)) : allData.products
      const trialProducts = realProducts.slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trialUrls     = trialProducts.map((p: any) => p.product_url as string)
      setTrialProductUrls(trialUrls)
      setRemainingCount(Math.max(0, realProducts.length - 5))
      // Cache full filtered data so handleFullImport can skip re-extraction
      setStoreData({ ...allData, products: realProducts })

      const res = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ shop, storeUrl: reconData.store_url, storeData: { ...allData, products: trialProducts }, isTrial: true, trialProductUrls: trialUrls }),
      })
      const respData = await res.json() as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(respData.error ?? 'Trial import failed to start.')
      const id = respData.jobId!
      setJobId(id)

      const poll = async () => {
        try {
          const r = await fetch(`/api/import/status/${id}?shop=${encodeURIComponent(shop)}`, { headers: await authHeaders() })
          const d = await r.json() as { status: string; progress?: { current: number; total: number; message: string; phase?: string; collections_total?: number; collections_current?: number; images_total?: number; images_current?: number; assigns_total?: number; assigns_current?: number }; error?: string; result?: ImportResult }
          const prog = d.progress ?? { current: 0, total: 0, message: '' }
          setImportStatus({ status: d.status, current: prog.current, total: prog.total, message: prog.message, phase: prog.phase, collectionsTotal: prog.collections_total, collectionsCurrent: prog.collections_current, imagesTotal: prog.images_total, imagesCurrent: prog.images_current, assignsTotal: prog.assigns_total, assignsCurrent: prog.assigns_current })
          if (d.status === 'complete') {
            clearPoll()
            const result = d.result ?? { productsCreated: 0, productsFailed: 0, collectionsCreated: 0 }
            setImportResult(result)
            setTrialUsed(true)
            track('trial_import_complete', { shop, products_created: result.productsCreated })
            setStep('trial_done')
          } else if (d.status === 'failed') {
            clearPoll()
            track('migration_failed', { shop, phase: 'trial' })
            setError(d.error ?? 'Trial import failed. Contact support.')
            setStep('preview')
          }
        } catch { /* network blip */ }
      }
      poll()
      clearPoll()
      pollRef.current = setInterval(poll, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trial import failed. Please try again.')
      setStep('preview')
    }
  }

  async function handleFullImport() {
    if (!reconData) return
    // Trial already extracted and cached full data — skip re-extraction
    if (storeData) {
      setStep('results')
      return
    }
    setStep('extracting')
    setExtractProgress(null)
    setError(null)
    try {
      const allData = await extract(reconData.store_url, reconData.store_id, (ev) => setExtractProgress(ev))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filtered = verifyCode ? { ...allData, products: allData.products.filter((p: any) => !(p.name ?? '').includes(verifyCode)) } : allData
      setStoreData(filtered)
      setStep('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed. Please try again.')
      setStep(trialUsed ? 'trial_done' : 'preview')
    }
  }

  async function handleImport() {
    if (!storeData || !reconData || !tier) return
    setError(null)

    if (tier.plan === 'Enterprise') {
      window.open('mailto:support@shoprift.app?subject=Enterprise%20Migration%20Enquiry', '_blank')
      return
    }

    if (tier.isFree) {
      setStep('importing')
      try {
        const res = await fetch('/api/import/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ shop, storeUrl: reconData.store_url, storeData, ...(trialProductUrls.length > 0 ? { skipUrls: trialProductUrls } : {}) }),
        })
        const data = await res.json() as { jobId?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Import failed to start.')
        const id = data.jobId!
        setJobId(id)

        const poll = async () => {
          try {
            const r = await fetch(`/api/import/status/${id}?shop=${encodeURIComponent(shop)}`, { headers: await authHeaders() })
            const d = await r.json() as { status: string; progress?: { current: number; total: number; message: string; phase?: string; collections_total?: number; collections_current?: number; images_total?: number; images_current?: number; assigns_total?: number; assigns_current?: number }; error?: string; result?: ImportResult }
            const prog = d.progress ?? { current: 0, total: 0, message: '' }
            setImportStatus({ status: d.status, current: prog.current, total: prog.total, message: prog.message, phase: prog.phase, collectionsTotal: prog.collections_total, collectionsCurrent: prog.collections_current, imagesTotal: prog.images_total, imagesCurrent: prog.images_current, assignsTotal: prog.assigns_total, assignsCurrent: prog.assigns_current })
            if (d.status === 'complete') {
              clearPoll()
              const result = d.result ?? { productsCreated: 0, productsFailed: 0, collectionsCreated: 0 }
              setImportResult(result)
              track('migration_complete', { shop, products_created: result.productsCreated, collections_created: result.collectionsCreated })
              setStep('done')
            } else if (d.status === 'failed') {
              clearPoll()
              track('migration_failed', { shop, phase: 'import_free' })
              setError(d.error ?? 'Import failed. Contact support.')
              setStep('results')
            }
          } catch { /* network blip */ }
        }
        poll()
        clearPoll()
        pollRef.current = setInterval(poll, 3000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start import.')
        setStep('results')
      }
      return
    }

    setBillingLoading(true)
    track('payment_initiated', { shop, plan: tier.plan, price: tier.price, product_count: storeData.products.length })
    try {
      const amount = parseInt(tier.price.replace(/[₹,]/g, ''), 10)
      const res = await fetch('/api/payment/billing/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ shop, storeUrl: reconData.store_url, storeData, skipUrls: trialProductUrls.length > 0 ? trialProductUrls : undefined, amount, planName: `Shoprift ${tier.plan}` }),
      })
      const d = await res.json() as { confirmationUrl?: string; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Failed to create payment.')
      // App Bridge Redirect uses postMessage which is unreliable in current Shopify admin.
      window.top!.location.href = d.confirmationUrl!
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment setup failed. Try again.')
      setBillingLoading(false)
    }
  }

  // #7 — step back-navigation handler; only preview and results are safe destinations
  function handleStepNav(s: Step) {
    if (s === 'preview' && reconData) setStep('preview')
    else if (s === 'results' && storeData) setStep('results')
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const tier           = reconData ? priceTier(reconData.product_count) : null
  const extractPercent = extractProgress && extractProgress.total > 0
    ? Math.round((extractProgress.current / extractProgress.total) * 100) : 0
  const importPercent  = importStatus ? calcImportProgress(importStatus) : 0
  const trialExtDone   = extractProgress != null && extractProgress.total > 0 && extractProgress.current >= extractProgress.total
  const showWarnBanner = step === 'extracting' || step === 'trialing' || step === 'importing'

  // #7 — steps that have a valid back-navigation target
  const navigableSteps: Set<Step> = new Set([
    ...(reconData ? ['preview' as Step] : []),
    ...(storeData ? ['results' as Step] : []),
  ])

  // #13 — format countdown as M:SS
  const verifyCountdown = verifySecsLeft != null
    ? `${Math.floor(verifySecsLeft / 60)}:${String(verifySecsLeft % 60).padStart(2, '0')}`
    : null

  let importEta: string | null = null
  if (importStatus && importStartRef.current) {
    const elapsed = Date.now() - importStartRef.current
    const pct = importPercent / 100
    if (elapsed >= 3000 && pct > 0.05 && pct < 1) {
      const etaMs = (elapsed / pct) - elapsed
      if (etaMs < 15000)      importEta = '< 15 sec'
      else if (etaMs < 60000) importEta = `~${Math.round(etaMs / 1000)} sec`
      else {
        const mins = Math.round(etaMs / 60000)
        importEta = `~${mins} min${mins !== 1 ? 's' : ''}`
      }
    }
  }

  // suppress unused warning — verified is set to track auth state for other flows
  void verified
  void jobId

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-page">
      {/* #17 — focus target; tabIndex=-1 allows focus() without showing a ring */}
      <div
        ref={mainRef}
        tabIndex={-1}
        className="outline-none max-w-[592px] mx-auto px-6 py-8 pb-24"
      >

        <StepTrack current={step} navigableSteps={navigableSteps} onStepClick={handleStepNav} />

        {/* Keep-window-open notice */}
        {showWarnBanner && (
          <AlertWarn>
            {step === 'trialing'   ? "Adding trial products to Shopify — keep this window open." :
             step === 'extracting' ? `Reading your store — ${reconData?.estimated_import_label ?? 'a few minutes'}. You can switch tabs but don't close this window.` :
                                     "Products are being added to your Shopify store. Don't close this window."}
          </AlertWarn>
        )}

        {/* Error */}
        {error && <AlertErr message={error} onDismiss={() => setError(null)} />}

        {/* ── URL input ─────────────────────────────────────────────────── */}
        {(step === 'url' || step === 'reconning') && (
          <div>
            {sessionRestored && trialUsed && storeUrl && (
              <AlertOk>
                Trial complete for <span className="font-semibold">{storeUrl.replace(/^https?:\/\//, '')}</span>. Scan again to import the rest.
              </AlertOk>
            )}
            <div className="mb-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4 mb-5">
                dm2buy → Shopify
              </p>
              <h1 className="text-[2.625rem] font-black tracking-[-0.04em] text-ink leading-[1.05] mb-4">
                Move your store.
              </h1>
              <p className="text-[0.9375rem] text-ink-3 leading-relaxed max-w-[40ch] mb-6">
                Products, images, and collections land directly in your Shopify admin. No CSV. No re-entering data.
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {['Products', 'Images', 'Collections'].map(f => (
                  <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wire-subtle border border-wire text-[11px] font-mono text-ink-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-mint-dark/60 flex-shrink-0" />
                    {f}
                  </span>
                ))}
                <span className="font-mono text-[11px] text-ink-4">→ directly into Shopify admin</span>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); if (step === 'url') handleCheckStore() }}>
              <label htmlFor="store-url" className="sr-only">Store URL</label>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    id="store-url"
                    type="url"
                    value={storeUrl}
                    onChange={(e) => { setStoreUrl(e.target.value); setUrlError(undefined) }}
                    placeholder="https://yourstore.dm2buy.com"
                    autoComplete="url"
                    disabled={step === 'reconning'}
                    className={[
                      'w-full bg-surface rounded-xl px-4 py-3.5',
                      'font-mono text-sm text-ink placeholder:text-ink-5',
                      'border transition-all duration-200 focus:outline-none',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      urlError
                        ? 'border-red-300 focus:border-red-400'
                        : 'border-wire-strong focus:border-mint focus:ring-2 focus:ring-mint/10',
                    ].join(' ')}
                  />
                </div>
                <Btn
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={step === 'reconning'}
                  className="flex-shrink-0"
                >
                  {/* #12 — differentiate "scanning store" from "checking your account" */}
                  {step === 'reconning'
                    ? (checkingAccount ? 'Checking...' : 'Scanning...')
                    : <><span>Scan store</span><IcoArrow /></>}
                </Btn>
              </div>
              {urlError && (
                <p className="mt-2 font-mono text-[11px] text-red-500">{urlError}</p>
              )}
            </form>
          </div>
        )}

        {/* ── Ownership verification ─────────────────────────────────────── */}
        {step === 'verifying' && reconData && (
          <div>
            <div className="mb-8">
              <RowLabel>Step 2 — Ownership verification</RowLabel>
              <h2 className="text-[1.875rem] font-bold tracking-[-0.03em] text-ink leading-tight mb-1.5">
                Confirm you own this store.
              </h2>
              <p className="text-[0.9375rem] text-ink-3">
                We verify ownership before any data moves.
              </p>
            </div>

            {/* Timeline instructions */}
            <ol className="mb-8 relative">
              {[
                'Log in to your dm2buy seller dashboard.',
                'Go to Products → Add Product.',
                'Set the product name to exactly the code below.',
                'Save — draft status is fine.',
                'Click "Verify now" below.',
              ].map((instruction, i, arr) => (
                <li key={i} className="flex gap-4 relative">
                  {i < arr.length - 1 && (
                    <div className="absolute left-[8px] top-7 bottom-0 w-px bg-wire" />
                  )}
                  <div className="flex-shrink-0 w-[17px] h-[17px] rounded-full border border-wire-strong flex items-center justify-center mt-[2px]">
                    <span className="font-mono text-[8.5px] text-ink-4">{i + 1}</span>
                  </div>
                  <p className="text-[0.9rem] text-ink-2 pb-[18px] leading-snug">{instruction}</p>
                </li>
              ))}
            </ol>

            {/* Code display */}
            <div className="mb-8">
              <RowLabel>Your verification code</RowLabel>
              <div className="flex items-center justify-between gap-4 bg-surface border border-wire rounded-xl px-5 py-4">
                <code className="font-mono text-xl text-mint-dark tracking-[0.06em] break-all select-all">
                  {verifyCode}
                </code>
                <button
                  type="button"
                  onClick={copyCode}
                  className="flex-shrink-0 flex items-center gap-1.5 font-mono text-[11px] text-ink-4 hover:text-ink-2 transition-colors duration-150 py-1"
                  aria-label="Copy verification code"
                >
                  <IcoCopy />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              {/* #13 — show countdown; turns red when expired */}
              <div className="mt-2 flex items-center justify-between">
                <p className="font-mono text-[10px] text-ink-5">
                  Product name must match exactly. Delete it after verification.
                </p>
                {verifyCountdown !== null && (
                  verifySecsLeft === 0 ? (
                    <button
                      onClick={handleRefreshCode}
                      disabled={verifyLoading}
                      className="font-mono text-[10px] flex-shrink-0 ml-3 text-mint hover:underline disabled:opacity-50"
                    >
                      Code expired — get new code
                    </button>
                  ) : (
                    <p className="font-mono text-[10px] flex-shrink-0 ml-3 text-ink-5">
                      {`Expires ${verifyCountdown}`}
                    </p>
                  )
                )}
              </div>
            </div>

            {verifyError && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="font-mono text-[11px] text-red-600">{verifyError}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Btn variant="primary" loading={verifyLoading} onClick={handleVerifyCheck}>
                Verify now <IcoArrow />
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  setReconData(null); setVerifyCode(''); setVerifyAttemptId(null);
                  setVerifyError(null); setVerifyLoading(false); setVerifySecsLeft(null);
                  setTrialUsed(false); setTrialProductUrls([]);
                  verifyExpRef.current = null; setStep('url');
                }}
              >
                Change URL
              </Btn>
            </div>
          </div>
        )}

        {/* ── Store preview ──────────────────────────────────────────────── */}
        {step === 'preview' && reconData && tier && (
          <div>
            <div className="mb-7">
              <RowLabel>Step 3 — Store preview</RowLabel>
              <h2 className="text-[1.875rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                {reconData.store_name}
              </h2>
              <p className="font-mono text-[11px] text-ink-4 mt-1">{reconData.store_url}</p>
            </div>

            {/* #11 — warn if store was previously migrated */}
            {hasPriorMigration && (
              <AlertWarn>
                This store was already migrated to this Shopify account. Importing again will create duplicate products.
              </AlertWarn>
            )}

            {/* Stats bar */}
            <div className="flex border border-wire rounded-xl overflow-hidden mb-7">
              {[
                { n: reconData.product_count,    label: 'products'    },
                { n: reconData.collection_count, label: 'collections' },
                { n: reconData.image_count,      label: 'images'      },
              ].map(({ n, label }, i) => (
                <div key={label} className={`flex-1 px-5 py-4 bg-surface ${i > 0 ? 'border-l border-wire' : ''}`}>
                  <p className="font-mono text-[2.4rem] font-black text-ink leading-none mb-1.5 tabular-nums tracking-[-0.02em]">{n}</p>
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-ink-4">{label}</p>
                </div>
              ))}
            </div>

            {/* Price row */}
            <div className="flex items-end justify-between pb-6 mb-5 border-b border-wire-subtle">
              <div>
                <RowLabel>Plan</RowLabel>
                <p className="text-[0.9375rem] text-ink-3">{tier.plan}</p>
              </div>
              <div className="text-right">
                <RowLabel>Price</RowLabel>
                <p className="font-mono text-[1.6rem] font-semibold text-ink tracking-[-0.02em]">{tier.price}</p>
              </div>
            </div>

            <p className="font-mono text-[10px] text-ink-4 mb-6">
              Est. {reconData.estimated_import_label}
            </p>

            {tier.isFree && (
              <AlertOk>Preview mode — stores with 3 or fewer products import free.</AlertOk>
            )}

            <div className="flex flex-col gap-2.5">
              {!trialUsed && !tier.isFree && (
                <Btn variant="secondary" size="lg" onClick={handleTrialImport} className="w-full">
                  Try free — import 5 products first
                </Btn>
              )}
              {tier.plan === 'Enterprise' ? (
                <LinkBtn href="mailto:support@shoprift.app?subject=Enterprise%20Migration%20Enquiry" variant="primary" size="lg" className="w-full">
                  Contact us for Enterprise <IcoArrow />
                </LinkBtn>
              ) : (
                <Btn variant="primary" size="lg" onClick={handleFullImport} className="w-full">
                  {trialUsed
                    ? `Import ${remainingCount} remaining — ${tier.price}`
                    : tier.isFree
                    ? 'Import to Shopify — free'
                    : `Import all — ${tier.price}`}
                  <IcoArrow />
                </Btn>
              )}
              <Btn
                variant="ghost"
                onClick={() => {
                  setReconData(null); setVerifyCode(''); setVerifyAttemptId(null);
                  setVerifyError(null); setVerifyLoading(false); setVerifySecsLeft(null);
                  setTrialUsed(false); setTrialProductUrls([]);
                  setVerified(false); setHasPriorMigration(false);
                  verifyExpRef.current = null; setStep('url');
                }}
              >
                Change URL
              </Btn>
            </div>
          </div>
        )}

        {/* ── Trial import progress ──────────────────────────────────────── */}
        {step === 'trialing' && reconData && (
          <div>
            <div className="mb-8">
              <RowLabel>{trialExtDone ? 'Adding to Shopify' : 'Reading products'}</RowLabel>
              <h2 className="text-[1.875rem] font-bold tracking-[-0.03em] text-ink">
                Importing 5 trial products.
              </h2>
            </div>

            <ProgressTrack percent={trialExtDone ? importPercent : extractPercent} />

            <div className="flex items-center justify-between mt-3">
              <p className="font-mono text-[11px] text-ink-4">
                {trialExtDone
                  ? (importStatus?.message || 'Adding to Shopify...')
                  : extractProgress
                    ? `${extractProgress.current} / ${extractProgress.total} products scanned`
                    : 'Starting scan...'}
              </p>
              <p className="font-mono text-[11px] text-ink-5">
                {trialExtDone ? importPercent : extractPercent}%
              </p>
            </div>

            {!trialExtDone && (
              <div className="mt-6 flex justify-center">
                <Btn variant="ghost" onClick={() => { clearPoll(); setExtractProgress(null); setImportStatus(null); setStep('preview') }}>
                  Cancel
                </Btn>
              </div>
            )}
          </div>
        )}

        {/* ── Trial done ────────────────────────────────────────────────── */}
        {step === 'trial_done' && importResult && (
          <div>
            {importResult.productsCreated === 0 ? (
              /* Zero products — surface the error clearly */
              <>
                <div className="flex items-center gap-2 text-red-500 font-mono text-xs mb-5">
                  Trial import failed — 0 products added
                </div>
                <div className="mb-6">
                  <h2 className="text-[1.875rem] font-bold tracking-[-0.03em] text-ink leading-tight mb-1.5">
                    Nothing was imported.
                  </h2>
                  <p className="text-[0.9375rem] text-ink-3 leading-relaxed">
                    {(importResult as ImportResult & { errors?: string[] }).errors?.[0]
                      ? `Shopify error: ${(importResult as ImportResult & { errors?: string[] }).errors![0]}`
                      : 'Shopify rejected all products. This usually means the app connection needs to be refreshed — try reinstalling Shoprift from the Shopify App Store.'}
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <Btn variant="primary" size="lg" onClick={() => setStep('preview')} className="w-full">
                    Try again <IcoArrow />
                  </Btn>
                  <p className="font-mono text-[10px] text-ink-4 text-center">
                    Still failing?{' '}
                    <a href="mailto:support@shoprift.app" className="text-portal hover:text-portal/80 transition-colors">
                      support@shoprift.app
                    </a>
                  </p>
                </div>
              </>
            ) : (
              /* Success */
              <>
                <div className="flex items-center gap-2 text-mint-dark font-mono text-xs mb-5">
                  <IcoCheck /> {importResult.productsCreated} product{importResult.productsCreated !== 1 ? 's' : ''} added to Shopify
                </div>

                <div className="mb-7">
                  <h2 className="text-[1.875rem] font-bold tracking-[-0.03em] text-ink leading-tight mb-1.5">
                    Trial complete.
                  </h2>
                  <p className="text-[0.9375rem] text-ink-3">
                    Check them in your Shopify admin, then import the rest.
                  </p>
                </div>

                <div className="border border-wire rounded-xl overflow-hidden mb-7 divide-y divide-wire-subtle">
                  <DataRow label="Trial products imported" value={String(importResult.productsCreated)} accent />
                  {remainingCount > 0 && (
                    <DataRow label="Remaining products" value={String(remainingCount)} />
                  )}
                </div>

                <div className="flex flex-col gap-2.5">
                  <LinkBtn href={shop ? `https://${shop}/admin/products` : '#'} external={!!shop} variant="secondary">
                    View in Shopify
                  </LinkBtn>
                  {remainingCount > 0 && tier && (
                    <Btn variant="primary" size="lg" onClick={handleFullImport} className="w-full">
                      Import {remainingCount} remaining — {tier.price} <IcoArrow />
                    </Btn>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Full extraction progress ───────────────────────────────────── */}
        {step === 'extracting' && reconData && (
          <div>
            <div className="mb-8">
              <RowLabel>Collecting data</RowLabel>
              <h2 className="text-[1.875rem] font-bold tracking-[-0.03em] text-ink">
                Reading your store.
              </h2>
            </div>

            <ProgressTrack percent={extractPercent} />

            <div className="flex items-center justify-between mt-3">
              <p className="font-mono text-[11px] text-ink-4">
                {extractProgress
                  ? `${extractProgress.current} / ${extractProgress.total} products`
                  : 'Starting...'}
              </p>
              <p className="font-mono text-[11px] text-ink-3">{extractPercent}%</p>
            </div>

            {extractProgress?.message && (
              <p className="mt-2 font-mono text-[10px] text-ink-5">{extractProgress.message}</p>
            )}

            <div className="mt-6 flex justify-center">
              <Btn variant="ghost" onClick={() => { setExtractProgress(null); setStep('preview') }}>
                Cancel
              </Btn>
            </div>
          </div>
        )}

        {/* ── Results / billing gate ─────────────────────────────────────── */}
        {step === 'results' && reconData && tier && storeData && (
          <div>
            <div className="mb-7">
              <RowLabel>Step 5 — Ready to import</RowLabel>
              <h2 className="text-[1.875rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                Your data is ready.
              </h2>
            </div>

            {/* #11 — duplicate warning on results step too */}
            {hasPriorMigration && (
              <AlertWarn>
                This store was already migrated to this Shopify account. Proceeding will create duplicate products.
              </AlertWarn>
            )}

            <div className="border border-wire rounded-xl overflow-hidden mb-5 divide-y divide-wire-subtle">
              <DataRow label="Products collected" value={String(storeData.products.length)} accent />
              <DataRow label="Collections" value={String(storeData.categories.length)} />
              {trialProductUrls.length > 0 && (
                <DataRow label="Already in Shopify — skipped" value={String(trialProductUrls.length)} dim />
              )}
            </div>

            {/* Product preview */}
            {storeData.products.length > 0 && (
              <div className="mb-6">
                <RowLabel>Preview</RowLabel>
                <div className="border border-wire-subtle rounded-xl overflow-hidden divide-y divide-[#F4F4F4]">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(storeData.products as any[]).slice(0, 3).map((p) => (
                    <div key={p.product_url ?? p.name} className="flex items-center justify-between px-5 py-3 bg-surface">
                      <span className="text-sm text-ink-3 truncate mr-4">{p.name}</span>
                      <span className="font-mono text-xs text-ink-4 flex-shrink-0 tabular-nums">₹{p.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing summary */}
            <div className="flex items-end justify-between pb-6 mb-5 border-b border-wire-subtle">
              <div>
                <RowLabel>Plan</RowLabel>
                <p className="text-[0.9375rem] text-ink-3">{tier.plan}</p>
              </div>
              <div className="text-right">
                <RowLabel>Total</RowLabel>
                <p className="font-mono text-[1.6rem] font-semibold text-ink tracking-[-0.02em]">{tier.price}</p>
              </div>
            </div>

            {tier.plan === 'Enterprise' ? (
              <LinkBtn href="mailto:support@shoprift.app?subject=Enterprise%20Migration%20Enquiry" variant="primary" size="lg" className="w-full mb-3">
                Contact us for Enterprise <IcoArrow />
              </LinkBtn>
            ) : (
              <Btn
                variant="primary"
                size="lg"
                onClick={handleImport}
                loading={billingLoading}
                className="w-full mb-3"
              >
                {tier.isFree
                  ? 'Import to Shopify — free'
                  : billingLoading
                  ? 'Redirecting to payment...'
                  : `Pay ${tier.price} and import`}
                {!billingLoading && <IcoArrow />}
              </Btn>
            )}

            <p className="font-mono text-[10px] text-ink-5 text-center leading-relaxed">
              {tier.isFree
                ? 'No charge — stores with 3 or fewer products are free.'
                : <>
                    Payment via Shopify Billing · Full refund if import fails ·{' '}
                    <a href="https://shoprift.app/refund-policy" target="_blank" rel="noopener noreferrer"
                       className="text-portal hover:text-portal/80 transition-colors">
                      Refund policy
                    </a>
                  </>}
            </p>

            <div className="mt-4 flex justify-center">
              <Btn variant="ghost" onClick={() => setStep('preview')}>
                Back to preview
              </Btn>
            </div>
          </div>
        )}

        {/* ── Import progress ───────────────────────────────────────────── */}
        {step === 'importing' && (
          <div>
            <div className="mb-8">
              <RowLabel>Importing</RowLabel>
              <h2 className="text-[1.875rem] font-bold tracking-[-0.03em] text-ink">
                Adding products to Shopify.
              </h2>
            </div>

            {importStatus && importStatus.total > 0 ? (
              <>
                {/* Main weighted progress bar */}
                <ProgressTrack percent={importPercent} />
                <div className="flex items-center justify-between mt-2 mb-6">
                  <p className="font-mono text-[11px] text-ink-4">
                    {importEta ? `${importEta} remaining` : (importStatus.current > 0 ? `${importStatus.current} / ${importStatus.total} products` : 'Starting...')}
                  </p>
                  <p className="font-mono text-[11px] text-ink-3">{importPercent}%</p>
                </div>

                {/* Phase checklist with per-phase mini progress bars */}
                {(() => {
                  const PHASES = ['products', 'images', 'collections', 'assigns']
                  const curPhase = importStatus.phase ?? 'products'
                  const curIdx = PHASES.indexOf(curPhase)
                  const isComplete = importStatus.status === 'complete'

                  function stepState(id: string): 'done' | 'active' | 'pending' {
                    if (isComplete) return 'done'
                    const idx = PHASES.indexOf(id)
                    if (idx < curIdx) return 'done'
                    if (idx === curIdx) return 'active'
                    return 'pending'
                  }

                  function phaseBarPct(state: 'done' | 'active' | 'pending', current: number, total: number): number {
                    if (state === 'done') return 100
                    if (total > 0) return Math.round((current / total) * 100)
                    return 0
                  }

                  function phaseCountText(state: 'done' | 'active' | 'pending', current: number, total: number): string {
                    if (state === 'done') return total > 0 ? `${total} done` : 'done'
                    if (state === 'active') return total > 0 ? `${current} / ${total}` : 'in progress'
                    return total > 0 ? `0 / ${total}` : '—'
                  }

                  const items = [
                    { id: 'products',    label: 'Products created',        current: importStatus.current,                 total: importStatus.total },
                    { id: 'images',      label: 'Images uploaded',          current: importStatus.imagesCurrent ?? 0,      total: importStatus.imagesTotal ?? 0 },
                    { id: 'collections', label: 'Collections created',      current: importStatus.collectionsCurrent ?? 0, total: importStatus.collectionsTotal ?? 0 },
                    { id: 'assigns',     label: 'Assigned to collections',  current: importStatus.assignsCurrent ?? 0,     total: importStatus.assignsTotal ?? 0 },
                  ]

                  return (
                    <div className="border border-wire rounded-xl overflow-hidden bg-surface divide-y divide-wire/40">
                      {items.map(({ id, label, current, total }) => {
                        const state = stepState(id)
                        const barPct = phaseBarPct(state, current, total)
                        const countText = phaseCountText(state, current, total)
                        return (
                          <div key={id} className="px-5 py-3">
                            <div className="flex items-center gap-3 mb-1.5">
                              <span className="flex-shrink-0 w-4 flex items-center justify-center">
                                {state === 'done' && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-mint-dark">
                                    <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeOpacity="0.3"/>
                                    <path d="M4.5 7L6.5 9L9.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                                {state === 'active' && (
                                  <span className="block w-3.5 h-3.5 border-[1.5px] border-wire border-t-mint rounded-full animate-spin" />
                                )}
                                {state === 'pending' && (
                                  <span className="block w-3 h-3 rounded-full border border-wire/60" />
                                )}
                              </span>
                              <span className={`font-mono text-[11px] flex-1 ${state === 'pending' ? 'text-ink-4' : 'text-ink'}`}>
                                {label}
                              </span>
                              <span className={`font-mono text-[11px] flex-shrink-0 tabular-nums ${state === 'done' ? 'text-mint-dark' : 'text-ink-4'}`}>
                                {countText}
                              </span>
                            </div>
                            {/* Mini progress bar — aligned with content, not the icon */}
                            <div className="ml-7 h-[2px] bg-wire/30 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${state === 'done' ? 'bg-mint-dark' : state === 'active' ? 'bg-mint' : 'bg-transparent'}`}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 border-[1.5px] border-wire border-t-mint rounded-full animate-spin flex-shrink-0" />
                <p className="font-mono text-[11px] text-ink-4">Starting import...</p>
              </div>
            )}
          </div>
        )}

        {/* ── Done ──────────────────────────────────────────────────────── */}
        {step === 'done' && importResult && (
          <div>
            <div className="flex items-center gap-2 text-mint-dark font-mono text-xs mb-5">
              <IcoCheck /> Migration complete
            </div>

            <h2 className="text-[2.625rem] font-black tracking-[-0.04em] text-ink leading-[1.05] mb-9">
              {importResult.productsCreated}{' '}
              product{importResult.productsCreated !== 1 ? 's' : ''} in Shopify.
            </h2>

            {/* Stats */}
            <div className="flex border border-wire rounded-xl overflow-hidden mb-8">
              <div className="flex-1 px-5 py-4 bg-surface">
                <p className="font-mono text-[1.9rem] font-medium text-mint-dark leading-none mb-1 tabular-nums">
                  {importResult.productsCreated}
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-ink-4">imported</p>
              </div>
              <div className="w-px bg-wire" />
              <div className="flex-1 px-5 py-4 bg-surface">
                <p className="font-mono text-[1.9rem] font-medium text-ink leading-none mb-1 tabular-nums">
                  {importResult.collectionsCreated}
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-ink-4">collections</p>
              </div>
              {importResult.productsFailed > 0 && (
                <>
                  <div className="w-px bg-wire" />
                  <div className="flex-1 px-5 py-4 bg-surface">
                    <p className="font-mono text-[1.9rem] font-medium text-red-500 leading-none mb-1 tabular-nums">
                      {importResult.productsFailed}
                    </p>
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.11em] text-red-400">failed</p>
                  </div>
                </>
              )}
            </div>

            {/* #14 — link to both products and collections */}
            <div className="flex items-center gap-3 flex-wrap mb-8">
              <LinkBtn href={shop ? `https://${shop}/admin/products` : '#'} external={!!shop} variant="primary">
                View products in Shopify <IcoArrow />
              </LinkBtn>
              {importResult.collectionsCreated > 0 && (
                <LinkBtn href={shop ? `https://${shop}/admin/collections` : '#'} external={!!shop} variant="secondary">
                  View collections
                </LinkBtn>
              )}
              <Btn
                variant="ghost"
                onClick={() => {
                  setStep('url'); setStoreUrl(''); setReconData(null); setStoreData(null)
                  setImportResult(null); setJobId(null); setImportStatus(null); setError(null)
                  setTrialUsed(false); setTrialProductUrls([]); setRemainingCount(0)
                  setVerified(false); setVerifyCode(''); setVerifyAttemptId(null); setVerifyError(null)
                  setHasPriorMigration(false); verifyExpRef.current = null
                }}
              >
                Migrate another store
              </Btn>
            </div>

            {importResult.errors && importResult.errors.length > 0 && (
              <div className="border border-wire-subtle rounded-xl overflow-hidden divide-y divide-[#F4F4F4]">
                <p className="px-5 py-3 font-mono text-[9.5px] uppercase tracking-[0.13em] text-ink-4">
                  Import errors
                </p>
                {importResult.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="px-5 py-2.5 font-mono text-[11px] text-red-400">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="mt-16 pt-5 border-t border-wire-subtle">
          <div className="flex items-center gap-5 flex-wrap">
            {[
              { label: 'Terms',             href: 'https://shoprift.app/terms' },
              { label: 'Privacy',           href: 'https://shoprift.app/privacy' },
              { label: 'Refunds',           href: 'https://shoprift.app/refund-policy' },
              { label: 'Grievance Officer', href: 'mailto:support@shoprift.app' },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4 hover:text-ink-2 transition-colors"
              >
                {label}
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function MigratePage() {
  return (
    <AppProvider i18n={enTranslations}>
      <Suspense
        fallback={
          <div className="min-h-screen bg-page flex items-center justify-center">
            <span className="w-4 h-4 border-[1.5px] border-wire border-t-mint rounded-full animate-spin" />
          </div>
        }
      >
        <MigrateWizard />
      </Suspense>
    </AppProvider>
  )
}
