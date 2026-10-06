import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { getAgents, getSessionsForAgent } from "../../lib/dashboard/queries";
import { formatDate } from "../../lib/format";
import { EmptyState } from "../../components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function AgentSessionsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const [agents, sessions] = await Promise.all([
    getAgents(),
    getSessionsForAgent(resolvedParams.id)
  ]);
  const agent = agents.find((item) => item.id === resolvedParams.id);

  const totalEvents = sessions.reduce((acc, s) => acc + s.event_count, 0);
  const totalDetections = sessions.reduce((acc, s) => acc + s.detection_count, 0);

  return (
    <div className="flex-1 flex flex-col space-y-margin-page">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-stack-md">
        <div>
          <Link
            href="/agents"
            className="inline-flex items-center gap-unit text-secondary hover:text-primary transition-colors font-label-xs text-label-xs uppercase tracking-widest mb-2"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            Back to Agents
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display-lg text-headline-lg text-on-surface">
              {agent?.name ?? "Observed Agent"}
            </h1>
            <span className="px-2 py-0.5 border border-on-surface font-label-xs text-label-xs uppercase bg-surface-container-high">
              {agent?.framework ?? "custom"}
            </span>
          </div>
          <p className="font-body-md text-secondary mt-1">
            Agent ID: <span className="font-data-mono text-xs text-on-surface">{resolvedParams.id}</span>
          </p>
        </div>
      </div>

      {/* Bento Metrics Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-outline-variant/70 bg-surface p-5 flex flex-col justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-secondary">Total Sessions</span>
          <span className="font-mono text-2xl font-bold text-on-surface mt-2">{sessions.length}</span>
        </div>
        <div className="border border-outline-variant/70 bg-surface p-5 flex flex-col justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-secondary">Total Events</span>
          <span className="font-mono text-2xl font-bold text-on-surface mt-2">{totalEvents.toLocaleString()}</span>
        </div>
        <div className="border border-outline-variant/70 bg-surface p-5 flex flex-col justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-secondary">Threat Detections</span>
          <span className={`font-mono text-2xl font-bold mt-2 ${totalDetections > 0 ? "text-error" : "text-on-surface"}`}>
            {totalDetections}
          </span>
        </div>
        <div className="border border-outline-variant/70 bg-surface p-5 flex flex-col justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-secondary">Health Status</span>
          <div className="mt-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${totalDetections === 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className={`font-mono text-lg font-bold tracking-wider uppercase ${totalDetections === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
              {totalDetections === 0 ? "OPTIMAL" : "ATTENTION"}
            </span>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="border border-outline-variant/70 bg-surface flex flex-col overflow-hidden">
        <div className="border-b border-outline-variant/70 px-6 py-4 flex justify-between items-center bg-surface-container-low/50">
          <h2 className="font-mono text-xs uppercase tracking-widest text-on-surface font-semibold">
            Recorded Execution Sessions
          </h2>
          <span className="font-mono text-xs text-secondary">
            {sessions.length} Sessions
          </span>
        </div>

        {sessions.length === 0 ? (
          <EmptyState title="No Sessions Found" message="No execution sessions have been recorded for this agent yet." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="border-b border-outline-variant/70 bg-surface-container-low/30 font-mono text-[11px] text-secondary uppercase tracking-wider">
                  <th className="px-6 py-3.5">Session Identifier</th>
                  <th className="px-6 py-3.5 text-right w-32">Events</th>
                  <th className="px-6 py-3.5 text-right w-36">Detections</th>
                  <th className="px-6 py-3.5 w-52">Started At</th>
                  <th className="px-6 py-3.5 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs divide-y divide-outline-variant/40">
                {sessions.map((session) => {
                  const hasDetections = session.detection_count > 0;
                  return (
                    <tr
                      key={session.id}
                      className={`hover:bg-surface-container-low/50 transition-colors ${
                        hasDetections ? "bg-error-container/10" : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-bold text-on-surface">
                        <Link
                          href={`/agents/${resolvedParams.id}/sessions/${session.id}`}
                          className="text-primary hover:underline flex items-center gap-2"
                        >
                          <Clock className="w-4 h-4 shrink-0 text-secondary" aria-hidden="true" />
                          <span className="font-mono">{session.external_session_id ?? session.id.slice(0, 8)}</span>
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-right text-on-surface font-mono">
                        {session.event_count}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {hasDetections ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-error/30 bg-error/10 text-error font-mono font-bold text-[11px] uppercase tracking-wider rounded-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                            {session.detection_count} Threats
                          </span>
                        ) : (
                          <span className="text-secondary/60 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-secondary text-xs font-mono">
                        {formatDate(session.started_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/agents/${resolvedParams.id}/sessions/${session.id}`}
                          className="h-7 px-3 bg-[#1A1A1A] text-white hover:bg-black font-mono text-xs uppercase transition-colors inline-flex items-center justify-center font-bold tracking-wider rounded-sm"
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
