"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2, Server, Cloud, Gavel, ChevronDown, Lock, Eye, EyeOff, Info, CheckCircle, AlertCircle } from "lucide-react";

type Provider = "ollama" | "gemini" | "deepseek" | "openai" | "anthropic";

export default function SettingsPage() {
  const [provider, setProvider] = useState<Provider>("ollama");
  const [model, setModel] = useState("llama3.2");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [apiKey, setApiKey] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const snapshot = JSON.stringify({ provider, model, baseUrl });
  const hasUnsavedChanges = initialSnapshot !== null && snapshot !== initialSnapshot;

  const updateApiKey = (val: string) => {
    setApiKey(val);
    sessionStorage.setItem("mimori_test_api_key", val);
  };

  useEffect(() => {
    fetch("/api/settings/judge")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setProvider(data.provider);
          setModel(data.model);
          setBaseUrl(data.base_url || "");
          setInitialSnapshot(JSON.stringify({ provider: data.provider, model: data.model, baseUrl: data.base_url || "" }));
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        setIsLoading(false);
      });
    const savedKey = sessionStorage.getItem("mimori_test_api_key");
    if (savedKey) {
      setTimeout(() => {
        setApiKey(savedKey);
      }, 0);
    }
  }, []);

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    updateApiKey("");
    if (newProvider === "ollama") {
      setModel("llama3.2");
      setBaseUrl("http://localhost:11434");
    } else if (newProvider === "gemini") {
      setModel("gemini-2.5-flash");
      setBaseUrl("");
    } else if (newProvider === "deepseek") {
      setModel("deepseek-chat");
      setBaseUrl("");
    } else if (newProvider === "openai") {
      setModel("gpt-4o-mini");
      setBaseUrl("https://api.openai.com/v1");
    } else if (newProvider === "anthropic") {
      setModel("claude-3-5-haiku-latest");
      setBaseUrl("https://api.anthropic.com/v1");
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/judge/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          base_url: baseUrl,
          api_key: apiKey,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `Connection successful (${data.response_time_ms}ms)` });
      } else {
        setTestResult({ success: false, message: `Failed: ${data.error}` });
      }
    } catch {
      setTestResult({ success: false, message: "Network error during test" });
    }
    setIsTesting(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setToast(null);
    try {
      const res = await fetch("/api/settings/judge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          base_url: baseUrl,
        }),
      });
      if (res.ok) {
        setToast({ message: "Configuration saved successfully.", type: "success" });
        setInitialSnapshot(JSON.stringify({ provider, model, baseUrl }));
      } else {
        setToast({ message: "Failed to save configuration.", type: "error" });
      }
    } catch {
      setToast({ message: "Error saving configuration.", type: "error" });
    }
    setIsSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDiscard = () => {
    if (initialSnapshot) {
      const parsed = JSON.parse(initialSnapshot);
      setProvider(parsed.provider);
      setModel(parsed.model);
      setBaseUrl(parsed.baseUrl);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse p-gutter">
        <div className="h-10 w-64 bg-surface-container-high" />
        <div className="h-4 w-96 bg-surface-container-high" />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-32 bg-surface-container-high" />
          <div className="h-32 bg-surface-container-high" />
        </div>
      </div>
    );
  }

  const isLocal = provider === "ollama";

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-margin-page pb-24">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="assertive"
          className={`fixed top-20 right-gutter border p-stack-sm flex items-center space-x-3 z-50 transition-opacity ${
            toast.type === "success"
              ? "bg-surface border-on-surface text-on-surface"
              : "bg-error-container border-error text-on-error-container"
          }`}
        >
          <div className={`w-2 h-2 ${toast.type === "success" ? "bg-primary" : "bg-error"}`}></div>
          <span className="font-data-mono text-data-mono">{toast.message}</span>
          {toast.type === "success" ? (
            <CheckCircle className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-4 h-4 text-error shrink-0" aria-hidden="true" />
          )}
        </div>
      )}

      {/* Page Header & Status */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-stack-md">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <p className="font-mono text-xs uppercase tracking-widest text-secondary font-semibold">
              Evaluation & AI Judge
            </p>
          </div>
          <h1 className="font-display-lg text-headline-lg md:text-[40px] md:leading-[48px] text-on-surface font-bold tracking-tight">
            LLM Judge Configuration
          </h1>
          <p className="font-mono text-xs text-secondary mt-1.5 max-w-2xl leading-relaxed">
            Configure evaluation models for behavior drift detection. Precision parameters govern the LLM judge&apos;s strictness during active monitoring cycles.
          </p>
        </div>

        {/* Unsaved Changes Indicator */}
        {hasUnsavedChanges && (
          <div className="flex items-center space-x-2 border border-amber-500/40 px-3 py-1.5 bg-amber-500/10 rounded-sm">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
            <span className="font-mono text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wider font-bold">
              Unsaved Changes
            </span>
          </div>
        )}
      </div>

      {/* Provider Selector Cards (Radio group matching E2E tests) */}
      <div
        className="grid md:grid-cols-2 gap-5"
        role="radiogroup"
        aria-label="LLM provider selection"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            handleProviderChange("ollama");
          } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            if (isLocal) handleProviderChange("openai");
          }
        }}
      >
        {/* Local LLM Card */}
        <button
          type="button"
          role="radio"
          aria-checked={isLocal}
          tabIndex={isLocal ? 0 : -1}
          onClick={() => handleProviderChange("ollama")}
          className={`text-left relative flex flex-col gap-4 p-6 bg-surface border transition-all rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
            isLocal
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-outline-variant/70 hover:border-outline opacity-80 hover:opacity-100"
          }`}
        >
          {isLocal && (
            <div className="absolute top-5 right-5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </div>
          )}
          <Server className={`w-7 h-7 ${isLocal ? "text-primary" : "text-secondary"}`} aria-hidden="true" />
          <div>
            <h2 className="font-mono text-base font-bold tracking-wider uppercase mb-1.5 text-on-surface">LOCAL LLM</h2>
            <p className="font-mono text-xs text-secondary leading-relaxed">
              Run judge analysis on your own hardware with Ollama, llama.cpp, vLLM, LM Studio, or a local server. Keeping telemetry local also requires a local database and no external webhooks.
            </p>
          </div>
        </button>

        {/* Cloud API Card */}
        <button
          type="button"
          role="radio"
          aria-checked={!isLocal}
          tabIndex={!isLocal ? 0 : -1}
          onClick={() => {
            if (isLocal) handleProviderChange("openai");
          }}
          className={`text-left relative flex flex-col gap-4 p-6 bg-surface border transition-all rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
            !isLocal
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-outline-variant/70 hover:border-outline opacity-80 hover:opacity-100"
          }`}
        >
          {!isLocal && (
            <div className="absolute top-5 right-5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </div>
          )}
          <Cloud className={`w-7 h-7 ${!isLocal ? "text-primary" : "text-secondary"}`} aria-hidden="true" />
          <div>
            <h2 className="font-mono text-base font-bold tracking-wider uppercase mb-1.5 text-on-surface">CLOUD API</h2>
            <p className="font-mono text-xs text-secondary leading-relaxed">
              Use a hosted LLM provider (OpenAI, Anthropic, Gemini, DeepSeek). Requires an API key for live inference.
            </p>
          </div>
        </button>
      </div>

      {/* Bento Grid Layout for Settings Forms */}
      <form id="settings-form" ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Main Configuration Block (Spans 8 columns) */}
        <div className="md:col-span-8 border border-outline-variant/70 bg-surface relative flex flex-col rounded-sm overflow-hidden">
          <div className="border-b border-outline-variant/70 bg-surface-container-low/50 px-5 py-3.5 flex items-center justify-between">
            <span className="font-mono text-xs text-on-surface uppercase tracking-wider font-semibold">
              {isLocal ? "Local Server Settings" : "Cloud Provider Settings"}
            </span>
            <Gavel className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
          </div>

          <div className="p-6 flex-1 flex flex-col space-y-6">
            {/* Structural Grid for Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
              {!isLocal && (
                <div className="flex flex-col space-y-2">
                  <label className="font-mono text-xs text-secondary uppercase tracking-wider font-semibold" htmlFor="settings-provider">
                    Provider
                  </label>
                  <div className="relative border-b border-outline-variant/80 focus-within:border-primary focus-within:border-b-2 transition-all">
                    <select
                      id="settings-provider"
                      value={provider}
                      onChange={(e) => handleProviderChange(e.target.value as Provider)}
                      className="w-full py-2 pl-0 pr-8 font-mono text-xs text-on-surface appearance-none bg-transparent border-0 focus:ring-0 cursor-pointer"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="deepseek">DeepSeek</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pointer-events-none pr-1">
                      <ChevronDown className="w-4 h-4 text-secondary" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              )}

              {/* Model Name */}
              <div className={`flex flex-col space-y-2 ${isLocal ? "md:col-span-2" : ""}`}>
                <label className="font-mono text-xs text-secondary uppercase tracking-wider font-semibold" htmlFor="settings-model">
                  Model Name
                </label>
                <input
                  id="settings-model"
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full py-2 px-0 font-mono text-xs text-on-surface bg-transparent border-0 border-b border-outline-variant/80 focus:border-b-2 focus:border-primary focus:ring-0"
                  placeholder={isLocal ? "llama3.2" : "gpt-4o-mini"}
                />
              </div>

              {/* Base URL */}
              <div className="flex flex-col space-y-2 md:col-span-2">
                <label className="font-mono text-xs text-secondary uppercase tracking-wider font-semibold" htmlFor="settings-base-url">
                  Base URL
                </label>
                <input
                  id="settings-base-url"
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full py-2 px-0 font-mono text-xs text-on-surface bg-transparent border-0 border-b border-outline-variant/80 focus:border-b-2 focus:border-primary focus:ring-0"
                  placeholder={isLocal ? "http://localhost:11434" : "https://api.openai.com/v1"}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Security & Credentials Block (Spans 4 columns) */}
        <div className="md:col-span-4 flex flex-col space-y-5">
          {/* Security Warning Chip */}
          <div className="border border-outline-variant/70 bg-surface-container-low/40 p-4 flex items-start space-x-3 rounded-sm">
            <Lock className="w-4 h-4 text-secondary mt-0.5 shrink-0" aria-hidden="true" />
            <p className="font-mono text-xs text-secondary leading-relaxed">
              API keys are only used in memory for connection testing and are never stored in plaintext database records.
            </p>
          </div>

          {/* Credentials Box */}
          <div className="border border-outline-variant/70 bg-surface flex-1 flex flex-col rounded-sm overflow-hidden">
            <div className="border-b border-outline-variant/70 bg-surface-container-low/50 px-5 py-3.5">
              <span className="font-mono text-xs text-on-surface uppercase tracking-wider font-semibold">
                Authentication
              </span>
            </div>
            <div className="p-5 flex flex-col space-y-5 flex-1 justify-between">
              <div className="flex flex-col space-y-2">
                <label className="font-mono text-xs text-secondary uppercase tracking-wider font-semibold" htmlFor="settings-api-key">
                  API Key
                </label>
                <div className="relative flex items-end w-full border-b border-outline-variant/80 focus-within:border-primary focus-within:border-b-2 transition-all">
                  <input
                    id="settings-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => updateApiKey(e.target.value)}
                    placeholder={isLocal ? "Optional for local auth" : "sk-..."}
                    className="w-full py-2 pl-0 pr-10 font-mono text-xs text-on-surface bg-transparent border-0 focus:ring-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    className="absolute right-0 bottom-2 text-secondary hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary p-0.5"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting}
                  aria-busy={isTesting}
                  aria-label="Test connection to LLM judge provider"
                  className="w-full h-9 border border-outline-variant/80 bg-surface text-on-surface hover:bg-surface-container-high font-mono text-xs uppercase tracking-wider font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  {isTesting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isTesting ? "Testing..." : "Test Connection"}</span>
                </button>
              </div>

              {testResult && (
                <div role="status" aria-live="polite" className={`p-3 font-mono text-xs border rounded-sm ${testResult.success ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold" : "border-error/40 bg-error-container/20 text-error"}`}>
                  {testResult.message}
                </div>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Contextual Action Bar (Sticky bottom) */}
      <div className="bg-surface/90 backdrop-blur-sm border-t border-outline-variant/70 px-6 py-4 flex items-center justify-between sticky bottom-0 z-40">
        <div className="hidden md:flex items-center space-x-2.5 text-secondary">
          <Info className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
          <span className="font-mono text-xs uppercase tracking-wider">
            Vigilance Status: <strong className="text-on-surface">Active</strong>
          </span>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={handleDiscard}
            className="h-9 px-5 border border-outline-variant/80 bg-surface text-on-surface font-mono text-xs uppercase tracking-wider font-semibold hover:bg-surface-container-high transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            Discard
          </button>
          <button
            type="submit"
            form="settings-form"
            disabled={isSaving}
            aria-busy={isSaving}
            className="h-9 px-5 bg-[#1A1A1A] text-white hover:bg-black transition-colors border border-outline-variant/80 font-mono text-xs uppercase tracking-wider font-bold flex items-center gap-2 disabled:opacity-50 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isSaving ? "Saving..." : "Save Config"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
