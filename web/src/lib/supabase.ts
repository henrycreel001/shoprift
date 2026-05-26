import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Environment variable validation ────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Copy .env.example to .env.local and fill in your values.`
    )
  }
  return value
}

// ─── Database type skeleton ──────────────────────────────────────────────────
//
// Full types can be generated with: npx supabase gen types typescript --linked
// For now, using `any` as placeholder so the client compiles without the CLI.
//
// TODO (Phase 13): run `npx supabase gen types typescript --linked > src/lib/database.types.ts`
//                  then import and use Database type below.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any

// ─── Browser client (singleton) ─────────────────────────────────────────────
//
// Used in Client Components ('use client').
// Reads NEXT_PUBLIC_* env vars — safe to expose to the browser.
// Singleton pattern prevents creating a new client on every render.

let browserClient: SupabaseClient<Database> | null = null

/**
 * Returns a Supabase client for use in browser (Client Component) contexts.
 * Uses the public anon key — row-level security enforces access control.
 *
 * @example
 * const supabase = createBrowserSupabaseClient()
 * const { data } = await supabase.from('import_jobs').select('*')
 */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient

  // Static dot-notation required — Next.js only inlines NEXT_PUBLIC_* vars
  // when accessed as literal property names, not via bracket notation.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY')

  browserClient = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return browserClient
}

// ─── Server client ───────────────────────────────────────────────────────────
//
// Used in API routes and Server Components.
// Uses the service role key when available (bypasses RLS) — keep secret.
// Falls back to anon key if service key is not set (read-only operations).

/**
 * Returns a Supabase client for use in server (API route / Server Component) contexts.
 * Uses SUPABASE_SERVICE_KEY if available, otherwise falls back to anon key.
 *
 * IMPORTANT: Never pass this client to the browser. It may use the service key.
 *
 * @example
 * // In an API route:
 * const supabase = createServerSupabaseClient()
 * const { data } = await supabase.from('import_jobs').select('*').eq('id', jobId)
 */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL')

  // Use service key for server-side writes; fall back to anon for reads
  const key =
    process.env.SUPABASE_SERVICE_KEY ??
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createClient<Database>(url, key, {
    auth: {
      // Server clients don't persist sessions
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
