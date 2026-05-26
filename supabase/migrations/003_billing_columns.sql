-- Migration 003: billing columns for Shopify AppPurchaseOneTime flow
-- Run in Supabase SQL editor before deploying billing code.

ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS store_data JSONB,
  ADD COLUMN IF NOT EXISTS skip_urls  JSONB DEFAULT '[]'::jsonb;

-- pending_payment is a valid status added by the billing flow:
-- pending_payment → (charge approved) → pending → importing → complete | failed
-- No constraint to update — status is a free TEXT column.
