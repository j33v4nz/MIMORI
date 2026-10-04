"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { resolveDetection } from "./detection-actions";

export function ResolveButton({ id, resolved }: { id: string; resolved: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (resolved) {
    return (
      <span
        role="status"
        aria-label="Status: Resolved"
        className="h-7 inline-flex items-center gap-1.5 px-2.5 py-1 border border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-bold uppercase tracking-wider select-none"
      >
        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        RESOLVED
      </span>
    );
  }

  const handleResolve = () => {
    setError(null);
    startTransition(async () => {
      try {
        await resolveDetection(id);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to resolve";
        setError(message);
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        aria-busy={isPending}
        aria-label="Mark detection as resolved"
        onClick={handleResolve}
        disabled={isPending}
        className="h-7 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 bg-surface hover:bg-surface-container-high border border-outline-variant hover:border-on-surface text-secondary hover:text-on-surface font-mono text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary whitespace-nowrap"
      >
        {isPending && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
        <span>{isPending ? "RESOLVING..." : "MARK RESOLVED"}</span>
      </button>
      {error && (
        <span role="alert" className="font-mono text-[9px] text-error font-semibold">
          {error}
        </span>
      )}
    </div>
  );
}

