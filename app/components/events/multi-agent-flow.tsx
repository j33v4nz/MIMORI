"use client";

import { useState } from "react";

export interface SessionTimelineEvent {
  id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  detections: Array<{
    id: string;
    category: string;
    severity: string;
    resolved_at: string | null;
  }>;
}

interface MultiAgentFlowProps {
  agentName: string;
  sessionId: string;
  events: SessionTimelineEvent[];
  selectedRole?: string | null;
  onSelectRole?: (role: string | null) => void;
}

function extractAgentRoles(events: SessionTimelineEvent[]): string[] {
  const roles = new Set<string>();

  for (const ev of events) {
    const p = ev.payload;
    const s = p.serialized as Record<string, unknown> | undefined;
    const name =
      (typeof s?.name === "string" ? s.name : "") ||
      (typeof p.agent_name === "string" ? p.agent_name : "") ||
      (typeof p.agent === "string" ? p.agent : "") ||
      (typeof p.agent_role === "string" ? p.agent_role : "") ||
      (typeof p.sender === "string" ? p.sender : "");

    if (name && name !== "agent" && name !== "unknown") {
      roles.add(name);
    }
  }

  return Array.from(roles);
}

export function MultiAgentFlow({
  agentName,
  sessionId,
  events,
  selectedRole: controlledSelectedRole,
  onSelectRole
}: MultiAgentFlowProps) {
  const [internalSelectedRole, setInternalSelectedRole] = useState<string | null>(null);
  const selectedRole = controlledSelectedRole !== undefined ? controlledSelectedRole : internalSelectedRole;
  const handleSelectRole = (role: string | null) => {
    if (onSelectRole) {
      onSelectRole(role);
    } else {
      setInternalSelectedRole(role);
    }
  };

  const distinctAgents = extractAgentRoles(events);
  const totalEvents = events.length;
  const totalDetections = events.reduce((sum, e) => sum + e.detections.length, 0);
  const totalTools = events.filter(
    (e) => e.event_type === "tool_start" || (e.event_type !== "tool_end" && e.payload.tool)
  ).length;
  const isMultiAgent = distinctAgents.length > 1;

  const roleEventCount = (roleName: string) => {
    return events.filter((ev) => {
      const p = ev.payload;
      const s = p.serialized as Record<string, unknown> | undefined;
      const name =
        (typeof s?.name === "string" ? s.name : "") ||
        (typeof p.agent_name === "string" ? p.agent_name : "") ||
        (typeof p.agent === "string" ? p.agent : "") ||
        (typeof p.agent_role === "string" ? p.agent_role : "") ||
        (typeof p.sender === "string" ? p.sender : "");
      return name === roleName;
    }).length;
  };

  return (
    <section
      role="region"
      aria-label="Multi-Agent Collaboration Topology"
      className="bg-surface border border-outline-variant/70 p-5 mb-8 rounded-sm"
    >
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-4 border-b border-outline-variant/70">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 bg-primary animate-pulse rounded-full"></span>
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
            {isMultiAgent ? "Multi-Agent Collaboration Topology" : "Agent Execution Flow"}
          </h2>
          <span className="font-mono text-[11px] bg-surface-container-high px-2 py-0.5 border border-outline-variant/60 text-secondary uppercase font-semibold rounded-sm">
            {isMultiAgent ? `${distinctAgents.length} Agents Active` : "Single Agent Loop"}
          </span>
        </div>

        {/* Quick Stats Counter */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-secondary uppercase">Steps:</span>
            <span className="text-on-surface font-bold">{totalEvents}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-secondary uppercase">Tools:</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">{totalTools}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-secondary uppercase">Threats:</span>
            <span className={totalDetections > 0 ? "text-error font-extrabold" : "text-emerald-600 dark:text-emerald-400 font-bold"}>
              {totalDetections}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Flow Topology Chain */}
      <div className="pt-4 pb-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <button
            type="button"
            onClick={() => handleSelectRole(selectedRole === "user" ? null : "user")}
            aria-pressed={selectedRole === "user"}
            aria-label="Node: End-User prompt origin"
            className={`flex items-center gap-1.5 border px-3 py-1.5 transition-all rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
              selectedRole === "user"
                ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold"
                : "bg-surface-container-low border-outline-variant/70 text-on-surface hover:border-primary/80"
            }`}
          >
            <span>👤</span>
            <span className="font-bold">End-User</span>
          </button>

          <span className="text-secondary font-bold text-xs" aria-hidden="true">➔</span>

          <button
            type="button"
            onClick={() => handleSelectRole(selectedRole === agentName ? null : agentName)}
            aria-pressed={selectedRole === agentName}
            aria-label={`Node: Primary Agent ${agentName}`}
            className={`flex items-center gap-1.5 border px-3 py-1.5 transition-all rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
              selectedRole === agentName
                ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold"
                : "bg-surface-container-low border-primary/60 text-primary hover:bg-primary/10"
            }`}
          >
            <span>🤖</span>
            <span className="font-bold">{agentName}</span>
          </button>

          {distinctAgents
            .filter((role) => role !== agentName)
            .map((role) => {
              const isSelected = selectedRole === role;
              return (
                <div key={role} className="flex items-center gap-2">
                  <span className="text-secondary font-bold text-xs" aria-hidden="true">⇄</span>
                  <button
                    type="button"
                    onClick={() => handleSelectRole(isSelected ? null : role)}
                    aria-pressed={isSelected}
                    aria-label={`Node: Subagent ${role}`}
                    className={`flex items-center gap-1.5 border px-3 py-1.5 transition-all rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-tertiary ${
                      isSelected
                        ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold"
                        : "bg-surface-container-low border-outline-variant/80 text-secondary hover:text-on-surface hover:border-outline"
                    }`}
                  >
                    <span>⚡</span>
                    <span className="font-bold">{role}</span>
                  </button>
                </div>
              );
            })}

          {totalTools > 0 && (
            <>
              <span className="text-secondary font-bold text-xs" aria-hidden="true">➔</span>
              <button
                type="button"
                onClick={() => handleSelectRole(selectedRole === "tools" ? null : "tools")}
                aria-pressed={selectedRole === "tools"}
                aria-label={`Node: Tools and APIs, ${totalTools} invocations`}
                className={`flex items-center gap-1.5 border px-3 py-1.5 transition-all rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-warning ${
                  selectedRole === "tools"
                    ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold"
                    : "bg-surface-container-low border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                }`}
              >
                <span>🛠️</span>
                <span className="font-bold">Tools / APIs ({totalTools})</span>
              </button>
            </>
          )}

          <span className="text-secondary font-bold text-xs" aria-hidden="true">➔</span>

          <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/70 px-3 py-1.5 text-on-surface rounded-sm">
            <span>💬</span>
            <span className="font-bold">Agent Output</span>
          </div>
        </div>

        {/* Selected Role Detail Note */}
        {selectedRole && (
          <div className="mt-4 p-3 bg-surface-container-low/60 border border-outline-variant/70 text-xs font-mono flex items-center justify-between text-on-surface rounded-sm">
            <span>
              Filtered Actor: <strong className="text-primary uppercase tracking-wider">{selectedRole}</strong>
              {selectedRole !== "user" && selectedRole !== "tools" && (
                <span className="ml-2 text-secondary">
                  ({roleEventCount(selectedRole)} event steps)
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => handleSelectRole(null)}
              className="text-secondary hover:text-on-surface uppercase text-[10px] font-bold tracking-wider"
            >
              Clear Filter ✕
            </button>
          </div>
        )}
      </div>

      {/* Security Status Banner */}
      {totalDetections > 0 && (
        <div className="mt-4 p-3 bg-error-container/20 border border-error/40 text-error text-xs font-mono flex items-center justify-between rounded-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider">⚠️ Vigilance Alert:</span>
            <span>{totalDetections} security violation(s) intercepted in this session loop.</span>
          </div>
          <span className="text-[11px] uppercase font-bold tracking-wider">Review Flags Below</span>
        </div>
      )}
    </section>
  );
}
