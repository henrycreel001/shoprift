import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import '@shopify/polaris/build/esm/styles.css'

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Shoprift — dm2buy to Shopify Migration',
  description: 'Move your dm2buy store to Shopify. Products, images, and collections land directly in your Shopify admin.',
  keywords: ['dm2buy', 'store migration', 'Shopify migration', 'e-commerce migration', 'India'],
  openGraph: {
    title: 'Shoprift — dm2buy to Shopify Migration',
    description: 'Move your dm2buy store to Shopify. Products, images, and collections land directly in your Shopify admin.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <meta name="shopify-api-key" content={process.env.SHOPIFY_API_KEY ?? ''} />
      </head>
      <body className="min-h-screen bg-page text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
