import Link from "next/link";
import { Plus, SlidersHorizontal, ShieldCheck } from "lucide-react";
import { getRules } from "../lib/dashboard/queries";
import { RuleToggle } from "./rule-toggle";
import { formatCategoryName } from "../lib/format";
import { SeverityBadge } from "../components/ui/severity-badge";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const rules = await getRules();

  return (
    <div className="flex-1 flex flex-col space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-secondary font-semibold">
              Signature & Policy Engine
            </span>
          </div>
          <h1 className="font-display-lg text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
            Detection Rules
          </h1>
          <p className="font-body-md text-sm md:text-base text-secondary max-w-2xl mt-1">
            Manage real-time regex signatures, prompt injection policies, and security guardrail definitions.
          </p>
        </div>
        <Link
          href="/rules/new"
          className="h-9 px-4 bg-[#1A1A1A] hover:bg-primary text-white font-mono text-xs uppercase tracking-wider font-semibold transition-colors flex items-center gap-2 self-start md:self-auto border border-outline-variant select-none"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Add Rule</span>
        </Link>
      </div>

      {/* Rules Data Table Container */}
      <div className="border border-outline-variant/80 bg-surface flex flex-col shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Table Header / Controls */}
        <div className="border-b border-outline-variant/80 p-4 px-5 flex flex-wrap gap-4 justify-between items-center bg-surface-container-low/80">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-wider text-on-surface font-semibold">
              Active Security Guardrail Policies
            </span>
          </div>
          <div className="font-mono text-xs text-secondary">
            Showing <strong className="text-on-surface">{rules.length}</strong> active rules
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-surface-container-low/60 border-b border-outline-variant/70 font-mono text-[11px] font-semibold text-secondary uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-5 w-24">Status</th>
                <th className="py-3.5 px-5">Rule Name</th>
                <th className="py-3.5 px-5 w-48">Category</th>
                <th className="py-3.5 px-5 w-32">Severity</th>
                <th className="py-3.5 px-5 hidden lg:table-cell">Regex Pattern</th>
                <th className="py-3.5 px-5 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs divide-y divide-outline-variant/40">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-secondary font-mono text-xs">
                    No detection rules found. Click &apos;Add Rule&apos; to create one.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="hover:bg-surface-container-low/70 transition-colors group"
                  >
                    <td className="py-4 px-5">
                      <RuleToggle id={rule.id} enabled={rule.enabled} />
                    </td>
                    <td className="py-4 px-5 font-semibold text-on-surface text-sm">
                      {rule.name}
                    </td>
                    <td className="py-4 px-5 text-secondary">
                      {formatCategoryName(rule.category)}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <SeverityBadge severity={rule.severity as "low" | "medium" | "high" | "critical"} size="sm" />
                    </td>
                    <td className="py-4 px-5 hidden lg:table-cell text-secondary truncate max-w-xs font-mono text-[11px]" title={rule.pattern}>
                      <code className="bg-surface-container-low px-2 py-0.5 border border-outline-variant/50">{rule.pattern}</code>
                    </td>
                    <td className="py-4 px-5 text-right">
                      <SlidersHorizontal className="w-4 h-4 text-secondary hover:text-primary cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity ml-auto" aria-hidden="true" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

