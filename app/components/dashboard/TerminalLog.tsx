"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatEventTypeName } from "../../lib/format";
import type { DashboardEvent } from "../../lib/dashboard/queries";

interface TerminalLogProps {
  recentEvents: DashboardEvent[];
}

export function TerminalLog({ recentEvents }: TerminalLogProps) {
  const router = useRouter();
  return (
    <div className="border border-outline-variant/70 h-full flex flex-col bg-surface min-h-[460px]">
      <div className="px-5 py-3.5 border-b border-outline-variant/70 flex justify-between items-center bg-surface-container-low/50">
        <span className="font-mono text-xs uppercase tracking-wider text-secondary font-bold">
          Recent Event Snapshot
        </span>
        <button type="button" onClick={() => router.refresh()} className="font-mono text-[11px] text-secondary font-bold tracking-wider">Refresh</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2.5 font-mono text-xs leading-tight bg-surface-container-lowest/30 custom-scrollbar max-h-[500px]">
        {recentEvents.length === 0 ? (
          <div className="text-secondary/70 italic my-8 text-center font-mono text-xs">
            No telemetry ingested yet. Run an agent script, then refresh to view its events.
          </div>
        ) : (
          recentEvents.map((evt) => {
            const isCrit = evt.detections.some((d) => d.severity === "critical");
            const isHigh = evt.detections.some((d) => d.severity === "high");
            const isAlert = evt.detections.length > 0;
            const timeStr = new Date(evt.created_at).toISOString().split("T")[1].slice(0, 8);

            const borderClass = isCrit
              ? "border-l-2 border-error pl-3 bg-error-container/10"
              : isHigh
              ? "border-l-2 border-amber-500 pl-3 bg-amber-500/5"
              : "border-l-2 border-outline-variant/60 pl-3";

            const tagText = isCrit
              ? "CRIT"
              : isHigh
              ? "WARN"
              : evt.event_type.startsWith("llm")
              ? "LLM"
              : evt.event_type.startsWith("tool")
              ? "TOOL"
              : "INFO";

            return (
              <div
                key={evt.id}
                className={`flex gap-3 items-start py-1.5 transition-colors ${borderClass}`}
              >
                <span className="text-secondary/80 shrink-0 text-[11px] font-mono">{timeStr}</span>
                <div
                  className={`w-1.5 h-1.5 mt-1 shrink-0 rounded-full ${
                    isCrit ? "bg-error animate-pulse" : isHigh ? "bg-amber-500" : "bg-outline-variant"
                  }`}
                />
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`font-bold text-[11px] uppercase tracking-wider ${
                        isCrit ? "text-error" : isHigh ? "text-amber-500" : "text-on-surface"
                      }`}
                    >
                      {tagText}:
                    </span>
                    <span className="font-semibold text-on-surface truncate">
                      {evt.session.agent.name}
                    </span>
                    <span className="text-secondary text-[11px]">
                      ({formatEventTypeName(evt.event_type)})
                    </span>
                  </div>
                  {isAlert && (
                    <span className="text-error text-[11px] font-semibold mt-0.5">
                      Threat signature triggered: {evt.detections.map((d) => d.severity.toUpperCase()).join(", ")}
                    </span>
                  )}
                </div>
                <Link
                  href={
                    evt.session?.agent?.id && evt.session?.id
                      ? `/agents/${evt.session.agent.id}/sessions/${evt.session.id}`
                      : `/events`
                  }
                  className="h-6 px-2 bg-surface-container border border-outline-variant/80 hover:bg-[#1A1A1A] hover:text-white hover:border-[#1A1A1A] text-secondary shrink-0 text-[10px] uppercase font-bold transition-colors inline-flex items-center justify-center rounded-sm"
                >
                  Trace →
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
