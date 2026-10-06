// Static detection evaluation. Dataset instructions are data and are never executed.
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, openSync, closeSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import os from "node:os";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataset = resolve(process.argv[2] ?? "/tmp/mimori-injecagent");
const output = resolve(process.argv[3] ?? join(root, "docs/benchmarks/injecagent"));
function revision(directory) {
  let gitDir = join(directory, ".git");
  try {
    const pointer = readFileSync(gitDir, "utf8").trim();
    if (pointer.startsWith("gitdir: ")) gitDir = resolve(directory, pointer.slice(8));
  } catch { /* Normal checkouts have a .git directory. */ }
  const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  if (!head.startsWith("ref: ")) return head;
  const ref = head.slice(5);
  try { return readFileSync(join(gitDir, ref), "utf8").trim(); }
  catch {
    const packed = readFileSync(join(gitDir, "packed-refs"), "utf8");
    const line = packed.split("\n").find((line) => line.endsWith(` ${ref}`));
    if (!line) throw new Error(`Cannot resolve ${ref}`);
    return line.split(" ")[0];
  }
}
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const sources = {};
function source(path) {
  const text = readFileSync(join(root, path), "utf8");
  sources[path] = sha256(text);
  return text;
}
function moduleUrl(text) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}
const rulesUrl = moduleUrl(source("app/lib/detection/rules.ts"));
const { compileRules, detectWithRules } = await import(rulesUrl);
const triggerText = source("app/lib/detection/trigger.ts").replace('"./rules"', JSON.stringify(rulesUrl));
const { shouldQueueForLlmJudge } = await import(moduleUrl(triggerText));
const serviceText = source("app/lib/services/detection-service.ts");
const ast = ts.createSourceFile("service.ts", serviceText, ts.ScriptTarget.Latest, true);
let initializer;
for (const statement of ast.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(ast) === "FALLBACK_DEFAULT_RULES") initializer = declaration.initializer.getText(ast);
    }
  }
}
if (!initializer) throw new Error("Cannot locate production fallback rules");
const { rules: fallback } = await import(moduleUrl(`export const rules = ${initializer};`));
const seedText = source("supabase/migrations/20261003000000_new_org_default_rules.sql");
const tuples = [...seedText.matchAll(/\(\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'(regex|keyword)',\s*'([^']+)',\s*'([^']+)',\s*(true|false)\s*\)/g)];
if (!tuples.length) throw new Error("Cannot parse new-organization rule pack");
const seed = tuples.map((m, i) => ({ id: `seed-${i + 1}`, name: m[1].replaceAll("''", "'"), pattern: m[2].replaceAll("''", "'"), pattern_type: m[3], category: m[4], severity: m[5], enabled: m[6] === "true" }));
const hashes = {};
function readDataset(name) {
  const text = readFileSync(join(dataset, "data", name), "utf8");
  hashes[name] = sha256(text);
  return text;
}
const samples = [];
for (const setting of ["base", "enhanced"]) {
  for (const family of ["dh", "ds"]) {
    const rows = JSON.parse(readDataset(`test_cases_${family}_${setting}.json`));
    for (const [index, row] of rows.entries()) {
      if (typeof row["Tool Response"] !== "string") throw new Error("Missing tool response");
      samples.push({ id: `${setting}-${family}-${index}`, setting, malicious: true, family, attack_type: row["Attack Type"], tool: row["User Tool"], payload: { tool: { name: row["User Tool"] }, output: row["Tool Response"] } });
    }
  }
}
const users = readDataset("user_cases.jsonl").trim().split(/\r?\n/).map(JSON.parse);
for (const [index, row] of users.entries()) {
  // Derived controls, not an independent benign corpus: remove the injection slot.
  const text = row["Tool Response Template"];
  if (typeof text !== "string" || !text.includes("<Attacker Instruction>")) throw new Error("Missing control injection slot");
  samples.push({ id: `control-${index}`, setting: "control", malicious: false, family: "derived_control", attack_type: "derived_control", tool: row["User Tool"], payload: { tool: { name: row["User Tool"] }, output: text.replaceAll("<Attacker Instruction>", "") } });
}
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * q) - 1)];
function summarize(rows) {
  const attacks = rows.filter((r) => r.malicious), controls = rows.filter((r) => !r.malicious);
  const tp = attacks.filter((r) => r.detected).length, fp = controls.filter((r) => r.detected).length;
  const queued = attacks.filter((r) => !r.detected && r.review_trigger).length;
  return { attacks: attacks.length, detected: tp, missed: attacks.length - tp, recall: attacks.length ? tp / attacks.length : null, controls: controls.length, false_positives: fp, false_positive_rate: controls.length ? fp / controls.length : null, precision: tp + fp ? tp / (tp + fp) : null, missed_attacks_triggering_review: queued, detection_or_review_coverage: attacks.length ? (tp + queued) / attacks.length : null, latency_ms: { p50: quantile(rows.map((r) => r.latency_ms), 0.5), p95: quantile(rows.map((r) => r.latency_ms), 0.95), p99: quantile(rows.map((r) => r.latency_ms), 0.99) } };
}
const engines = {};
const details = {};
for (const [name, rules] of [["new_org_rules", seed], ["fallback_rules", fallback]]) {
  const compiled = compileRules(rules);
  if (compiled.some((r) => r.enabled && !(r.compiledPattern || r.lowerKeyword))) throw new Error(`${name}: uncompiled rule`);
  for (const sample of samples.slice(0, 50)) detectWithRules(sample.payload, compiled);
  const rows = samples.map(({ payload, ...sample }) => {
    const start = performance.now();
    const detections = detectWithRules(payload, compiled);
    const elapsed = performance.now() - start;
    return { ...sample, detected: detections.length > 0, categories: [...new Set(detections.map((d) => d.category))], rule_ids: detections.map((d) => d.ruleId), review_trigger: detections.length === 0 && shouldQueueForLlmJudge(payload), latency_ms: elapsed };
  });
  details[name] = rows;
  engines[name] = { rule_count: rules.length };
  console.log(`${name}: evaluated ${rows.length} samples`);
}
source("sdk/mimori/guardrail.py");
source("scripts/benchmark-injecagent-sdk.py");
source("scripts/benchmark-injecagent.mjs");
// A file-backed stdin avoids blocking on large synchronous pipe writes.
const temp = mkdtempSync(join(os.tmpdir(), "mimori-benchmark-"));
let inputFd;
let sdk;
try {
  const inputPath = join(temp, "payloads.json");
  writeFileSync(inputPath, JSON.stringify(samples.map((s) => s.payload)));
  inputFd = openSync(inputPath, "r");
  sdk = JSON.parse(execFileSync("python3", [join(root, "scripts/benchmark-injecagent-sdk.py")], { stdio: [inputFd, "pipe", "pipe"], maxBuffer: 20 * 1024 * 1024, encoding: "utf8", timeout: 120_000 }));
} finally {
  if (inputFd !== undefined) closeSync(inputFd);
  rmSync(temp, { recursive: true, force: true });
}
if (sdk.results.length !== samples.length) throw new Error("SDK result count mismatch");
details.sdk_guardrail = samples.map(({ payload, ...sample }, i) => ({ ...sample, ...sdk.results[i], review_trigger: false }));
engines.sdk_guardrail = { rule_count: sdk.rule_count };
for (const [name, rows] of Object.entries(details)) {
  engines[name].settings = Object.fromEntries(["base", "enhanced"].map((setting) => [setting, summarize(rows.filter((r) => r.setting === setting || !r.malicious))]));
  engines[name].base_by_attack_type = Object.fromEntries([...new Set(rows.filter((r) => r.setting === "base").map((r) => r.attack_type))].map((type) => [type, summarize(rows.filter((r) => r.setting === "base" && r.attack_type === type))]));
}
const report = { generated_at: new Date().toISOString(), scope: "Static tool-response detection on InjecAgent; not official agent attack-success evaluation", dataset_url: "https://github.com/uiuc-kang-lab/InjecAgent", dataset_commit: revision(dataset), mimori_commit: revision(root), dataset_sha256: hashes, source_sha256: sources, environment: { node: process.version, platform: os.platform(), cpu: os.cpus()[0]?.model }, limitations: ["No agent actions, live API ingestion, database, Laya, or paid LLM judge were run.", "Review-trigger coverage is routing only, not successful detection; random sampling is excluded.", "17 controls are derived by removing the injection slot from tool templates, not a representative benign dataset.", "Precision depends on this attack-heavy evaluation mix; control false-positive rate has very small support.", "Base and enhanced are paired variants, not 2,108 independent attacks; there are 62 distinct base attack instructions combined with 17 tool templates.", "Latency measures local detector calls only; no networking, persistence, judge execution, or end-to-end guardrail protection.", "Only tool name and response content are scanned; attack labels and expected achievements are excluded."], engines };
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "results.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(output, "cases.jsonl"), Object.entries(details).flatMap(([engine, rows]) => rows.map((row) => JSON.stringify({ engine, ...row }))).join("\n") + "\n");
for (const [engine, result] of Object.entries(engines)) {
  for (const [setting, metrics] of Object.entries(result.settings)) {
    console.log(`${engine}/${setting}: ${metrics.detected}/${metrics.attacks} detected (${(100 * metrics.recall).toFixed(2)}%), ${metrics.false_positives}/${metrics.controls} control false positives, p95 ${metrics.latency_ms.p95.toFixed(4)} ms`);
  }
}
console.log(`Results saved to ${output}`);
