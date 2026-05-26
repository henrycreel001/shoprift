import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: require("path").join(__dirname, ".."),

  images: {
    remotePatterns: [],
  },

  // Required for Shopify embedded app: allow *.myshopify.com to embed this app in an iframe.
  // Without this, Shopify Admin will refuse to load the app (X-Frame-Options / CSP block).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // frame-ancestors must list all Shopify Admin domains
            value: "frame-ancestors https://*.myshopify.com https://admin.shopify.com",
          },
        ],
      },
    ]
  },
}

export default nextConfig
