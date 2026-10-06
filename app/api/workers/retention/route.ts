import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { getLlmJudgeEnv } from "../../../lib/env";
import { createSupabaseServiceClient } from "../../../lib/db/service";
import { apiError } from "../../../lib/api/errors";
import { logger } from "../../../lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;
const BATCH_SIZE = 1000;
const MAX_BATCHES = 100;

export async function POST(request: NextRequest) {
  const env = getLlmJudgeEnv();

  if (!env.cronSecret) {
    return apiError(500, "server_configuration_error", "CRON_SECRET is not configured.");
  }
  if (!isAuthorizedWorkerRequest(request, env.cronSecret)) {
    logger.warn("Unauthorized request to retention worker");
    return apiError(401, "unauthorized_worker", "Invalid worker authorization.");
  }

  const params = request.nextUrl.searchParams;
  const dryRunParam = params.get("dryRun") ?? params.get("dry_run");
  const dryRun = dryRunParam === "1" || dryRunParam?.toLowerCase() === "true";

  const supabase = createSupabaseServiceClient();
  const retentionDays = await resolveRetentionDays(supabase);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffIso = cutoffDate.toISOString();

  try {
    const startTime = performance.now();

    // Per-org cutoffs: events carry org_id, so each org gets its own policy
    // (default 30d). No single org can pin or shrink retention for others.
    const policies = await resolveRetentionPolicies(supabase);
    let total = 0;
    let wouldDeleteTotal = 0;
    let batches = 0;

    if (dryRun) {
      // Single exact count per policy — no 100x re-fetch of the same batch.
      for (const policy of policies) {
        let query = supabase.from("events").select("id", { count: "exact", head: true });
        query = policy.orgId === null ? query.is("org_id", null) : query.eq("org_id", policy.orgId);
        const { count, error: countError } = await query.lt("created_at", policy.cutoffIso);
        if (countError) throw countError;
        wouldDeleteTotal += count ?? 0;
      }
      const durationMs = Math.round(performance.now() - startTime);
      logger.info(
        { counted: wouldDeleteTotal, batches: 0, retentionPolicies: policies.length, durationMs, dryRun },
        "Retention dry run completed"
      );
      return NextResponse.json({
        success: true,
        deleted: 0,
        wouldDelete: wouldDeleteTotal,
        batches: 0,
        durationMs,
        cutoff: cutoffIso,
        retentionDays,
        retentionPolicies: policies.map((p) => ({ orgId: p.orgId, retentionDays: p.retentionDays, cutoff: p.cutoffIso })),
        dryRun
      });
    }

    // Per-org batch quota: every policy gets a fair share of the global cap so
    // one large org cannot starve the others. The global cap still applies.
    const perOrgBatchQuota = Math.max(1, Math.ceil(MAX_BATCHES / Math.max(1, policies.length)));

    for (const policy of policies) {
      let orgBatches = 0;
      while (orgBatches < perOrgBatchQuota && batches < MAX_BATCHES) {
        let fetchQuery = supabase.from("events").select("id");
        fetchQuery = policy.orgId === null
          ? fetchQuery.is("org_id", null)
          : fetchQuery.eq("org_id", policy.orgId);
        const { data: batch, error: fetchError } = await fetchQuery
          .lt("created_at", policy.cutoffIso)
          .order("created_at", { ascending: true })
          .limit(BATCH_SIZE);

        if (fetchError) throw fetchError;
        if (!batch || batch.length === 0) break;

        const ids = batch.map((row) => row.id);
        const { error: deleteError } = await supabase
          .from("events")
          .delete()
          .in("id", ids);

        if (deleteError) throw deleteError;

        total += batch.length;
        batches++;
        orgBatches++;

        logger.debug({ batch: batches, count: batch.length, total, dryRun }, "Retention batch completed");

        if (batch.length < BATCH_SIZE) break;
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    logger.info(
      { deletedCount: total, counted: total, batches, cutoff: cutoffIso, retentionDays, durationMs, dryRun },
      "Retention worker cleaned up old events"
    );
    return NextResponse.json({
      success: true,
      deleted: total,
      wouldDelete: total,
      batches,
      durationMs,
      cutoff: cutoffIso,
      retentionDays,
      dryRun
    });
  } catch (error) {
    logger.error({ error }, "Failed to run retention cleanup");
    return apiError(500, "retention_cleanup_failed", "Retention cleanup failed.");
  }
}

/**
 * Resolve per-org retention policies. Each org gets its own cutoff from
 * org_settings.retention_days (default 30d, clamped 1–3650).
 *
 * Orgs are enumerated from the organizations table UNION org_settings.org_id
 * (the events sample is only a fallback when those queries error), and a
 * null-org default policy is ALWAYS appended so events with org_id IS NULL
 * are still pruned once any org exists.
 */
async function resolveRetentionPolicies(
  supabase: ReturnType<typeof createSupabaseServiceClient>
): Promise<Array<{ orgId: string | null; retentionDays: number; cutoffIso: string }>> {
  const cutoffFor = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };
  const clamp = (days: number) =>
    Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.floor(days)));
  const defaultPolicy = (): { orgId: string | null; retentionDays: number; cutoffIso: string } => ({
    orgId: null,
    retentionDays: DEFAULT_RETENTION_DAYS,
    cutoffIso: cutoffFor(DEFAULT_RETENTION_DAYS)
  });

  try {
    const { data: settings, error: settingsError } = await supabase
      .from("org_settings")
      .select("org_id, retention_days");
    const { data: orgRows, error: orgsError } = await supabase
      .from("organizations")
      .select("id");

    const byOrg = new Map<string, number>();
    if (!settingsError && Array.isArray(settings)) {
      for (const row of settings as Array<{ org_id: string; retention_days: number | null }>) {
        if (!row?.org_id) continue;
        byOrg.set(
          row.org_id,
          typeof row.retention_days === "number" && Number.isFinite(row.retention_days)
            ? clamp(row.retention_days)
            : DEFAULT_RETENTION_DAYS
        );
      }
    }

    const orgIds = new Set<string>();
    if (!orgsError && Array.isArray(orgRows)) {
      for (const row of orgRows as Array<{ id: string | null }>) {
        if (row?.id) orgIds.add(row.id);
      }
    } else {
      // Enumeration failed: fall back to sampling event org_ids (best effort).
      logger.warn({ err: orgsError?.message }, "Retention org enumeration failed, sampling events instead");
      try {
        const { data: sample, error: sampleError } = await supabase
          .from("events")
          .select("org_id")
          .limit(10000);
        if (!sampleError && Array.isArray(sample)) {
          for (const row of sample as Array<{ org_id: string | null }>) {
            if (row?.org_id) orgIds.add(row.org_id);
          }
        }
      } catch {
        // Events sample unreadable too: continue with what we have.
      }
    }
    // UNION org_settings.org_id (orgs with settings but no organizations row).
    for (const orgId of byOrg.keys()) orgIds.add(orgId);

    const policies: Array<{ orgId: string | null; retentionDays: number; cutoffIso: string }> =
      [...orgIds].map((orgId) => {
        const days = byOrg.get(orgId) ?? DEFAULT_RETENTION_DAYS;
        return { orgId, retentionDays: days, cutoffIso: cutoffFor(days) };
      });
    // ALWAYS prune org_id IS NULL events too (default policy), otherwise they
    // survive forever once any org-specific policy exists.
    policies.push(defaultPolicy());
    if (settingsError && orgIds.size === 0) {
      logger.warn({ err: settingsError.message }, "Retention settings unreadable, using default policy only");
    }
    return policies;
  } catch {
    return [defaultPolicy()];
  }
}

/**
 * Resolve the global retention cutoff (legacy summary field).
 */
async function resolveRetentionDays(
  supabase: ReturnType<typeof createSupabaseServiceClient>
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("org_settings")
      .select("retention_days");
    if (error || !Array.isArray(data)) return DEFAULT_RETENTION_DAYS;
    let max: number | null = null;
    for (const row of data as Array<{ retention_days: number | null }>) {
      const days = row?.retention_days;
      if (typeof days === "number" && Number.isFinite(days)) {
        max = max === null ? days : Math.max(max, days);
      }
    }
    if (max === null) return DEFAULT_RETENTION_DAYS;
    return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.floor(max)));
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

function isAuthorizedWorkerRequest(request: NextRequest, cronSecret: string): boolean {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";

  return safeStrEqual(bearer, cronSecret) || safeStrEqual(headerSecret, cronSecret);
}

function safeStrEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
