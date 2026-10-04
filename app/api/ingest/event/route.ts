import { NextResponse, type NextRequest } from "next/server";
import { readBodyWithLimit } from "../../../lib/api/body";
import { apiError } from "../../../lib/api/errors";
import {
  authenticateApiKey,
  extractBearerToken
} from "../../../lib/api/auth";
import {
  checkRateLimit,
  getIngestRateLimit,
  INGEST_RATE_WINDOW_SECONDS
} from "../../../lib/api/rate-limit";
import { createSupabaseServiceClient } from "../../../lib/db/service";
import { processIngestion } from "../../../lib/services/ingest-service";
import {
  MAX_BODY_BYTES,
  MAX_EVENTS,
  ingestEnvelopeSchema,
  ingestEventSchema
} from "../../../lib/schemas";
import { type IngestResponse } from "../../../lib/types";
import { logger } from "../../../lib/logger";

export const runtime = "nodejs";

interface SkippedEvent {
  index: number;
  reason: string;
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    logger.warn("Missing API key");
    return apiError(401, "missing_api_key", "Missing Authorization bearer token.");
  }

  const supabase = createSupabaseServiceClient();
  const authenticatedKey = await authenticateApiKey(supabase, token);

  if (!authenticatedKey) {
    logger.warn("Invalid API key");
    return apiError(401, "invalid_api_key", "API key is invalid or revoked.");
  }

  const bodyText = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (bodyText === null) {
    logger.warn("Payload too large");
    return apiError(413, "payload_too_large", "Request body must be 1MB or smaller.");
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(bodyText);
  } catch {
    logger.warn("Invalid JSON");
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const envelope = ingestEnvelopeSchema.safeParse(parsedJson);

  if (!envelope.success) {
    logger.warn({ issues: envelope.error.issues }, "Invalid request envelope");
    return apiError(400, "invalid_request", envelope.error.issues[0]?.message ?? "Invalid request.");
  }

  // SEV-2 double-charge fix: exactly ONE atomic check per request.
  //
  // The old code ran a pre-check (+1) AND an N-event check against the SAME
  // atomic counter, charging 1+N per request — which halved the effective
  // budget (60000 events/min behaved like ~60 events/min). There is now a
  // single check that charges the envelope's event count (min 1; an empty
  // batch charges 1). Invalid JSON / invalid envelope requests are rejected
  // above, before the counter is touched (uncharged 400s).
  const chargeEvents = Math.max(1, envelope.data.events.length);
  const rateLimit = await checkRateLimit(
    supabase,
    authenticatedKey.id,
    getIngestRateLimit(),
    INGEST_RATE_WINDOW_SECONDS,
    chargeEvents
  );

  if (!rateLimit.allowed) {
    if (rateLimit.unavailable) {
      return NextResponse.json({ error: {
        code: "rate_limit_unavailable", message: "Ingestion is temporarily unavailable. Retry later."
      } }, { status: 503, headers: { "Retry-After": "60" } });
    }
    const rawRetry = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    const retryAfterSeconds = Number.isFinite(rawRetry) ? Math.max(1, rawRetry) : 60;
    logger.warn("Rate limit exceeded");
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: "Ingestion event budget exceeded for this API key."
        }
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) }
      }
    );
  }

  const skipped: SkippedEvent[] = [];
  const validEvents = envelope.data.events.flatMap((event, index) => {
    const parsedEvent = ingestEventSchema.safeParse(event);

    if (!parsedEvent.success) {
      skipped.push({
        index,
        reason: parsedEvent.error.issues[0]?.message ?? "Invalid event."
      });
      return [];
    }

    return [parsedEvent.data];
  });

  const { error, response } = await processIngestion(
    supabase,
    authenticatedKey.orgId,
    envelope.data,
    validEvents,
    authenticatedKey.id
  );

  if (error) {
    logger.error({ error }, "Internal server error during ingestion");
    return apiError(500, "internal_error", "Internal server error during ingestion.");
  }



  logger.info({ agent: envelope.data.agent_name, events: response?.accepted, skipped: skipped.length }, "Ingested events");

  const finalResponse: IngestResponse = {
    ...response!,
  };

  if (skipped.length > 0) {
    finalResponse.skipped = skipped;
  }

  return NextResponse.json(finalResponse, { status: 202 });
}
