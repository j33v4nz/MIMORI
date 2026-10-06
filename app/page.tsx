import { Suspense } from "react";
import Loading from "./loading";
import { getOverviewStats, getEvents } from "./lib/dashboard/queries";
import { computeVigilance } from "./lib/vigilance";
import {
  PageHeader,
  MetricsGrid,
  SeverityMatrix,
  TopAgentsTable,
  TerminalLog,
  StatusFooter
} from "./components/dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const statsPromise = getOverviewStats();
  const recentEventsPromise = getEvents(20);

  return (
    <Suspense fallback={<Loading />}>
      <Overview
        statsPromise={statsPromise}
        recentEventsPromise={recentEventsPromise}
      />
    </Suspense>
  );
}

async function Overview({
  statsPromise,
  recentEventsPromise,
}: {
  statsPromise: ReturnType<typeof getOverviewStats>;
  recentEventsPromise: ReturnType<typeof getEvents>;
}) {
  const stats = await statsPromise;
  const recentEvents = await recentEventsPromise;

  const totalDetections24h = Object.values(stats.detections_by_severity_24h).reduce(
    (total, count) => total + count,
    0
  );

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toISOString().split("T")[1].slice(0, 8) + " UTC";

  const { systemStatus, vigilanceLevel, statusColor, statusBg } =
    computeVigilance(stats.detections_by_severity_24h);

  return (
    <div className="space-y-gutter">
      <PageHeader
        systemStatus={systemStatus}
        vigilanceLevel={vigilanceLevel}
        statusColor={statusColor}
        statusBg={statusBg}
        dateStr={dateStr}
        timeStr={timeStr}
      />

      <MetricsGrid
        observedAgentsCount={stats.observed_agents}
        totalEvents24h={stats.total_events_24h}
        criticalAlerts={stats.detections_by_severity_24h.critical}
        totalEvents7d={stats.total_events_7d}
      />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
        {/* Left Column: Severity Distribution & Top Agents (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-gutter">
          <SeverityMatrix
            totalDetections24h={totalDetections24h}
            low={stats.detections_by_severity_24h.low}
            medium={stats.detections_by_severity_24h.medium}
            high={stats.detections_by_severity_24h.high}
            critical={stats.detections_by_severity_24h.critical}
          />
          <TopAgentsTable topAgents={stats.top_agents_by_volume} />
        </div>

        {/* Right Column: Live Event Stream (5 cols) */}
        <div className="col-span-12 lg:col-span-5">
          <TerminalLog recentEvents={recentEvents} />
        </div>
      </section>

      <StatusFooter
        statusBg={statusBg}
        systemStatus={systemStatus}
        statusColor={statusColor}
        dateStr={dateStr}
      />
    </div>
  );
}
