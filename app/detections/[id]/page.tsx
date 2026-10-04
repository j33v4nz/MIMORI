import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Shield, CheckCircle, Code, History, ExternalLink } from "lucide-react";
import { getDetectionById, getSessionEvents } from "../../lib/dashboard/queries";
import { formatCategoryName, formatEventTypeName, formatLayerName, formatDate } from "../../lib/format";
import { ResolveButton } from "../resolve-button";

export const dynamic = "force-dynamic";

const SEVERITY_CONTEXT: Record<string, { color: string; description: string; action: string }> = {
  critical: {
    color: "text-error",
    description: "Immediate threat detected. Requires urgent investigation and response.",
    action: "Escalate to incident response. Isolate affected agent. Review full session timeline.",
  },
  high: {
    color: "text-primary",
    description: "Significant security concern. Should be reviewed promptly.",
    action: "Investigate agent behavior. Check for lateral movement or data access patterns.",
  },
  medium: {
    color: "text-secondary",
    description: "Potential risk detected. Review during normal operations.",
    action: "Verify if behavior is expected. Check agent configuration and permissions.",
  },
  low: {
    color: "text-secondary",
    description: "Minor anomaly or informational detection. No immediate action required.",
    action: "Log for trend analysis. Monitor for escalation patterns.",
  },
};

const CATEGORY_THREAT_MAP: Record<string, { icon: string; risk: string; mitigations: string[] }> = {
  prompt_injection: { icon: "override", risk: "Agent was instructed to ignore safety constraints", mitigations: ["Review input source", "Check for injection vectors", "Validate agent guardrails"] },
  instruction_override: { icon: "override", risk: "Agent was instructed to ignore safety constraints", mitigations: ["Review input source", "Check for injection vectors", "Validate agent guardrails"] },
  jailbreak_persona: { icon: "lock_open", risk: "Agent bypassed persona restrictions", mitigations: ["Strengthen system prompt", "Add output validation", "Implement content filtering"] },
  system_prompt_extraction: { icon: "visibility", risk: "Attempt to reveal system prompt or internals", mitigations: ["Monitor for repeated extraction attempts", "Add prompt leak detection", "Rate-limit probing"] },
  encoding_evasion: { icon: "code", risk: "Obfuscated payload to bypass detection", mitigations: ["Enable payload decoding", "Check for steganography", "Review input sanitization"] },
  data_exfiltration: { icon: "cloud_upload", risk: "Data leaving authorized boundaries", mitigations: ["Block outbound URLs", "Audit data access logs", "Implement DLP controls"] },
  exfiltration: { icon: "vpn_key", risk: "Sensitive data exposure in agent outputs", mitigations: ["Redact secrets from outputs", "Audit credential storage", "Implement secret scanning"] },
  excessive_agency: { icon: "handyman", risk: "Agent performed unauthorized privileged actions", mitigations: ["Review permission scope", "Implement action approval workflows", "Reduce tool access"] },
  threat_intel: { icon: "warning", risk: "Known malicious signatures or threat patterns matched", mitigations: ["Block malicious domains/IPs", "Update threat signatures", "Isolate compromised tools"] },
  threat: { icon: "warning", risk: "Attack payload targeting agent vulnerabilities", mitigations: ["Deploy input validation", "Enable WAF rules", "Review agent sandboxing"] },
  other: { icon: "help", risk: "Unclassified behavioral anomaly", mitigations: ["Manual review recommended", "Check for new attack patterns"] },
};

export default async function DetectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detection = await getDetectionById(id);

  if (!detection) {
    notFound();
  }

  const context = SEVERITY_CONTEXT[detection.severity] ?? SEVERITY_CONTEXT.low;
  const threatInfo = CATEGORY_THREAT_MAP[detection.category] ?? CATEGORY_THREAT_MAP.other;
  const payload = detection.event.payload;

  let sessionEvents: Array<{ id: string; event_type: string; sequence_number: number; created_at: string }> = [];
  try {
    sessionEvents = await getSessionEvents(detection.event.session.id);
  } catch {
    // Session events fallback
  }

  const eventIndex = sessionEvents.findIndex((e) => e.id === detection.event.id);
  const precedingEvents = eventIndex >= 0 ? sessionEvents.slice(Math.max(0, eventIndex - 3), eventIndex) : [];
  const followingEvents = eventIndex >= 0 ? sessionEvents.slice(eventIndex + 1, eventIndex + 4) : [];

  return (
    <div className="flex-1 flex flex-col space-y-8 pb-12">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between border-b border-outline-variant/60 pb-4">
        <Link
          href="/detections"
          className="inline-flex items-center gap-2 text-secondary hover:text-primary transition-colors font-mono text-xs uppercase tracking-wider font-semibold group"
        >
          <ArrowLeft className="w-4 h-4 shrink-0 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          <span>Back to Detections</span>
        </Link>
        <div className="font-mono text-xs text-secondary">
          Detection ID: <span className="text-on-surface font-semibold">{detection.id}</span>
        </div>
      </div>

      {/* Threat Alert Banner */}
      <div className={`border p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] ${
        detection.severity === "critical"
          ? "border-error/40 bg-error/5 text-on-error-container"
          : "border-outline-variant/80 bg-surface text-on-surface"
      }`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 border shrink-0 ${
            detection.severity === "critical"
              ? "border-error/50 bg-error text-white"
              : "border-outline-variant bg-surface-container-high text-primary"
          }`}>
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`font-mono text-xs uppercase font-bold px-2.5 py-0.5 border ${
                detection.severity === "critical"
                  ? "border-error/40 bg-error/10 text-error"
                  : "border-primary/40 bg-primary/10 text-primary"
              }`}>
                {detection.severity}
              </span>
              <h1 className="font-display-lg text-xl md:text-2xl font-bold tracking-tight text-on-surface">
                {formatCategoryName(detection.category)}
              </h1>
              <span className="font-mono text-[11px] uppercase px-2 py-0.5 bg-surface-container-low border border-outline-variant/70 text-secondary font-semibold">
                {formatLayerName(detection.layer)}
              </span>
            </div>
            <p className="font-body-md text-sm text-secondary max-w-3xl">
              {context.description}
            </p>
          </div>
        </div>

        <div className="self-end md:self-auto shrink-0">
          <ResolveButton id={detection.id} resolved={!!detection.resolved_at} />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Column (8 cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          {/* Threat Intelligence Card */}
          <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="border-b border-outline-variant/80 p-4 px-5 bg-surface-container-low/70 flex justify-between items-center">
              <span className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                Threat Intelligence Analysis
              </span>
            </div>
            <div className="p-5 flex flex-col gap-4 font-mono text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-surface-container-low/40 border border-outline-variant/40">
                  <span className="font-mono text-[11px] text-secondary uppercase tracking-wider block mb-1 font-semibold">
                    Risk Assessment
                  </span>
                  <p className="text-on-surface font-semibold text-sm">{threatInfo.risk}</p>
                </div>
                <div className="p-4 bg-surface-container-low/40 border border-outline-variant/40">
                  <span className="font-mono text-[11px] text-secondary uppercase tracking-wider block mb-1 font-semibold">
                    Confidence Score
                  </span>
                  <p className="text-on-surface font-semibold text-sm">
                    {detection.confidence !== null ? `${(detection.confidence * 100).toFixed(1)}%` : "Not measured"}
                  </p>
                </div>
              </div>

              <div className="border-t border-outline-variant/60 pt-4 mt-2">
                <span className="font-mono text-xs text-secondary uppercase tracking-wider block mb-3 font-semibold">
                  Recommended Mitigations
                </span>
                <ul className="space-y-2.5">
                  {threatInfo.mitigations.map((m, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs text-on-surface bg-surface-container-low/30 p-2.5 border border-outline-variant/30">
                      <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Event Payload Inspector */}
          <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="border-b border-outline-variant/80 p-4 px-5 bg-surface-container-low/70 flex justify-between items-center">
              <span className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface flex items-center gap-2">
                <Code className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
                Event Payload Context
              </span>
              <span className="font-mono text-xs text-secondary font-semibold">
                Sequence #{detection.event.sequence_number}
              </span>
            </div>
            <div className="p-5 bg-surface-container-lowest overflow-x-auto max-h-[420px] custom-scrollbar border-t border-outline-variant/40">
              <pre className="font-mono text-xs text-on-surface whitespace-pre-wrap break-words leading-relaxed">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </div>
          </div>

          {/* Session Timeline Context */}
          {(precedingEvents.length > 0 || followingEvents.length > 0) && (
            <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="border-b border-outline-variant/80 p-4 px-5 bg-surface-container-low/70">
                <span className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface flex items-center gap-2">
                  <History className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
                  Session Execution Stream
                </span>
              </div>
              <div className="p-5 space-y-2 font-mono text-xs">
                {precedingEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 text-secondary py-1 px-2 hover:bg-surface-container-low transition-colors">
                    <span className="w-24 shrink-0 text-secondary/80">{formatDate(ev.created_at).substring(11, 19)}</span>
                    <span className="border border-outline-variant/60 px-2 py-0.5 uppercase text-[10px] bg-surface-container-low font-semibold">{formatEventTypeName(ev.event_type)}</span>
                    <span>Event #{ev.sequence_number}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 text-on-surface font-bold border-l-3 border-primary pl-3 bg-primary/5 py-2 px-2">
                  <span className="w-24 shrink-0 text-primary">{formatDate(detection.created_at).substring(11, 19)}</span>
                  <span className="border border-primary/40 bg-primary/10 text-primary px-2 py-0.5 uppercase text-[10px] font-bold">{formatEventTypeName(detection.event.event_type)}</span>
                  <span className="text-primary">Event #{detection.event.sequence_number} (Trigger Event)</span>
                </div>
                {followingEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 text-secondary py-1 px-2 hover:bg-surface-container-low transition-colors">
                    <span className="w-24 shrink-0 text-secondary/80">{formatDate(ev.created_at).substring(11, 19)}</span>
                    <span className="border border-outline-variant/60 px-2 py-0.5 uppercase text-[10px] bg-surface-container-low font-semibold">{formatEventTypeName(ev.event_type)}</span>
                    <span>Event #{ev.sequence_number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Metadata (4 cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          {/* Metadata Block */}
          <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="border-b border-outline-variant/80 p-4 px-5 bg-surface-container-low/70">
              <span className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface">
                Telemetry Metadata
              </span>
            </div>
            <div className="p-5 font-mono text-xs space-y-3.5">
              <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2.5">
                <span className="text-secondary uppercase">Category</span>
                <span className="text-on-surface font-semibold">{formatCategoryName(detection.category)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2.5">
                <span className="text-secondary uppercase">Detection Layer</span>
                <span className="text-on-surface font-semibold">{formatLayerName(detection.layer)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2.5">
                <span className="text-secondary uppercase">Verdict</span>
                <span className={`font-semibold uppercase px-2 py-0.5 border text-[10px] ${
                  detection.verdict === "malicious"
                    ? "border-error/30 bg-error/10 text-error"
                    : "border-primary/30 bg-primary/10 text-primary"
                }`}>
                  {detection.verdict ?? "Malicious"}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2.5">
                <span className="text-secondary uppercase">Timestamp</span>
                <span className="text-on-surface">{formatDate(detection.created_at)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-secondary uppercase">Resolution</span>
                <span className={`font-semibold ${detection.resolved_at ? "text-emerald-600" : "text-amber-600"}`}>
                  {detection.resolved_at ? "Resolved" : "Unresolved"}
                </span>
              </div>
            </div>
          </div>

          {/* Source Agent Block */}
          <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="border-b border-outline-variant/80 p-4 px-5 bg-surface-container-low/70">
              <span className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface">
                Source Agent
              </span>
            </div>
            <div className="p-5 font-mono text-xs space-y-3.5">
              <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2.5">
                <span className="text-secondary uppercase">Agent Name</span>
                <span className="text-on-surface font-bold">{detection.event.session.agent.name}</span>
              </div>
              <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2.5">
                <span className="text-secondary uppercase">Session</span>
                <Link
                  href={`/agents/${detection.event.session.agent.id}/sessions/${detection.event.session.id}`}
                  className="text-primary hover:underline flex items-center gap-1 text-xs truncate max-w-[160px]"
                >
                  <span>{detection.event.session.id.substring(0, 10)}...</span>
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                </Link>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-secondary uppercase">Sequence #</span>
                <span className="text-on-surface font-semibold">{detection.event.sequence_number}</span>
              </div>
            </div>
          </div>

          {/* Analyst Quick Actions */}
          <div className="border border-outline-variant/80 bg-surface p-5 flex flex-col space-y-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <span className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface">
              Analyst Actions
            </span>
            <p className="font-mono text-xs text-secondary leading-relaxed">
              {context.action}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href={`/agents/${detection.event.session.agent.id}/sessions/${detection.event.session.id}`}
                className="w-full text-center py-2 px-3 border border-outline-variant hover:border-on-surface bg-[#1A1A1A] text-white hover:bg-primary font-mono text-xs uppercase tracking-wider font-semibold transition-colors"
              >
                Inspect Session
              </Link>
              <Link
                href={`/events?agentId=${detection.event.session.agent.id}`}
                className="w-full text-center py-2 px-3 border border-outline-variant hover:border-on-surface bg-surface text-on-surface hover:bg-surface-container-high font-mono text-xs uppercase tracking-wider font-semibold transition-colors"
              >
                All Agent Events
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
