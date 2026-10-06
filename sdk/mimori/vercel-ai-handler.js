/**
 * Vercel AI SDK integration for MIMORI telemetry.
 *
 * Usage:
 *   // Copy this source file into your ESM project as mimori-vercel.mjs.
 *   // This repository does not publish an npm adapter package.
 *   import { MIMORIVercelAIHandler } from "./mimori-vercel.mjs";
 *
 *   const handler = new MIMORIVercelAIHandler({
 *     apiKey: "mmr_dev_...",
 *     agentName: "my-agent",
 *     apiUrl: "http://localhost:3000",
 *   });
 *
 *   const result = await generateText({
 *     model: openai("gpt-4o"),
 *     prompt: "Hello!",
 *     ...handler.generateTextConfig(),
 *   });
 *
 *   // Or use as a telemetry integration:
 *   const result = await generateText({
 *     model: openai("gpt-4o"),
 *     prompt: "Hello!",
 *     experimental_telemetry: {
 *       isEnabled: true,
 *       integrations: [handler.telemetryIntegration()],
 *     },
 *   });
 */

/**
 * Maximum characters per truncated payload string in the Vercel AI handler.
 *
 * Documented truncation budget (MAX_PAYLOAD_CHARS):
 * - Vercel AI handler (JS): 2000 chars per string. Kept small for
 *   browser/edge payloads and Vercel function limits.
 * - Python SDK handlers (`sdk/mimori/*_handler.py`): 100_000 chars per
 *   string via `_truncate(value, limit=100_000)`, with
 *   `MIMORIConfig.max_payload_chars` (default 100_000) as the documented
 *   client-side budget.
 * The values intentionally differ by runtime; do not assume parity.
 */
export const MAX_PAYLOAD_CHARS = 2000;

function truncate(value, limit = MAX_PAYLOAD_CHARS) {
  const text = value == null ? "" : String(value);
  return text.length > limit ? text.slice(0, limit) : text;
}

export class MIMORIVercelAIHandler {
  constructor({ apiKey, agentName, apiUrl = "http://localhost:3000", sessionId }) {
    if (!apiKey) throw new Error("apiKey is required");
    if (!agentName) throw new Error("agentName is required");

    this.apiKey = apiKey;
    this.agentName = agentName;
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.sessionId = sessionId || `sess_${crypto.randomUUID()}`;
    this._seq = 0;
    this._pending = new Set();
  }

  async _post(endpoint, body) {
    try {
      const res = await fetch(`${this.apiUrl}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.warn(`MIMORI: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn(`MIMORI telemetry failed: ${err.message}`);
    }
  }

  _ingest(events) {
    const pending = this._post("/api/ingest/event", {
      agent_name: this.agentName,
      framework: "vercel-ai",
      session_id: this.sessionId,
      events: events.map((e) => ({
        event_type: e.event_type,
        sequence_number: ++this._seq,
        payload: e.payload,
        timestamp: e.timestamp || new Date().toISOString(),
      })),
    });
    this._pending.add(pending);
    pending.finally(() => this._pending.delete(pending));
    return pending;
  }

  /**
   * Returns a config object to spread into `generateText()` or `streamText()`.
   * Captures step-level events via onStepFinish.
   */
  generateTextConfig() {
    const handler = this;

    return {
      async onStepFinish({ text, toolCalls, toolResults }) {
        const events = [];

        // LLM response
        if (text) {
          events.push({
            event_type: "llm_end",
            payload: { response: truncate(text) },
          });
        }

        // Tool calls
        if (toolCalls) {
          for (const tc of toolCalls) {
            events.push({
              event_type: "tool_start",
              payload: {
                tool: { name: tc.toolName },
                input: truncate(JSON.stringify(tc.input ?? tc.args)),
              },
            });
          }
        }

        // Tool results
        if (toolResults) {
          for (const tr of toolResults) {
            events.push({
              event_type: "tool_end",
              payload: { output: truncate(JSON.stringify(tr.output ?? tr.result)) },
            });
          }
        }

        if (events.length > 0) {
          await handler._ingest(events);
        }
      },
    };
  }

  /**
   * Returns a TelemetryIntegration for use with experimental_telemetry.
   */
  telemetryIntegration() {
    const handler = this;

    return {
      onStart(event) {
        handler._ingest([
          {
            event_type: "chain_start",
            payload: { chain: { name: event.functionId || "vercel-ai" } },
          },
        ]);
      },

      onStepStart(event) {
        handler._ingest([
          {
            event_type: "llm_start",
            payload: {
              serialized: { name: event.model || "vercel-ai-model" },
              prompts: [truncate(event.prompt || "")],
            },
          },
        ]);
      },

      onToolCallStart(event) {
        handler._ingest([
          {
            event_type: "tool_start",
            payload: {
              tool: { name: event.toolCall?.toolName || "unknown" },
              input: truncate(JSON.stringify(event.toolCall?.args)),
            },
          },
        ]);
      },

      onToolCallFinish(event) {
        handler._ingest([
          {
            event_type: "tool_end",
            payload: {
              output: truncate(
                JSON.stringify(event.result || event.error || "")
              ),
            },
          },
        ]);
      },

      onStepFinish(event) {
        handler._ingest([
          {
            event_type: "llm_end",
            payload: {
              response: truncate(
                JSON.stringify(event.text || event.usage || "")
              ),
            },
          },
        ]);
      },

      onFinish(event) {
        handler._ingest([
          {
            event_type: "chain_end",
            payload: {
              outputs: {
                steps: event.steps?.length || 0,
                usage: event.totalUsage,
              },
            },
          },
        ]);
      },
    };
  }

  async close() {
    await Promise.all([...this._pending]);
  }
}
