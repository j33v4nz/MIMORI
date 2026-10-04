import type {
  DetectionCategory,
  DetectionVerdict,
  Severity
} from "../types";

export interface Rule {
  id: string;
  name: string;
  pattern: string;
  pattern_type: "regex" | "keyword";
  category: DetectionCategory;
  severity: Severity;
  enabled: boolean;
}

export interface CompiledRule extends Rule {
  compiledPattern?: RegExp;
  lowerKeyword?: string;
}

const REDOS_PATTERNS = [
  /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/,   // Nested quantifier inside group with outer quantifier, e.g. (a+)+
  /\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*[+*]\)[+*{]/,  // Alternation with quantifier inside quantified group, e.g. (a|b+)+
  /\([^()]+\)[+*]{2,}/                                 // Consecutive outer quantifiers
];

function hasRedosRisk(pattern: string): boolean {
  return REDOS_PATTERNS.some((re) => re.test(pattern));
}

export function compileRules(rules: Rule[]): CompiledRule[] {
  return rules.map((rule) => {
    if (rule.pattern_type === "keyword") {
      return { ...rule, lowerKeyword: rule.pattern.toLowerCase() };
    }
    
    try {
      const javascriptPattern = rule.pattern.replace(/\(\?i\)/g, "");
      if (hasRedosRisk(javascriptPattern)) {
        console.warn(`[rules] Rule ${rule.id} skipped: regex pattern may be vulnerable to ReDoS`);
        return { ...rule };
      }
      return { ...rule, compiledPattern: new RegExp(javascriptPattern, "i") };
    } catch (e) {
      console.warn(`[rules] Failed to compile regex for rule ${rule.id}:`, e);
      return { ...rule };
    }
  });
}

export interface RuleDetection {
  ruleId: string;
  category: DetectionCategory;
  severity: Severity;
  verdict: DetectionVerdict;
  confidence: number;
}

const SEVERITY_CONFIDENCE: Record<Severity, number> = {
  critical: 0.95,
  high: 0.85,
  medium: 0.7,
  low: 0.5
};

export function payloadToSearchText(payload: Record<string, unknown>): string {
  const seen = new WeakSet();
  try {
    const payloadCopy = JSON.parse(JSON.stringify(payload, (key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[CIRCULAR]";
        seen.add(value);
      }
      return value;
    }));

    return JSON.stringify(payloadCopy).toLowerCase();
  } catch {
    return String(payload).toLowerCase();
  }
}

export function detectWithRules(
  payload: Record<string, unknown>,
  rules: CompiledRule[],
  searchText?: string
): RuleDetection[] {
  const text = (searchText ?? payloadToSearchText(payload)).slice(0, 100000);
  const detections: RuleDetection[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    let matched = false;
    if (rule.pattern_type === "keyword" && rule.lowerKeyword) {
      matched = text.includes(rule.lowerKeyword);
    } else if (rule.pattern_type === "regex" && rule.compiledPattern) {
      matched = rule.compiledPattern.test(text);
    }

    if (matched) {
      const isMalicious = rule.severity === "critical" || rule.severity === "high";
      detections.push({
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        verdict: isMalicious ? "malicious" : "suspicious",
        confidence: SEVERITY_CONFIDENCE[rule.severity]
      });
    }
  }

  return detections;
}
