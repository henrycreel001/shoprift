import type { NextConfig } from 'next'

const NGROK_ORIGIN = process.env.SHOPIFY_APP_URL?.replace(/^https?:\/\//, '') ?? ''

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@shopify/polaris'],
  outputFileTracingRoot: require("path").join(__dirname, ".."),
  // Allow the ngrok dev tunnel to load /_next/* HMR assets without a CORS warning.
  allowedDevOrigins: NGROK_ORIGIN ? [NGROK_ORIGIN] : [],

  images: {
    remotePatterns: [],
  },

  // CSP frame-ancestors is set dynamically per-shop in src/middleware.ts
}

export default nextConfig
