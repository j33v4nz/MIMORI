-- Every new organization starts with the visible versioned rule pack.
-- Runs inside organization creation; no account or shared key is provisioned.
CREATE OR REPLACE FUNCTION private.seed_new_org_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
WITH rule_pack (name, pattern, pattern_type, category, severity, enabled) AS (
VALUES
  (
    'SQL Injection',
    '(?i)\b(UNION\s+SELECT|DROP\s+TABLE|OR\s+1=1|--;\s*EXEC|WAITFOR\s+DELAY|BENCHMARK\s*\(|SLEEP\s*\()\b',
    'regex',
    'threat',
    'high',
    true
  ),
  (
    'Ignore Previous Instructions',
    '(?i)ignore (all )?(previous|prior|above) instructions',
    'regex',
    'instruction_override',
    'high',
    true
  ),
  (
    'Disregard System Prompt',
    '(?i)disregard (the )?(system|developer) (prompt|message|instructions)',
    'regex',
    'instruction_override',
    'high',
    true
  ),
  (
    'SSRF Cloud Metadata Exploit',
    '(?i)\b(169\.254\.169\.254|metadata\.google\.internal)\b',
    'regex',
    'threat',
    'critical',
    true
  ),
  (
    'DAN Jailbreak Persona',
    '(?i)\bDAN\b.{0,80}(jailbreak|do anything now|bypass)|do anything now',
    'regex',
    'jailbreak_persona',
    'medium',
    true
  ),
  (
    'Developer Mode Bypass',
    '(?i)enable developer mode|developer mode.{0,80}(bypass|restriction|safety)',
    'regex',
    'jailbreak_persona',
    'medium',
    true
  ),
  (
    'System Prompt Extraction',
    '(?i)(reveal|print|show|repeat).{0,80}(system prompt|developer message|hidden instructions)',
    'regex',
    'system_prompt_extraction',
    'high',
    true
  ),
  (
    'Credential & Secret Exfiltration',
    '(?i)(api[_ -]?key|password|token|secret).*(send|post|upload|exfiltrate)',
    'regex',
    'data_exfiltration',
    'critical',
    true
  ),
  (
    'SDK Reported Credential Exposure',
    'MIMORI_CREDENTIAL_EXPOSURE',
    'keyword',
    'data_exfiltration',
    'critical',
    true
  ),
  (
    'AWS Secret Key Leakage',
    '(?i)(AKIA[0-9A-Z]{16}|aws_secret_access_key)',
    'regex',
    'data_exfiltration',
    'critical',
    true
  ),
  (
    'Excessive Agency Action',
    '(?i)(delete|transfer|email|download|run|execute).*(without asking|without approval|do not ask)',
    'regex',
    'excessive_agency',
    'high',
    true
  ),
  (
    'RCE Command Injection',
    '(?i)(;\s*(rm -rf|curl|wget|nc -e|bash -i|powershell)|&&\s*(curl|wget|sh))',
    'regex',
    'threat',
    'critical',
    true
  )
 )
INSERT INTO public.rules (id, org_id, name, pattern, pattern_type, category, severity, enabled)
SELECT gen_random_uuid(), org.id, pack.name, pack.pattern, pack.pattern_type,
       pack.category, pack.severity, pack.enabled
FROM (SELECT NEW.id AS id) AS org
CROSS JOIN rule_pack AS pack
ON CONFLICT (org_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.seed_new_org_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_org_created_seed_rules ON public.organizations;
CREATE TRIGGER on_org_created_seed_rules
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION private.seed_new_org_rules();
