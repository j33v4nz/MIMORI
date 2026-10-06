"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  ShieldCheck,
  Cpu,
  Layers,
  Terminal,
  Zap,
  GitCompare,
  Radar,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Sliders,
  ShieldAlert,
  Bot,
  Copy,
  Check,
  Play,
  KeyRound,
  CheckCircle2,
  X,
  Loader2
} from "lucide-react";
import { signIn, signUp, signInWithGithub, signInDevOperative } from "../auth/actions";
import { SubmitButton } from "./submit-button";

interface StoryChapter {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  narrative: string;
  keyPoints: { icon: any; title: string; desc: string }[];
  codeOrMetrics: {
    type: "terminal" | "code" | "metrics";
    title: string;
    content: any;
  };
}

const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: "story-mission",
    badge: "01 // THE STORY & PROBLEM",
    title: "Why Autonomous Agents Need A Control Plane",
    subtitle: "The Black Box Dilemma of Non-Deterministic AI",
    narrative:
      "Modern AI agents browse the web, write code, query databases, and call tools. MIMORI records agent telemetry, surfaces configured detection signals, and provides an optional in-process guardrail for operations an application explicitly wraps.",
    keyPoints: [
      {
        icon: Bot,
        title: "Instrumented agents",
        desc: "Record configured model requests, responses, and tool activity from instrumented agents."
      },
      {
        icon: ShieldAlert,
        title: "Threat monitoring",
        desc: "Surface configured signals for prompt injection, SSRF, destructive commands, and possible data exposure."
      },
      {
        icon: GitCompare,
        title: "Behavior comparison",
        desc: "Compare recorded traces to review how a prompt or model change affected tool activity."
      }
    ],
    codeOrMetrics: {
      type: "terminal",
      title: "AGENT_TELEMETRY // SIMULATED EXAMPLE",
      content: [
        { tag: "AGENT_INIT", text: "agent:fin-analyst framework:CrewAI session:ses_994", color: "text-blue-400" },
        { tag: "RULE_CHECK", text: "Configured pattern checks -> no finding (illustrative example)", color: "text-emerald-400" },
        { tag: "OPTIONAL_CLASSIFIER", text: "Illustrative result: benign; scores require workload evaluation", color: "text-purple-400" },
        { tag: "TOOL_CALL", text: "tool:execute_market_query args:{ticker: 'NVDA'}", color: "text-amber-400" },
        { tag: "VIGILANCE", text: "Example: no findings in this session", color: "text-emerald-400" }
      ]
    }
  },
  {
    id: "story-ingest",
    badge: "02 // FRAMEWORKS & TELEMETRY",
    title: "Framework Integrations & Telemetry",
    subtitle: "Non-Blocking Asynchronous Background Pipelines",
    narrative:
      "MIMORI provides Python and TypeScript SDK integrations for selected agent frameworks, plus manual telemetry and an in-process Python guardrail. Integration coverage and behavior vary; review the adapter docs and configure what your application sends.",
    keyPoints: [
      {
        icon: Cpu,
        title: "Framework integrations",
        desc: "Adapters cover selected frameworks including LangChain, CrewAI, AutoGen, DSPy, and LlamaIndex."
      },
      {
        icon: Zap,
        title: "Background Telemetry Batching",
        desc: "A bounded background queue sends telemetry separately from agent execution; overflow and network failures can drop events."
      },
      {
        icon: Layers,
        title: "Full Trace Hierarchy",
        desc: "Correlate agents, multi-turn sessions, LLM inferences, tool calls, and detections in one timeline."
      }
    ],
    codeOrMetrics: {
      type: "code",
      title: "PYTHON INTEGRATION // DROP-IN HANDLER & GUARDRAIL",
      content: `from mimori import MIMORIHandler, MIMORIGuardrail

# 1. Optional in-process checks for known dangerous patterns
guard = MIMORIGuardrail(mode="block", use_classifier=True)

# 2. Attach telemetry handler to your agent framework
handler = MIMORIHandler(api_key="mmr_dev_...", agent_name="finance-agent")
agent = Agent(role="Market Analyst", callbacks=[handler])
agent.run("Analyze Q3 portfolio risk")`
    }
  },
  {
    id: "story-defense",
    badge: "03 // OPTIONAL DETECTION SIGNALS",
    title: "Rules + Optional Laya Classifier + LLM Judge",
    subtitle: "Telemetry triage with configurable components",
    narrative:
      "MIMORI applies deterministic rules for known dangerous patterns. Optional Laya classification can route suspicious events to an asynchronous LLM judge. Detection coverage and latency depend on configuration and inputs; a lack of findings is not a safety guarantee.",
    keyPoints: [
      {
        icon: ShieldCheck,
        title: "Configured pattern checks",
        desc: "Configured patterns can flag prompt, network, command, and possible secret exposure signals."
      },
      {
        icon: Zap,
        title: "Optional Laya classifier",
        desc: "Optional service classification routes events by configured thresholds; latency and coverage require evaluation."
      },
      {
        icon: Sparkles,
        title: "Asynchronous LLM judge",
        desc: "Optional review through a configured local or cloud model provider."
      }
    ],
    codeOrMetrics: {
      type: "metrics",
      title: "CONFIGURATION OVERVIEW",
      content: [
        { label: "Deterministic Rules Engine", value: "Configured", sub: "Inline checks only in explicitly wrapped SDK guardrails" },
        { label: "Layer 1.5 Laya Classifier", value: "Optional", sub: "Latency and coverage depend on model and deployment" },
        { label: "LLM Judge Providers", value: "Optional", sub: "Ollama and configured cloud providers" },
        { label: "Framework Coverage", value: "Adapters", sub: "See SDK docs for integration details and limits" }
      ]
    }
  },
  {
    id: "story-releaseguard",
    badge: "04 // RELEASEGUARD & CI/CD",
    title: "Behavior Diff & Regression Testing",
    subtitle: "Compare Agent Sessions Side-By-Side Before Release",
    narrative:
      "Upgrading prompt instructions or switching LLM models can change agent behavior. MIMORI ReleaseGuard compares two recorded traces, highlights differences, and returns a review signal based on observed telemetry. It does not prove an agent is safe or run the agent for you.",
    keyPoints: [
      {
        icon: GitCompare,
        title: "Trace Behavioral Diff",
        desc: "Diff event traces between Model A and Model B to catch subtle workflow deviations."
      },
      {
        icon: Sliders,
        title: "Review signal",
        desc: "Use observed differences and configured signals as inputs to your own CI/CD review."
      },
      {
        icon: Radar,
        title: "Regression review",
        desc: "Review prompt changes for differences in recorded tool sequences and detections."
      }
    ],
    codeOrMetrics: {
      type: "terminal",
      title: "RELEASEGUARD // ILLUSTRATIVE BEHAVIOR DIFF",
      content: [
        { tag: "BASELINE", text: "Session A (v1.2-gpt4o): 14 events, 0 alerts", color: "text-neutral-400" },
        { tag: "CANDIDATE", text: "Session B (v1.3-deepseek): 16 events, 1 new tool call", color: "text-blue-400" },
        { tag: "DIFF_RESULT", text: "Added: [tool:fetch_internal_api] -> Review recorded behavior", color: "text-emerald-400" },
        { tag: "REVIEW_SIGNAL", text: "No configured finding in this example; review before deployment", color: "text-emerald-400" }
      ]
    }
  }
];

export function LoginForm({
  message,
  next = "/",
  initialTab = "login",
  initialEmail = "",
  initialName = ""
}: {
  message?: string;
  next?: string;
  initialTab?: "login" | "signup";
  initialEmail?: string;
  initialName?: string;
}) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">(initialTab);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState(initialName);
  const [copiedCode, setCopiedCode] = useState(false);
  const [credentialsFilled, setCredentialsFilled] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [isLoggingIn, startLoginTransition] = useTransition();

  // Simulated live events for Chapter 1 interactive test
  const [extraEvents, setExtraEvents] = useState<{ tag: string; text: string; color: string }[]>([]);

  const storyScrollRef = useRef<HTMLDivElement>(null);
  const fastTrackBtnRef = useRef<HTMLButtonElement>(null);
  const activeChapter = STORY_CHAPTERS[activeChapterIndex];

  const handleEnterDashboard = useCallback(() => {
    startLoginTransition(async () => {
      const formData = new FormData();
      formData.set("next", next);
      await signInDevOperative(formData);
    });
  }, [next]);

  const switchChapter = useCallback((targetIndex: number) => {
    const clamped = Math.max(0, Math.min(targetIndex, STORY_CHAPTERS.length - 1));
    setActiveChapterIndex(clamped);
  }, []);

  const handleNextChapter = useCallback(() => {
    if (activeChapterIndex < STORY_CHAPTERS.length - 1) {
      setActiveChapterIndex((prev) => Math.min(prev + 1, STORY_CHAPTERS.length - 1));
    } else {
      handleEnterDashboard();
    }
  }, [activeChapterIndex, handleEnterDashboard]);

  const handlePrevChapter = useCallback(() => {
    setActiveChapterIndex((prev) => Math.max(0, prev - 1));
  }, []);

  // Keyboard navigation for story chapters (Left / Right arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === "ArrowRight") {
        handleNextChapter();
      } else if (e.key === "ArrowLeft") {
        handlePrevChapter();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNextChapter, handlePrevChapter]);

  const handleCopyCode = () => {
    if (activeChapter.codeOrMetrics.type === "code") {
      navigator.clipboard.writeText(activeChapter.codeOrMetrics.content);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleSimulateTrace = () => {
    const sampleTraces = [
      { tag: "INTERCEPT", text: "Blocked prompt injection in tool payload (0.19ms)", color: "text-red-400" },
      { tag: "EVAL_PASS", text: "LLM Judge verdict: hallucination score 0.01 (clean)", color: "text-emerald-400" },
      { tag: "TOOL_AUTH", text: "Sanitized SQL query: 0 unescaped tokens detected", color: "text-blue-400" },
      { tag: "SYNC_OK", text: "Telemetry flushed to MIMORI Control Plane (HTTP 200)", color: "text-emerald-400" }
    ];
    const picked = sampleTraces[extraEvents.length % sampleTraces.length];
    setExtraEvents((prev) => [...prev.slice(-3), picked]);
  };

  const handleQuickFill = () => {
    setActiveTab("signup");
    setEmail("");
    setPassword("");
    setCredentialsFilled(true);
    setTimeout(() => setCredentialsFilled(false), 3000);
  };

  // Password entropy calculation
  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = [hasMinLength, hasNumber, hasUpper, hasSpecial].filter(Boolean).length;

  const getStrengthLabel = () => {
    if (!password) return { text: "Enter Password", color: "text-secondary", width: "0%", barColor: "bg-outline" };
    if (strengthScore <= 1) return { text: "Weak Clearance", color: "text-red-500", width: "25%", barColor: "bg-red-500" };
    if (strengthScore === 2) return { text: "Fair Clearance", color: "text-amber-500", width: "50%", barColor: "bg-amber-500" };
    if (strengthScore === 3) return { text: "Strong Password", color: "text-blue-500", width: "75%", barColor: "bg-blue-500" };
    return { text: "Strong Password", color: "text-emerald-500", width: "100%", barColor: "bg-emerald-500" };
  };

  const strength = getStrengthLabel();

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen lg:h-screen w-full flex flex-col lg:flex-row overflow-x-hidden">
      {/* Left Column: MIMORI Interactive Story & Full Guide Deck */}
      <div
        id="story-tour"
        ref={storyScrollRef}
        className="order-2 lg:order-1 relative w-full lg:w-7/12 min-h-[500px] lg:h-full bg-surface-container flex flex-col justify-between p-6 sm:p-10 lg:p-10 border-t lg:border-t-0 lg:border-r border-on-surface grid-bg z-10 overflow-y-auto custom-scrollbar"
      >
        <div className="space-y-5">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt="MIMORI Logo"
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                  priority
                />
              </div>
              <div className="relative h-12 w-48 sm:h-14 sm:w-56 flex items-center">
                <Image
                  src="/mimori.png"
                  alt="MIMORI"
                  width={224}
                  height={56}
                  className="h-full w-auto object-contain"
                  priority
                />
              </div>
            </div>
            <button
              type="button"
              disabled={isLoggingIn}
              onClick={handleEnterDashboard}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-white font-data-mono text-[10.5px] uppercase tracking-wider transition-colors font-bold disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Entering...</span>
                </>
              ) : (
                <span>Enter Dashboard ➔</span>
              )}
            </button>
          </div>

          {/* Quick Steps Bar */}
          <div className="border border-on-surface bg-surface p-1.5 flex items-center justify-between gap-1 shadow-sm">
            <button
              type="button"
              id="top-prev-chapter-btn"
              disabled={activeChapterIndex === 0}
              onClick={handlePrevChapter}
              className="touch-manipulation px-2.5 py-1.5 border border-on-surface/40 bg-surface-container text-on-surface hover:bg-primary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-data-mono text-[11px] uppercase transition-colors flex items-center gap-1 shrink-0 font-bold cursor-pointer"
              aria-label="Previous Chapter"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev</span>
            </button>

            <div className="flex-1 flex gap-1 justify-center">
              {STORY_CHAPTERS.map((chapter, idx) => (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => switchChapter(idx)}
                  className={`touch-manipulation flex-1 max-w-[130px] py-1.5 px-2 text-center font-data-mono text-[10.5px] uppercase tracking-wider transition-colors duration-150 truncate cursor-pointer ${
                    activeChapterIndex === idx
                      ? "bg-on-surface text-surface font-bold shadow-sm"
                      : "text-secondary hover:text-on-surface hover:bg-surface-container-high"
                  }`}
                  aria-label={`Go to chapter ${idx + 1}: ${chapter.title}`}
                >
                  <span className="font-bold">0{idx + 1}</span>
                  <span className="hidden md:inline ml-1 opacity-70">
                    {chapter.badge.split("//")[1]?.trim()}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              id="top-next-chapter-btn"
              disabled={isLoggingIn}
              onClick={handleNextChapter}
              className="touch-manipulation px-3 py-1.5 bg-primary text-white hover:bg-on-surface hover:text-surface font-data-mono text-[11px] uppercase transition-colors flex items-center gap-1 shrink-0 font-bold shadow-sm disabled:opacity-50 cursor-pointer"
              aria-label={activeChapterIndex < STORY_CHAPTERS.length - 1 ? "Next Chapter" : "Next: Enter Dashboard"}
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Entering...</span>
                </>
              ) : (
                <>
                  <span>{activeChapterIndex < STORY_CHAPTERS.length - 1 ? "Next" : "Next: Enter Dashboard"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Active Chapter Narrative Section */}
          <div className="border border-on-surface bg-surface p-5 sm:p-6 space-y-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
            {/* Background watermark badge */}
            <div className="absolute right-4 top-4 font-data-mono text-3xl font-black text-outline/20 select-none pointer-events-none">
              0{activeChapterIndex + 1}
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-primary/10 border border-primary/30 text-primary font-data-mono text-[10px] uppercase tracking-widest font-semibold">
                {activeChapter.badge}
              </div>
              <h1 className="font-display-lg text-2xl sm:text-3xl text-on-surface font-bold tracking-tight leading-tight">
                {activeChapter.title}
              </h1>
              <p className="font-data-mono text-xs text-secondary uppercase tracking-wider">
                {activeChapter.subtitle}
              </p>
            </div>

            <p className="font-body-md text-secondary text-sm sm:text-[14.5px] leading-relaxed min-h-[64px]">
              {activeChapter.narrative}
            </p>

            {/* Core Capability Bullets */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-outline-variant">
              {activeChapter.keyPoints.map((pt, i) => {
                const IconComponent = pt.icon;
                return (
                  <div key={i} className="border border-on-surface/30 bg-surface-container-low p-3 space-y-1.5 min-h-[92px]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <IconComponent className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <h4 className="font-display-sm text-xs font-bold text-on-surface leading-tight">
                        {pt.title}
                      </h4>
                    </div>
                    <p className="font-body-sm text-[11.5px] text-secondary leading-snug">
                      {pt.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Dynamic Code / Terminal / Metrics Preview Box with FIXED stable height */}
            <div className="pt-2 h-[210px] min-h-[210px] max-h-[210px] overflow-hidden">
              {activeChapter.codeOrMetrics.type === "terminal" && (
                <div className="h-full border border-on-surface bg-black text-emerald-400 p-3 font-data-mono text-[11px] leading-relaxed shadow-inner flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-2 mb-1 border-b border-neutral-800 text-neutral-400 text-[10px] shrink-0">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="w-3 h-3 text-emerald-400" />
                      {activeChapter.codeOrMetrics.title}
                    </span>
                    <button
                      type="button"
                      onClick={handleSimulateTrace}
                      className="touch-manipulation px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-emerald-400 hover:border-emerald-500 transition-colors flex items-center gap-1 text-[9.5px] uppercase tracking-wider"
                    >
                      <Play className="w-2.5 h-2.5 text-emerald-400" />
                      Simulate Example Trace
                    </button>
                  </div>
                  <div className="space-y-1 text-neutral-300 font-data-mono text-[10.5px] overflow-y-auto custom-scrollbar flex-1">
                    {activeChapter.codeOrMetrics.content.map((item: any, idx: number) => (
                      <p key={idx}>
                        <span className={`font-bold ${item.color}`}>[{item.tag}]</span> {item.text}
                      </p>
                    ))}
                    {extraEvents.map((item, idx) => (
                      <p key={`extra-${idx}`} className="animate-fade-in">
                        <span className={`font-bold ${item.color}`}>[{item.tag}]</span> {item.text}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {activeChapter.codeOrMetrics.type === "code" && (
                <div className="h-full border border-on-surface bg-black text-neutral-200 p-3 font-data-mono text-[11px] leading-relaxed shadow-inner flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-2 mb-1 border-b border-neutral-800 text-neutral-400 text-[10px] shrink-0">
                    <span className="flex items-center gap-1.5 text-neutral-300">
                      <Cpu className="w-3 h-3 text-primary" />
                      {activeChapter.codeOrMetrics.title}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="touch-manipulation px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white transition-colors flex items-center gap-1 text-[9.5px] uppercase tracking-wider"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Snippet</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-neutral-300 font-data-mono text-[11px] overflow-x-auto whitespace-pre flex-1 custom-scrollbar">
                    <code>{activeChapter.codeOrMetrics.content}</code>
                  </pre>
                </div>
              )}

              {activeChapter.codeOrMetrics.type === "metrics" && (
                <div className="h-full border border-on-surface bg-surface-container p-3 font-data-mono flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-2 mb-1 border-b border-on-surface text-secondary text-[10px] uppercase tracking-wider font-semibold shrink-0">
                    <span>{activeChapter.codeOrMetrics.title}</span>
                    <span className="text-primary">BENCHMARK</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {activeChapter.codeOrMetrics.content.map((item: any, idx: number) => (
                      <div key={idx} className="border border-outline-variant bg-surface p-2 flex flex-col justify-center">
                        <div className="text-[10px] text-secondary uppercase tracking-wider">{item.label}</div>
                        <div className="font-display-lg text-sm font-bold text-on-surface mt-0.5">{item.value}</div>
                        <div className="text-[9.5px] text-secondary mt-0.5 truncate">{item.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Story Next / Previous Action Buttons Bar (PERSISTENT & UNTOUCHED BY TRANSITIONS) */}
            <div className="pt-3 border-t border-on-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center justify-between sm:justify-start gap-3 order-2 sm:order-1">
                <button
                  type="button"
                  id="prev-chapter-btn"
                  disabled={activeChapterIndex === 0}
                  onClick={handlePrevChapter}
                  className="touch-manipulation px-3.5 py-2 border border-on-surface bg-surface text-on-surface font-label-xs text-xs uppercase tracking-wider hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 font-bold cursor-pointer"
                  aria-label="Previous Chapter"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                {/* Step indicator dots */}
                <div className="flex items-center gap-1.5">
                  {STORY_CHAPTERS.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => switchChapter(i)}
                      aria-label={`Jump to step ${i + 1}`}
                      className={`touch-manipulation h-2 transition-all rounded-none cursor-pointer ${
                        activeChapterIndex === i ? "w-6 bg-primary" : "w-2 bg-on-surface/30 hover:bg-on-surface/60"
                      }`}
                    />
                  ))}
                  <span className="font-data-mono text-[11px] text-secondary ml-1.5 font-semibold select-none">
                    0{activeChapterIndex + 1} / 0{STORY_CHAPTERS.length}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 order-1 sm:order-2 w-full sm:w-auto">
                {activeChapterIndex < STORY_CHAPTERS.length - 1 ? (
                  <button
                    type="button"
                    id="next-chapter-btn"
                    onClick={handleNextChapter}
                    className="touch-manipulation w-full sm:w-auto justify-center px-4 py-2.5 bg-primary text-white hover:bg-on-surface font-label-xs text-xs uppercase tracking-wider transition-colors flex items-center gap-2 font-bold shadow-sm cursor-pointer"
                    aria-label="Next Chapter"
                  >
                    <span>Next Chapter</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => switchChapter(0)}
                      className="touch-manipulation px-3 py-2.5 border border-on-surface bg-surface text-secondary hover:text-on-surface font-label-xs text-xs uppercase tracking-wider transition-colors font-medium cursor-pointer shrink-0"
                    >
                      <span>Restart ↺</span>
                    </button>
                    <button
                      type="button"
                      id="enter-dashboard-btn"
                      disabled={isLoggingIn}
                      onClick={handleEnterDashboard}
                      className="touch-manipulation flex-1 sm:flex-initial justify-center px-4 py-2.5 bg-primary text-white hover:bg-on-surface font-label-xs text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                      aria-label="Enter Dashboard"
                    >
                      {isLoggingIn ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Entering...</span>
                        </>
                      ) : (
                        <span>Next: Enter Dashboard ➔</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Flow Visual Strip */}
          <div className="border border-on-surface bg-surface p-3 flex flex-col sm:flex-row items-center justify-between gap-2 font-data-mono text-[10px] uppercase tracking-wider text-secondary">
            <span className="font-semibold text-on-surface flex items-center gap-1">
              <Zap className="w-3 h-3 text-primary" /> PIPELINE:
            </span>
            <span>Agent Execution</span>
            <span className="text-outline">➔</span>
            <span>SDK Guardrail (&lt;1ms)</span>
            <span className="text-outline">➔</span>
            <span>Threat Engine</span>
            <span className="text-outline">➔</span>
            <span className="text-primary font-bold">MIMORI Cockpit</span>
          </div>

          {/* Mobile Back-to-Login Link */}
          <div className="lg:hidden text-center pt-3 border-t border-outline-variant">
            <a
              href="#auth-panel"
              className="font-data-mono text-[11px] text-primary font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>↑ Return to Login / Sign In</span>
            </a>
          </div>
        </div>
      </div>

      {/* Right Column: Authentication Form */}
      <div
        id="auth-panel"
        className="order-1 lg:order-2 w-full lg:w-5/12 min-h-fit lg:h-full bg-surface flex flex-col justify-center px-6 sm:px-10 lg:px-12 py-8 sm:py-10 relative overflow-y-auto custom-scrollbar"
      >
        <div className="w-full max-w-md mx-auto space-y-5">
          {/* Unboxed Logo & Writing Header */}
          <div className="flex items-center justify-center gap-3.5 pb-3 border-b border-on-surface mb-1">
            <div className="w-12 h-12 sm:w-14 sm:h-14 relative flex-shrink-0 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="MIMORI Logo"
                width={56}
                height={56}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <div className="h-9 w-40 sm:h-11 sm:w-48 flex items-center">
              <Image
                src="/mimori.png"
                alt="MIMORI"
                width={192}
                height={44}
                className="h-full w-auto object-contain"
                priority
              />
            </div>
          </div>

          {/* Fast Track: Create Your Account */}
          <form action={signInDevOperative} className="w-full">
            <input type="hidden" name="next" value={next} suppressHydrationWarning />
            <button
              ref={fastTrackBtnRef}
              id="fast-track-demo-btn"
              type="submit"
              className="w-full border-2 border-primary bg-primary/10 hover:bg-primary text-primary hover:text-white font-label-xs text-xs uppercase tracking-widest py-3 px-4 flex items-center justify-center gap-2.5 transition-all shadow-sm font-bold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>Create Your Account</span>
            </button>
          </form>

          {/* 1-Click GitHub OAuth Button */}
          <form action={signInWithGithub} className="w-full">
            <input type="hidden" name="next" value={next} suppressHydrationWarning />
            <button
              type="submit"
              className="w-full border border-on-surface bg-surface-container-high text-on-surface hover:bg-primary hover:text-white font-label-xs text-xs uppercase tracking-widest py-2.5 px-4 flex items-center justify-center gap-3 transition-colors shadow-sm focus-visible:outline-none"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>Continue with GitHub</span>
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex py-0.5 items-center">
            <div className="flex-grow border-t border-outline-variant"></div>
            <span className="flex-shrink mx-3 font-data-mono text-[10px] text-secondary uppercase tracking-widest">
              Or standard email clearance
            </span>
            <div className="flex-grow border-t border-outline-variant"></div>
          </div>

          {/* Tabs */}
          <div role="tablist" aria-label="Authentication mode" className="flex border-b border-on-surface">
            <button
              type="button"
              role="tab"
              id="tab-login"
              aria-selected={activeTab === "login"}
              aria-controls="panel-login"
              onClick={() => setActiveTab("login")}
              className={`flex-1 pb-3 font-label-xs text-xs tracking-widest uppercase transition-colors focus-visible:outline-none flex items-center justify-center gap-2 ${
                activeTab === "login"
                  ? "text-on-surface border-b-2 border-primary font-bold"
                  : "text-secondary hover:text-on-surface"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Operative Login
            </button>
            <button
              type="button"
              role="tab"
              id="tab-signup"
              aria-selected={activeTab === "signup"}
              aria-controls="panel-signup"
              onClick={() => setActiveTab("signup")}
              className={`flex-1 pb-3 font-label-xs text-xs tracking-widest uppercase transition-colors focus-visible:outline-none flex items-center justify-center gap-2 ${
                activeTab === "signup"
                  ? "text-on-surface border-b-2 border-primary font-bold"
                  : "text-secondary hover:text-on-surface"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Create Account
            </button>
          </div>

          {/* Alert / Notice Banner */}
          {message && bannerVisible && (
            <div
              role="alert"
              className={`border p-3.5 font-data-mono text-xs flex items-start justify-between gap-3 shadow-sm ${
                message === "signed-up"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-error/50 bg-error-container text-on-error-container"
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {message === "signed-up" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="space-y-0.5 min-w-0">
                  <p className="font-bold uppercase tracking-wider text-[10.5px]">
                    {message === "signed-up" ? "Account Initialized" : "Clearance Notification"}
                  </p>
                  <p className="break-words leading-relaxed text-xs">
                    {message === "signed-up"
                      ? "Account created. Check your email to confirm your account, then sign in."
                      : message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBannerVisible(false)}
                className="text-secondary hover:text-on-surface p-0.5 rounded transition-colors shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Login Form */}
          {activeTab === "login" && (
            <form
              id="panel-login"
              role="tabpanel"
              aria-labelledby="tab-login"
              action={signIn}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="next" value={next} suppressHydrationWarning />

              <div className="space-y-1.5">
                <label className="font-label-xs text-xs tracking-widest uppercase text-secondary flex items-center gap-1.5" htmlFor="login-email">
                  <Mail className="w-3.5 h-3.5 text-secondary" /> Email Address
                </label>
                <input
                  className="w-full bg-surface-container-low border border-on-surface focus:border-primary focus:ring-1 focus:ring-primary/20 font-data-mono text-xs sm:text-sm p-3 text-on-surface placeholder:text-outline outline-none transition-all"
                  id="login-email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  autoComplete="email"
                  suppressHydrationWarning
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="font-label-xs text-xs tracking-widest uppercase text-secondary flex items-center gap-1.5" htmlFor="login-password">
                    <Lock className="w-3.5 h-3.5 text-secondary" /> Password
                  </label>
                </div>
                <div className="relative">
                  <input
                    className="w-full bg-surface-container-low border border-on-surface focus:border-primary focus:ring-1 focus:ring-primary/20 font-data-mono text-xs sm:text-sm p-3 pr-10 text-on-surface placeholder:text-outline outline-none transition-all"
                    id="login-password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface transition-colors p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Dev Quick Fill Helper */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <button
                  type="button"
                  onClick={handleQuickFill}
                  className="font-data-mono text-[11px] text-secondary hover:text-primary transition-colors flex items-center gap-1.5 underline underline-offset-2"
                >
                  {credentialsFilled ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <KeyRound className="w-3.5 h-3.5 text-primary" />
                  )}
                  <span>
                    Start a new account
                  </span>
                </button>
                {credentialsFilled && (
                  <span className="font-data-mono text-[10px] text-emerald-500 font-semibold uppercase">
                    Ready
                  </span>
                )}
              </div>

              <SubmitButton icon="arrow_forward">
                Next ➔ Sign In to Dashboard
              </SubmitButton>

              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => setActiveTab("signup")}
                  className="font-label-xs text-xs tracking-widest uppercase text-secondary hover:text-primary underline underline-offset-4 transition-colors"
                >
                  Need an operative account? Sign up
                </button>
              </div>
            </form>
          )}

          {/* Sign Up Form */}
          {activeTab === "signup" && (
            <form
              id="panel-signup"
              role="tabpanel"
              aria-labelledby="tab-signup"
              action={signUp}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="next" value={next} suppressHydrationWarning />

              <div className="space-y-1.5">
                <label className="font-label-xs text-xs tracking-widest uppercase text-secondary flex items-center gap-1.5" htmlFor="signup-name">
                  <User className="w-3.5 h-3.5 text-secondary" /> Operator Name
                </label>
                <input
                  className="w-full bg-surface-container-low border border-on-surface focus:border-primary focus:ring-1 focus:ring-primary/20 font-data-mono text-xs sm:text-sm p-3 text-on-surface placeholder:text-outline outline-none transition-all"
                  id="signup-name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Operative Name"
                  required
                  autoComplete="name"
                  suppressHydrationWarning
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-label-xs text-xs tracking-widest uppercase text-secondary flex items-center gap-1.5" htmlFor="signup-email">
                  <Mail className="w-3.5 h-3.5 text-secondary" /> Email Address
                </label>
                <input
                  className="w-full bg-surface-container-low border border-on-surface focus:border-primary focus:ring-1 focus:ring-primary/20 font-data-mono text-xs sm:text-sm p-3 text-on-surface placeholder:text-outline outline-none transition-all"
                  id="signup-email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@mimori.local"
                  required
                  type="email"
                  autoComplete="email"
                  suppressHydrationWarning
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-label-xs text-xs tracking-widest uppercase text-secondary flex items-center gap-1.5" htmlFor="signup-password">
                  <Lock className="w-3.5 h-3.5 text-secondary" /> Master Password
                </label>
                <div className="relative">
                  <input
                    className="w-full bg-surface-container-low border border-on-surface focus:border-primary focus:ring-1 focus:ring-primary/20 font-data-mono text-xs sm:text-sm p-3 pr-10 text-on-surface placeholder:text-outline outline-none transition-all"
                    id="signup-password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a master password (8+ chars)"
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface transition-colors p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {password && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between items-center text-[10px] font-data-mono">
                      <span className="text-secondary uppercase">Clearance Level:</span>
                      <span className={`font-bold ${strength.color}`}>{strength.text}</span>
                    </div>
                    <div className="w-full h-1 bg-surface-container-high overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strength.barColor}`}
                        style={{ width: strength.width }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <SubmitButton icon="person_add">
                Next ➔ Create Operator Account
              </SubmitButton>

              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => setActiveTab("login")}
                  className="font-label-xs text-xs tracking-widest uppercase text-secondary hover:text-primary underline underline-offset-4 transition-colors"
                >
                  Already have an account? Sign In
                </button>
              </div>
            </form>
          )}

          {/* Enterprise Support Footer */}
          <div className="pt-2 text-center">
            <span className="font-data-mono text-[10.5px] text-secondary">
              MIMORI v1.1 Control Plane // Enterprise Airgap Ready
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
