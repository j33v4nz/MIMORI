import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface SeverityMatrixProps {
  totalDetections24h: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export function SeverityMatrix({
  totalDetections24h,
  low,
  medium,
  high,
  critical
}: SeverityMatrixProps) {
  const maxVal = Math.max(low, medium, high, critical, 1);

  const categories = [
    {
      key: "low",
      label: "LOW",
      fullLabel: "Low Severity",
      count: low,
      pct: low > 0 ? Math.round((low / maxVal) * 100) : 0,
      textColor: "text-secondary",
      fillBg: "bg-slate-400 dark:bg-slate-500",
      activeBorder: "border-slate-500/40 hover:border-slate-400",
      badgeBg: "bg-slate-500/10 text-slate-400 border-slate-500/30",
      glowColor: "group-hover:shadow-[0_0_15px_rgba(148,163,184,0.35)]"
    },
    {
      key: "medium",
      label: "MED",
      fullLabel: "Medium Severity",
      count: medium,
      pct: medium > 0 ? Math.round((medium / maxVal) * 100) : 0,
      textColor: "text-amber-500",
      fillBg: "bg-amber-500",
      activeBorder: "border-amber-500/40 hover:border-amber-400",
      badgeBg: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      glowColor: "group-hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]"
    },
    {
      key: "high",
      label: "HIGH",
      fullLabel: "High Risk",
      count: high,
      pct: high > 0 ? Math.round((high / maxVal) * 100) : 0,
      textColor: "text-orange-500",
      fillBg: "bg-orange-500",
      activeBorder: "border-orange-500/40 hover:border-orange-400",
      badgeBg: "bg-orange-500/10 text-orange-500 border-orange-500/30",
      glowColor: "group-hover:shadow-[0_0_18px_rgba(249,115,22,0.45)]"
    },
    {
      key: "critical",
      label: "CRIT",
      fullLabel: "Critical Escalation",
      count: critical,
      pct: critical > 0 ? Math.round((critical / maxVal) * 100) : 0,
      textColor: "text-error",
      fillBg: "bg-error",
      activeBorder: "border-error/50 hover:border-error",
      badgeBg: "bg-error/10 text-error border-error/40",
      glowColor: "group-hover:shadow-[0_0_20px_rgba(239,68,68,0.55)]"
    }
  ];

  return (
    <div className="border border-outline-variant/70 p-5 flex flex-col bg-surface rounded-sm shadow-sm">
      {/* Card Header with Summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-outline-variant/70 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <h2 className="font-mono text-xs uppercase tracking-wider text-on-surface font-bold">
            Active Threat Distribution
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-secondary font-semibold">
            {totalDetections24h} Active Unresolved Threat{totalDetections24h === 1 ? "" : "s"}
          </span>
          <Link
            href="/detections"
            className="font-mono text-[10px] uppercase font-bold text-primary hover:underline flex items-center gap-0.5 ml-1"
          >
            All Alerts <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Top Metric Breakdown Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {categories.map((cat) => (
          <Link
            key={cat.key}
            href={`/detections?severity=${cat.key}`}
            className={`flex items-center justify-between px-3 py-2 rounded-sm border font-mono text-xs transition-all hover:scale-[1.01] ${
              cat.count > 0 ? cat.badgeBg : "bg-surface-container-low/40 border-outline-variant/50 text-secondary"
            }`}
          >
            <span className="font-bold text-[11px] uppercase tracking-wider">{cat.label}</span>
            <span className="font-bold text-sm">{cat.count}</span>
          </Link>
        ))}
      </div>

      {/* Chart Canvas Area (Full Width, Wide Bar Tracks) */}
      <div className="relative h-48 flex flex-col justify-between pt-3 pb-2 bg-surface-container-lowest/30 border border-outline-variant/40 rounded-sm px-4">
        {/* Reference Grid Lines */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between pt-7 pb-8 px-3">
          <div className="w-full border-b border-outline-variant/20 flex justify-end">
            <span className="font-mono text-[9px] text-secondary/50 -mt-2 pr-1">MAX ({maxVal})</span>
          </div>
          <div className="w-full border-b border-outline-variant/15 flex justify-end">
            <span className="font-mono text-[9px] text-secondary/40 -mt-2 pr-1">75%</span>
          </div>
          <div className="w-full border-b border-outline-variant/15 flex justify-end">
            <span className="font-mono text-[9px] text-secondary/40 -mt-2 pr-1">50%</span>
          </div>
          <div className="w-full border-b border-outline-variant/15 flex justify-end">
            <span className="font-mono text-[9px] text-secondary/40 -mt-2 pr-1">25%</span>
          </div>
          <div className="w-full border-b border-outline-variant/40 flex justify-end">
            <span className="font-mono text-[9px] text-secondary/40 -mt-2 pr-1">0</span>
          </div>
        </div>

        {/* 4 Full-Width Severity Columns */}
        <div className="relative z-10 flex-1 flex items-end gap-3 sm:gap-5 px-1 sm:px-2">
          {categories.map((cat) => (
            <div key={cat.key} className="flex-1 flex flex-col items-center h-full justify-between min-w-0">
              {/* Count Indicator */}
              <div className="flex flex-col items-center mb-1.5">
                <span className={`font-mono text-base font-black ${cat.count > 0 ? cat.textColor : "text-secondary/40"} leading-none`}>
                  {cat.count}
                </span>
              </div>

              {/* Bar Track & Fill Container (Full-Width Responsive Bar Column) */}
              <Link
                href={`/detections?severity=${cat.key}`}
                title={`Filter detections by ${cat.fullLabel} (${cat.count} alerts)`}
                className={`w-full flex-1 bg-surface-container-low/60 border border-outline-variant/60 rounded-t-sm relative flex flex-col justify-end overflow-hidden group transition-all ${cat.activeBorder} ${cat.glowColor}`}
              >
                {/* Bar Fill */}
                <div
                  className={`w-full transition-all duration-300 rounded-t-sm ${cat.fillBg} opacity-90 group-hover:opacity-100`}
                  style={{
                    height: `${cat.pct}%`,
                    minHeight: cat.count > 0 ? "10px" : "0px"
                  }}
                />
              </Link>

              {/* Column Label */}
              <span className={`mt-2 font-mono text-[11px] font-bold tracking-wider uppercase ${cat.textColor}`}>
                {cat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
