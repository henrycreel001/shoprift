import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import '@shopify/polaris/build/esm/styles.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Shoprift — dm2buy to Shopify Migration',
  description:
    'Move your dm2buy store to Shopify. Extract all your products, images and data in minutes — complete migration package ready to import.',
  keywords: ['dm2buy', 'store migration', 'Shopify migration', 'e-commerce migration', 'India'],
  openGraph: {
    title: 'Shoprift — dm2buy to Shopify Migration',
    description:
      'Move your dm2buy store to Shopify. Extract all your products, images and data in minutes.',
    type: 'website',
  },
}

/**
 * Root layout — wraps every page.
 * Font: Inter via next/font (zero layout shift, self-hosted).
 * No auth wrapper in V1 — anonymous sessions identified by job ID.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="shopify-api-key" content={process.env.SHOPIFY_API_KEY ?? ''} />
      </head>
      <body className="min-h-screen bg-white text-gray-900 font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
