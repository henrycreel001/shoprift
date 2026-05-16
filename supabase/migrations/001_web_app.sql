-- 001_web_app.sql — Web app schema additions
-- Run in Supabase SQL editor or via supabase db push
-- Depends on: import_jobs table (created in Phase 0 setup)

-- ─────────────────────────────────────────────────────────────
-- payments
-- Tracks Razorpay payment lifecycle per job.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id              UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
  user_id             TEXT NOT NULL,
  razorpay_order_id   TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  amount_paise        INTEGER NOT NULL,        -- amount in paise (₹599 = 59900)
  status              TEXT NOT NULL DEFAULT 'created',  -- created | paid | failed | refunded
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_job_id_idx    ON payments(job_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx   ON payments(user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx    ON payments(status);

-- ─────────────────────────────────────────────────────────────
-- downloads
-- Tracks signed Supabase Storage URLs issued to sellers.
-- Storage path: {user_id}/{job_id}/delivery.zip
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS downloads (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id          UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
  user_id         TEXT NOT NULL,
  storage_path    TEXT NOT NULL,               -- e.g. "abc123/def456/delivery.zip"
  signed_url      TEXT,                        -- populated when first signed URL is issued
  expires_at      TIMESTAMPTZ NOT NULL,        -- 7 days from creation
  downloaded_at   TIMESTAMPTZ,                 -- null until first download click
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS downloads_job_id_idx  ON downloads(job_id);
CREATE INDEX IF NOT EXISTS downloads_user_id_idx ON downloads(user_id);

-- ─────────────────────────────────────────────────────────────
-- consent_records
-- Immutable log of every Migration Consent acceptance.
-- Required: one record per extraction job, before job starts.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consent_records (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id              UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
  user_id             TEXT NOT NULL,
  store_url           TEXT NOT NULL,
  consent_version     TEXT NOT NULL DEFAULT '1.0',  -- version of migration-consent.md accepted
  consent_text_hash   TEXT NOT NULL,               -- SHA-256 of the consent text the user saw
  accepted_at         TIMESTAMPTZ NOT NULL,
  ip_address          TEXT,
  user_agent          TEXT
);

CREATE INDEX IF NOT EXISTS consent_job_id_idx   ON consent_records(job_id);
CREATE INDEX IF NOT EXISTS consent_user_id_idx  ON consent_records(user_id);

-- Prevent duplicate consent records per job
CREATE UNIQUE INDEX IF NOT EXISTS consent_job_unique_idx ON consent_records(job_id)
  WHERE job_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- Enable RLS. Web app uses service role key (bypasses RLS).
-- Anon key (public) must not read payments or consent_records.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — no policies needed for server-side access.
-- If you add Supabase Auth later, add user-scoped policies here.
