import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionEvents, getAgents } from "../../../../lib/dashboard/queries";
import { SessionTimelineViewer } from "../../../../components/events/session-timeline-viewer";

export const dynamic = "force-dynamic";

export default async function SessionTimelinePage({
  params
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const resolvedParams = await params;
  const [events, agents] = await Promise.all([
    getSessionEvents(resolvedParams.sessionId),
    getAgents()
  ]);

  const agent = agents.find((a) => a.id === resolvedParams.id);
  const agentName = agent?.name ?? "Agent";

  return (
    <div className="flex-1 flex flex-col space-y-margin-page pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-stack-md border-b border-on-surface pb-6">
        <div>
          <Link
            href={`/agents/${resolvedParams.id}`}
            className="inline-flex items-center gap-unit text-secondary hover:text-primary transition-colors font-label-xs text-label-xs uppercase tracking-widest mb-2"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            Back to Agent Sessions
          </Link>
          <h1 className="font-display-lg text-headline-lg text-on-surface">
            Session Execution Trace
          </h1>
          <p className="font-body-md text-secondary mt-1">
            Agent: <span className="text-on-surface font-bold">{agentName}</span>
            <span className="mx-2 text-outline-variant">·</span>
            Session ID: <span className="font-data-mono text-xs text-on-surface">{resolvedParams.sessionId}</span>
          </p>
        </div>
      </div>

      {/* Interactive Timeline & Topology Viewer */}
      <SessionTimelineViewer
        agentName={agentName}
        sessionId={resolvedParams.sessionId}
        events={events}
      />
    </div>
  );
}
