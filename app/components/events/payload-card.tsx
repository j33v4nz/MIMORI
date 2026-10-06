"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle, Copy, Check, Terminal, Cpu, Wrench, ShieldAlert, ArrowRight, ExternalLink } from "lucide-react";
import { ResolveButton } from "../../detections/resolve-button";
import { formatCategoryName, formatEventTypeName, formatInternal } from "../../lib/format";

interface Detection {
  id: string;
  severity: string;
  category: string;
  resolved_at: string | null;
}

interface EventPayloadCardProps {
  eventType: string;
  payload: Record<string, unknown>;
  detections: Detection[];
}

interface ParsedTurn {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

interface EmittedToolCall {
  name: string;
  args: Record<string, unknown> | string;
  id?: string;
}

function parseRawPromptString(raw: string): { userText: string; turns: ParsedTurn[] } {
  const ollamaUserMatch = raw.match(/<\|start_header_id\|>user<\|end_header_id\|>\s*([\s\S]*?)(?:<\|eot_id\|>|$)/i);
  if (ollamaUserMatch) {
    return { userText: ollamaUserMatch[1].trim(), turns: [] };
  }

  const instMatch = raw.match(/\[INST\]\s*([\s\S]*?)\s*\[\/INST\]/i);
  if (instMatch) {
    return { userText: instMatch[1].trim(), turns: [] };
  }

  if (raw.includes("Human:") || raw.includes("AI:") || raw.includes("Tool:") || raw.includes("System:")) {
    const lines = raw.split(/\n(?=(?:Human|AI|Tool|System):)/i);
    const turns: ParsedTurn[] = [];

    for (const segment of lines) {
      const trimmed = segment.trim();
      if (!trimmed) continue;

      if (/^System:/i.test(trimmed)) {
        turns.push({ role: "system", content: trimmed.replace(/^System:\s*/i, "").trim() });
      } else if (/^Human:/i.test(trimmed)) {
        turns.push({ role: "user", content: trimmed.replace(/^Human:\s*/i, "").trim() });
      } else if (/^AI:/i.test(trimmed)) {
        turns.push({ role: "assistant", content: trimmed.replace(/^AI:\s*/i, "").trim() });
      } else if (/^Tool:/i.test(trimmed)) {
        turns.push({ role: "tool", content: trimmed.replace(/^Tool:\s*/i, "").trim() });
      } else {
        turns.push({ role: "user", content: trimmed });
      }
    }

    const lastUserTurn = [...turns].reverse().find((t) => t.role === "user");
    return {
      userText: lastUserTurn?.content ?? turns[0]?.content ?? raw,
      turns: turns.length > 1 ? turns : []
    };
  }

  return { userText: raw.trim(), turns: [] };
}

function extractPromptTextAndTurns(prompts: unknown): { userText: string; turns: ParsedTurn[] } {
  if (!prompts) return { userText: "", turns: [] };

  if (Array.isArray(prompts) && prompts.length > 0) {
    const turns: ParsedTurn[] = [];
    const items = Array.isArray(prompts[0]) ? prompts[0] : prompts;
    let isObjectArray = false;

    for (const item of items) {
      if (typeof item === "object" && item !== null && ("role" in item || "content" in item || "text" in item)) {
        isObjectArray = true;
        const roleStr = String((item as Record<string, unknown>).role || "user").toLowerCase();
        const role: ParsedTurn["role"] =
          roleStr === "system" ? "system" :
          roleStr === "assistant" || roleStr === "ai" ? "assistant" :
          roleStr === "tool" || roleStr === "function" ? "tool" : "user";

        const content = typeof (item as Record<string, unknown>).content === "string"
          ? String((item as Record<string, unknown>).content)
          : typeof (item as Record<string, unknown>).text === "string"
          ? String((item as Record<string, unknown>).text)
          : JSON.stringify((item as Record<string, unknown>).content ?? item);

        turns.push({ role, content });
      }
    }

    if (isObjectArray && turns.length > 0) {
      const lastUser = [...turns].reverse().find((t) => t.role === "user");
      return {
        userText: lastUser?.content ?? turns[turns.length - 1].content,
        turns: turns.length > 1 ? turns : []
      };
    }

    if (typeof items[0] === "string") {
      return parseRawPromptString(String(items[0]));
    }
  }

  if (typeof prompts === "string") {
    return parseRawPromptString(prompts);
  }

  return { userText: String(prompts), turns: [] };
}

function extractLLMResponse(payload: Record<string, unknown>): {
  llmText: string;
  emittedToolCalls: EmittedToolCall[];
} {
  let llmText = "";
  const emittedToolCalls: EmittedToolCall[] = [];

  const extractToolsFromObj = (obj: any) => {
    if (!obj) return;
    const tcList =
      obj.tool_calls ||
      obj.kwargs?.tool_calls ||
      obj.additional_kwargs?.tool_calls ||
      obj.function_call ||
      obj.kwargs?.function_call;

    if (Array.isArray(tcList)) {
      for (const tc of tcList) {
        if (tc) {
          const name = tc.name || tc.function?.name || "tool";
          let args = tc.args || tc.function?.arguments || {};
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              // keep as string
            }
          }
          emittedToolCalls.push({ name, args, id: tc.id });
        }
      }
    }
  };

  if (Array.isArray(payload.generations) && payload.generations.length > 0) {
    const firstList = payload.generations[0];
    if (Array.isArray(firstList) && firstList.length > 0) {
      const firstGen = firstList[0];
      if (typeof firstGen === "object" && firstGen !== null) {
        if (typeof firstGen.text === "string" && firstGen.text.trim()) {
          llmText = firstGen.text.trim();
        } else if (firstGen.message?.content && typeof firstGen.message.content === "string") {
          llmText = firstGen.message.content.trim();
        }
        extractToolsFromObj(firstGen.message);
        extractToolsFromObj(firstGen);
      }
    }
  }

  if (payload.response && typeof payload.response === "object") {
    const resp = payload.response as Record<string, any>;

    if (Array.isArray(resp.generations) && resp.generations.length > 0) {
      const firstList = resp.generations[0];
      if (Array.isArray(firstList) && firstList.length > 0) {
        const firstGen = firstList[0];
        if (typeof firstGen === "object" && firstGen !== null) {
          if (typeof firstGen.text === "string" && firstGen.text.trim()) {
            llmText = firstGen.text.trim();
          } else if (firstGen.message?.content && typeof firstGen.message.content === "string") {
            llmText = firstGen.message.content.trim();
          }
          extractToolsFromObj(firstGen.message);
          extractToolsFromObj(firstGen);
        }
      }
    }

    if (Array.isArray(resp.choices) && resp.choices.length > 0) {
      const choice = resp.choices[0];
      if (choice?.message?.content && typeof choice.message.content === "string") {
        llmText = choice.message.content.trim();
      }
      extractToolsFromObj(choice?.message);
    }

    if (Array.isArray(resp.content) && resp.content.length > 0) {
      const textBlock = resp.content.find((b: any) => b.type === "text" || typeof b.text === "string");
      if (textBlock?.text) {
        llmText = textBlock.text.trim();
      }
      const toolBlocks = resp.content.filter((b: any) => b.type === "tool_use");
      for (const tb of toolBlocks) {
        emittedToolCalls.push({ name: tb.name, args: tb.input ?? {}, id: tb.id });
      }
    }

    if (!llmText && typeof resp.text === "string" && resp.text.trim()) {
      llmText = resp.text.trim();
    }
    if (!llmText && typeof resp.response === "string" && resp.response.trim()) {
      llmText = resp.response.trim();
    }
  } else if (typeof payload.response === "string") {
    llmText = payload.response.trim();
  }

  if (!llmText && payload.output) {
    if (typeof payload.output === "string") {
      llmText = payload.output.trim();
    } else if (typeof payload.output === "object" && payload.output !== null) {
      const outObj = payload.output as Record<string, any>;
      if (typeof outObj.text === "string") llmText = outObj.text.trim();
      else if (typeof outObj.output === "string") llmText = outObj.output.trim();
      else if (typeof outObj.result === "string") llmText = outObj.result.trim();
    }
  }

  return { llmText, emittedToolCalls };
}

function parsePayloadContent(eventType: string, payload: Record<string, unknown>) {
  let userText = "";
  let promptTurns: ParsedTurn[] = [];
  let llmText = "";
  let emittedToolCalls: EmittedToolCall[] = [];
  let toolCallStr = "";
  let toolResult = "";
  let agentAction = "";
  let workflowName = "";
  let workflowStatus = "";
  let tokenInfo = "";
  let interAgentHandoff = "";

  const s = payload.serialized as Record<string, unknown> | undefined;
  const agentActor =
    (typeof s?.name === "string" ? s.name : "") ||
    (typeof payload.agent_name === "string" ? payload.agent_name : "") ||
    (typeof payload.agent === "string" ? payload.agent : "") ||
    (typeof payload.agent_role === "string" ? payload.agent_role : "") ||
    "";

  if (typeof payload.action === "string" && payload.action.toLowerCase().includes("handoff")) {
    interAgentHandoff = payload.action;
  } else if (payload.sender && payload.recipient) {
    interAgentHandoff = `${payload.sender} ➔ ${payload.recipient}`;
  }

  if (eventType === "llm_start" || payload.prompts || payload.prompt || payload.messages) {
    const extracted = extractPromptTextAndTurns(payload.prompts || payload.prompt || payload.messages);
    userText = extracted.userText;
    promptTurns = extracted.turns;
  }

  if (eventType === "llm_end" || payload.generations || payload.response) {
    const res = extractLLMResponse(payload);
    llmText = res.llmText;
    emittedToolCalls = res.emittedToolCalls;

    if (emittedToolCalls.length > 0 && !toolCallStr) {
      toolCallStr = emittedToolCalls
        .map((tc) => `${tc.name}(${typeof tc.args === "object" ? JSON.stringify(tc.args) : tc.args})`)
        .join("\n");
    }
  }

  if (eventType === "tool_start" || payload.tool) {
    const toolObj = payload.tool as Record<string, unknown> | undefined;
    const toolName = toolObj?.name || (typeof payload.name === "string" ? payload.name : "") || "Tool";
    const rawArgs = payload.input || payload.arguments || payload.params || payload.args || "";
    const formattedArgs = typeof rawArgs === "object" ? JSON.stringify(rawArgs) : String(rawArgs);
    toolCallStr = `${toolName}(${formattedArgs})`;
  }

  if (eventType === "tool_end" || (payload.output && eventType !== "llm_end" && eventType !== "chain_end")) {
    const out = payload.output || payload.result || "";
    toolResult = typeof out === "object" ? JSON.stringify(out, null, 2) : String(out);
  }

  if (eventType === "agent_action" || payload.action) {
    const act = payload.action;
    agentAction = typeof act === "object" ? JSON.stringify(act, null, 2) : String(act || "");
  }

  if (eventType === "chain_start" || eventType === "chain_end" || payload.chain) {
    const chainObj = payload.chain as Record<string, unknown> | undefined;
    workflowName = String(chainObj?.name || payload.name || agentActor || "Workflow");
    if (eventType === "chain_end") {
      workflowStatus = "Completed Successfully";
    } else if (eventType === "chain_start") {
      workflowStatus = "Initialized";
    }
  }

  const usage = (payload.token_usage || payload.usage) as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    const promptTokens = usage.prompt_tokens ?? usage.input_tokens;
    const completionTokens = usage.completion_tokens ?? usage.output_tokens;
    const total = usage.total_tokens;
    if (total !== undefined || promptTokens !== undefined) {
      const pCount = typeof promptTokens === "number" ? promptTokens : 0;
      const cCount = typeof completionTokens === "number" ? completionTokens : 0;
      const tCount = typeof total === "number" ? total : pCount + cCount;
      tokenInfo = `${pCount} in / ${cCount} out (${tCount} total)`;
    }
  }

  return {
    userText,
    promptTurns,
    llmText,
    emittedToolCalls,
    toolCallStr,
    toolResult,
    agentAction,
    workflowName,
    workflowStatus,
    tokenInfo,
    agentActor,
    interAgentHandoff
  };
}

function sanitizePayload(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizePayload);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "kwargs" && typeof value === "object" && value !== null) {
      const clean = sanitizePayload(value);
      if (typeof clean === "object" && clean !== null && Object.keys(clean).length > 0) {
        result[key] = clean;
      }
      continue;
    }
    if (key === "serialized" && typeof value === "object" && value !== null) {
      const s = value as Record<string, unknown>;
      const name = s.name ?? s._type;
      if (name) {
        result[key] = { name };
      } else {
        result[key] = { _type: s._type ?? "unknown" };
      }
      continue;
    }
    result[key] = sanitizePayload(value);
  }
  return result;
}

export function EventPayloadCard({ eventType, payload, detections }: EventPayloadCardProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "json">("summary");
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const hasDetections = detections.length > 0;
  const {
    userText,
    promptTurns,
    llmText,
    emittedToolCalls,
    toolCallStr,
    toolResult,
    agentAction,
    workflowName,
    workflowStatus,
    tokenInfo,
    agentActor,
    interAgentHandoff
  } = parsePayloadContent(eventType, payload);

  const hasHumanContent = Boolean(
    userText ||
    llmText ||
    emittedToolCalls.length > 0 ||
    toolCallStr ||
    toolResult ||
    agentAction ||
    workflowName ||
    interAgentHandoff
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`bg-surface border overflow-hidden transition-all rounded-sm shadow-sm ${
        hasDetections ? "border-error/80 ring-1 ring-error/30" : "border-outline-variant/70 hover:border-outline"
      }`}
    >
      {/* Header Bar with Tabs & Badges */}
      <div className="bg-surface-container-low/70 border-b border-outline-variant/70 px-4 py-2 flex flex-wrap justify-between items-center gap-2">
        <div role="tablist" aria-label="Payload view mode" className="flex items-center gap-1.5">
          <button
            type="button"
            role="tab"
            id="tab-summary"
            aria-selected={activeTab === "summary"}
            aria-controls="panel-summary"
            onClick={() => setActiveTab("summary")}
            className={`font-mono text-[11px] font-bold uppercase px-3 py-1 border transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
              activeTab === "summary"
                ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                : "bg-surface-container-low text-secondary border-outline-variant/60 hover:text-on-surface"
            }`}
          >
            Human View ({formatEventTypeName(eventType)})
          </button>
          <button
            type="button"
            role="tab"
            id="tab-json"
            aria-selected={activeTab === "json"}
            aria-controls="panel-json"
            onClick={() => setActiveTab("json")}
            className={`font-mono text-[11px] font-bold uppercase px-3 py-1 border transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
              activeTab === "json"
                ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                : "bg-surface-container-low text-secondary border-outline-variant/60 hover:text-on-surface"
            }`}
          >
            Raw JSON
          </button>
        </div>

        <div className="flex items-center gap-3">
          {tokenInfo && (
            <span className="font-mono text-[10px] bg-surface-container-high/60 border border-outline-variant/60 px-2 py-0.5 text-secondary rounded-sm hidden sm:inline-flex items-center gap-1">
              <Cpu className="w-3 h-3 text-primary" />
              {tokenInfo}
            </span>
          )}
          <button
            type="button"
            onClick={() => handleCopy(JSON.stringify(payload, null, 2))}
            title="Copy Raw Event Payload"
            className="p-1 text-secondary hover:text-on-surface transition-colors rounded-sm hover:bg-surface-container-high"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {hasDetections ? (
            <AlertTriangle className="w-4 h-4 text-error shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Multi-Agent Loop & Handoff Ribbon */}
      {interAgentHandoff && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold">🔄 MULTI-AGENT HANDOFF:</span>
            <span className="text-on-surface font-semibold">{interAgentHandoff}</span>
          </div>
        </div>
      )}

      {/* Detections Threat Alert Header */}
      {hasDetections && (
        <div className="bg-error-container/20 border-b border-error/40 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold text-error uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-error animate-pulse" />
              Security Violation Intercepted
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {detections.map((detection) => (
              <div
                key={detection.id}
                className="flex items-center gap-2 bg-surface/80 border border-error/50 p-1.5 rounded-sm"
              >
                <span className="inline-flex items-center gap-1.5 text-error text-[10px] font-bold uppercase px-2 py-0.5 bg-error/10 rounded-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                  {detection.severity.toUpperCase()} : {formatCategoryName(detection.category)}
                </span>
                <Link
                  href={`/detections/${detection.id}`}
                  className="font-mono text-[10px] text-secondary hover:text-on-surface flex items-center gap-0.5 underline decoration-dotted"
                >
                  Report <ExternalLink className="w-2.5 h-2.5" />
                </Link>
                <ResolveButton id={detection.id} resolved={!!detection.resolved_at} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card Content Body */}
      {activeTab === "summary" ? (
        <div
          role="tabpanel"
          id="panel-summary"
          aria-labelledby="tab-summary"
          tabIndex={0}
          className="p-4 space-y-4 bg-surface text-xs font-mono focus-visible:outline-none"
        >
          {/* Active Role Bar */}
          {agentActor && (
            <div className="flex items-center justify-between text-xs pb-2 border-b border-outline-variant/30">
              <div className="flex items-center gap-2">
                <span className="text-secondary font-medium">🤖 Active Role:</span>
                <span className="text-on-surface font-bold bg-surface-container-high px-2 py-0.5 border border-outline-variant/60 rounded-sm">
                  {agentActor}
                </span>
              </div>
            </div>
          )}

          {/* User Prompt & Conversation Turn History */}
          {userText && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-secondary uppercase font-bold tracking-wider flex items-center gap-1.5">
                  💬 User Prompt
                </span>
                {promptTurns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-[10px] text-primary hover:underline font-semibold"
                  >
                    {showHistory ? "Hide Turn History" : `View Turn History (${promptTurns.length} turns)`}
                  </button>
                )}
              </div>

              <div className="p-3.5 bg-surface-container-low/40 border border-outline-variant/60 text-on-surface whitespace-pre-wrap leading-relaxed rounded-sm font-sans text-xs">
                {userText}
              </div>

              {/* Collapsible Prior Turn History */}
              {showHistory && promptTurns.length > 0 && (
                <div className="mt-2 space-y-2 pl-3 border-l-2 border-primary/40 pt-1">
                  <span className="text-[10px] text-secondary uppercase font-bold tracking-wider block">
                    Context Message Sequence
                  </span>
                  {promptTurns.map((turn, idx) => (
                    <div key={idx} className="p-2.5 bg-surface-container-low/60 border border-outline-variant/40 rounded-sm space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-secondary uppercase">
                        {turn.role === "user" ? "👤 User" : turn.role === "assistant" ? "🤖 AI" : turn.role === "tool" ? "🛠️ Tool" : "⚙️ System"}
                      </div>
                      <div className="text-on-surface text-[11px] whitespace-pre-wrap font-mono">
                        {turn.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Response Text */}
          {llmText && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-secondary uppercase font-bold tracking-wider flex items-center gap-1.5">
                  🤖 AI Response
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(llmText)}
                  className="text-[10px] text-secondary hover:text-on-surface flex items-center gap-1"
                >
                  <Copy className="w-2.5 h-2.5" /> Copy Text
                </button>
              </div>
              <div className="p-3.5 bg-surface-container-low/50 border border-outline-variant/60 text-on-surface whitespace-pre-wrap leading-relaxed rounded-sm font-sans text-xs">
                {llmText}
              </div>
            </div>
          )}

          {/* Autonomous Tool Calls Emitted by Model */}
          {emittedToolCalls.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Wrench className="w-3 h-3" />
                Emitted Tool Call(s) ({emittedToolCalls.length})
              </span>
              <div className="space-y-1.5">
                {emittedToolCalls.map((tc, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-amber-500/5 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-mono rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{tc.name}</span>
                      <span className="text-secondary text-[11px]">
                        {typeof tc.args === "object" ? JSON.stringify(tc.args) : tc.args}
                      </span>
                    </div>
                    {tc.id && (
                      <span className="text-[10px] text-secondary font-mono">id: {tc.id}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Single Tool Invocation (Tool Start) */}
          {toolCallStr && emittedToolCalls.length === 0 && (
            <div>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold tracking-wider block mb-1.5">
                🛠️ Tool Invocation
              </span>
              <div className="p-3 bg-amber-500/5 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold whitespace-pre-wrap break-all rounded-sm">
                {toolCallStr}
              </div>
            </div>
          )}

          {/* Tool Result Output */}
          {toolResult && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">
                  📊 Tool Output
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(toolResult)}
                  className="text-[10px] text-secondary hover:text-on-surface flex items-center gap-1"
                >
                  <Copy className="w-2.5 h-2.5" /> Copy JSON
                </button>
              </div>
              <div className="p-3 bg-surface-container-low/50 border border-outline-variant/60 text-on-surface whitespace-pre-wrap break-all max-h-56 overflow-auto rounded-sm font-mono text-[11px]">
                {toolResult}
              </div>
            </div>
          )}

          {/* Agent Action Decision */}
          {agentAction && !interAgentHandoff && (
            <div>
              <span className="text-[10px] text-primary uppercase font-bold tracking-wider block mb-1.5">
                ⚡ Agent Decision
              </span>
              <div className="p-3 bg-primary/5 border border-primary/20 text-on-surface whitespace-pre-wrap rounded-sm">
                {agentAction}
              </div>
            </div>
          )}

          {/* Workflow Lifecycle Step */}
          {workflowName && !userText && !llmText && !toolCallStr && !toolResult && (
            <div className="p-3.5 bg-surface-container-low/40 border border-outline-variant/60 text-on-surface rounded-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-secondary font-medium">🔗 Workflow:</span>
                <span className="font-bold text-on-surface">{workflowName}</span>
              </div>
              {workflowStatus && (
                <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm">
                  {workflowStatus}
                </span>
              )}
            </div>
          )}

          {/* Fallback for Telemetry Markers */}
          {!hasHumanContent && (
            <div className="p-3.5 bg-surface-container-low/30 border border-outline-variant/50 text-secondary rounded-sm flex items-center justify-between">
              <span className="italic text-[11px]">
                Telemetry step marker: {formatEventTypeName(eventType)}
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("json")}
                className="text-[10px] text-primary font-bold uppercase hover:underline"
              >
                Inspect Raw JSON ➔
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Raw JSON View */
        <div
          role="tabpanel"
          id="panel-json"
          aria-labelledby="tab-json"
          tabIndex={0}
          className="p-4 bg-surface-container-lowest text-on-surface font-mono text-xs max-h-80 overflow-auto focus-visible:outline-none custom-scrollbar"
        >
          <pre className="whitespace-pre-wrap break-all leading-normal text-secondary font-mono text-xs">
            {JSON.stringify(sanitizePayload(payload), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

