-- Migration 004: add refresh token columns to shopify_sessions
-- Required for Shopify expiring offline tokens (mandatory for public apps).
-- Run in Supabase SQL editor before deploying.

ALTER TABLE shopify_sessions
  ADD COLUMN IF NOT EXISTS refresh_token          TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;
