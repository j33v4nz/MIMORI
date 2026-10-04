ALTER TABLE detections
ADD CONSTRAINT unique_detection UNIQUE NULLS NOT DISTINCT (event_id, layer, rule_id);

CREATE OR REPLACE FUNCTION claim_llm_judge_jobs(limit_count int)
RETURNS SETOF llm_judge_jobs AS $$
BEGIN
  RETURN QUERY
  UPDATE llm_judge_jobs
  SET status = 'processing', updated_at = now()
  WHERE id IN (
    SELECT id
    FROM llm_judge_jobs
    WHERE status = 'pending' AND attempts < 3
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT limit_count
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;
