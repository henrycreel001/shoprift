-- Migration 002: top-level trial columns + verification_attempts table
-- Run in Supabase SQL editor before deploying code changes.

ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS is_trial           BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS trial_product_urls JSONB   DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS import_jobs_is_trial_idx ON import_jobs(is_trial);

CREATE TABLE IF NOT EXISTS verification_attempts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  TEXT NOT NULL,
  store_url   TEXT NOT NULL,
  code        TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'dm2buy_product',
  status      TEXT NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS va_shop_store_verified_idx
  ON verification_attempts(account_id, store_url)
  WHERE status = 'verified';
