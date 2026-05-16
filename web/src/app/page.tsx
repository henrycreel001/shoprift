import Link from 'next/link'

/**
 * Landing page — server component.
 *
 * Goal: one clear message, one CTA. No fluff.
 * Sellers landing here are stressed (dm2buy is shutting down).
 * The page should feel calm, competent, and fast.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* ─── Nav ──────────────────────────────────────────────────── */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <span className="font-semibold text-gray-900 tracking-tight">
            Shoprift
          </span>
          <span className="text-xs text-gray-400">
            dm2buy Migration Tool
          </span>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          {/* Status badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            dm2buy is shutting down — act before your data is gone
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Migrate your dm2buy store{' '}
            <span className="text-brand-600">before it&apos;s gone</span>
          </h1>

          {/* Subheadline */}
          <p className="mt-5 text-lg text-gray-500 leading-relaxed">
            Extract all your products, images and data in minutes.
            Get a complete migration package — CSV + images — ready to load
            into Shopify or any platform.
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/migrate"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 transition-colors"
            >
              Migrate my store
              <span aria-hidden="true">&#8594;</span>
            </Link>
            <span className="text-xs text-gray-400">
              No account needed &middot; Pay only after recon
            </span>
          </div>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────────── */}
      <section className="border-t border-gray-100 bg-gray-50 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-sm font-semibold uppercase tracking-widest text-gray-400">
            How it works
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Paste your URL',
                desc: 'Enter your dm2buy store URL. We scan it in seconds and show you exactly what we found.',
              },
              {
                step: '02',
                title: 'Confirm & pay',
                desc: 'Review the product count and price tier. Pay via UPI or card — ₹599 for up to 25 products.',
              },
              {
                step: '03',
                title: 'Download your data',
                desc: 'Get a ZIP with your CSV and all product images. Import-ready for Shopify in minutes.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col gap-2">
                <span className="text-xs font-mono font-semibold text-brand-500">
                  {step}
                </span>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing summary ──────────────────────────────────────── */}
      <section className="border-t border-gray-100 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-sm font-semibold uppercase tracking-widest text-gray-400">
            Pricing
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-left font-medium text-gray-500">Plan</th>
                  <th className="pb-3 text-left font-medium text-gray-500">Products</th>
                  <th className="pb-3 text-left font-medium text-gray-500">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { plan: 'Preview', range: '0–3 products', price: 'Free (no download)' },
                  { plan: 'Starter', range: '1–25 products', price: '₹599' },
                  { plan: 'Standard', range: '26–100 products', price: '₹999' },
                  { plan: 'Pro', range: '101–500 products', price: '₹1,999' },
                  { plan: 'Enterprise', range: '500+ products', price: 'Contact us' },
                ].map(({ plan, range, price }) => (
                  <tr key={plan}>
                    <td className="py-3 font-medium text-gray-900">{plan}</td>
                    <td className="py-3 text-gray-500">{range}</td>
                    <td className="py-3 text-gray-900">{price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-center text-xs text-gray-400">
            Price shown after your store is scanned. Pay only when you&apos;re ready.
          </p>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="mx-auto max-w-4xl flex flex-col items-center gap-2 text-center text-xs text-gray-400">
          <p>Shoprift by MALIQ ENTERPRISES &middot; Delhi, India</p>
          <p>
            This tool extracts data you own from your own dm2buy store.
            You are responsible for compliance with dm2buy&apos;s terms.
          </p>
        </div>
      </footer>
    </main>
  )
}
