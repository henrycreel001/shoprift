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
} from '@shopify/polaris'
import { recon as runRecon } from '@/lib/dm2buy/recon'
import { extract } from '@/lib/dm2buy/extractor'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { ReconData, StoreData, ProgressEvent } from '@/lib/dm2buy/types'

// ─── Types ──────────────────────────────────────────────────────────────────

type Step =
  | 'url'
  | 'reconning'
  | 'preview'
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
  url: 'Enter URL',
  reconning: 'Enter URL',
  preview: 'Preview',
  trialing: 'Extracting',
  trial_done: 'Review',
  extracting: 'Extracting',
  results: 'Review',
  importing: 'Importing',
  done: 'Done',
}

const STEP_ORDER: Step[] = ['url', 'preview', 'extracting', 'results', 'importing', 'done']

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])
  useEffect(() => () => clearPoll(), [clearPoll])

  // ── Step 1: Recon ──────────────────────────────────────────────────────────

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

      // Check if trial already used for this shop + store
      if (shop) {
        const supabase = createBrowserSupabaseClient()
        const { data: trialRow } = await supabase
          .from('import_jobs')
          .select('recon_data')
          .eq('account_id', shop)
          .eq('store_url', data.store_url)
          .filter('recon_data->>is_trial', 'eq', 'true')
          .eq('status', 'complete')
          .maybeSingle()

        if (trialRow) {
          const rd = trialRow.recon_data as { trial_product_urls?: string[] } | null
          setTrialUsed(true)
          setTrialProductUrls(rd?.trial_product_urls ?? [])
          setRemainingCount(Math.max(0, data.product_count - 5))
        }
      }

      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Store scan failed. Check the URL and try again.')
      setStep('url')
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
      const trialProducts = allData.products.slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trialUrls = trialProducts.map((p: any) => p.product_url as string)
      const trialStoreData = { ...allData, products: trialProducts }

      setTrialProductUrls(trialUrls)
      setRemainingCount(Math.max(0, reconData.product_count - 5))

      const res = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
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
          const r = await fetch(`/api/import/status/${id}`)
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
      setStoreData(allData)
      setStep('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed. Please try again.')
      setStep(fallbackStep)
    }
  }

  // ── Import (billing bypassed — T7 implements Shopify Billing API) ──────────

  async function handleImport() {
    if (!storeData || !reconData) return
    setStep('importing')
    setError(null)
    try {
      const res = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
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
          const r = await fetch(`/api/import/status/${id}`)
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
            setError(d.error ?? 'Import failed. Contact support with your Job ID.')
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

        {/* ── Step 2: Recon preview ──────────────────────────────────────── */}
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
            <Banner title="5 products added to your Shopify store!" tone="success">
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

              <Button variant="primary" size="large" onClick={handleImport}>
                {tier.isFree
                  ? 'Import to Shopify (free)'
                  : `Pay ${tier.price} and import to Shopify`}
              </Button>

              <Text tone="subdued" as="p">
                {tier.isFree
                  ? 'No charge for stores with 3 or fewer products.'
                  : 'Payment via Shopify Billing · Full refund if import fails.'}
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
                    {importStatus.current} of {importStatus.total} products imported
                  </Text>
                  {importStatus.message && (
                    <Text tone="subdued" as="p">{importStatus.message}</Text>
                  )}
                </>
              ) : (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text tone="subdued" as="p">Starting import...</Text>
                </InlineStack>
              )}

              {jobId && (
                <Text tone="subdued" as="p">Job ID: {jobId}</Text>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ── Done ──────────────────────────────────────────────────────── */}
        {step === 'done' && importResult && (
          <BlockStack gap="400">
            <Banner title="Migration complete!" tone="success">
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
