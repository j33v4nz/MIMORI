import Image from "next/image";

interface StatusFooterProps {
  statusBg: string;
  systemStatus: string;
  statusColor: string;
  dateStr: string;
}

export function StatusFooter({
  systemStatus,
  statusColor,
  dateStr
}: StatusFooterProps) {
  return (
    <footer className="border-t border-outline-variant/70 pt-6 pb-2 flex flex-col sm:flex-row justify-between items-center gap-3 font-mono text-xs text-secondary">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        <span className="uppercase text-[11px] tracking-wider">
          Node Status: <strong className={`${statusColor} font-bold`}>{systemStatus}</strong>
        </span>
      </div>
      <div className="flex items-center gap-2 uppercase text-[11px] tracking-wider text-secondary/80">
        <div className="w-3.5 h-3.5 relative shrink-0">
          <Image
            src="/logo.png"
            alt="MIMORI"
            width={14}
            height={14}
            className="w-full h-full object-contain"
          />
        </div>
        <span>MIMORI TELEMETRY NODE // {dateStr}</span>
      </div>
    </footer>
  );
}
