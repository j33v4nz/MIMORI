import Link from "next/link";
import { getEvents, getAgents } from "../lib/dashboard/queries";
import { formatEventTypeName, formatDate } from "../lib/format";
import { SeverityBadge } from "../components/ui/severity-badge";
import { EmptyState } from "../components/ui/empty-state";
import { TimeFilterBar } from "../components/events/time-filter-bar";

export const dynamic = "force-dynamic";

function buildAgentFilterUrl(
  agentId: string | undefined,
  from: string | undefined,
  to: string | undefined
) {
  const params = new URLSearchParams();
  if (agentId) params.set("agentId", agentId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return `/events${qs ? `?${qs}` : ""}`;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    agentId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const resolved = await searchParams;
  const { agentId, from, to } = resolved;
  const agents = await getAgents();
  const events = await getEvents(10000, agentId, from, to);

  const selectedAgent = agents.find((a) => a.id === agentId);
  const hasFilters = !!(agentId || from || to);

  return (
    <div className="flex-1 flex flex-col space-y-8 pb-12">
      {/* Title Row */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-secondary" />
            <span className="font-mono text-xs uppercase tracking-widest text-secondary font-semibold">
              Recorded Audit Events & Tool Executions
            </span>
          </div>
          <h1 className="font-display-lg text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
            Telemetry Events
          </h1>
          <p className="font-body-md text-sm md:text-base text-secondary max-w-2xl mt-1">
            Recent recorded agent interactions, LLM inferences, tool calls, and detections. Refresh this page to load new events.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-secondary bg-surface-container-low px-3 py-1.5 border border-outline-variant/60">
            <strong className="text-on-surface">{events.length}</strong> {events.length === 1 ? "Event" : "Events"}
            {selectedAgent && (
              <span className="ml-2 text-primary font-bold">
                ({selectedAgent.name})
              </span>
            )}
          </span>
          {hasFilters && (
            <Link
              href="/events"
              className="px-3 py-1.5 border border-outline-variant hover:border-on-surface bg-surface text-on-surface hover:bg-surface-container-high font-mono text-xs font-bold uppercase transition-colors"
            >
              Clear Filters
            </Link>
          )}
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="bg-surface border border-outline-variant/70 p-3.5 px-5 flex flex-wrap items-center justify-between gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        {/* Agent Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider mr-1">
            Agent:
          </span>
          <Link
            href={buildAgentFilterUrl(undefined, from, to)}
            className={`px-3 py-1 font-mono text-xs uppercase tracking-wider border transition-colors select-none ${
              !agentId
                ? "bg-on-surface text-surface border-on-surface font-bold"
                : "bg-surface-container-low text-secondary border-outline-variant/60 hover:border-on-surface hover:text-on-surface"
            }`}
          >
            All
          </Link>
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={buildAgentFilterUrl(agent.id, from, to)}
              className={`px-3 py-1 font-mono text-xs uppercase tracking-wider border transition-colors select-none ${
                agentId === agent.id
                  ? "bg-on-surface text-surface border-on-surface font-bold"
                  : "bg-surface-container-low text-secondary border-outline-variant/60 hover:border-on-surface hover:text-on-surface"
              }`}
            >
              {agent.name}
            </Link>
          ))}
        </div>

        {/* Time Filter */}
        <TimeFilterBar agentId={agentId} from={from} to={to} />
      </div>

      {/* Main Table Content */}
      <div className="border border-outline-variant/80 bg-surface flex flex-col overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        {events.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No Telemetry Found"
              message="No events matched your current filters. Execute an agent script to stream telemetry."
            />
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <caption className="sr-only">Telemetry events log</caption>
              <thead>
                <tr className="border-b border-outline-variant/80 bg-surface-container-low/80 font-mono text-[11px] font-semibold text-secondary uppercase tracking-wider">
                  <th className="px-5 py-3.5 w-44">Timestamp</th>
                  <th className="px-5 py-3.5 w-36">Agent</th>
                  <th className="px-5 py-3.5 w-36">Event Type</th>
                  <th className="px-5 py-3.5">Payload Context</th>
                  <th className="px-5 py-3.5 w-28 text-center">Alerts</th>
                  <th className="px-5 py-3.5 w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40 font-mono text-xs">
                {events.map((event) => {
                  const preview = getPayloadPreview(
                    event.event_type,
                    event.payload
                  );
                  const truncatedPreview =
                    preview.length > 100
                      ? preview.substring(0, 100) + "..."
                      : preview;
                  const hasDetections = event.detections.length > 0;

                  return (
                    <tr
                      key={event.id}
                      className={`hover:bg-surface-container-low/70 transition-colors ${
                        hasDetections
                          ? "bg-error/5 hover:bg-error/10"
                          : ""
                      }`}
                    >
                      <td className="px-5 py-4 whitespace-nowrap text-secondary text-xs">
                        {formatDate(event.created_at)}
                      </td>
                      <td className="px-5 py-4 font-bold text-on-surface text-xs whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-surface-container-high/60 border border-outline-variant/60">
                          {event.session.agent.name}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-block border border-outline-variant/70 px-2 py-0.5 text-[10px] uppercase font-bold bg-surface-container-low text-secondary">
                          {formatEventTypeName(event.event_type)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-secondary">
                        <div className="bg-surface-container-lowest border border-outline-variant/50 px-2.5 py-1 line-clamp-1 overflow-hidden text-ellipsis">
                          <code>{truncatedPreview}</code>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        {!hasDetections ? (
                          <span className="text-secondary text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap justify-center gap-1">
                            {event.detections.map((det) => (
                              <SeverityBadge
                                key={det.id}
                                severity={det.severity}
                                size="sm"
                              />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <Link
                          href={`/agents/${event.session.agent.id}/sessions/${event.session.id}`}
                          className="h-7 inline-flex items-center px-2.5 py-1 border border-outline-variant hover:border-on-surface hover:bg-on-surface hover:text-surface font-mono text-[10px] font-bold uppercase transition-colors select-none"
                        >
                          Trace
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function extractPromptPreview(prompts: unknown): string {
  if (!Array.isArray(prompts) || prompts.length === 0) return "";

  const first = prompts[0];

  if (typeof first === "string") {
    const ollamaUserMatch = first.match(/<\|start_header_id\|>user<\|end_header_id\|>\s*([\s\S]*?)(?:<\|eot_id\|>|$)/i);
    if (ollamaUserMatch) {
      return ollamaUserMatch[1].trim();
    }

    if (first.includes("Human:")) {
      const humanText = first.split(/Human:/i).pop()?.trim();
      if (humanText) return humanText;
    }

    const humanMsgMatch = first.match(/\[INST\]\s*(.*?)\s*\[\/INST\]/is);
    if (humanMsgMatch) {
      return humanMsgMatch[1].trim();
    }

    return first;
  }

  if (Array.isArray(first)) {
    const reversed = [...first].reverse();
    const lastUser = reversed.find(
      (m: unknown): m is Record<string, unknown> =>
        typeof m === "object" && m !== null && "role" in m && (m as Record<string, unknown>).role === "user"
    );
    if (lastUser && typeof lastUser.content === "string") {
      return lastUser.content;
    }
  }

  return String(first);
}

function getPayloadPreview(
  event_type: string,
  payload: Record<string, unknown>
): string {
  try {
    if (event_type === "llm_start" && Array.isArray(payload.prompts)) {
      const text = extractPromptPreview(payload.prompts);
      return text ? `Prompt: ${text}` : "";
    }
    if (event_type === "llm_end" && Array.isArray(payload.generations)) {
      const firstGen = payload.generations[0]?.[0];
      const firstText = firstGen?.text;
      if (firstText && firstText.trim()) return `Response: ${firstText.trim()}`;
      if (firstGen?.message?.kwargs?.tool_calls?.length) {
        const tc = firstGen.message.kwargs.tool_calls[0];
        return `Tool Call: ${tc.name}(${JSON.stringify(tc.args)})`;
      }
    }
    if (payload.input) {
      return typeof payload.input === "object"
        ? `Input: ${JSON.stringify(payload.input)}`
        : `Input: ${payload.input}`;
    }
    if (payload.output) {
      return typeof payload.output === "object"
        ? `Output: ${JSON.stringify(payload.output)}`
        : `Output: ${payload.output}`;
    }
    if (payload.message) {
      return String(payload.message);
    }
    return JSON.stringify(payload);
  } catch {
    return "Event Payload";
  }
}
