-- Legacy events were already handled by the synchronous ingestion path. New
-- events retain a NULL marker until findings/judge work have been persisted.
ALTER TABLE public.events ADD COLUMN detection_processed_at timestamptz DEFAULT now();
ALTER TABLE public.events ALTER COLUMN detection_processed_at DROP DEFAULT;
CREATE INDEX events_detection_pending ON public.events(created_at)
  WHERE detection_processed_at IS NULL;
