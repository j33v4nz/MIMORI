-- Migration 20260731000000_add_performance_indexes.sql
-- Adds composite index for llm_judge_jobs claim query and BRIN index for events time-range queries

-- 1. Composite index for llm_judge_jobs claim query
-- The claim_llm_judge_jobs function filters by (status = 'pending', attempts < 3) and orders by created_at ASC
-- The existing idx_llm_judge_jobs_status only covers (status, created_at) but misses the attempts filter
CREATE INDEX IF NOT EXISTS idx_llm_judge_jobs_claim
  ON public.llm_judge_jobs(status, attempts, created_at)
  WHERE status = 'pending' AND attempts < 3;

-- 2. BRIN index for events time-range queries
-- BRIN (Block Range INdex) is extremely compact and ideal for append-only time-series data
-- It stores the min/max of each block range, making time-range queries very efficient
-- Much smaller than a B-tree for the same data, with excellent performance for sequential inserts
CREATE INDEX IF NOT EXISTS idx_events_created_at_brin
  ON public.events USING brin(created_at)
  WITH (pages_per_range = 32);

-- 3. Composite index for detections dashboard query
-- Covers the common pattern: SELECT ... WHERE severity = X AND created_at >= Y AND resolved_at IS NULL
CREATE INDEX IF NOT EXISTS idx_detections_unresolved_24h
  ON public.detections(severity, created_at DESC)
  WHERE resolved_at IS NULL;
