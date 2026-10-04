"use client";

import { useCallback, useState } from "react";
import { Copy, Ban, Trash2, Shield, CheckCircle } from "lucide-react";
import type { DashboardApiKey } from "../lib/dashboard/queries";
import { formatDateOnly } from "../lib/format";

export function KeyActions({ keys: initialKeys }: { keys: DashboardApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const createKey = useCallback(async () => {
    if (!newKeyName.trim()) return;

    setIsCreating(true);
    setCreatedKey(null);

    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        setCreatedKey(data.key);
        setNewKeyName("");

        const refreshed = await fetch("/api/keys");
        if (refreshed.ok) {
          const refreshedData = await refreshed.json();
          setKeys(refreshedData.keys);
        }
        showToast("API key created successfully.");
      } else {
        showToast("Failed to create key. Please try again.");
      }
    } catch {
      showToast("Failed to create key. Please check your network.");
    } finally {
      setIsCreating(false);
    }
  }, [newKeyName, showToast]);

  const revokeKey = useCallback(async (id: string) => {
    setRevokingId(id);

    try {
      const response = await fetch(`/api/keys/${id}`, { method: "PATCH" });

      if (response.ok) {
        setKeys((prev) =>
          prev.map((key) =>
            key.id === id ? { ...key, revoked_at: new Date().toISOString() } : key
          )
        );
        showToast("Key revoked successfully.");
      } else {
        showToast("Failed to revoke key.");
      }
    } catch {
      showToast("Failed to revoke key.");
    } finally {
      setRevokingId(null);
    }
  }, [showToast]);

  const deleteKey = useCallback(async (id: string) => {
    setDeletingId(id);

    try {
      const response = await fetch(`/api/keys/${id}`, { method: "DELETE" });

      if (response.ok) {
        setKeys((prev) => prev.filter((key) => key.id !== id));
        showToast("Key deleted.");
      } else {
        showToast("Failed to delete key.");
      }
    } catch {
      showToast("Failed to delete key.");
    } finally {
      setDeletingId(null);
    }
  }, [showToast]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Key copied to clipboard");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showToast("Key copied to clipboard");
    }
  };

  return (
    <div className="flex flex-col space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Section 1: Create API Key (Spans 4 columns) */}
        <div className="lg:col-span-4 border border-outline-variant/80 bg-surface p-6 flex flex-col h-full shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="border-b border-outline-variant/60 pb-3 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" aria-hidden="true" />
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface">
              Provision API Access Key
            </h2>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); createKey(); }} className="flex-1 flex flex-col justify-between space-y-4">
            <div>
              <label className="block font-mono text-xs text-secondary uppercase tracking-wider mb-2 font-semibold" htmlFor="key-label">
                Key Label / Description (required)
              </label>
              <input
                id="key-label"
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Production Ingestion Bot"
                className="w-full border border-outline-variant/70 bg-surface-container-low/50 focus:bg-surface focus:ring-1 focus:ring-primary/20 focus:border-primary font-mono text-xs text-on-surface p-2.5 px-3 transition-colors outline-none"
                required
              />
            </div>

            {/* Generated Key Alert */}
            {createdKey && (
              <div role="status" aria-live="polite" className="bg-surface-container-low p-4 border border-outline-variant mb-3 space-y-2">
                <p className="font-mono text-[11px] text-primary uppercase font-bold tracking-wider">
                  Key Generated — Save Now
                </p>
                <div className="flex items-center justify-between gap-3 bg-surface p-2 border border-outline-variant/60">
                  <code className="font-mono text-xs text-primary truncate flex-1 select-all font-bold">
                    {createdKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdKey)}
                    className="text-secondary hover:text-primary transition-colors focus-visible:outline-none p-1"
                    title="Copy to clipboard"
                    aria-label="Copy generated key to clipboard"
                  >
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isCreating || !newKeyName.trim()}
              aria-busy={isCreating}
              className="w-full h-10 bg-[#1A1A1A] hover:bg-primary text-white font-mono text-xs uppercase tracking-wider font-semibold transition-colors border border-outline-variant disabled:opacity-50 disabled:cursor-not-allowed select-none"
            >
              {isCreating ? "Generating Key..." : "Generate API Key"}
            </button>
          </form>
        </div>

        {/* Section 2: Active Keys Table (Spans 8 columns) */}
        <div className="lg:col-span-8 border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="border-b border-outline-variant/80 p-4 px-5 flex justify-between items-center bg-surface-container-low/80">
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface">
              Active Access Keys
            </h2>
            <span className="font-mono text-xs text-secondary">
              <strong className="text-on-surface">{keys.length}</strong> Total
            </span>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="border-b border-outline-variant/70 bg-surface-container-low/60 font-mono text-[11px] font-semibold text-secondary uppercase tracking-wider">
                  <th className="py-3.5 px-5 w-1/4">Prefix</th>
                  <th className="py-3.5 px-5 w-1/4">Label</th>
                  <th className="py-3.5 px-5">Created / Last Used</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs divide-y divide-outline-variant/40">
                {keys.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-secondary font-mono text-xs">
                      No API keys configured yet. Create one on the left.
                    </td>
                  </tr>
                ) : (
                  keys.map((key) => (
                    <tr
                      key={key.id}
                      className={`hover:bg-surface-container-low/70 transition-colors ${
                        key.revoked_at ? "opacity-60 bg-surface-container-low/40" : ""
                      }`}
                    >
                      <td className="py-4 px-5 text-on-surface font-bold">
                        <code className="bg-surface-container-high px-2 py-0.5 border border-outline-variant/70 text-xs font-mono">
                          {key.key_prefix}…
                        </code>
                      </td>
                      <td className="py-4 px-5 text-on-surface font-medium">
                        <span className={key.revoked_at ? "line-through text-secondary" : ""}>
                          {key.name ?? "—"}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-secondary">
                        <div className="flex flex-col text-xs">
                          <span>{formatDateOnly(key.created_at)}</span>
                          <span className={key.revoked_at ? "text-error font-semibold" : "opacity-70 text-[11px]"}>
                            {key.revoked_at ? "Revoked" : key.last_used_at ? formatDateOnly(key.last_used_at) : "Never used"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2 items-center">
                          {!key.revoked_at && (
                            <button
                              type="button"
                              onClick={() => revokeKey(key.id)}
                              disabled={revokingId === key.id}
                              className="h-7 px-2.5 inline-flex items-center gap-1 border border-outline-variant hover:border-on-surface hover:bg-surface-container-high text-secondary hover:text-on-surface text-[10px] font-mono font-bold uppercase transition-colors"
                              title="Revoke"
                              aria-label={`Revoke API key ${key.name ?? key.key_prefix}`}
                            >
                              <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Revoke</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteKey(key.id)}
                            disabled={deletingId === key.id}
                            className="h-7 px-2.5 inline-flex items-center gap-1 border border-outline-variant hover:border-error/50 hover:bg-error/10 text-secondary hover:text-error text-[10px] font-mono font-bold uppercase transition-colors"
                            title="Delete"
                            aria-label={`Delete API key ${key.name ?? key.key_prefix}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Security Policy Footer Note */}
      <div className="border border-outline-variant/80 p-5 flex items-start gap-3.5 bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface mb-1">Security Policy & Cryptographic Hashing</h3>
          <p className="font-mono text-xs text-secondary leading-relaxed">
            API access keys are cryptographically hashed using SHA-256 and scoped strictly to your organization. Never commit API keys into source control. Rotate production credentials periodically.
          </p>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 right-8 bg-[#1A1A1A] text-white px-5 py-3.5 border border-outline-variant shadow-xl flex items-center gap-2.5 z-50 transition-all font-mono text-xs uppercase tracking-wider font-semibold"
        >
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
