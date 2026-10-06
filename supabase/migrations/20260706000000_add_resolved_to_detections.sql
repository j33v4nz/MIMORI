-- Add resolved_at timestamp to detections table to track incident resolution
ALTER TABLE public.detections 
ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE NULL;

-- Create an index to quickly filter out resolved detections in dashboard views if needed
CREATE INDEX IF NOT EXISTS idx_detections_resolved_at ON public.detections(resolved_at);
