import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";
import { EmptyState } from "../ui/empty-state";

interface TopAgent {
  agent_id: string;
  agent_name: string;
  event_count: number;
}

interface TopAgentsTableProps {
  topAgents: TopAgent[];
}

export function TopAgentsTable({ topAgents }: TopAgentsTableProps) {
  return (
    <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="p-4 px-5 border-b border-outline-variant/80 flex justify-between items-center bg-surface-container-low/80">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="font-mono text-xs uppercase tracking-wider text-on-surface font-semibold">
            Top Active Agents (24h)
          </span>
        </div>
        <Link
          href="/agents"
          className="font-mono text-xs text-secondary hover:text-primary uppercase tracking-wider font-semibold transition-colors flex items-center gap-1"
        >
          <span>View Fleet</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        {topAgents.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No Agents Active" message="No agent activity recorded in the past 24 hours." />
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-outline-variant/70 bg-surface-container-low/60 font-mono text-[11px] font-semibold text-secondary uppercase tracking-wider">
                <th className="py-3 px-5 w-20">Rank</th>
                <th className="py-3 px-5">Agent Name</th>
                <th className="py-3 px-5 text-right w-36">Event Volume</th>
                <th className="py-3 px-5 text-right w-36">Action</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs divide-y divide-outline-variant/40">
              {topAgents.map((agent, index) => (
                <tr
                  key={agent.agent_id || `${agent.agent_name}-${index}`}
                  className="hover:bg-surface-container-low/70 transition-colors group"
                >
                  <td className="py-3.5 px-5 text-secondary font-mono text-xs">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td className="py-3.5 px-5 font-semibold text-on-surface">
                    <Link href={`/agents/${agent.agent_id}`} className="hover:text-primary transition-colors flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>{agent.agent_name}</span>
                    </Link>
                  </td>
                  <td className="py-3.5 px-5 text-right text-on-surface font-medium">
                    {agent.event_count.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-5 text-right whitespace-nowrap">
                    <Link
                      href={`/agents/${agent.agent_id}`}
                      className="inline-flex items-center gap-1 text-secondary hover:text-primary font-mono text-[11px] uppercase tracking-wider transition-colors"
                    >
                      <span>Sessions</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

