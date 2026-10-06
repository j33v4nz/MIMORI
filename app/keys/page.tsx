import { getApiKeys } from "../lib/dashboard/queries";
import { KeyActions } from "./key-actions";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const keys = await getApiKeys();

  return (
    <div className="flex-1 flex flex-col space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-secondary font-semibold">
              Security Credentials & API Authentication
            </span>
          </div>
          <h1 className="font-display-lg text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
            API Keys
          </h1>
          <p className="font-body-md text-sm md:text-base text-secondary max-w-2xl mt-1">
            Manage programmatic access tokens for agent telemetry ingestion, SDK authentication, and CI/CD pipelines.
          </p>
        </div>
      </div>

      <KeyActions keys={keys} />
    </div>
  );
}

