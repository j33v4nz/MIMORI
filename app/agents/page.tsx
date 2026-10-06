import Link from "next/link";
import { Bot, ChevronRight, Activity } from "lucide-react";
import { getAgents } from "../lib/dashboard/queries";
import { formatDate } from "../lib/format";
import { EmptyState } from "../components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await getAgents();

  return (
    <div className="flex-1 flex flex-col space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-secondary font-semibold">
              Autonomous Fleet Topology
            </span>
          </div>
          <h1 className="font-display-lg text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
            Observed Agents
          </h1>
          <p className="font-body-md text-sm md:text-base text-secondary max-w-2xl mt-1">
            Fleet registry of autonomous AI agents streaming behavioral telemetry, framework handlers, and tool executions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-secondary bg-surface-container-low px-3 py-1.5 border border-outline-variant/60">
            <strong className="text-on-surface">{agents.length}</strong> Total Agents Active
          </span>
        </div>
      </div>

      {/* Agents Table */}
      <div className="border border-outline-variant/80 bg-surface flex flex-col overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="border-b border-outline-variant/80 p-4 px-5 flex justify-between items-center bg-surface-container-low/80">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
            <h2 className="font-mono text-xs uppercase tracking-wider text-on-surface font-semibold">
              Registered Agent Fleet
            </h2>
          </div>
          <span className="font-mono text-[11px] text-secondary">
            Live Telemetry Registry
          </span>
        </div>

        {agents.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No Agents Registered"
              message="No observed agents have streamed telemetry yet. Initialize the MIMORI SDK in your agent code to begin monitoring."
            />
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-surface-container-low/60 border-b border-outline-variant/70 font-mono text-[11px] font-semibold text-secondary uppercase tracking-wider">
                  <th className="py-3.5 px-5">Agent Identity</th>
                  <th className="py-3.5 px-5 w-32">Status</th>
                  <th className="py-3.5 px-5 w-40">Framework</th>
                  <th className="py-3.5 px-5 text-right w-36">Total Sessions</th>
                  <th className="py-3.5 px-5 text-right w-36">Total Events</th>
                  <th className="py-3.5 px-5 text-right w-48">Last Active</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs divide-y divide-outline-variant/40">
                {agents.map((agent) => {
                  const isRecent =
                    new Date().getTime() - new Date(agent.last_seen_at).getTime() <
                    1000 * 60 * 15;

                  return (
                    <tr
                      key={agent.id}
                      className="hover:bg-surface-container-low/70 transition-colors group"
                    >
                      <td className="py-4 px-5">
                        <Link
                          href={`/agents/${agent.id}`}
                          className="text-primary hover:text-primary-container font-semibold flex items-center gap-2 group-hover:underline"
                        >
                          <Bot className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
                          <span>{agent.name}</span>
                        </Link>
                      </td>

                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-outline-variant/60 bg-surface-container-low">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isRecent ? "bg-emerald-500 animate-pulse" : "bg-secondary"
                            }`}
                          />
                          <span className="font-mono text-[10px] uppercase font-bold text-secondary">
                            {isRecent ? "Active" : "Idle"}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className="border border-outline-variant/70 px-2 py-0.5 text-[10px] uppercase font-bold bg-surface-container-high text-on-surface">
                          {agent.framework ?? "custom"}
                        </span>
                      </td>

                      <td className="py-4 px-5 text-right font-semibold text-on-surface">
                        {agent.session_count}
                      </td>

                      <td className="py-4 px-5 text-right text-secondary">
                        {agent.event_count.toLocaleString()}
                      </td>

                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <Link
                          href={`/agents/${agent.id}`}
                          className="inline-flex items-center gap-1 text-secondary hover:text-primary font-mono text-[11px] group-hover:translate-x-0.5 transition-transform"
                        >
                          <span>{formatDate(agent.last_seen_at)}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
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

