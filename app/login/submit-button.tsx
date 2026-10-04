"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2 } from "lucide-react";

export function SubmitButton({ children }: { children: React.ReactNode; icon?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="mt-stack-sm w-full bg-on-surface text-surface font-label-xs text-label-xs tracking-widest uppercase py-4 px-6 hover:bg-primary hover:text-white transition-colors flex justify-between items-center border border-on-surface disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      <span>{pending ? "Processing..." : children}</span>
      {pending ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}
