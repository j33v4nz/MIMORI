type Severity = "low" | "medium" | "high" | "critical";

const SEVERITY_STYLES: Record<
  Severity,
  { container: string; dot: string; text: string }
> = {
  critical: {
    container: "bg-error/10 text-error border-error/30",
    dot: "bg-error animate-pulse",
    text: "text-error font-bold",
  },
  high: {
    container: "bg-primary/10 text-primary border-primary/30",
    dot: "bg-primary",
    text: "text-primary font-bold",
  },
  medium: {
    container: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
    dot: "bg-amber-600",
    text: "text-amber-800 dark:text-amber-300 font-semibold",
  },
  low: {
    container: "bg-secondary-container/40 text-secondary border-outline-variant/60",
    dot: "bg-secondary",
    text: "text-secondary font-medium",
  },
};

interface SeverityBadgeProps {
  severity: Severity;
  size?: "sm" | "md";
}

export function SeverityBadge({ severity, size = "sm" }: SeverityBadgeProps) {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
  const textSize = size === "sm" ? "text-[10px]" : "text-[11px]";
  const padding = size === "sm" ? "px-2.5 py-0.5" : "px-3 py-1";

  return (
    <span
      aria-label={`Severity: ${severity}`}
      className={`inline-flex items-center gap-1.5 border font-mono uppercase tracking-wider rounded-none select-none ${textSize} ${padding} ${style.container}`}
    >
      <span className={`w-1.5 h-1.5 shrink-0 ${style.dot}`} />
      <span className={style.text}>{severity}</span>
    </span>
  );
}

