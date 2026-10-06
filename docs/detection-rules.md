# Detection Rules Engine

MIMORI uses a deterministic rules engine to evaluate incoming events. Every time an event hits the ingestion API, its raw payload (prompts, tool args, outputs) is checked against your active rules. This is your first line of defense, backed up by the slower, asynchronous LLM Judge.

## Rule types

1. **Regex rules (`pattern_type: 'regex'`)**
   Evaluates the payload against a standard regular expression.
   - Example: SSRF IP detection (`^169\.254\.169\.254$`)
   - Example: SQL injection heuristics

2. **Keyword rules (`pattern_type: 'keyword'`)**
   Checks if the payload contains specific keywords or phrases (case-insensitive).
   - Example: Jailbreak phrases (`ignore all previous instructions`, `DAN`, `do anything now`)

## Standard seed rules
The core pack comes with pre-written SQL seeds covering several attack families:
- **Jailbreak and prompt injection** (critical/high)
- **System-prompt extraction and encoding evasion** (medium/high)
- **SSRF, metadata access, SQL injection, and command injection** (high/critical)
- **Data exfiltration and credential leakage** (high/critical)
- **Excessive agency and privilege escalation** (medium/critical)

Rules are evaluated by the `detectWithRules` function during event ingestion. If a rule triggers, a `Detection` record is created (flagged as `layer: 'rule'`) and attached to the event.

## Catching the rest
Since static rules can't catch everything, MIMORI also relies on an **asynchronous LLM Judge** to catch semantic anomalies, and the **Behavior Diff** feature to visually inspect changes in an agent's execution patterns over time.
