import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Engine (Playwright) runs on Railway — all extraction API calls go there.
  // Web app on Vercel is UI + thin API layer only.
  // No special rewrites needed here — RAILWAY_WORKER_URL is consumed in API routes.

  // Suppress React 19 hydration noise in dev
  reactStrictMode: true,
  outputFileTracingRoot: require("path").join(__dirname, ".."),

  // Image domains — add Railway worker host once known
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
