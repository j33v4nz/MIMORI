# Rule Packs

MIMORI stores organization-scoped rules as data in the `rules` table. The shipped SQL seed is the core rule pack; its comment headings group signatures by behavior family without requiring a second runtime service.

## Current coverage

- Instruction override and indirect prompt injection
- Jailbreak personas and filter-bypass framing
- System-prompt and hidden-reasoning extraction
- Encoding and boundary-token evasion
- Excessive agency and approval bypass
- SSRF, local metadata access, command injection, and SQL injection
- Credential, secret, and external exfiltration patterns

Rules are evaluated against the JSON payload of every ingested event. A match creates a detection linked to the original event, so a rule result can be inspected in the session timeline.

## Rule format

Each rule has:

| Field | Meaning |
| --- | --- |
| `name` | Stable human-readable name, unique within its organization. |
| `org_id` | Organization that owns the rule; required. |
| `description` | Why the signature matters. |
| `pattern` | A keyword or JavaScript-compatible regular expression. |
| `pattern_type` | `keyword` for a case-insensitive substring, or `regex` for a regular expression. |
| `category` | The behavior family shown in detections. |
| `severity` | `low`, `medium`, `high`, or `critical`. |
| `enabled` | Whether ingestion evaluates the rule. |

Example:

```sql
insert into public.rules
  (org_id, name, description, pattern, pattern_type, category, severity, enabled)
values
  (
    '00000000-0000-0000-0000-000000000001', -- local sandbox only; replace with your organization UUID
    'Unexpected export tool',
    'Flags a tool that should not be available to the agent.',
    'customer_export',
    'keyword',
    'excessive_agency',
    'high',
    true
  )
on conflict (org_id, name) do nothing;
```

## Adding a pack

For a local experiment, use **Rules -> New Rule** in the dashboard. For a reusable open-source pack, add a clearly grouped, idempotent insert block to `supabase/seed/001_rules.sql`, add a focused test case to `app/lib/detection/rules.test.ts`, and document the coverage here. Keep signatures specific enough to avoid matching normal agent work.

MIMORI currently keeps pack metadata lightweight. A future release could promote grouping comments into pack/version records; this is not a shipped feature.
