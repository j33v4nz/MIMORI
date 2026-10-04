-- Migration 20260801000001_add_expires_at_to_api_keys.sql
-- Adds the expires_at column that the application code expects but was never created.

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
