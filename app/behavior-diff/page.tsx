import Link from "next/link";
import Form from "next/form";
import { ChevronDown } from "lucide-react";
import { CompareButton } from "./compare-button";
import {
  getBehaviorDiff,
  getBehaviorDiffSessions,
  type BehaviorDiffSession
} from "../lib/dashboard/queries";
import { formatDateShort, formatEventTypeName } from "../lib/format";
import { EmptyState } from "../components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function BehaviorDiffPage({
  searchParams
}: {
  searchParams: Promise<{ baseline?: string; candidate?: string }>;
}) {
  const params = await searchParams;
  const recentSessions = await getBehaviorDiffSessions();
  const missingRequested = [params.baseline, params.candidate].filter((id): id is string =>
    !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) && !recentSessions.some((session) => session.id === id));
  const selectedSessions = missingRequested.length ? await getBehaviorDiffSessions(missingRequested) : [];
  const sessions = [...selectedSessions, ...recentSessions];
  const defaults = chooseDefaults(sessions, params.baseline, params.candidate);
  const baseline = sessions.find((session) => session.id === defaults.baseline);
  const candidate = sessions.find((session) => session.id === defaults.candidate);
  const diff = baseline && candidate
    ? await getBehaviorDiff(baseline.id, candidate.id)
    : null;

  return (
    <div className="flex-1 flex flex-col space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-secondary font-semibold">
              Trace Comparison & Drift Analysis
            </span>
          </div>
          <h1 className="font-display-lg text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
            Behavior Diff
          </h1>
          <p className="font-body-md text-sm md:text-base text-secondary max-w-2xl mt-1">
            Review changed tool inputs, execution order, and recorded security findings between two sessions.
          </p>
        </div>
        <Link
          href="/agents"
          className="h-9 px-4 border border-outline-variant hover:border-on-surface bg-surface hover:bg-surface-container-high text-on-surface transition-colors font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2 self-start md:self-auto select-none"
        >
          Agent Registry
        </Link>
      </div>

      {/* Session Selection Panel */}
      <div className="border border-outline-variant/80 bg-surface p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <Form className="grid gap-6 lg:grid-cols-[1fr_1fr_auto] lg:items-end" action="/behavior-diff">
          <SessionSelect label="Baseline Session (Reference)" name="baseline" selected={defaults.baseline} sessions={sessions} />
          <SessionSelect label="Candidate Session (Test)" name="candidate" selected={defaults.candidate} sessions={sessions} />
          <CompareButton />
        </Form>
      </div>

      {!baseline || !candidate ? (
        <div className="border border-outline-variant/80 bg-surface p-8 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <EmptyState
            title="Comparison Requires Two Sessions"
            message="Behavior diffing compares telemetry across two distinct runs. Execute your agent using the MIMORI SDK to stream sessions."
          />
        </div>
      ) : diff ? (
        <DiffReport baseline={baseline} candidate={candidate} diff={diff} />
      ) : null}
    </div>
  );
}

function SessionSelect({
  label,
  name,
  selected,
  sessions
}: {
  label: string;
  name: string;
  selected?: string;
  sessions: BehaviorDiffSession[];
}) {
  const selectId = `session-select-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider">
        {label}
      </label>
      <div className="relative border border-outline-variant/70 bg-surface-container-low/50 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 px-3 transition-all">
        <select
          id={selectId}
          name={name}
          defaultValue={selected}
          disabled={sessions.length === 0}
          className="w-full bg-transparent border-none focus:ring-0 font-mono text-xs text-on-surface py-2.5 pl-0 pr-8 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed outline-none"
        >
          {selected && !sessions.some((session) => session.id === selected) ? <option value={selected}>Requested session unavailable</option> : null}
          {sessions.length === 0 ? <option value="">No recorded sessions</option> : null}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {`${session.agent.name} · ${session.external_session_id ?? session.id.slice(0, 8)} · ${formatDateShort(session.started_at)} (${session.event_count} evts)`}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-secondary" aria-hidden="true" />
      </div>
    </div>
  );
}

function DiffReport({
  baseline,
  candidate,
  diff
}: {
  baseline: BehaviorDiffSession;
  candidate: BehaviorDiffSession;
  diff: Awaited<ReturnType<typeof getBehaviorDiff>>;
}) {
  const statusClass =
    diff.status === "high_risk"
      ? "border-error/40 bg-error/5 text-on-error-container"
      : diff.status === "review"
      ? "border-primary/40 bg-primary/5 text-on-surface"
      : "border-outline-variant/80 bg-surface text-on-surface";

  return (
    <div className="space-y-6">
      {/* Status Decision Card */}
      <div className={`border p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] ${statusClass}`}>
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-xs uppercase font-bold px-2.5 py-0.5 border border-current">
              Review Recommendation
            </span>
            <h2 className="font-display-lg text-xl md:text-2xl font-bold uppercase">{diff.status.replace("_", " ")}</h2>
          </div>
          <p className="font-body-md text-sm text-secondary mt-1 max-w-3xl">{diff.summary}</p>
          {diff.orderChanged && <p className="mt-2 text-sm font-semibold">Execution order changed. Review the session timelines.</p>}
          {diff.comparisonWarnings?.map((warning) => <p key={warning} className="mt-2 text-xs text-secondary">{warning}</p>)}
        </div>
        <div className="font-mono text-xs text-secondary text-right bg-surface-container-low/80 p-3 border border-outline-variant/60">
          <div>Baseline: <span className="text-on-surface font-semibold">{baseline.agent.name}</span></div>
          <div className="mt-1">Candidate: <span className="text-on-surface font-semibold">{candidate.agent.name}</span></div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Metric label="Baseline Events" value={diff.baseline.eventCount} />
        <Metric label="Candidate Events" value={diff.candidate.eventCount} />
        <Metric label="New Behaviors Detected" value={diff.added.reduce((sum, item) => sum + item.count, 0)} isHighlight />
      </div>

      {/* Detailed Diff Breakdown */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ChangeSection title="New Behaviors" changes={diff.added} empty="No new behavioral signatures detected." tone="warning" />
        <ChangeSection title="Removed Behaviors" changes={diff.removed} empty="No baseline behaviors removed." tone="neutral" removed />
        <ChangeSection title="New Threat Detections" changes={diff.detectionChanges} empty="No additional recorded security findings." tone="danger" />
        <ChangeSection title="Removed Threat Detections" changes={diff.removedDetections ?? []} empty="No recorded findings removed." tone="neutral" removed />
        <div className="border border-outline-variant/80 bg-surface p-5">
          <h3 className="font-mono text-xs font-semibold uppercase">Changed Inputs</h3>
          {diff.inputChanges?.length ? diff.inputChanges.map((change) => (
            <p key={change.behavior} className="mt-3 text-sm break-all">{change.behavior}: recorded input fingerprints changed. Inspect both session traces for context.</p>
          )) : <p className="mt-3 text-sm text-secondary">No input changes identified for matching behaviors.</p>}
          <div className="mt-4 flex gap-4 text-sm">
            <Link className="underline" href={`/agents/${baseline.agent.id}/sessions/${baseline.id}`}>Inspect baseline</Link>
            <Link className="underline" href={`/agents/${candidate.agent.id}/sessions/${candidate.id}`}>Inspect candidate</Link>
          </div>
        </div>
        
        {/* Event Mix Section */}
        <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="border-b border-outline-variant/80 p-4 px-5 bg-surface-container-low/80 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface">
              Candidate Event Mix
            </span>
            <span className="font-mono text-[11px] text-secondary uppercase font-semibold">Breakdown</span>
          </div>
          <div className="p-5 space-y-2.5 font-mono text-xs">
            {Object.entries(diff.candidate.eventTypes).map(([eventType, count]) => (
              <div key={eventType} className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
                <span className="uppercase text-secondary">{formatEventTypeName(eventType)}</span>
                <span className="text-on-surface font-bold bg-surface-container-high px-2 py-0.5 border border-outline-variant/50">{count}</span>
              </div>
            ))}
            {Object.keys(diff.candidate.eventTypes).length === 0 && (
              <p className="text-secondary">No events recorded in candidate trace.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, isHighlight }: { label: string; value: number; isHighlight?: boolean }) {
  return (
    <div className="bg-surface border border-outline-variant/70 p-5 flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <span className="font-mono text-xs uppercase tracking-wider text-secondary font-semibold">{label}</span>
      <span className={`font-display-lg text-3xl font-bold mt-2 tracking-tight ${isHighlight && value > 0 ? "text-primary" : "text-on-surface"}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function ChangeSection({
  title,
  changes,
  empty,
  tone,
  removed = false
}: {
  title: string;
  changes: Array<{ label: string; count: number }>;
  empty: string;
  tone: "warning" | "neutral" | "danger";
  removed?: boolean;
}) {
  return (
    <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="border-b border-outline-variant/80 p-4 px-5 bg-surface-container-low/80 flex justify-between items-center">
        <span className="font-mono text-xs uppercase tracking-wider font-semibold text-on-surface">
          {title}
        </span>
        <span className="font-mono text-xs text-secondary font-semibold bg-surface-container-high px-2 py-0.5 border border-outline-variant/50">{changes.length}</span>
      </div>
      <div className="p-5 font-mono text-xs">
        {changes.length === 0 ? (
          <p className="text-secondary">{empty}</p>
        ) : (
          <div className="space-y-2.5">
            {changes.map((change) => (
              <div key={change.label} className="flex items-center justify-between gap-4 border-b border-outline-variant/40 pb-2">
                <span className="break-all text-on-surface" title={change.label}>{change.label.replace(/:inputs#([a-f0-9]{64})/, (_, hash: string) => ` · inputs ${hash.slice(0, 12)}`).replace(/_/g, " ")}</span>
                <span className={`shrink-0 font-bold px-2 py-0.5 border text-xs ${
                  tone === "danger"
                    ? "border-error/30 bg-error/10 text-error"
                    : tone === "warning"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-outline-variant text-secondary bg-surface-container-low"
                }`}>
                  {removed ? "−" : "+"}{change.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function chooseDefaults(
  sessions: BehaviorDiffSession[],
  requestedBaseline?: string,
  requestedCandidate?: string
) {
  const candidate = requestedCandidate || sessions[0]?.id;
  const baseline = requestedBaseline || sessions.find((session) => session.id !== candidate)?.id;

  return { baseline, candidate };
}
