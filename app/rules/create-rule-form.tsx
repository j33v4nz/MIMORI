"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";
import { createRule } from "./rule-actions";

interface Preset {
  name: string;
  category: string;
  severity: string;
  pattern: string;
  description: string;
}

const PRESETS: Record<string, Preset> = {
  custom: {
    name: "",
    category: "prompt_injection",
    severity: "high",
    pattern: "",
    description: ""
  },
  jailbreak_dan: {
    name: "Jailbreak Detector (DAN)",
    category: "jailbreak",
    severity: "critical",
    pattern: "(?i)\\b(dan|jailbreak|dev mode|do anything now)\\b",
    description: "Blocks standard DAN/developer mode overrides"
  },
  prompt_leak: {
    name: "System Prompt Leak Detector",
    category: "prompt_injection",
    severity: "high",
    pattern: "(?i)\\b(ignore previous|system prompt|developer instructions|output your rules)\\b",
    description: "Flags system instructions leak attempts"
  },
  email_leak: {
    name: "PII Leak (Email)",
    category: "pii_leak",
    severity: "medium",
    pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    description: "Flags email addresses in LLM prompts or output"
  },
  credit_card: {
    name: "PII Leak (Credit Card)",
    category: "pii_leak",
    severity: "critical",
    pattern: "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
    description: "Flags standard 16-digit credit card patterns"
  },
  ssrf_attempt: {
    name: "SSRF Network Exploit",
    category: "threat",
    severity: "critical",
    pattern: "(?i)\\b(169\\.254\\.169\\.254|localhost|127\\.0\\.0\\.1|::1|internal\\.corp)\\b",
    description: "Detects attempts to access internal metadata or local network interfaces"
  },
  command_injection: {
    name: "Command Injection (RCE)",
    category: "threat",
    severity: "critical",
    pattern: "(?i)(;|\\|\\||&&|\\$|\\x60)\\s*(bash|sh|nc|curl|wget|python|perl|rm -rf)\\b",
    description: "Flags OS command injection patterns"
  },
  aws_keys: {
    name: "Secret Leak (AWS Keys)",
    category: "exfiltration",
    severity: "critical",
    pattern: "(?i)\\b(AKIA[0-9A-Z]{16})\\b",
    description: "Detects AWS Access Key ID leaks"
  },
  sql_injection: {
    name: "SQL Injection",
    category: "threat",
    severity: "high",
    pattern: "(?i)\\b(UNION\\s+SELECT|DROP\\s+TABLE|OR\\s+1=1|--|;\\s*EXEC)\\b",
    description: "Flags classic SQL injection sequences"
  }
};

export function CreateRuleForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Selected preset key
  const [selectedPreset, setSelectedPreset] = useState("custom");

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState("prompt_injection");
  const [severity, setSeverity] = useState("high");
  const [pattern, setPattern] = useState("");
  const [description, setDescription] = useState("");

  // Test states
  const [testText, setTestText] = useState("");
  const [regexStatus, setRegexStatus] = useState<{
    valid: boolean;
    error: string | null;
    matches: boolean;
  }>({ valid: true, error: null, matches: false });

  // Run tester logic
  const handleTestMatch = (currPattern: string, currTestText: string) => {
    if (!currPattern) {
      setRegexStatus({ valid: true, error: null, matches: false });
      return;
    }
    try {
      let parsedPattern = currPattern;
      let flags = "";
      if (currPattern.startsWith("(?i)")) {
        parsedPattern = currPattern.slice(4);
        flags = "i";
      }

      const regex = new RegExp(parsedPattern, flags);
      const isMatch = currTestText ? regex.test(currTestText) : false;
      setRegexStatus({ valid: true, error: null, matches: isMatch });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setRegexStatus({ valid: false, error: message, matches: false });
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!regexStatus.valid) {
      setError("Cannot save rule with an invalid regex pattern.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("category", category);
    formData.append("severity", severity);
    formData.append("pattern", pattern);
    formData.append("description", description);

    startTransition(async () => {
      try {
        await createRule(formData);
        router.push("/rules");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to create rule";
        setError(message);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Config Form */}
        <div className="lg:col-span-8 border border-outline-variant/70 bg-surface flex flex-col rounded-sm overflow-hidden">
          <div className="border-b border-outline-variant/70 px-5 py-3.5 bg-surface-container-low/50">
            <h2 className="font-mono text-xs uppercase tracking-wider text-on-surface font-semibold flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              Configuration Parameters
            </h2>
          </div>

          <div className="p-6 flex flex-col gap-6">
            {/* Preset Template */}
            <div className="flex flex-col gap-2">
              <label className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold" htmlFor="preset-template">
                Preset Templates
              </label>
              <div className="relative border-b border-outline-variant/80 focus-within:border-primary focus-within:border-b-2 transition-all">
                <select
                  id="preset-template"
                  value={selectedPreset}
                  onChange={(e) => {
                    const pKey = e.target.value;
                    setSelectedPreset(pKey);
                    const p = PRESETS[pKey];
                    if (p) {
                      setName(p.name);
                      setCategory(p.category);
                      setSeverity(p.severity);
                      setPattern(p.pattern);
                      setDescription(p.description);
                      handleTestMatch(p.pattern, testText);
                    }
                  }}
                  className="w-full bg-transparent border-none focus:ring-0 font-mono text-xs text-on-surface py-2 pl-0 pr-8 appearance-none cursor-pointer"
                >
                  <option value="custom">Custom (From Scratch)</option>
                  <option value="jailbreak_dan">Jailbreak Detector (DAN)</option>
                  <option value="prompt_leak">System Prompt Leak Detector</option>
                  <option value="email_leak">PII Leak (Email)</option>
                  <option value="credit_card">PII Leak (Credit Card)</option>
                  <option value="ssrf_attempt">SSRF Network Exploit</option>
                  <option value="command_injection">Command Injection (RCE)</option>
                  <option value="aws_keys">Secret Leak (AWS Keys)</option>
                  <option value="sql_injection">SQL Injection</option>
                </select>
                <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-secondary" aria-hidden="true" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Rule Identifier */}
              <div className="flex flex-col gap-2">
                <label className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold" htmlFor="identifier">
                  Rule Name *
                </label>
                <input
                  id="identifier"
                  type="text"
                  required
                  placeholder="e.g. Prompt Override Detector"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent border-0 border-b border-outline-variant/80 focus:border-b-2 focus:border-primary focus:ring-0 font-mono text-xs text-on-surface py-2 px-0"
                />
              </div>

              {/* Category Dropdown */}
              <div className="flex flex-col gap-2">
                <label className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold" htmlFor="category">
                  Category *
                </label>
                <div className="relative border-b border-outline-variant/80 focus-within:border-primary focus-within:border-b-2 transition-all">
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 font-mono text-xs text-on-surface py-2 pl-0 pr-8 appearance-none cursor-pointer"
                  >
                    <option value="prompt_injection">Prompt Injection</option>
                    <option value="jailbreak">Jailbreak Detection</option>
                    <option value="pii_leak">PII Leak</option>
                    <option value="exfiltration">Data Exfiltration</option>
                    <option value="threat">Security Threat</option>
                    <option value="excessive_agency">Excessive Agency</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-secondary" aria-hidden="true" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Severity Dropdown */}
              <div className="flex flex-col gap-2">
                <label className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold" htmlFor="severity">
                  Severity *
                </label>
                <div className="relative border-b border-outline-variant/80 focus-within:border-primary focus-within:border-b-2 transition-all">
                  <select
                    id="severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 font-mono text-xs text-on-surface py-2 pl-0 pr-8 appearance-none cursor-pointer"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-secondary" aria-hidden="true" />
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-2">
                <label className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold" htmlFor="description">
                  Description
                </label>
                <input
                  id="description"
                  type="text"
                  placeholder="Summary of threat pattern"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-transparent border-0 border-b border-outline-variant/80 focus:border-b-2 focus:border-primary focus:ring-0 font-mono text-xs text-on-surface py-2 px-0"
                />
              </div>
            </div>

            {/* Regex Pattern */}
            <div className="flex flex-col gap-2">
              <label className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold flex justify-between items-center" htmlFor="regex">
                <span>Regex Pattern *</span>
                <span className="text-primary tracking-wider text-[11px]">Bounded JavaScript Regex</span>
              </label>
              <div className="border border-outline-variant/80 focus-within:border-primary focus-within:border-2 bg-surface-container-low/40 rounded-sm">
                <input
                  id="regex"
                  type="text"
                  required
                  placeholder="(?i)ignore\s+previous"
                  value={pattern}
                  aria-invalid={!regexStatus.valid}
                  aria-describedby="regex-status-output"
                  onChange={(e) => {
                    setPattern(e.target.value);
                    handleTestMatch(e.target.value, testText);
                  }}
                  className="w-full bg-transparent border-none focus:ring-0 font-mono text-xs text-on-surface p-3 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Regex Validator */}
        <div className="lg:col-span-4 flex flex-col h-full">
          <div className="border border-outline-variant/70 bg-surface flex flex-col flex-1 min-h-[400px] rounded-sm overflow-hidden">
            <div className="border-b border-outline-variant/70 px-5 py-3.5 bg-surface-container-low/50 flex justify-between items-center">
              <h2 className="font-mono text-xs uppercase tracking-wider text-on-surface font-semibold flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                Live Validator
              </h2>
            </div>
            <div className="p-5 flex flex-col flex-1 gap-4">
              {/* Sample Text Input */}
              <div className="flex flex-col gap-2 flex-1">
                <label className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold" htmlFor="sample_text">
                  Sample Threat / Log Data
                </label>
                <textarea
                  id="sample_text"
                  rows={6}
                  placeholder="Paste sample threat text here to test against regex pattern..."
                  value={testText}
                  onChange={(e) => {
                    setTestText(e.target.value);
                    handleTestMatch(pattern, e.target.value);
                  }}
                  className="w-full bg-surface-container-low/40 border border-outline-variant/80 focus:border-primary focus:ring-0 font-mono text-xs text-on-surface p-3 resize-none flex-1 outline-none leading-relaxed rounded-sm"
                />
              </div>

              {/* Validation Results */}
              <div id="regex-status-output" role="status" aria-live="polite" className="flex flex-col gap-2">
                <span className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold">Evaluation Output</span>
                {!regexStatus.valid ? (
                  <div className="border border-error/40 bg-error-container/20 p-3.5 flex items-start gap-3 rounded-sm">
                    <div className="w-2.5 h-2.5 bg-error mt-0.5 shrink-0 rounded-full animate-pulse"></div>
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-bold text-error uppercase tracking-wider">
                        Invalid Regex Pattern
                      </span>
                      <span className="font-mono text-[11px] text-error/90 mt-1">
                        {regexStatus.error}
                      </span>
                    </div>
                  </div>
                ) : regexStatus.matches ? (
                  <div className="border border-emerald-500/40 bg-emerald-500/10 p-3.5 flex items-start gap-3 rounded-sm">
                    <div className="w-2.5 h-2.5 bg-emerald-500 mt-0.5 shrink-0 rounded-full"></div>
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                        Match Detected
                      </span>
                      <span className="font-mono text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                        Signature pattern triggers against sample payload.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="border border-outline-variant/70 bg-surface-container-low/40 p-3.5 flex items-start gap-3 rounded-sm">
                    <div className="w-2.5 h-2.5 bg-secondary mt-0.5 shrink-0 rounded-full"></div>
                    <span className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider">
                      No Signature Match
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 border border-error/40 bg-error-container/20 text-error font-mono text-xs rounded-sm">
          {error}
        </div>
      )}

      {/* Footer Actions */}
      <div className="pt-4 border-t border-outline-variant/70 flex justify-end gap-3">
        <Link
          href="/rules"
          className="h-9 px-5 border border-outline-variant/80 bg-surface text-on-surface hover:bg-surface-container-high transition-colors font-mono text-xs uppercase tracking-wider inline-flex items-center justify-center font-semibold rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending || !regexStatus.valid}
          aria-busy={isPending}
          className="h-9 px-5 bg-[#1A1A1A] text-white hover:bg-black border border-outline-variant/80 font-mono text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          <span>{isPending ? "Saving..." : "Save Rule"}</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
