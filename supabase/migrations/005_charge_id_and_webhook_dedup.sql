-- 005: Add charge_id to import_jobs + webhook deduplication table

-- Store the Shopify charge GID so APP_PURCHASES_ONE_TIME_UPDATE webhook can find the job
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS charge_id text;

CREATE INDEX IF NOT EXISTS import_jobs_charge_id_idx ON import_jobs (charge_id);

-- Webhook deduplication: prevents double-processing on Shopify retries
CREATE TABLE IF NOT EXISTS webhook_idempotency (
  webhook_id   text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-expire old entries after 24 hours (Shopify webhook retry window)
-- Run as a scheduled job or rely on the select query being fast enough
-- For V1, a simple cleanup is sufficient; entries older than 24h can be ignored

CREATE INDEX IF NOT EXISTS webhook_idempotency_processed_at_idx
  ON webhook_idempotency (processed_at);
