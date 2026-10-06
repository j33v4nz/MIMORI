import Link from "next/link";
import { Download, ShieldAlert, AlertTriangle, Cpu, Radio, Bot, FileText, ChevronRight } from "lucide-react";
import { getDetections } from "../lib/dashboard/queries";
import { ResolveButton } from "./resolve-button";
import { formatCategoryName, formatEventTypeName, formatLayerName, formatDate } from "../lib/format";
import { EmptyState } from "../components/ui/empty-state";
import { SeverityBadge } from "../components/ui/severity-badge";

export const dynamic = "force-dynamic";

export default async function DetectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; category?: string; layer?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const detections = await getDetections({
    severity: resolvedSearchParams.severity,
    category: resolvedSearchParams.category,
    limit: 200,
  });

  const severityFilter = resolvedSearchParams.severity;
  const categoryFilter = resolvedSearchParams.category;
  const layerFilter = resolvedSearchParams.layer;

  const visibleDetections = layerFilter
    ? detections.filter((d) => d.layer === layerFilter)
    : detections;

  const layerHref = (layer: string | undefined) => {
    const params = new URLSearchParams();
    if (severityFilter) params.set("severity", severityFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (layer) params.set("layer", layer);
    const qs = params.toString();
    return qs ? `/detections?${qs}` : "/detections";
  };

  const allCategories = [...new Set(detections.map((d) => d.category))];
  const critCount = detections.filter((d) => d.severity === "critical").length;
  const highCount = detections.filter((d) => d.severity === "high").length;
  const llmJudgeCount = detections.filter((d) => d.layer === "llm_judge").length;
  const layaCount = detections.filter((d) => d.layer === "laya").length;

  return (
    <div className="flex-1 flex flex-col space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-secondary font-semibold">
              Agent Security Review
            </span>
          </div>
          <h1 className="font-display-lg text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
            Security Detections
          </h1>
          <p className="font-body-md text-sm md:text-base text-secondary max-w-2xl mt-1">
            Recorded security findings from agent telemetry. Review detections and their event context; a finding does not mean an action was blocked.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(() => {
            // Build the export href with URLSearchParams so every filter
            // combination serializes correctly (a category/layer filter with
            // no severity used to produce "&..." without a leading "?").
            const exportParams = new URLSearchParams();
            if (severityFilter) exportParams.set("severity", severityFilter);
            if (categoryFilter) exportParams.set("category", categoryFilter);
            if (layerFilter) exportParams.set("layer", layerFilter);
            const exportQs = exportParams.toString();
            return (
              <a
                href={exportQs ? `/api/export/detections?${exportQs}` : "/api/export/detections"}
                download
                className="h-9 px-4 border border-outline-variant hover:border-on-surface bg-surface hover:bg-surface-container-high text-on-surface transition-colors font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2 select-none"
              >
                <Download className="w-3.5 h-3.5 shrink-0 text-secondary" aria-hidden="true" />
                <span>Export CSV</span>
              </a>
            );
          })()}
        </div>
      </div>

      {/* Metric Summary Ribbon Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Detections Card */}
        <div className="bg-surface border border-outline-variant/70 p-5 flex flex-col justify-between hover:border-outline transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">Total Detections</span>
            <Radio className="w-4 h-4 text-secondary" aria-hidden="true" />
          </div>
          <div className="mt-3">
            <div className="font-display-lg text-3xl font-bold text-on-surface tracking-tight">
              {detections.length}
            </div>
            <div className="font-mono text-[11px] text-secondary mt-1">Recorded telemetry findings</div>
          </div>
        </div>

        {/* Critical Escalations Card */}
        <div className={`p-5 flex flex-col justify-between transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.03)] ${
          critCount > 0
            ? "bg-error/5 border border-error/40 text-on-error-container"
            : "bg-surface border border-outline-variant/70 hover:border-outline"
        }`}>
          <div className="flex items-center justify-between">
            <span className={`font-mono text-[11px] uppercase tracking-wider font-semibold ${
              critCount > 0 ? "text-error" : "text-secondary"
            }`}>
              Critical Escalations
            </span>
            <ShieldAlert className={`w-4 h-4 ${critCount > 0 ? "text-error" : "text-secondary"}`} aria-hidden="true" />
          </div>
          <div className="mt-3">
            <div className={`font-display-lg text-3xl font-bold tracking-tight ${
              critCount > 0 ? "text-error" : "text-on-surface"
            }`}>
              {critCount}
            </div>
            <div className="font-mono text-[11px] text-secondary mt-1">Requires immediate mitigation</div>
          </div>
        </div>

        {/* High Risk Events Card */}
        <div className={`p-5 flex flex-col justify-between transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.03)] ${
          highCount > 0
            ? "bg-primary/5 border border-primary/30"
            : "bg-surface border border-outline-variant/70 hover:border-outline"
        }`}>
          <div className="flex items-center justify-between">
            <span className={`font-mono text-[11px] uppercase tracking-wider font-semibold ${
              highCount > 0 ? "text-primary" : "text-secondary"
            }`}>
              High Risk Events
            </span>
            <AlertTriangle className={`w-4 h-4 ${highCount > 0 ? "text-primary" : "text-secondary"}`} aria-hidden="true" />
          </div>
          <div className="mt-3">
            <div className={`font-display-lg text-3xl font-bold tracking-tight ${
              highCount > 0 ? "text-primary" : "text-on-surface"
            }`}>
              {highCount}
            </div>
            <div className="font-mono text-[11px] text-secondary mt-1">Prompt injections & persona leaks</div>
          </div>
        </div>

        {/* AI Judge Triggers Card */}
        <div className="bg-surface border border-outline-variant/70 p-5 flex flex-col justify-between hover:border-outline transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">AI Judge Triggers</span>
            <Cpu className="w-4 h-4 text-secondary" aria-hidden="true" />
          </div>
          <div className="mt-3">
            <div className="font-display-lg text-3xl font-bold text-on-surface tracking-tight">
              {llmJudgeCount}
            </div>
            <div className="font-mono text-[11px] text-secondary mt-1">Autonomous second opinions · Laya: {layaCount}</div>
          </div>
        </div>
      </div>

      {/* Filter Control Toolbar */}
      <div className="bg-surface border border-outline-variant/70 p-3.5 px-5 flex flex-wrap items-center justify-between gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        {/* Severity Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider mr-1">
            Severity:
          </span>
          <Link
            href={categoryFilter ? `/detections?category=${categoryFilter}` : "/detections"}
            aria-current={!severityFilter ? "page" : undefined}
            className={`px-3 py-1 font-mono text-xs uppercase tracking-wider border transition-colors select-none ${
              !severityFilter
                ? "bg-on-surface text-surface border-on-surface font-bold"
                : "bg-surface-container-low text-secondary border-outline-variant/60 hover:border-on-surface hover:text-on-surface"
            }`}
          >
            All
          </Link>
          {["critical", "high", "medium", "low"].map((sev) => (
            <Link
              key={sev}
              aria-current={severityFilter === sev ? "page" : undefined}
              href={`/detections?severity=${sev}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
              className={`px-3 py-1 font-mono text-xs uppercase tracking-wider border transition-colors select-none ${
                severityFilter === sev
                  ? "bg-on-surface text-surface border-on-surface font-bold"
                  : "bg-surface-container-low text-secondary border-outline-variant/60 hover:border-on-surface hover:text-on-surface"
              }`}
            >
              {sev}
            </Link>
          ))}
        </div>

        {/* Layer Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider mr-1">
            Layer:
          </span>
          <Link
            href={layerHref(undefined)}
            className={`px-2.5 py-1 font-mono text-xs uppercase border transition-colors select-none ${
              !layerFilter
                ? "bg-on-surface text-surface border-on-surface font-bold"
                : "bg-surface-container-low border-outline-variant/60 text-secondary hover:border-on-surface hover:text-on-surface"
            }`}
          >
            All
          </Link>
          {[
            { value: "llm_judge", label: `LLM Judge (${llmJudgeCount})` },
            { value: "laya", label: `Laya (${layaCount})` },
          ].map((layer) => (
            <Link
              key={layer.value}
              href={layerHref(layer.value)}
              className={`px-2.5 py-1 font-mono text-xs uppercase border transition-colors select-none ${
                layerFilter === layer.value
                  ? "bg-on-surface text-surface border-on-surface font-bold"
                  : "bg-surface-container-low border-outline-variant/60 text-secondary hover:border-on-surface hover:text-on-surface"
              }`}
            >
              {layer.label}
            </Link>
          ))}
        </div>

        {/* Category Filters */}
        {allCategories.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-secondary uppercase tracking-wider mr-1">
              Category:
            </span>
            <Link
              href={severityFilter ? `/detections?severity=${severityFilter}` : "/detections"}
              className={`px-2.5 py-1 font-mono text-xs uppercase border transition-colors select-none ${
                !categoryFilter
                  ? "bg-on-surface text-surface border-on-surface font-bold"
                  : "bg-surface-container-low border-outline-variant/60 text-secondary hover:border-on-surface hover:text-on-surface"
              }`}
            >
              All
            </Link>
            {allCategories.map((cat) => (
              <Link
                key={cat}
                href={`/detections?category=${cat}${severityFilter ? `&severity=${severityFilter}` : ""}`}
                className={`px-2.5 py-1 font-mono text-xs uppercase border transition-colors select-none ${
                  categoryFilter === cat
                    ? "bg-on-surface text-surface border-on-surface font-bold"
                    : "bg-surface-container-low border-outline-variant/60 text-secondary hover:border-on-surface hover:text-on-surface"
                }`}
              >
                {formatCategoryName(cat)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Detections Table */}
      <div className="border border-outline-variant/80 bg-surface flex flex-col overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        {visibleDetections.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No Detections Found"
              message="No threat detections match the current filter parameters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead>
                <tr className="border-b border-outline-variant/80 bg-surface-container-low/80 font-mono text-[11px] font-semibold text-secondary uppercase tracking-wider">
                  <th className="px-5 py-3.5 w-32">Severity</th>
                  <th className="px-5 py-3.5 min-w-[220px]">Category</th>
                  <th className="px-5 py-3.5 w-44">Agent</th>
                  <th className="px-5 py-3.5 min-w-[220px]">Event Context</th>
                  <th className="px-5 py-3.5 w-36">Detection Layer</th>
                  <th className="px-5 py-3.5 w-48">Timestamp</th>
                  <th className="px-5 py-3.5 w-32">Verdict</th>
                  <th className="px-5 py-3.5 w-44 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40 font-mono text-xs">
                {visibleDetections.map((detection) => (
                  <tr
                    key={detection.id}
                    className={`hover:bg-surface-container-low/70 transition-colors ${
                      detection.severity === "critical"
                        ? "bg-error/5"
                        : detection.severity === "high"
                        ? "bg-primary/[0.03]"
                        : ""
                    }`}
                  >
                    {/* Severity Column */}
                    <td className="px-5 py-4 align-middle whitespace-nowrap">
                      <SeverityBadge severity={detection.severity as "low" | "medium" | "high" | "critical"} size="sm" />
                    </td>

                    {/* Category Column */}
                    <td className="px-5 py-4 align-middle">
                      <div className="font-semibold text-on-surface text-sm">
                        {formatCategoryName(detection.category)}
                      </div>
                      <div className="text-[11px] text-secondary font-normal truncate max-w-xs mt-0.5">
                        {detection.category}
                      </div>
                    </td>

                    {/* Agent Column */}
                    <td className="px-5 py-4 align-middle whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-high/60 border border-outline-variant/60 text-xs font-mono font-medium text-on-surface">
                        <Bot className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                        <span>{detection.event.session.agent.name}</span>
                      </div>
                    </td>

                    {/* Event Context Column */}
                    <td className="px-5 py-4 align-middle">
                      <Link
                        href={`/detections/${detection.id}`}
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-container hover:underline whitespace-nowrap group font-mono font-medium"
                      >
                        <span>Event #{detection.event.sequence_number}</span>
                        <span className="text-secondary font-normal text-[11px]">
                          ({formatEventTypeName(detection.event.event_type)})
                        </span>
                        <ChevronRight className="w-3 h-3 text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </td>

                    {/* Detection Layer Column */}
                    <td className="px-5 py-4 align-middle whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 border border-outline-variant/70 text-[10px] uppercase font-mono font-semibold text-secondary bg-surface-container-low">
                        {formatLayerName(detection.layer)}
                      </span>
                    </td>

                    {/* Timestamp Column */}
                    <td className="px-5 py-4 align-middle text-secondary text-xs font-mono whitespace-nowrap">
                      {formatDate(detection.created_at)}
                    </td>

                    {/* Verdict Column */}
                    <td className="px-5 py-4 align-middle whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${
                          detection.verdict === "malicious"
                            ? "border-error/30 bg-error/10 text-error"
                            : detection.verdict === "suspicious"
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-outline-variant text-secondary bg-surface-container-low"
                        }`}
                      >
                        {detection.verdict ?? "Flagged"}
                      </span>
                    </td>

                    {/* Actions Column */}
                    <td className="px-5 py-4 align-middle text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        <Link
                          href={`/detections/${detection.id}`}
                          className="h-7 inline-flex items-center gap-1 px-2.5 py-1 border border-outline-variant hover:border-on-surface hover:bg-on-surface hover:text-surface text-[10px] font-mono font-bold uppercase transition-colors select-none"
                        >
                          <FileText className="w-3 h-3 text-secondary group-hover:text-surface" aria-hidden="true" />
                          <span>Report</span>
                        </Link>
                        <ResolveButton id={detection.id} resolved={!!detection.resolved_at} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
