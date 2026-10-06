# Data Model

MIMORI tracks core entities to maintain full context of agent behavior within a Supabase (PostgreSQL) database.

## 1. Organizations & Members
- `organizations`: Represents a tenant or company.
- `org_members`: Links Supabase Auth users to an organization with a specific role (e.g. `owner`, `member`).

## 2. API Keys
- `api_keys`: Hashed API keys used by the SDK to authenticate ingestion requests. Linked to an `org_id`.

## 3. Agents & Sessions
- `agents`: Represents a logical AI agent (e.g., "Customer Support Bot"). Belongs to an organization.
- `sessions`: A specific execution run or conversation. `id` is the internal UUID used by dashboard and comparison routes; `external_session_id` is the caller's session identifier, unique within its agent. Ingestion returns both identifiers.

## 4. Events
- `events`: The atomic unit of telemetry.
- **Fields:** 
  - `event_type`: `chain_start`, `chain_end`, `llm_start`, `llm_end`, `tool_start`, `tool_end`, `agent_action`, `manual`
  - `sequence_number`: Order of execution within a session.
  - `payload`: Submitted JSON containing prompts, tool arguments, or generated text. SDK submissions contain recognized-value redaction; direct callers are responsible for sanitization.
  - `timestamp`: When the event occurred (mapped to `created_at`).

## 5. Rules & Detections
- `rules`: Threat signatures managed by the organization.
  - **Fields:** `category`, `pattern`, `pattern_type` (`regex`, `keyword`), `severity`.
- `detections`: Created when an Event triggers a rule or is flagged by the LLM Judge.
  - **Fields:** `layer` (`rule`, `laya`, `llm_judge`), `severity`, `verdict`, `confidence`, `resolved_at` (null if active, timestamp if resolved by an operative). Rule detections reference an organization-owned rule; classifier/judge detections have no rule reference.

## 6. LLM Judge Settings & Jobs
- `judge_settings`: Configuration for the LLM Judge per organization. 
  - **Fields:** `provider` (`ollama`, `gemini`, `deepseek`, `openai`, `anthropic`), `model`, `base_url`. API keys are deliberately NOT persisted in the database for security; they are provided via environment variables or expected to be local.
- `llm_judge_jobs`: Asynchronous jobs queued for evaluating events via the LLM Judge.
  - **Fields:** `status` (`pending`, `processing`, `completed`, `failed`), `attempts`, `last_error`.
