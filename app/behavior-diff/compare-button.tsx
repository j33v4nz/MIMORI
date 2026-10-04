"use client";

import { useFormStatus } from "react-dom";
import { Loader2, RefreshCw } from "lucide-react";

export function CompareButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label="Compare session behavioral difference"
      className="h-10 px-6 bg-[#1A1A1A] hover:bg-primary text-white font-mono text-xs uppercase tracking-wider font-semibold border border-outline-variant transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5 text-secondary group-hover:text-white" />
      )}
      <span>{pending ? "Comparing..." : "Compare Diff"}</span>
    </button>
  );
}

