import { NextResponse } from "next/server";
import { requireDashboardUser } from "../../../lib/api/auth";
import { apiError } from "../../../lib/api/errors";
import { getDetections } from "../../../lib/dashboard/queries";
import { formatInternal } from "../../../lib/format";
import { logger } from "../../../lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  const { searchParams } = new URL(request.url);
  const severity = searchParams.get("severity") || undefined;
  const category = searchParams.get("category") || undefined;
  const layer = searchParams.get("layer") || undefined;

  const detections = await getDetections({ limit: 1000, severity, category, layer, excludePayload: true });

  // Generate CSV
  const header = ["ID", "Severity", "Category", "Layer", "Agent", "Event ID", "Timestamp"];
  const sanitizeCsv = (val: unknown) => {
    const str = String(val ?? "");
    if (/^[=+\-@\t\r\n]/.test(str)) {
      return `'${str}`;
    }
    return str;
  };

  const rows = detections.map((d) => [
    sanitizeCsv(d.id),
    sanitizeCsv(d.severity),
    sanitizeCsv(formatInternal(d.category)),
    sanitizeCsv(formatInternal(d.layer)),
    sanitizeCsv(d.event.session.agent.name),
    sanitizeCsv(d.event.id),
    sanitizeCsv(new Date(d.created_at).toISOString())
  ]);

  const csvContent = [
    header.join(","),
    ...rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
  ].join("\n");

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="detections_export_${new Date().toISOString().split('T')[0]}.csv"`
    }
  });
}
