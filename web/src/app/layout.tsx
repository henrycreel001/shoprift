import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Shoprift — dm2buy Store Migration',
  description:
    'Extract all your products, images and data from dm2buy in minutes. Get a complete migration package ready to load into Shopify or any other platform.',
  keywords: ['dm2buy', 'store migration', 'Shopify migration', 'e-commerce migration', 'India'],
  openGraph: {
    title: 'Shoprift — dm2buy Store Migration',
    description:
      'Extract all your products, images and data from dm2buy in minutes.',
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
      <body className="min-h-screen bg-white text-gray-900 font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
