-- A detection can reference its own tenant's rule or a deliberately global rule.
CREATE OR REPLACE FUNCTION private.check_detection_rule_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE rule_org uuid;
BEGIN
  IF NEW.rule_id IS NOT NULL THEN
    SELECT org_id INTO rule_org FROM public.rules WHERE id = NEW.rule_id;
    IF NOT FOUND OR (rule_org IS NOT NULL AND rule_org <> NEW.org_id) THEN
      RAISE EXCEPTION 'Detection rule is not available to this organization'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.check_detection_rule_org() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER detections_rule_org_boundary
BEFORE INSERT OR UPDATE OF rule_id, org_id ON public.detections
FOR EACH ROW EXECUTE FUNCTION private.check_detection_rule_org();
