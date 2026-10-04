export interface VigilanceResult {
  vigilanceLevel: string;
  systemStatus: string;
  statusColor: string;
  statusBg: string;
  vigilanceDesc: string;
  activeSegmentsCount: number;
}

export function computeVigilance(detectionsBySeverity: {
  critical: number;
  high: number;
  medium: number;
  low: number;
}): VigilanceResult {
  if (detectionsBySeverity.critical > 0) {
    return {
      vigilanceLevel: "LEVEL_05",
      systemStatus: "CRITICAL ALERT",
      statusColor: "text-error",
      statusBg: "bg-error",
      vigilanceDesc: "CRITICAL FINDINGS (24H)",
      activeSegmentsCount: 5,
    };
  }
  if (detectionsBySeverity.high > 0) {
    return {
      vigilanceLevel: "LEVEL_04",
      systemStatus: "ELEVATED THREAT",
      statusColor: "text-error",
      statusBg: "bg-error",
      vigilanceDesc: "THREAT ELEVATED",
      activeSegmentsCount: 4,
    };
  }
  if (detectionsBySeverity.medium > 0) {
    return {
      vigilanceLevel: "LEVEL_03",
      systemStatus: "CAUTION ADVISED",
      statusColor: "text-amber-500",
      statusBg: "bg-amber-500",
      vigilanceDesc: "CAUTION ADVISED",
      activeSegmentsCount: 3,
    };
  }
  if (detectionsBySeverity.low > 0) {
    return {
      vigilanceLevel: "LEVEL_02",
      systemStatus: "MONITORING ACTIVE",
      statusColor: "text-primary",
      statusBg: "bg-primary",
      vigilanceDesc: "MONITORING ACTIVE",
      activeSegmentsCount: 2,
    };
  }
  return {
    vigilanceLevel: "LEVEL_01",
    systemStatus: "NO UNRESOLVED FINDINGS (24H)",
    statusColor: "text-tertiary",
    statusBg: "bg-tertiary",
    vigilanceDesc: "NO UNRESOLVED FINDINGS (24H)",
    activeSegmentsCount: 1,
  };
}
