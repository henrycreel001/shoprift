'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import enTranslations from '@shopify/polaris/locales/en.json'
import {
  AppProvider,
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Banner,
  ProgressBar,
  Badge,
  Divider,
  Box,
  Spinner,
  Link,
} from '@shopify/polaris'
import { recon as runRecon } from '@/lib/dm2buy/recon'
import { extract } from '@/lib/dm2buy/extractor'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { ReconData, StoreData, ProgressEvent } from '@/lib/dm2buy/types'
import createApp from '@shopify/app-bridge'
import { getSessionToken } from '@shopify/app-bridge/utilities'

// ─── Types ──────────────────────────────────────────────────────────────────

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
}

interface ImportResult {
  productsCreated: number
  productsFailed: number
  collectionsCreated: number
  errors?: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function priceTier(count: number) {
  if (count <= 3) return { plan: 'Preview', price: 'Free', isFree: true }
  if (count <= 25) return { plan: 'Starter', price: '₹599', isFree: false }
  if (count <= 100) return { plan: 'Standard', price: '₹999', isFree: false }
  if (count <= 500) return { plan: 'Pro', price: '₹1,999', isFree: false }
  return { plan: 'Enterprise', price: 'Contact us', isFree: false }
}

function isDm2buyUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    const parts = hostname.split('.')
    return parts.length >= 3 && parts.slice(-2).join('.') === 'dm2buy.com'
  } catch {
    return false
  }
}

// ─── Step indicator ─────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  url: 'URL',
  reconning: 'URL',
  verifying: 'Verify',
  preview: 'Preview',
  trialing: 'Extract',
  trial_done: 'Review',
  extracting: 'Extract',
  results: 'Review',
  importing: 'Import',
  done: 'Done',
}

const STEP_ORDER: Step[] = ['url', 'verifying', 'preview', 'extracting', 'results', 'importing', 'done']

function stepIndex(step: Step): number {
  const mapped: Partial<Record<Step, Step>> = {
    reconning: 'url',
    trialing: 'extracting',
    trial_done: 'results',
  }
  return STEP_ORDER.indexOf(mapped[step] ?? step)
}

function StepBar({ current }: { current: Step }) {
  const idx = stepIndex(current)
  return (
    <Box paddingBlockEnd="400">
      <InlineStack gap="200" wrap={false}>
        {STEP_ORDER.map((s, i) => {
          const done = i < idx
          const active = i === idx
          return (
            <InlineStack key={s} gap="100" wrap={false} blockAlign="center">
              <Box
                background={done ? 'bg-fill-success' : active ? 'bg-fill-emphasis' : 'bg-fill-secondary'}
                borderRadius="full"
                minWidth="24px"
                minHeight="24px"
                as="span"
              >
                <Box paddingInline="100" paddingBlock="050">
                  <Text
                    as="span"
                    variant="bodySm"
                    fontWeight="semibold"
                    tone={done || active ? undefined : 'subdued'}
                  >
                    {done ? '✓' : String(i + 1)}
                  </Text>
                </Box>
              </Box>
              <Text
                as="span"
                variant="bodySm"
                fontWeight={active ? 'semibold' : 'regular'}
                tone={active ? undefined : 'subdued'}
              >
                {STEP_LABELS[s]}
              </Text>
              {i < STEP_ORDER.length - 1 && (
                <Box
                  background={done ? 'bg-fill-success' : 'bg-fill-secondary'}
                  minWidth="24px"
                  minHeight="2px"
                  as="span"
                />
              )}
            </InlineStack>
          )
        })}
      </InlineStack>
    </Box>
  )
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

function MigrateWizard() {
  const searchParams = useSearchParams()
  const shop = searchParams.get('shop') ?? ''
  const host = searchParams.get('host') ?? ''
  const billingJobId = searchParams.get('billing_job_id')
  const billingError = searchParams.get('billing_error')

  const [step, setStep] = useState<Step>('url')
  const [storeUrl, setStoreUrl] = useState('')
  const [urlError, setUrlError] = useState<string | undefined>()
  const [reconData, setReconData] = useState<ReconData | null>(null)
  const [storeData, setStoreData] = useState<StoreData | null>(null)
  const [extractProgress, setExtractProgress] = useState<ProgressEvent | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trialUsed, setTrialUsed] = useState(false)
  const [trialProductUrls, setTrialProductUrls] = useState<string[]>([])
  const [remainingCount, setRemainingCount] = useState(0)
  const [verified, setVerified] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyAttemptId, setVerifyAttemptId] = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const appBridgeRef = useRef<ReturnType<typeof createApp> | null>(null)

  const clearPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])
  useEffect(() => () => clearPoll(), [clearPoll])

  // Initialize App Bridge (must run before billing polling effect)
  useEffect(() => {
    if (typeof window === 'undefined' || !host) return
    try {
      const apiKey = document.querySelector<HTMLMetaElement>('meta[name="shopify-api-key"]')?.content ?? ''
      if (apiKey) appBridgeRef.current = createApp({ apiKey, host })
    } catch { /* not in Shopify context — dev mode */ }
  }, [host])

  async function authHeaders(): Promise<Record<string, string>> {
    if (!appBridgeRef.current) return {}
    try {
      const token = await getSessionToken(appBridgeRef.current)
      return { Authorization: `Bearer ${token}` }
    } catch {
      return {}
    }
  }

  // ── Return from Shopify billing page ──────────────────────────────────────
  useEffect(() => {
    if (billingError) {
      setError(`Payment issue: ${billingError.replace(/_/g, ' ')}. Try again or contact support.`)
    }
    if (!billingJobId) return
    const id = billingJobId
    setJobId(id)
    setStep('importing')
    const poll = async () => {
      try {
        const r = await fetch(`/api/import/status/${id}`, { headers: await authHeaders() })
        const d = await r.json() as {
          status: string
          progress?: { current: number; total: number; message: string }
          error?: string
          result?: ImportResult
        }
        const prog = d.progress ?? { current: 0, total: 0, message: '' }
        setImportStatus({ status: d.status, current: prog.current, total: prog.total, message: prog.message })
        if (d.status === 'complete') {
          clearPoll()
          setImportResult(d.result ?? { productsCreated: 0, productsFailed: 0, collectionsCreated: 0 })
          setStep('done')
        } else if (d.status === 'failed') {
          clearPoll()
          setError(d.error ?? 'Import failed. Contact support.')
        }
      } catch {
        // network blip — keep polling
      }
    }
    poll()
    pollRef.current = setInterval(poll, 3000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 1: Recon + verification gate ─────────────────────────────────────

  async function handleCheckStore() {
    setUrlError(undefined)
    setError(null)
    const url = storeUrl.trim()
    if (!isDm2buyUrl(url)) {
      setUrlError('Enter a valid dm2buy store URL, e.g. https://yourstore.dm2buy.com')
      return
    }
    setStep('reconning')
    try {
      const data = await runRecon(url)
      setReconData(data)

      if (shop) {
        const supabase = createBrowserSupabaseClient()

        // Check if trial already used for this shop + store (using top-level columns)
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
          setTrialProductUrls(
            Array.isArray(trialRow.trial_product_urls) ? trialRow.trial_product_urls as string[] : [],
          )
          setRemainingCount(Math.max(0, data.product_count - 5))
        }

        // Check if already verified for this shop + store
        const { data: va } = await supabase
          .from('verification_attempts')
          .select('id, code')
          .eq('account_id', shop)
          .eq('store_url', data.store_url)
          .eq('status', 'verified')
          .maybeSingle()

        if (va) {
          setVerified(true)
          if (va.code) setVerifyCode(va.code)
          setStep('preview')
        } else {
          const vRes = await fetch('/api/verify/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ storeUrl: data.store_url }),
          })
          const vData = await vRes.json() as { code?: string; attemptId?: string; error?: string }
          if (!vRes.ok || !vData.code) {
            throw new Error(vData.error ?? 'Failed to start verification.')
          }
          setVerifyCode(vData.code)
          setVerifyAttemptId(vData.attemptId ?? null)
          setStep('verifying')
        }
      } else {
        // Dev mode without shop param — skip verification
        setStep('preview')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Store scan failed. Check the URL and try again.')
      setStep('url')
    }
  }

  // ── Step 2: Verify ownership ───────────────────────────────────────────────

  async function handleVerifyCheck() {
    setVerifyLoading(true)
    setVerifyError(null)
    try {
      const r = await fetch('/api/verify/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ attemptId: verifyAttemptId, storeUrl: reconData!.store_url }),
      })
      const d = await r.json() as { verified?: boolean; error?: string; expired?: boolean }
      if (d.expired) {
        // Code expired — get a new one
        const vRes = await fetch('/api/verify/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ storeUrl: reconData!.store_url }),
        })
        const vData = await vRes.json() as { code?: string; attemptId?: string }
        if (vData.code) {
          setVerifyCode(vData.code)
          setVerifyAttemptId(vData.attemptId ?? null)
          setVerifyError('Your code expired. A new code has been generated — add the new product and try again.')
        }
        return
      }
      if (d.verified) {
        setVerified(true)
        setStep('preview')
      } else {
        setVerifyError('Product not found. Make sure the product name is exactly the code shown, then try again.')
      }
    } catch {
      setVerifyError('Check failed. Try again.')
    } finally {
      setVerifyLoading(false)
    }
  }

  // ── Trial import: extract all → slice 5 → import to Shopify ───────────────

  async function handleTrialImport() {
    if (!reconData) return
    setStep('trialing')
    setExtractProgress(null)
    setImportStatus(null)
    setError(null)
    try {
      const allData = await extract(reconData.store_url, reconData.store_id, (ev) => {
        setExtractProgress(ev)
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const realProducts = verifyCode ? allData.products.filter((p: any) => !(p.name ?? '').includes(verifyCode)) : allData.products
      const trialProducts = realProducts.slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trialUrls = trialProducts.map((p: any) => p.product_url as string)
      const trialStoreData = { ...allData, products: trialProducts }

      setTrialProductUrls(trialUrls)
      setRemainingCount(Math.max(0, realProducts.length - 5))

      const res = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          storeUrl: reconData.store_url,
          storeData: trialStoreData,
          isTrial: true,
          trialProductUrls: trialUrls,
        }),
      })
      const respData = await res.json() as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(respData.error ?? 'Trial import failed to start.')
      const id = respData.jobId!
      setJobId(id)

      const poll = async () => {
        try {
          const r = await fetch(`/api/import/status/${id}`, { headers: await authHeaders() })
          const d = await r.json() as {
            status: string
            progress?: { current: number; total: number; message: string }
            error?: string
            result?: ImportResult
          }
          const prog = d.progress ?? { current: 0, total: 0, message: '' }
          setImportStatus({ status: d.status, current: prog.current, total: prog.total, message: prog.message })
          if (d.status === 'complete') {
            clearPoll()
            setImportResult(d.result ?? { productsCreated: 0, productsFailed: 0, collectionsCreated: 0 })
            setTrialUsed(true)
            setStep('trial_done')
          } else if (d.status === 'failed') {
            clearPoll()
            setError(d.error ?? 'Trial import failed. Contact support.')
            setStep('preview')
          }
        } catch {
          // network blip — keep polling
        }
      }

      poll()
      pollRef.current = setInterval(poll, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trial import failed. Please try again.')
      setStep('preview')
    }
  }

  // ── Full extraction: extract all → results card ────────────────────────────

  async function handleFullImport() {
    if (!reconData) return
    const fallbackStep: Step = trialUsed ? 'trial_done' : 'preview'
    setStep('extracting')
    setExtractProgress(null)
    setError(null)
    try {
      const allData = await extract(reconData.store_url, reconData.store_id, (ev) => {
        setExtractProgress(ev)
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filtered = verifyCode ? { ...allData, products: allData.products.filter((p: any) => !(p.name ?? '').includes(verifyCode)) } : allData
      setStoreData(filtered)
      setStep('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed. Please try again.')
      setStep(fallbackStep)
    }
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!storeData || !reconData || !tier) return
    setError(null)

    if (tier.isFree) {
      // Free tier — direct import, no billing
      setStep('importing')
      try {
        const res = await fetch('/api/import/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({
            storeUrl: reconData.store_url,
            storeData,
            ...(trialProductUrls.length > 0 ? { skipUrls: trialProductUrls } : {}),
          }),
        })
        const data = await res.json() as { jobId?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Import failed to start.')
        const id = data.jobId!
        setJobId(id)

        const poll = async () => {
          try {
            const r = await fetch(`/api/import/status/${id}`, { headers: await authHeaders() })
            const d = await r.json() as {
              status: string
              progress?: { current: number; total: number; message: string }
              error?: string
              result?: ImportResult
            }
            const prog = d.progress ?? { current: 0, total: 0, message: '' }
            setImportStatus({ status: d.status, current: prog.current, total: prog.total, message: prog.message })
            if (d.status === 'complete') {
              clearPoll()
              setImportResult(d.result ?? { productsCreated: 0, productsFailed: 0, collectionsCreated: 0 })
              setStep('done')
            } else if (d.status === 'failed') {
              clearPoll()
              setError(d.error ?? 'Import failed. Contact support.')
            }
          } catch {
            // network blip — keep polling
          }
        }
        poll()
        pollRef.current = setInterval(poll, 3000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start import.')
        setStep('results')
      }
      return
    }

    // Paid tier — Shopify Billing API
    setBillingLoading(true)
    try {
      const amount = parseInt(tier.price.replace(/[₹,]/g, ''), 10)
      const res = await fetch('/api/payment/billing/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          storeUrl: reconData.store_url,
          storeData,
          skipUrls: trialProductUrls.length > 0 ? trialProductUrls : undefined,
          amount,
          planName: `Shoprift ${tier.plan}`,
        }),
      })
      const d = await res.json() as { confirmationUrl?: string; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Failed to create payment.')
      // Escape iframe — navigate top frame to Shopify payment page
      window.top!.location.href = d.confirmationUrl!
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment setup failed. Try again.')
      setBillingLoading(false)
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const tier = reconData ? priceTier(reconData.product_count) : null

  const extractPercent =
    extractProgress && extractProgress.total > 0
      ? Math.round((extractProgress.current / extractProgress.total) * 100)
      : 0

  const importPercent =
    importStatus && importStatus.total > 0
      ? Math.round((importStatus.current / importStatus.total) * 100)
      : 0

  // True once extraction phase of trialing is complete (scan done, now importing)
  const trialExtractionComplete =
    extractProgress != null &&
    extractProgress.total > 0 &&
    extractProgress.current >= extractProgress.total

  const showDontCloseBanner = step === 'extracting' || step === 'trialing' || step === 'importing'

  const pageTitle: Record<Step, string> = {
    url: 'Migrate from dm2buy',
    reconning: 'Migrate from dm2buy',
    verifying: 'Confirm store ownership',
    preview: 'Store preview',
    trialing: 'Importing trial products',
    trial_done: 'Trial complete',
    extracting: 'Extracting store data',
    results: 'Ready to import',
    importing: 'Importing to Shopify',
    done: 'Migration complete',
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Page title={pageTitle[step]}>
      <BlockStack gap="400">

        <StepBar current={step} />

        {/* Don't close tab banner */}
        {showDontCloseBanner && (
          <Banner title="Don't close this tab" tone="warning">
            <Text as="p">
              {step === 'trialing'
                ? "Importing your trial products to Shopify — don't close this window."
                : step === 'extracting'
                ? `Collecting your store data — ${reconData?.estimated_import_label ?? 'a few minutes'}. You can switch tabs, but don't close this window.`
                : "Products are being added to your Shopify store. Don't close this window."}
            </Text>
          </Banner>
        )}

        {/* Error banner */}
        {error && (
          <Banner title="Something went wrong" tone="critical" onDismiss={() => setError(null)}>
            <Text as="p">{error}</Text>
          </Banner>
        )}

        {/* ── Step 1: URL input ──────────────────────────────────────────── */}
        {(step === 'url' || step === 'reconning') && (
          <BlockStack gap="400">
            {/* Compact hero context */}
            <Box paddingBlockEnd="200">
              <BlockStack gap="300">
                <Text variant="headingLg" as="h2">Move your dm2buy products to Shopify</Text>
                <BlockStack gap="150">
                  {[
                    'Scan your store in seconds — no login needed',
                    'Try free: 5 products imported straight to Shopify',
                    'Pay only after you see your products in the store',
                  ].map((bullet) => (
                    <InlineStack key={bullet} gap="200" blockAlign="center" wrap={false}>
                      <Text as="span" tone="success" fontWeight="semibold">✓</Text>
                      <Text as="p" tone="subdued">{bullet}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Box>

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">Enter your dm2buy store URL</Text>
                  <Text tone="subdued" as="p">
                    Move all your products and collections to Shopify automatically.
                  </Text>
                </BlockStack>

                <form
                  onSubmit={(e) => { e.preventDefault(); if (step === 'url') handleCheckStore() }}
                >
                  <TextField
                    label="Store URL"
                    value={storeUrl}
                    onChange={(v) => { setStoreUrl(v); setUrlError(undefined) }}
                    placeholder="https://yourstore.dm2buy.com"
                    type="url"
                    autoComplete="url"
                    error={urlError}
                    disabled={step === 'reconning'}
                    helpText="Enter your dm2buy subdomain URL."
                  />
                </form>

                <InlineStack>
                  <Button
                    variant="primary"
                    onClick={handleCheckStore}
                    loading={step === 'reconning'}
                    disabled={step === 'reconning'}
                  >
                    Check store
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        )}

        {/* ── Step 2: Ownership verification ────────────────────────────── */}
        {step === 'verifying' && reconData && (
          <Card>
            <BlockStack gap="500">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">Confirm you own this store</Text>
                <Text tone="subdued" as="p">
                  We verify ownership before importing to protect dm2buy sellers&apos; data.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="p" fontWeight="semibold">Add a product to your dm2buy store:</Text>
                {[
                  'Log in to your dm2buy seller dashboard.',
                  'Go to Products → Add Product.',
                  'Set the product name to exactly the code below.',
                  'Save the product — draft status is fine.',
                  'Click "I\'ve added it — verify now" below.',
                ].map((instruction, i) => (
                  <InlineStack key={i} gap="200" blockAlign="start" wrap={false}>
                    <Box
                      background="bg-fill-secondary"
                      borderRadius="full"
                      minWidth="24px"
                      minHeight="24px"
                      as="span"
                    >
                      <Box paddingInline="100" paddingBlock="050">
                        <Text as="span" variant="bodySm" fontWeight="semibold">{i + 1}</Text>
                      </Box>
                    </Box>
                    <Text as="p">{instruction}</Text>
                  </InlineStack>
                ))}
              </BlockStack>

              <BlockStack gap="200">
                <Text as="p" tone="subdued" variant="bodySm">Your verification code</Text>
                <Box
                  background="bg-fill-secondary"
                  borderRadius="100"
                  padding="300"
                >
                  <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <Text as="p" fontWeight="bold" variant="headingMd">{verifyCode}</Text>
                    <Button
                      variant="plain"
                      size="micro"
                      onClick={() => navigator.clipboard.writeText(verifyCode)}
                    >
                      Copy
                    </Button>
                  </InlineStack>
                </Box>
                <Text tone="subdued" as="p" variant="bodySm">
                  The product name must match exactly. Delete the test product after verification.
                </Text>
              </BlockStack>

              {verifyError && (
                <Banner tone="critical" onDismiss={() => setVerifyError(null)}>
                  <Text as="p">{verifyError}</Text>
                </Banner>
              )}

              <InlineStack gap="300" wrap>
                <Button
                  variant="primary"
                  onClick={handleVerifyCheck}
                  loading={verifyLoading}
                >
                  I&apos;ve added it — verify now
                </Button>
                <Button
                  variant="plain"
                  onClick={() => {
                    setReconData(null)
                    setVerifyCode('')
                    setVerifyAttemptId(null)
                    setVerifyError(null)
                    setStep('url')
                  }}
                >
                  Change URL
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* ── Step 3: Recon preview ──────────────────────────────────────── */}
        {step === 'preview' && reconData && tier && (
          <Card>
            <BlockStack gap="500">
              <BlockStack gap="100">
                <Text variant="headingLg" as="h2">{reconData.store_name}</Text>
                <Text tone="subdued" as="p">{reconData.store_url}</Text>
              </BlockStack>

              <Divider />

              <InlineStack gap="600" wrap={false}>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{reconData.product_count}</Text>
                  <Text tone="subdued" as="p">Products</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{reconData.collection_count}</Text>
                  <Text tone="subdued" as="p">Collections</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{reconData.image_count}</Text>
                  <Text tone="subdued" as="p">Images</Text>
                </BlockStack>
              </InlineStack>

              <Divider />

              <InlineStack align="space-between" wrap={false}>
                <BlockStack gap="050">
                  <Text tone="subdued" as="p">Plan</Text>
                  <Text fontWeight="semibold" as="p">{tier.plan}</Text>
                </BlockStack>
                <BlockStack gap="050" inlineAlign="end">
                  <Text tone="subdued" as="p">Price</Text>
                  <Text variant="headingLg" as="p">{tier.price}</Text>
                </BlockStack>
              </InlineStack>

              {tier.isFree && (
                <Banner tone="info">
                  <Text as="p">
                    Preview mode: stores with 3 or fewer products are free.
                  </Text>
                </Banner>
              )}

              <Text tone="subdued" as="p">Estimated time: {reconData.estimated_import_label}</Text>

              <InlineStack gap="300" wrap>
                {!trialUsed && !tier.isFree && (
                  <Button variant="primary" onClick={handleTrialImport}>
                    Try free — 5 products
                  </Button>
                )}
                <Button
                  variant={trialUsed || tier.isFree ? 'primary' : 'secondary'}
                  onClick={handleFullImport}
                >
                  {trialUsed
                    ? `Import all ${remainingCount} remaining — ${tier.price}`
                    : tier.isFree
                    ? 'Import to Shopify (free)'
                    : `Import all — ${tier.price}`}
                </Button>
                <Button
                  variant="plain"
                  onClick={() => {
                    setReconData(null)
                    setTrialUsed(false)
                    setTrialProductUrls([])
                    setVerified(false)
                    setStep('url')
                  }}
                >
                  Change URL
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* ── Trial import progress ──────────────────────────────────────── */}
        {step === 'trialing' && reconData && (
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Importing 5 trial products to Shopify</Text>

              {!trialExtractionComplete ? (
                <>
                  <ProgressBar progress={extractPercent} size="medium" tone="highlight" />
                  <Text tone="subdued" as="p">
                    {extractProgress
                      ? `Scanning: ${extractProgress.current} of ${extractProgress.total} products`
                      : 'Starting scan...'}
                  </Text>
                </>
              ) : (
                <>
                  <ProgressBar progress={importPercent} size="medium" tone="success" />
                  <Text tone="subdued" as="p">
                    {importStatus?.message || 'Adding products to Shopify...'}
                  </Text>
                </>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ── Trial done ────────────────────────────────────────────────── */}
        {step === 'trial_done' && importResult && (
          <BlockStack gap="400">
            <Banner title="5 products added to your Shopify store." tone="success">
              <Text as="p">
                Your trial import is complete. See them live in your store, then import the rest.
              </Text>
            </Banner>

            <Card>
              <BlockStack gap="500">
                <BlockStack gap="300">
                  <InlineStack align="space-between" wrap={false}>
                    <Text as="p">Trial products imported</Text>
                    <Badge tone="success">{String(importResult.productsCreated)}</Badge>
                  </InlineStack>
                  {remainingCount > 0 && (
                    <InlineStack align="space-between" wrap={false}>
                      <Text as="p">Remaining products</Text>
                      <Text as="p" fontWeight="semibold">{remainingCount}</Text>
                    </InlineStack>
                  )}
                </BlockStack>

                <Divider />

                <InlineStack gap="300" wrap>
                  <Button
                    variant="primary"
                    url={shop ? `https://${shop}/admin/products` : '#'}
                    external={!!shop}
                  >
                    View in Shopify
                  </Button>
                  {remainingCount > 0 && tier && (
                    <Button variant="secondary" onClick={handleFullImport}>
                      {`Import all ${remainingCount} remaining — ${tier.price}`}
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        )}

        {/* ── Full extraction progress ───────────────────────────────────── */}
        {step === 'extracting' && reconData && (
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Collecting product data from dm2buy</Text>

              <ProgressBar progress={extractPercent} size="medium" tone="highlight" />

              <Text tone="subdued" as="p">
                {extractProgress
                  ? `${extractProgress.current} of ${extractProgress.total} products collected`
                  : 'Starting...'}
              </Text>

              {extractProgress?.message && (
                <Text tone="subdued" as="p">{extractProgress.message}</Text>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ── Results / billing gate ─────────────────────────────────────── */}
        {step === 'results' && reconData && tier && storeData && (
          <Card>
            <BlockStack gap="500">
              <Text variant="headingMd" as="h2">Your data is ready</Text>

              <BlockStack gap="300">
                <InlineStack align="space-between" wrap={false}>
                  <Text as="p">Products collected</Text>
                  <Badge tone="success">{String(storeData.products.length)}</Badge>
                </InlineStack>
                <InlineStack align="space-between" wrap={false}>
                  <Text as="p">Collections</Text>
                  <Text as="p" fontWeight="semibold">{storeData.categories.length}</Text>
                </InlineStack>
                {trialProductUrls.length > 0 && (
                  <InlineStack align="space-between" wrap={false}>
                    <Text as="p" tone="subdued">Trial products (already in Shopify)</Text>
                    <Text as="p" tone="subdued">{trialProductUrls.length} skipped</Text>
                  </InlineStack>
                )}
              </BlockStack>

              {/* Preview first 3 products */}
              {storeData.products.slice(0, 3).length > 0 && (
                <BlockStack gap="100">
                  <Text tone="subdued" as="p" variant="bodySm">Preview</Text>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(storeData.products as any[]).slice(0, 3).map((p) => (
                    <InlineStack key={p.product_url ?? p.name} align="space-between" wrap={false}>
                      <Text as="p" variant="bodySm">{p.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">₹{p.price}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}

              <Divider />

              <InlineStack align="space-between" wrap={false}>
                <BlockStack gap="050">
                  <Text tone="subdued" as="p">Plan</Text>
                  <Text fontWeight="semibold" as="p">{tier.plan}</Text>
                </BlockStack>
                <BlockStack gap="050" inlineAlign="end">
                  <Text tone="subdued" as="p">Total</Text>
                  <Text variant="headingXl" as="p">{tier.price}</Text>
                </BlockStack>
              </InlineStack>

              <Button
                variant="primary"
                size="large"
                onClick={handleImport}
                loading={billingLoading}
                disabled={billingLoading}
              >
                {tier.isFree
                  ? 'Import to Shopify (free)'
                  : billingLoading
                  ? 'Redirecting to payment...'
                  : `Pay ${tier.price} and import to Shopify`}
              </Button>

              <Text tone="subdued" as="p">
                {tier.isFree
                  ? 'No charge for stores with 3 or fewer products.'
                  : <>Payment via Shopify Billing · Full refund if import fails · <Link url="https://project-pjqwm.vercel.app/refund-policy" target="_blank" removeUnderline={false}>Refund policy</Link></>}
              </Text>
            </BlockStack>
          </Card>
        )}

        {/* ── Import progress ───────────────────────────────────────────── */}
        {step === 'importing' && (
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Adding products to your Shopify store</Text>

              {importStatus && importStatus.total > 0 ? (
                <>
                  <ProgressBar progress={importPercent} size="medium" tone="highlight" />
                  <Text tone="subdued" as="p">
                    {importStatus.message || `${importStatus.current} of ${importStatus.total} imported`}
                  </Text>
                </>
              ) : (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text tone="subdued" as="p">Starting import...</Text>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ── Done ──────────────────────────────────────────────────────── */}
        {step === 'done' && importResult && (
          <BlockStack gap="400">
            <Banner title="Migration complete." tone="success">
              <Text as="p">
                {importResult.productsCreated} product{importResult.productsCreated !== 1 ? 's' : ''} and{' '}
                {importResult.collectionsCreated} collection{importResult.collectionsCreated !== 1 ? 's' : ''} added to your Shopify store.
                {importResult.productsFailed > 0 &&
                  ` ${importResult.productsFailed} product${importResult.productsFailed !== 1 ? 's' : ''} failed — check your Shopify admin for details.`}
              </Text>
            </Banner>

            <Card>
              <BlockStack gap="500">
                <InlineStack gap="600" wrap={false}>
                  <BlockStack gap="100">
                    <Text variant="heading2xl" as="p">{importResult.productsCreated}</Text>
                    <Text tone="subdued" as="p">Imported</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="heading2xl" as="p">{importResult.collectionsCreated}</Text>
                    <Text tone="subdued" as="p">Collections</Text>
                  </BlockStack>
                  {importResult.productsFailed > 0 && (
                    <BlockStack gap="100">
                      <Text variant="heading2xl" as="p" tone="critical">{importResult.productsFailed}</Text>
                      <Text tone="critical" as="p">Failed</Text>
                    </BlockStack>
                  )}
                </InlineStack>

                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    url={shop ? `https://${shop}/admin/products` : '#'}
                    external={!!shop}
                  >
                    View your products in Shopify
                  </Button>
                  <Button
                    variant="plain"
                    onClick={() => {
                      setStep('url')
                      setStoreUrl('')
                      setReconData(null)
                      setStoreData(null)
                      setImportResult(null)
                      setJobId(null)
                      setImportStatus(null)
                      setError(null)
                      setTrialUsed(false)
                      setTrialProductUrls([])
                      setRemainingCount(0)
                      setVerified(false)
                      setVerifyCode('')
                      setVerifyAttemptId(null)
                      setVerifyError(null)
                    }}
                  >
                    Migrate another store
                  </Button>
                </InlineStack>

                {importResult.errors && importResult.errors.length > 0 && (
                  <BlockStack gap="200">
                    <Text tone="subdued" as="p" fontWeight="semibold">Import errors:</Text>
                    {importResult.errors.slice(0, 5).map((e, i) => (
                      <Text key={i} tone="critical" as="p">{e}</Text>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        )}

      </BlockStack>

      <Box paddingBlockStart="800" paddingBlockEnd="400">
        <InlineStack gap="400" align="center" wrap>
          <Link url="https://project-pjqwm.vercel.app/terms" target="_blank" removeUnderline>
            <Text tone="subdued" as="span" variant="bodySm">Terms of Service</Text>
          </Link>
          <Text tone="subdued" as="span" variant="bodySm">·</Text>
          <Link url="https://project-pjqwm.vercel.app/privacy" target="_blank" removeUnderline>
            <Text tone="subdued" as="span" variant="bodySm">Privacy Policy</Text>
          </Link>
          <Text tone="subdued" as="span" variant="bodySm">·</Text>
          <Link url="https://project-pjqwm.vercel.app/refund-policy" target="_blank" removeUnderline>
            <Text tone="subdued" as="span" variant="bodySm">Refund Policy</Text>
          </Link>
          <Text tone="subdued" as="span" variant="bodySm">·</Text>
          <Link url="mailto:001henrycreel@gmail.com" removeUnderline>
            <Text tone="subdued" as="span" variant="bodySm">Grievance Officer</Text>
          </Link>
        </InlineStack>
      </Box>

    </Page>
  )
}

// ─── Root — AppProvider + Suspense boundary for useSearchParams ──────────────

export default function MigratePage() {
  return (
    <AppProvider i18n={enTranslations}>
      <Suspense
        fallback={
          <Page title="Loading...">
            <Box padding="800">
              <InlineStack align="center">
                <Spinner size="large" />
              </InlineStack>
            </Box>
          </Page>
        }
      >
        <MigrateWizard />
      </Suspense>
    </AppProvider>
  )
}
