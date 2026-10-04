import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateRuleForm } from "../create-rule-form";

export default function NewRulePage() {
  return (
    <div className="flex-1 flex flex-col space-y-stack-lg">
      {/* Page Header */}
      <div className="flex flex-col gap-stack-sm">
        <Link
          href="/rules"
          className="inline-flex items-center gap-unit text-secondary hover:text-primary transition-colors font-label-xs text-label-xs uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          Back to Rules
        </Link>
        <h1 className="font-display-lg text-headline-lg md:text-display-lg text-on-surface">
          Create Rule
        </h1>
        <p className="font-body-md text-secondary">
          Provision deterministic regex signatures and threat detection logic.
        </p>
      </div>

      <CreateRuleForm />
    </div>
  );
}
