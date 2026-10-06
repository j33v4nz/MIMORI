import Link from "next/link";
import { Bot, TrendingUp, AlertTriangle, Activity } from "lucide-react";

interface MetricsGridProps {
  observedAgentsCount: number;
  totalEvents24h: number;
  criticalAlerts: number;
  totalEvents7d: number;
}

export function MetricsGrid({
  observedAgentsCount,
  totalEvents24h,
  criticalAlerts,
  totalEvents7d
}: MetricsGridProps) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Overview metrics">
      {/* Metric 1 — Observed Agents */}
      <Link
        href="/agents"
        aria-label={`View agents: ${observedAgentsCount} observed`}
        className="bg-surface border border-outline-variant/70 p-5 hover:border-outline hover:bg-surface-container-low/60 transition-colors block shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        <div className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider mb-2.5 flex justify-between items-center">
          <span>Observed Agents</span>
          <Bot className="w-4 h-4 text-secondary" />
        </div>
        <div className="font-display-lg text-3xl font-bold text-on-surface tracking-tight">
          {String(observedAgentsCount).padStart(3, "0")}
        </div>
        <div className="font-mono text-[11px] text-secondary mt-1.5">Agents recorded in this workspace</div>
      </Link>

      {/* Metric 2 — Events (24h) */}
      <Link
        href="/events"
        aria-label={`View events: ${totalEvents24h} in last 24 hours`}
        className="bg-surface border border-outline-variant/70 p-5 hover:border-outline hover:bg-surface-container-low/60 transition-colors block shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        <div className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider mb-2.5 flex justify-between items-center">
          <span>Events (24h)</span>
          <TrendingUp className="w-4 h-4 text-secondary" />
        </div>
        <div className="font-display-lg text-3xl font-bold text-on-surface tracking-tight">
          {totalEvents24h.toLocaleString()}
        </div>
        <div className="font-mono text-[11px] text-secondary mt-1.5">Recorded telemetry events</div>
      </Link>

      {/* Metric 3 — Critical Alerts */}
      <Link
        href="/detections?severity=critical"
        aria-label={`View critical alerts: ${criticalAlerts} unresolved in the last 24 hours`}
        className={`border p-5 transition-colors block shadow-[0_1px_3px_rgba(0,0,0,0.03)] ${
          criticalAlerts > 0
            ? "bg-error/5 border-error/40 text-on-error-container hover:bg-error/10"
            : "bg-surface border-outline-variant/70 hover:border-outline hover:bg-surface-container-low/60"
        }`}
      >
        <div className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider mb-2.5 flex justify-between items-center">
          <span className={criticalAlerts > 0 ? "text-error font-bold" : "text-secondary"}>Critical Alerts (24h)</span>
          <AlertTriangle className={`w-4 h-4 ${criticalAlerts > 0 ? "text-error" : "text-secondary"}`} />
        </div>
        <div className={`font-display-lg text-3xl font-bold tracking-tight ${criticalAlerts > 0 ? "text-error" : "text-on-surface"}`}>
          {String(criticalAlerts).padStart(3, "0")}
        </div>
        <div className="font-mono text-[11px] text-secondary mt-1.5">Unresolved detections created in 24h</div>
      </Link>

      {/* Metric 4 — Events (7d) */}
      <Link
        href="/events"
        aria-label={`View events: ${totalEvents7d} total in last 7 days`}
        className="bg-surface border border-outline-variant/70 p-5 hover:border-outline hover:bg-surface-container-low/60 transition-colors block shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        <div className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider mb-2.5 flex justify-between items-center">
          <span>Events (7d)</span>
          <Activity className="w-4 h-4 text-secondary" />
        </div>
        <div className="font-display-lg text-3xl font-bold text-on-surface tracking-tight">
          {totalEvents7d.toLocaleString()}
        </div>
        <div className="font-mono text-[11px] text-secondary mt-1.5">7-day aggregated volume</div>
      </Link>
    </section>
  );
}
