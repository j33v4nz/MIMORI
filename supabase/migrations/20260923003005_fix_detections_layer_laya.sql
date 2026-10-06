-- P0.1: allow 'laya' as a detections layer.
--
-- The Laya classifier path in app/lib/services/detection-service.ts inserts
-- rows with layer = 'laya'. The initial schema only permitted
-- ('rule', 'llm_judge'), so those inserts failed with 23514 (check_violation).
--
-- This migration is idempotent: every statement uses IF EXISTS / re-adds the
-- named constraints, so it is safe to run more than once.

-- 1. Widen the layer allow-list to include 'laya'.
ALTER TABLE public.detections DROP CONSTRAINT IF EXISTS detections_layer_check;
ALTER TABLE public.detections
  ADD CONSTRAINT detections_layer_check CHECK (layer IN ('rule', 'laya', 'llm_judge'));

-- 2. Update the layer/rule_id coherence check. The initial schema required
-- (layer = 'rule' AND rule_id IS NOT NULL) OR
-- (layer = 'llm_judge' AND rule_id IS NULL), which has no valid branch for
-- 'laya'. Laya detections carry no rule row, so rule_id must be NULL for
-- both non-rule layers (matching the llm_judge convention).
-- The original check was declared inline (auto-named detections_check).
ALTER TABLE public.detections DROP CONSTRAINT IF EXISTS detections_check;
ALTER TABLE public.detections
  ADD CONSTRAINT detections_layer_rule_coherence_check CHECK (
    (layer = 'rule' AND rule_id IS NOT NULL)
    OR (layer IN ('laya', 'llm_judge') AND rule_id IS NULL)
  );
