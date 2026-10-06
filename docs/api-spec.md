# Ingestion API Specification

*(Note: This covers the ingestion endpoint used by the SDK. Internal dashboard API routes are omitted.)*

MIMORI exposes a serverless REST API for ingesting agent telemetry.

### `POST /api/ingest/event`

Ingests a batch of events for a specific agent session.

**Headers:**
- `Authorization: Bearer <API_KEY>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "agent_name": "Customer-Support-Bot",
  "session_id": "cs-ticket-9e21",
  "events": [
    {
      "event_type": "llm_start",
      "sequence_number": 1,
      "payload": {
        "prompt": "Hello world"
      },
      "timestamp": "2026-07-07T10:00:00Z"
    }
  ]
}
```

**Response (HTTP `202 Accepted`):**
```json
{
  "accepted": 1,
  "session_id": "cs-ticket-9e21",
  "session_record_id": "uuid",
  "immediate_detections": []
}
```

- `session_id` is your external session identifier. 
- `session_record_id` is the internal MIMORI identifier used by the dashboard and Behavior Diff API.
- `immediate_detections` returns findings recorded during ingestion by deterministic rules or optional Laya classification. The example assumes no enabled rule matches its benign payload. Asynchronous judge findings appear after the worker runs and are not included in the original response.
- `skipped` (optional) lists any events in the batch that failed validation, with their index and reason.

---

## Security, Authentication & Rate Limiting

### Authentication
All ingestion requests must be authenticated using an API key generated from the MIMORI dashboard.
Provide the key in the `Authorization` header:
`Authorization: Bearer <API_KEY>`

### API Key Scopes
- **Organization-scoped telemetry and comparison**: Keys allow ingestion and `GET /api/behavior-diff` for their organization. Comparison exposes recorded profiles and findings, so treat keys as read-capable credentials too. Keys cannot manage rules or authenticate dashboard pages. An invalid supplied bearer key is rejected even if a dashboard cookie is present.
- **Rotation**: It is recommended to rotate your API keys periodically (e.g., every 90 days). You can revoke old keys and issue new ones directly from the API Keys page in the dashboard.

### Rate Limits
To protect the ingestion pipeline from abuse and ensure system stability, MIMORI enforces rate limiting on the `/api/ingest/event` endpoint:
- **Default Limit**: 1,200 events per minute per API key, configurable with `INGEST_EVENTS_PER_MINUTE`. Each batch charges its event count (empty batches charge one).
- **Window**: A fixed 60-second window starting with the first charged request; counters reset on the next request after expiration.

If you exceed the rate limit, the API will respond with:
```json
{
  "error": {
    "code": "rate_limited",
    "message": "Ingestion event budget exceeded for this API key."
  }
}
```
*HTTP Status Code: `429 Too Many Requests`*

### Payload Size Limits
To prevent memory exhaustion, the ingestion endpoint enforces a strict payload size limit:
- **Max Body Bytes**: 1 MB
- **Max Events per Request**: 500 events


Database limiter failures return retryable `503` with error code
`rate_limit_unavailable` and `Retry-After: 60`; they never bypass the budget.
Batches larger than the configured event budget are denied even in a fresh window.

## Behavior comparison

`GET /api/behavior-diff?baseline=<session_record_id>&candidate=<session_record_id>`
accepts an organization API key or an authenticated dashboard session. The response
contains `baseline`, `candidate`, and `diff`; use internal session IDs from ingestion.
The `diff.status` is `clear`, `review`, or `high_risk`, with profiles, additions,
removals, input changes, order changes, and comparison warnings.

`clear` describes recorded inspected fields only. Redacted values and missing
telemetry cannot establish that an agent is safe. See [behavior comparison](behavior-diff.md).
