-- Enforce parent/tenant consistency on new writes without rewriting historical rows.
-- NOT VALID constraints still enforce all new inserts/updates. Operators should
-- audit historical rows before running VALIDATE CONSTRAINT (see release checklist).
CREATE UNIQUE INDEX IF NOT EXISTS agents_id_org_unique ON public.agents (id, org_id);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_id_org_unique ON public.sessions (id, org_id);
CREATE UNIQUE INDEX IF NOT EXISTS events_id_org_unique ON public.events (id, org_id);

ALTER TABLE public.sessions ADD CONSTRAINT sessions_agent_org_fk
  FOREIGN KEY (agent_id, org_id) REFERENCES public.agents (id, org_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.events ADD CONSTRAINT events_session_org_fk
  FOREIGN KEY (session_id, org_id) REFERENCES public.sessions (id, org_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.detections ADD CONSTRAINT detections_event_org_fk
  FOREIGN KEY (event_id, org_id) REFERENCES public.events (id, org_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.llm_judge_jobs ADD CONSTRAINT judge_jobs_event_org_fk
  FOREIGN KEY (event_id, org_id) REFERENCES public.events (id, org_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.rate_limit_counters ADD CONSTRAINT rate_limit_api_key_fk
  FOREIGN KEY (api_key_id) REFERENCES public.api_keys (id) ON DELETE CASCADE NOT VALID;

CREATE POLICY "detections tenant update boundary"
ON public.detections AS RESTRICTIVE FOR UPDATE TO authenticated
USING (private.is_org_member(org_id))
WITH CHECK (private.is_org_member(org_id));
