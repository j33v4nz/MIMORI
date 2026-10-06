"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, LayoutList, GitCommit, X, Filter, ShieldAlert, Wrench, MessageSquare, Bot, Layers, Copy, Check } from "lucide-react";
import { MultiAgentFlow, type SessionTimelineEvent } from "./multi-agent-flow";
import { EventPayloadCard } from "./payload-card";
import { formatEventTypeName, formatTimeHHMMSS } from "../../lib/format";
import { EmptyState } from "../ui/empty-state";

interface SessionTimelineViewerProps {
  agentName: string;
  sessionId: string;
  events: SessionTimelineEvent[];
  // Optional blame target: the event that caused the incident. When omitted,
  // the first malicious (critical/high, else any flagged) event is used.
  causedByEventId?: string;
}

type CategoryFilter = "all" | "prompts" | "responses" | "tools" | "threats";

function getNodeColorClass(eventType: string, hasDetections: boolean): string {
  if (hasDetections) return "bg-error ring-4 ring-error/20 animate-pulse";
  if (eventType === "llm_start") return "bg-sky-500";
  if (eventType === "llm_end") return "bg-purple-500";
  if (eventType === "tool_start" || eventType === "tool_end") return "bg-amber-500";
  if (eventType === "chain_start" || eventType === "chain_end") return "bg-emerald-500";
  return "bg-on-surface";
}

export function SessionTimelineViewer({
  agentName,
  sessionId,
  events,
  causedByEventId
}: SessionTimelineViewerProps) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"tree" | "stream">("tree");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [copiedSession, setCopiedSession] = useState(false);

  // Category counts
  const promptCount = useMemo(() => events.filter((e) => e.event_type === "llm_start" || e.payload.prompts || e.payload.prompt).length, [events]);
  const responseCount = useMemo(() => events.filter((e) => e.event_type === "llm_end" || e.payload.generations || e.payload.response).length, [events]);
  const toolCount = useMemo(() => events.filter((e) => e.event_type === "tool_start" || e.event_type === "tool_end" || e.payload.tool).length, [events]);
  const threatCount = useMemo(() => events.filter((e) => e.detections && e.detections.length > 0).length, [events]);

  // Causal highlight: explicit prop wins, else first malicious
  // (critical/high severity) event, else first flagged event, else null.
  const causalEventId = useMemo(() => {
    if (causedByEventId && events.some((e) => e.id === causedByEventId)) return causedByEventId;
    const flagged = events.filter((e) => e.detections && e.detections.length > 0);
    if (flagged.length === 0) return null;
    const malicious = flagged.find((e) =>
      e.detections.some((d) => d.severity === "critical" || d.severity === "high")
    );
    return (malicious ?? flagged[0]).id;
  }, [events, causedByEventId]);

  // Scroll only when the caller explicitly passed a blame target. An
  // auto-picked highlight must never yank the viewport.
  const explicitCause = causedByEventId != null && causalEventId === causedByEventId;

  // Scroll the explicitly-caused event into view once timeline data settles.
  useEffect(() => {
    if (!explicitCause || !causalEventId) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = document.getElementById(`timeline-event-${causalEventId}`);
    el?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
  }, [causalEventId, explicitCause]);

  // Filter events based on selectedRole, searchQuery, and categoryFilter
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // 1. Category Filter
      if (categoryFilter === "prompts") {
        if (ev.event_type !== "llm_start" && !ev.payload.prompts && !ev.payload.prompt) return false;
      } else if (categoryFilter === "responses") {
        if (ev.event_type !== "llm_end" && !ev.payload.generations && !ev.payload.response) return false;
      } else if (categoryFilter === "tools") {
        if (ev.event_type !== "tool_start" && ev.event_type !== "tool_end" && !ev.payload.tool) return false;
      } else if (categoryFilter === "threats") {
        if (!ev.detections || ev.detections.length === 0) return false;
      }

      // 2. Role filter
      if (selectedRole) {
        const p = ev.payload;
        const s = p.serialized as Record<string, unknown> | undefined;
        const actor =
          (typeof s?.name === "string" ? s.name : "") ||
          (typeof p.agent_name === "string" ? p.agent_name : "") ||
          (typeof p.agent === "string" ? p.agent : "") ||
          (typeof p.agent_role === "string" ? p.agent_role : "") ||
          (typeof p.sender === "string" ? p.sender : "");

        if (selectedRole === "user") {
          if (ev.event_type !== "llm_start" && !p.prompts && !p.prompt && !p.messages) {
            return false;
          }
        } else if (selectedRole === "tools") {
          if (ev.event_type !== "tool_start" && ev.event_type !== "tool_end" && !p.tool) {
            return false;
          }
        } else if (selectedRole === agentName) {
          if (actor && actor !== agentName) {
            return false;
          }
        } else {
          if (actor !== selectedRole) {
            return false;
          }
        }
      }

      // 3. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const payloadStr = JSON.stringify(ev.payload).toLowerCase();
        const typeStr = ev.event_type.toLowerCase();
        if (!payloadStr.includes(query) && !typeStr.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [events, selectedRole, searchQuery, categoryFilter, agentName]);

  const handleCopySessionId = () => {
    navigator.clipboard.writeText(sessionId);
    setCopiedSession(true);
    setTimeout(() => setCopiedSession(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Topology Flow Graph */}
      <MultiAgentFlow
        agentName={agentName}
        sessionId={sessionId}
        events={events}
        selectedRole={selectedRole}
        onSelectRole={setSelectedRole}
      />

      {/* Quick Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-2.5 border border-outline-variant/70 font-mono text-xs rounded-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors rounded-sm border ${
              categoryFilter === "all"
                ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                : "bg-surface-container-low text-secondary border-outline-variant/60 hover:text-on-surface"
            }`}
          >
            All Steps ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("prompts")}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors rounded-sm border flex items-center gap-1 ${
              categoryFilter === "prompts"
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-surface-container-low text-secondary border-outline-variant/60 hover:text-sky-500"
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            Prompts ({promptCount})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("responses")}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors rounded-sm border flex items-center gap-1 ${
              categoryFilter === "responses"
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-surface-container-low text-secondary border-outline-variant/60 hover:text-purple-500"
            }`}
          >
            <Bot className="w-3 h-3" />
            AI Responses ({responseCount})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("tools")}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors rounded-sm border flex items-center gap-1 ${
              categoryFilter === "tools"
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-surface-container-low text-secondary border-outline-variant/60 hover:text-amber-500"
            }`}
          >
            <Wrench className="w-3 h-3" />
            Tool Events ({toolCount})
          </button>
          {threatCount > 0 && (
            <button
              type="button"
              onClick={() => setCategoryFilter("threats")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors rounded-sm border flex items-center gap-1 ${
                categoryFilter === "threats"
                  ? "bg-error text-white border-error"
                  : "bg-error-container/20 text-error border-error/50 hover:bg-error-container/40"
              }`}
            >
              <ShieldAlert className="w-3 h-3 animate-pulse" />
              Threats ({threatCount})
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopySessionId}
          className="text-secondary hover:text-on-surface text-[11px] font-mono flex items-center gap-1.5 px-2 py-1 bg-surface-container-low border border-outline-variant/60 rounded-sm"
        >
          {copiedSession ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          <span>Session: <code className="text-on-surface">{sessionId.slice(0, 8)}...</code></span>
        </button>
      </div>

      {/* Timeline Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-3.5 border border-outline-variant/70 font-mono text-xs rounded-sm">
        {/* Search & Active Filter Tag */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64 max-w-sm">
            <Search className="w-3.5 h-3.5 text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search event payloads..."
              className="w-full h-8 bg-surface-container-low border border-outline-variant/70 text-on-surface text-xs pl-8 pr-7 rounded-sm focus:outline-none focus:border-primary transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {selectedRole && (
            <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/40 text-primary px-2.5 py-1 text-[11px] rounded-sm">
              <Filter className="w-3 h-3" />
              <span>Actor: <strong>{selectedRole}</strong></span>
              <button
                type="button"
                onClick={() => setSelectedRole(null)}
                className="hover:text-white ml-1 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          <span className="text-secondary text-[11px]">
            Showing {filteredEvents.length} of {events.length} steps
          </span>
        </div>

        {/* View Mode Switcher & Legend */}
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-surface-container-low border border-outline-variant/70 p-0.5 rounded-sm">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`flex items-center gap-1 px-3 py-1 text-xs uppercase tracking-wider transition-colors rounded-sm font-mono ${
                viewMode === "tree"
                  ? "bg-[#1A1A1A] text-white font-bold"
                  : "text-secondary hover:text-on-surface"
              }`}
              title="Alternating Tree View"
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Tree</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("stream")}
              className={`flex items-center gap-1 px-3 py-1 text-xs uppercase tracking-wider transition-colors rounded-sm font-mono ${
                viewMode === "stream"
                  ? "bg-[#1A1A1A] text-white font-bold"
                  : "text-secondary hover:text-on-surface"
              }`}
              title="Linear Stream View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Stream</span>
            </button>
          </div>

          {/* Legend */}
          <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-sky-500"></div>
              <span className="text-secondary">Prompt</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
              <span className="text-secondary">AI</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span className="text-secondary">Tool</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-error animate-pulse"></div>
              <span className="text-error font-bold">Threat</span>
            </div>
          </div>
        </div>
      </div>

      {/* Events Timeline Container */}
      <div className="relative pt-2">
        {filteredEvents.length === 0 ? (
          <EmptyState
            title="No Matching Events"
            message={
              selectedRole || searchQuery || categoryFilter !== "all"
                ? "No telemetry events matched your active filter criteria or search query."
                : "No telemetry events were found for this session."
            }
          />
        ) : viewMode === "tree" ? (
          <>
            {/* Center Line for Tree View */}
            <div className="absolute left-1/2 -translate-x-1/2 w-px bg-outline-variant/40 h-full z-0 top-0 hidden md:block"></div>

            <div className="space-y-10 relative z-10">
              {filteredEvents.map((event, index) => {
                const isFirst = index === 0;
                const timeDiff = isFirst
                  ? 0
                  : (new Date(event.created_at).getTime() - new Date(events[0].created_at).getTime()) / 1000;
                const timeStr = isFirst ? "+0.000s" : `+${timeDiff.toFixed(3)}s`;
                const hasDetections = (event.detections ?? []).length > 0;
                const isEven = index % 2 === 0;
                const nodeColor = getNodeColorClass(event.event_type, hasDetections);

                return (
                  <div
                    key={event.id}
                    id={`timeline-event-${event.id}`}
                    className={`relative w-full flex flex-col md:flex-row justify-between items-stretch gap-4 md:gap-0 scroll-mt-24 ${
                      isEven ? "" : "md:flex-row-reverse"
                    } ${
                      event.id === causalEventId ? "outline outline-2 outline-offset-4 outline-error/70 rounded-sm" : ""
                    }`}
                  >
                    {/* Time & Label Column */}
                    <div
                      className={`w-full md:w-[calc(50%-32px)] flex flex-col justify-center py-2 ${
                        isEven ? "md:text-right md:pr-6" : "md:text-left md:pl-6"
                      }`}
                    >
                      <span className="font-mono text-xs text-secondary font-semibold">
                        {formatTimeHHMMSS(event.created_at)} <span className="text-secondary/70">({timeStr})</span>
                      </span>
                      <h3
                        className={`font-display-lg text-base font-bold mt-1 uppercase ${
                          hasDetections ? "text-error" : "text-on-surface"
                        }`}
                      >
                        {formatEventTypeName(event.event_type)}
                      </h3>
                      <span className="font-mono text-[11px] text-secondary">
                        Sequence #{event.sequence_number}
                      </span>
                    </div>

                    {/* Timeline Node Center Indicator */}
                    <div className="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-20">
                      <div
                        className={`w-3.5 h-3.5 border-2 border-surface rounded-full ${nodeColor}`}
                      />
                    </div>

                    {/* Content Card Column */}
                    <div className="w-full md:w-[calc(50%-32px)]">
                      <EventPayloadCard
                        eventType={event.event_type}
                        payload={event.payload}
                        detections={event.detections ?? []}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Linear Stream View (No zigzag, optimal for rapid scan) */
          <div className="space-y-4">
            {filteredEvents.map((event) => {
              const hasDetections = (event.detections ?? []).length > 0;
              const nodeColor = getNodeColorClass(event.event_type, hasDetections);

              return (
                <div
                  key={event.id}
                  id={`timeline-event-${event.id}`}
                  className={`border p-5 bg-surface transition-colors rounded-sm shadow-sm scroll-mt-24 ${
                    hasDetections ? "border-error/70 bg-error-container/5 ring-1 ring-error/20" : "border-outline-variant/70"
                  }${event.id === causalEventId ? " outline outline-2 outline-offset-2 outline-error" : ""}`}
                >
                  <div className="flex justify-between items-center pb-2.5 border-b border-outline-variant/40 mb-3.5 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${nodeColor}`} />
                      <span className="font-bold text-on-surface uppercase tracking-wider">{formatEventTypeName(event.event_type)}</span>
                      <span className="text-secondary text-[11px]">Sequence #{event.sequence_number}</span>
                    </div>
                    <span className="text-secondary text-xs">{formatTimeHHMMSS(event.created_at)}</span>
                  </div>
                  <EventPayloadCard
                    eventType={event.event_type}
                    payload={event.payload}
                    detections={event.detections ?? []}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
