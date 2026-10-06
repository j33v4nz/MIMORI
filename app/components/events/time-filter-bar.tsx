"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PRESET_RANGES = [
  { label: "1H", hours: 1 },
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 24 * 7 },
  { label: "30D", hours: 24 * 30 },
] as const;

function buildHref(base: string, params: Record<string, string>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return `${base}${qs ? `?${qs}` : ""}`;
}

interface TimeFilterBarProps {
  agentId?: string;
  from?: string;
  to?: string;
}

export function TimeFilterBar({ agentId, from, to }: TimeFilterBarProps) {
  const router = useRouter();
  const [fromInput, setFromInput] = useState(() =>
    from ? formatForInput(new Date(from)) : ""
  );
  const [toInput, setToInput] = useState(() =>
    to ? formatForInput(new Date(to)) : ""
  );

  const [now] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const presets = PRESET_RANGES.map((p) => ({
    ...p,
    fromValue: new Date(now - p.hours * 60 * 60 * 1000)
      .toISOString()
      .split(".")[0],
  }));

  return (
    <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4 w-full justify-between">
      {/* Time Presets */}
      <div className="flex border border-outline-variant/70 bg-surface rounded-sm overflow-hidden">
        {presets.map((preset, idx) => {
          const isActive = from === preset.fromValue && !to;
          return (
            <Link
              key={preset.label}
              href={buildHref("/events", {
                agentId: agentId ?? "",
                from: preset.fromValue,
              })}
              suppressHydrationWarning
              className={`px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider hover:bg-surface-container-high transition-colors ${
                idx < presets.length - 1 ? "border-r border-outline-variant/70" : ""
              } ${
                isActive
                  ? "bg-[#1A1A1A] text-white font-bold"
                  : "bg-surface text-secondary hover:text-on-surface"
              }`}
            >
              {preset.label}
            </Link>
          );
        })}
      </div>

      {/* Custom Range Form */}
      <form
        className="flex flex-col sm:flex-row items-end gap-2.5 w-full xl:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          const sp = new URLSearchParams();
          if (agentId) sp.set("agentId", agentId);
          if (fromInput) sp.set("from", fromInput);
          if (toInput) sp.set("to", toInput);
          const qs = sp.toString();
          router.push(`/events${qs ? `?${qs}` : ""}`);
        }}
      >
        <div className="flex border border-outline-variant/70 bg-surface focus-within:border-primary transition-colors w-full sm:w-auto rounded-sm overflow-hidden">
          <div className="px-2.5 py-1.5 border-r border-outline-variant/70 bg-surface-container-low/50 flex items-center">
            <span className="font-mono text-[11px] uppercase tracking-wider text-secondary font-bold">START</span>
          </div>
          <input
            type="datetime-local"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            aria-label="From date and time"
            className="font-mono text-xs bg-transparent border-none focus:ring-0 px-2.5 py-1.5 outline-none w-full text-on-surface"
          />
        </div>

        <div className="flex border border-outline-variant/70 bg-surface focus-within:border-primary transition-colors w-full sm:w-auto rounded-sm overflow-hidden">
          <div className="px-2.5 py-1.5 border-r border-outline-variant/70 bg-surface-container-low/50 flex items-center">
            <span className="font-mono text-[11px] uppercase tracking-wider text-secondary font-bold">END</span>
          </div>
          <input
            type="datetime-local"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            aria-label="To date and time"
            className="font-mono text-xs bg-transparent border-none focus:ring-0 px-2.5 py-1.5 outline-none w-full text-on-surface"
          />
        </div>

        <button
          type="submit"
          aria-label="Apply custom date range filter"
          className="h-[34px] px-4 bg-[#1A1A1A] text-white hover:bg-black border border-outline-variant/80 font-mono text-xs uppercase font-bold tracking-wider transition-colors w-full sm:w-auto rounded-sm inline-flex items-center justify-center"
        >
          Apply
        </button>
      </form>
    </div>
  );
}

function formatForInput(d: Date): string {
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
