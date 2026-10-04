"use client";

import { useState } from "react";

export function RuleToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleRule() {
    const nextValue = !isEnabled;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/rules/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ enabled: nextValue })
      });

      if (response.ok) {
        setIsEnabled(nextValue);
      } else {
        setError("Failed to toggle rule.");
      }
    } catch (err) {
      console.error("Failed to toggle rule", err);
      setError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        className={`h-7 px-3 font-mono text-xs font-bold uppercase transition-colors tracking-wider border rounded-sm inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
          isEnabled
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25"
            : "bg-surface-container-low text-secondary border-outline-variant/70 hover:text-on-surface"
        } disabled:opacity-65 disabled:cursor-wait`}
        type="button"
        onClick={toggleRule}
        disabled={isSaving}
        aria-pressed={isEnabled}
        aria-busy={isSaving}
        aria-label={`Toggle rule state, currently ${isEnabled ? "enabled" : "disabled"}`}
      >
        {isSaving ? "SAVING..." : isEnabled ? "ENABLED" : "DISABLED"}
      </button>
      {error && (
        <span role="alert" className="font-mono text-[10px] text-error">{error}</span>
      )}
    </div>
  );
}


