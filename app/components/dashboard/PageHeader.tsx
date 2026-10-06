import Link from "next/link";

interface PageHeaderProps {
  systemStatus: string;
  vigilanceLevel: string;
  statusColor: string;
  statusBg: string;
  dateStr: string;
  timeStr: string;
}

export function PageHeader({
  systemStatus,
  vigilanceLevel,
  statusColor,
  dateStr,
  timeStr
}: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-stack-md border-b border-outline-variant/70 pb-6">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <p className="font-mono text-xs uppercase tracking-widest text-secondary font-semibold">
            Command Center
          </p>
        </div>
        <h1 className="font-display-lg text-headline-lg md:text-[40px] md:leading-[48px] text-on-surface font-bold tracking-tight">
          Global Overview
        </h1>
        <p className="font-mono text-xs text-secondary mt-1.5 flex items-center gap-2">
          <span>System Status:</span>
          <span className={`${statusColor} font-bold uppercase`}>{systemStatus}</span>
          <span className="text-outline-variant">·</span>
          <span>Vigilance:</span>
          <span className="text-on-surface font-bold uppercase">{vigilanceLevel}</span>
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="font-mono text-xs text-secondary tracking-wider uppercase bg-surface-container-low/50 px-3 py-1.5 border border-outline-variant/60 rounded-sm">
          <span>{dateStr}</span>
          <span className="mx-2 text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">{timeStr}</span>
        </div>
        <div className="flex gap-2.5">
          <Link
            href="/events"
            className="h-8 px-3.5 border border-outline-variant/80 bg-surface text-on-surface font-mono text-xs uppercase tracking-wider hover:bg-surface-container-high transition-colors inline-flex items-center justify-center font-semibold rounded-sm"
          >
            Audit Trail
          </Link>
          <Link
            href="/rules"
            className="h-8 px-3.5 bg-[#1A1A1A] text-white hover:bg-black border border-outline-variant/80 font-mono text-xs uppercase tracking-wider transition-colors inline-flex items-center justify-center font-bold rounded-sm"
          >
            Review Rules
          </Link>
        </div>
      </div>
    </div>
  );
}
