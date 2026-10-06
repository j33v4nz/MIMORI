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
  if (REDOS_PATTERNS.some((re) => re.test(pattern))) return true;
  // Reject repeated alternation even when branches hide in nested groups:
  // (a|aa)+ and (?:(?:a)|aa)+ can both backtrack exponentially. Escaped
  // punctuation and character classes are literals, not group structure.
  const groups = [{ alternation: false, repetition: false }];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\") { i++; continue; }
    if (char === "[") { inClass = true; continue; }
    if (char === "]" && inClass) { inClass = false; continue; }
    if (inClass) continue;
    const current = groups[groups.length - 1];
    if (char === "(") groups.push({ alternation: false, repetition: false });
    else if (char === "|") current.alternation = true;
    else if (char === ")" && groups.length > 1) {
      const group = groups.pop()!;
      const repeated = /[+*{]/.test(pattern[i + 1] ?? "");
      if (repeated && (group.alternation || group.repetition)) return true;
      const parent = groups[groups.length - 1];
      parent.alternation ||= group.alternation;
      parent.repetition ||= group.repetition || repeated;
    } else if (char === "+" || char === "*" || char === "{") current.repetition = true;
  }
  return false;
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

const WORD_LOOKALIKES: Record<string, string> = {
  "а": "a", "е": "e", "і": "i", "о": "o", "с": "c", "р": "p",
  "х": "x", "у": "y", "ѕ": "s", "ι": "i"
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
  // Scan bounded overlapping windows, including the tail. JSON serialization
  // escapes newlines, so also inspect each original string value separately.
  // An explicit override remains the sole input (used for SDK signal markers).
  const text = searchText ?? payloadToSearchText(payload);
  const sources = [text.toLowerCase()];
  if (searchText === undefined) {
    try {
      const pending: unknown[] = [JSON.parse(text)];
      while (pending.length) {
        const value = pending.pop();
        if (typeof value === "string") sources.push(value);
        else if (value && typeof value === "object") {
          for (const child of Object.values(value)) pending.push(child);
        }
      }
    } catch { /* Serialization fallback remains searchable. */ }
  }
  const windows = (value: string): string[] => {
    const result: string[] = [];
    for (let start = 0; start < value.length; start += 95904) {
      result.push(value.slice(start, start + 100000));
    }
    return result;
  };
  const raw = sources.flatMap(windows);
  // Normalize words only: changing digits or punctuation can manufacture
  // secret/IP/command matches. Keep those categories on the raw views.
  const wordCategories = new Set(["instruction_override", "jailbreak_persona", "system_prompt_extraction"]);
  const normalized = sources.flatMap((value) => [false, true].flatMap((spaces) => windows(
    value.normalize("NFKC").toLowerCase()
      .replace(/[\u00ad\u034f\u2060\u200b-\u200f\ufeff]/g, spaces ? " " : "")
      .replace(/[аеіосрхуѕι]/g, (letter) => WORD_LOOKALIKES[letter])
      .replace(/\s+/g, " ")
  )));
  const detections: RuleDetection[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    let matched = false;
    if (rule.pattern_type === "keyword" && rule.lowerKeyword) {
      matched = raw.some((view) => view.includes(rule.lowerKeyword!));
      if (!matched && wordCategories.has(rule.category)) {
        matched = normalized.some((view) => view.includes(rule.lowerKeyword!));
      }
    } else if (rule.pattern_type === "regex" && rule.compiledPattern) {
      matched = raw.some((view) => rule.compiledPattern!.test(view));
      if (!matched && wordCategories.has(rule.category)) {
        matched = normalized.some((view) => rule.compiledPattern!.test(view));
      }
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
