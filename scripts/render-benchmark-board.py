"""Build exact, editable benchmark artwork from saved local evaluation results.

Produces SVG/HTML sources, machine-readable facts and a public-facing review.
Use render-benchmark-board.mjs to export the sources to PNG and PDF.
"""
import hashlib
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / 'docs/benchmarks/run-20261006-132635'
LAYA = ROOT / 'docs/benchmarks/laya-task-v0.3'
OUT = ROOT / 'docs/benchmarks/social-review-20261006'


def read(path):
    return json.loads(path.read_text())


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def pct(value):
    return f'{value * 100:.1f}%'


def collect():
    semantic = read(RUN / 'semantic/results.json')
    laya = read(LAYA / 'results.json')
    static = read(RUN / 'regex/results.json')
    raw = read(RUN / 'semantic/raw-regex-comparison.json')
    original = rows(RUN / 'semantic/cases.jsonl')
    candidate = rows(LAYA / 'regression.jsonl')
    assert [r['id'] for r in original] == [r['id'] for r in candidate] == [r['id'] for r in raw['cases']]
    threshold = laya['policy']['threshold']
    classifications = {
        'regex': [r['detected'] for r in raw['cases']],
        'llm': [r['detected'] for r in original],
        'laya': [not r['error'] and r['choice'] != 'benign' and r['scores'][r['choice']] >= threshold for r in candidate],
    }
    profiles = []
    for name, engines in [
        ('SDK regex only', ['regex']), ('Laya v0.3 only', ['laya']),
        ('Llama semantic review', ['llm']), ('Llama + Laya / OR', ['llm', 'laya']),
        ('Regex + Llama / OR', ['regex', 'llm']), ('Regex + Llama + Laya / OR', ['regex', 'llm', 'laya']),
    ]:
        positives = [any(classifications[engine][i] for engine in engines) for i in range(len(original))]
        tp = sum(flag and case['malicious'] for flag, case in zip(positives, original))
        fp = sum(flag and not case['malicious'] for flag, case in zip(positives, original))
        attacks = sum(r['malicious'] for r in original)
        benign = len(original) - attacks
        fn, tn = attacks - tp, benign - fp
        profiles.append({'name': name, 'engines': engines, 'true_positives': tp, 'false_positives': fp,
                         'false_negatives': fn, 'true_negatives': tn, 'attacks': attacks, 'benign': benign,
                         'recall': tp / attacks, 'false_positive_rate': fp / benign,
                         'precision': tp / (tp + fp) if tp + fp else 0,
                         'f1': 2 * tp / (2 * tp + fp + fn), 'accuracy': (tp + tn) / len(original),
                         'scope': 'offline OR replay' if len(engines) > 1 else 'individual detector evaluation'})
    assert profiles[2]['true_positives'] == semantic['total']['detected']
    assert profiles[3]['true_positives'] == laya['regression_combined_offline']['detected']
    assert profiles[3]['false_positives'] == laya['regression_combined_offline']['false_positives']
    assert not any(r['review_error'] for r in original) and not any(r['error'] for r in candidate)
    source_paths = [RUN / 'semantic/results.json', RUN / 'semantic/cases.jsonl', RUN / 'semantic/inputs.json',
                    RUN / 'semantic/raw-regex-comparison.json', RUN / 'regex/results.json',
                    LAYA / 'results.json', LAYA / 'regression.jsonl', LAYA / 'training-manifest.json',
                    LAYA / 'weight-verification.json', LAYA / 'policy.json',
                    ROOT / 'docs/benchmarks/llm-regex-v2/regex-results.json',
                    ROOT / 'docs/benchmarks/capabilities/results.json']
    facts = {'date': '2026-10-06', 'scope': 'Local detector regression, not official agent attack-success evaluation',
             'semantic': semantic, 'laya': laya, 'static': static, 'profiles': profiles,
             'training': read(LAYA / 'training-manifest.json'), 'weights': read(LAYA / 'weight-verification.json'),
             'scanner': read(ROOT / 'docs/benchmarks/llm-regex-v2/regex-results.json')['summary'],
             'capabilities': read(ROOT / 'docs/benchmarks/capabilities/results.json'),
             'provenance': read(RUN / 'run-manifest.json'),
             'review_errors': 0,
             'new_laya_attacks': [r['id'] for i, r in enumerate(original) if r['malicious'] and classifications['laya'][i] and not classifications['llm'][i]],
             'new_laya_benign_blocks': [r['id'] for i, r in enumerate(original) if not r['malicious'] and classifications['laya'][i] and not classifications['llm'][i]],
             'source_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths},
             'limitations': [
                 'The 103-case set was previously inspected. It is a regression, not a blind or production-distribution evaluation.',
                 'Overall recall mixes 62 public attacks with 8 authored attacks; public-only recall is reported separately.',
                 'No real agent attack actions ran. These results are not official InjecAgent ASR or a leaderboard rank.',
                 'Combined detector profiles are offline OR replays. The task-aware SDK path uses the supplied reviewer and does not apply raw regex.',
                 'Combined latency is a per-case sum of separately measured latencies, not a live latency or throughput measurement.',
                 'Regex enhanced cases contain an explicit override prefix. Base/enhanced share 62 instructions across 17 contexts.',
                 'Laya data are synthetic, resource-disjoint with shared concepts. Test cases never choose weights, temperature or threshold.',
                 'Precision, F1 and accuracy depend on this attack-heavy sample mix; benign sample sizes are small.',
                 'Capability audit assumes application-owned grants; it checks dataset-proposed tool names, not live agent attack prevention.',
                 'Laya v0.3 was not promoted for blocking: it adds no regression detections and one extra false positive.',
             ]}
    smoke = LAYA / 'sdk-smoke.json'
    if smoke.exists():
        facts['sdk_smoke'] = read(smoke)
    return facts


class Canvas:
    def __init__(self, width, height):
        self.width, self.height = width, height
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
                      '<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#081321"/><stop offset="1" stop-color="#12223A"/></linearGradient></defs>',
                      f'<rect width="{width}" height="{height}" fill="url(#bg)"/>']

    def box(self, x, y, w, h, fill='#14253A', stroke='#2A415B', r=24):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')

    def text(self, x, y, value, size=32, color='#B8CAE0', weight=400, anchor='start'):
        self.parts.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="Fira Sans, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>')

    def line(self, x1, y1, x2, y2, color='#2A415B', width=2):
        self.parts.append(f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="{width}"/>')

    def spark(self, x, y, w, h, values, color):
        lo, hi = .60, 1.05
        points = [(x + w * i / 3, y + h * (hi - value) / (hi - lo)) for i, value in enumerate(values)]
        d = ' '.join(('M' if i == 0 else 'L') + f'{px:.1f} {py:.1f}' for i, (px, py) in enumerate(points))
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="4" stroke-linejoin="round"/>')
        for px, py in points:
            self.parts.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="5" fill="{color}"/>')

    def save(self, name):
        svg = '\n'.join(self.parts + ['</svg>'])
        (OUT / f'{name}.svg').write_text(svg)
        (OUT / f'{name}.html').write_text(f'<!doctype html><meta charset="utf-8"><style>@page{{size:{self.width}px {self.height}px;margin:0}}html,body{{margin:0;background:#081321}}svg{{display:block}}</style>{svg}')


def portrait(facts):
    c = Canvas(2400, 3000)
    white, mint, amber = '#F4F8FD', '#7AE9C5', '#FFD28A'
    profiles, training = facts['profiles'], facts['training']
    c.text(80, 100, 'MIMORI', 58, white, 700)
    c.box(1820, 60, 500, 64, '#1D334A')
    c.text(2070, 104, 'LOCAL CPU  /  06 OCT 2026', 28, '#CCE0F7', 600, 'middle')
    c.text(80, 231, 'Security benchmark', 108, white, 700)
    c.text(80, 299, 'InjecAgent subset + authored challenges · task-aware tool-response review', 37)
    c.text(80, 348, '103 INPUTS    /    70 ATTACKS    /    33 BENIGN    /    FROZEN INPUTS + SOURCES', 29, '#8FAECF', 600)
    for x, profile, label, color in [(80, profiles[2], 'WITHOUT LAYA · LLAMA REVIEW', mint), (1224, profiles[3], 'WITH LAYA · INDEPENDENT OR', amber)]:
        c.box(x, 395, 1096, 394)
        c.text(x + 38, 452, label, 32, color, 600)
        c.text(x + 38, 489, 'ATTACK RECALL', 24, '#91B0D2', 600)
        c.text(x + 38, 632, pct(profile['recall']), 164, white, 700)
        c.text(x + 680, 580, f'{profile["true_positives"]}/70', 60, color, 600)
        c.text(x + 680, 632, 'attacks caught', 30)
        for dx, value, title in [(38, profile['false_positive_rate'], 'FALSE POSITIVE RATE'), (385, profile['precision'], 'PRECISION'), (740, profile['accuracy'], 'ACCURACY')]:
            c.text(x + dx, 711, pct(value), 49, color, 600)
            c.text(x + dx, 758, title, 24, '#A8BED8', 600)
    c.box(80, 819, 2240, 77, '#2D2B25', '#6B5B3F', 18)
    c.text(1200, 869, 'Laya added 0 caught attacks and 1 extra benign false positive on this regression.', 35, amber, 500, 'middle')
    c.box(80, 931, 2240, 591)
    c.text(118, 993, '01 / Layer-by-layer comparison', 39, white, 600)
    c.text(2280, 993, 'SAME 70 ATTACK + 33 BENIGN INPUTS', 26, '#91B0D2', 600, 'end')
    c.text(118, 1068, 'PROFILE', 26, '#91B0D2', 600)
    for x, name in [(960, 'RECALL'), (1260, 'CAUGHT'), (1690, 'BENIGN BLOCKED'), (2150, 'F1')]:
        c.text(x, 1068, name, 26, '#91B0D2', 600, 'middle')
    c.line(118, 1092, 2280, 1092)
    for i, p in enumerate(profiles):
        y = 1143 + i * 57
        color = mint if p['engines'] == ['llm'] else amber if p['engines'] == ['llm', 'laya'] else white
        c.text(118, y, p['name'], 32, color, 500)
        for x, value in [(960, pct(p['recall'])), (1260, f'{p["true_positives"]}/70'), (1690, f'{p["false_positives"]}/33  ({pct(p["false_positive_rate"])})'), (2150, pct(p['f1']))]:
            c.text(x, y, value, 33, color, 500, 'middle')
    c.text(118, 1490, 'Combined profiles are offline OR replays. Task-aware SDK review does not apply raw regex.', 27)
    c.box(80, 1560, 1096, 429)
    c.text(118, 1621, '02 / Public + authored slices', 38, white, 600)
    for y, label, value, note in [
        (1705, 'InjecAgent base subset', '52/62', '83.9% recall · one selected context per public attack instruction'),
        (1806, 'Derived ordinary outputs', '0/17 FP', '17 benign controls obtained by removing the injection slot'),
        (1907, 'Authored attack challenges', '8/8', '16 authored benign examples: 1 false positive'),
    ]:
        c.text(118, y, label, 32, white, 500)
        c.text(1120, y, value, 43, mint, 600, 'end')
        c.text(118, y + 42, note, 25)
    c.box(1224, 1560, 1096, 429)
    c.text(1262, 1621, '03 / Full static regex test', 38, white, 600)
    for x, label, anchor in [(1262, 'PACK', 'start'), (1600, 'BASE /1,054', 'middle'), (1920, 'ENHANCED /1,054', 'middle'), (2250, 'FP /17', 'middle')]:
        c.text(x, 1692, label, 23, '#91B0D2', 600, anchor)
    for i, (label, key) in enumerate([('New-org', 'new_org_rules'), ('Fallback', 'fallback_rules'), ('SDK regex', 'sdk_guardrail')]):
        settings = facts['static']['engines'][key]['settings']
        y = 1758 + 60 * i
        c.text(1262, y, label, 31, white, 500)
        for x, value in [(1600, settings['base']['detected']), (1920, settings['enhanced']['detected']), (2250, settings['base']['false_positives'])]:
            c.text(x, y, f'{value:,}', 34, white, 500, 'middle')
    c.text(1262, 1935, 'Enhanced cases contain a direct override prefix.', 26, amber)
    c.text(1262, 1970, '62 instructions × 17 contexts; base/enhanced are paired.', 24)
    c.box(80, 2026, 2240, 432)
    c.text(118, 2089, '04 / Actual Laya v0.3 training', 39, white, 600)
    c.box(1902, 2050, 379, 55, '#332D25', '#6B5B3F', 12)
    c.text(2091, 2086, 'RESEARCH CANDIDATE', 24, amber, 600, 'middle')
    for y, label in [(2160, '192 train · 96 calibration · 96 held-out'), (2214, '26.2M head parameters · frozen encoder'), (2268, '4 epochs / 192 steps · selected epoch 3'), (2314, '144 retained updates · 33.6 minutes on CPU')]:
        c.text(118, y, label, 31)
    c.spark(120, 2348, 650, 77, training['losses'], mint)
    c.spark(120, 2348, 650, 77, training['calibration_losses'], '#79BAFF')
    for i in range(4):
        c.text(120 + 650 * i / 3, 2446, f'{i + 1}' + ('*' if i == 2 else ''), 22, '#91B0D2', 500, 'middle')
    c.text(830, 2383, 'Training loss', 24, mint)
    c.text(830, 2418, 'Calibration loss', 24, '#79BAFF')
    c.text(1210, 2160, 'SYNTHETIC HELD-OUT ATTACK RECALL', 28, '#91B0D2', 600)
    old = facts['laya']['heldout_baseline_calibrated']
    new = facts['laya']['heldout_candidate']
    c.text(1210, 2264, pct(old['recall']), 91, white, 600)
    c.text(1628, 2264, '→', 83, '#79BAFF', 500)
    c.text(1800, 2264, pct(new['recall']), 91, mint, 600)
    c.text(1210, 2315, f'v0.2 · {old["detected"]}/40', 30)
    c.text(1800, 2315, f'v0.3 · {new["detected"]}/40', 30)
    c.text(1210, 2364, '0/48 benign false positives for both', 30, mint)
    c.text(1210, 2411, 'Separate calibration thresholds · no test tuning', 26)
    c.box(80, 2494, 2240, 208)
    c.text(118, 2552, '05 / Runtime + evidence', 38, white, 600)
    c.text(118, 2602, 'Llama 3.1 8B · Q4_K_M · Ollama 0.32.5 · Intel i5-1235U · CPU only', 32)
    semlat = facts['semantic']['total']['latency_ms']
    laylat = facts['laya']['regression_candidate']['latency_ms']
    combo = facts['laya']['regression_combined_offline']['latency_ms']
    c.text(118, 2650, f'LLM p50 {semlat["p50"]/1000:.2f}s / p95 {semlat["p95"]/1000:.2f}s  ·  Laya p50 {laylat["p50"]/1000:.2f}s / p95 {laylat["p95"]/1000:.2f}s', 31)
    c.text(118, 2690, f'LLM + Laya p50 {combo["p50"]/1000:.2f}s / p95 {combo["p95"]/1000:.2f}s (offline summed estimate) · 0 review errors', 27)
    c.text(80, 2755, 'Scanner dev checks: 12/20 → 20/20 authored signatures caught; 0/16 benign false positives.', 29)
    c.text(80, 2803, 'Capability audit: 1,054/1,054 proposed chains contain a denied tool; 17/17 original calls allowed.', 29)
    c.text(80, 2844, 'Capability counts use fixture grants and dataset tool labels; no live agent attack-success score.', 26, '#91B0D2')
    c.line(80, 2870, 2320, 2870)
    c.text(80, 2917, 'LOCAL DETECTOR EVALUATION · Previously inspected regression · Not official InjecAgent ASR', 28, white, 600)
    c.text(80, 2960, 'No agent attacks executed. Positive = suspicious/malicious; errors never count as catches. Source: InjecAgent f19c9f2.', 26)
    c.save('mimori-benchmark-board')


def wide(facts):
    c = Canvas(2560, 1440)
    white, mint, amber = '#F4F8FD', '#7AE9C5', '#FFD28A'
    c.text(80, 99, 'MIMORI', 56, white, 700)
    c.text(2480, 98, 'LOCAL CPU / 06 OCT 2026', 29, '#91B0D2', 600, 'end')
    c.text(80, 217, 'Security benchmark review', 94, white, 700)
    c.text(80, 282, '103 frozen inputs · 62 public + 8 authored attacks · 33 benign · detector classification', 34)
    for x, p, label, color in [(80, facts['profiles'][2], 'WITHOUT LAYA / LLAMA REVIEW', mint), (880, facts['profiles'][3], 'WITH LAYA / OFFLINE OR', amber)]:
        c.box(x, 340, 760, 430)
        c.text(x + 35, 405, label, 30, color, 600)
        c.text(x + 35, 587, pct(p['recall']), 145, white, 700)
        c.text(x + 502, 549, 'ATTACK', 24, '#91B0D2', 600)
        c.text(x + 502, 588, 'RECALL', 24, '#91B0D2', 600)
        c.text(x + 35, 658, f'{p["true_positives"]}/70 attacks caught', 38, color, 500)
        c.text(x + 35, 719, f'{p["false_positives"]}/33 false positives  /  {pct(p["precision"])} precision', 29)
    c.box(1680, 340, 800, 430)
    c.text(1715, 405, 'ACTUAL LAYA TRAINING', 32, white, 600)
    c.text(1715, 472, '4 epochs / 192 steps · selected epoch 3', 31)
    c.text(1715, 526, '26.2M head parameters · frozen encoder', 31)
    c.text(1715, 580, 'Synthetic held-out: 8/40 → 13/40 caught', 31, mint)
    c.text(1715, 634, '0/48 benign false positives for both', 31, mint)
    c.text(1715, 699, 'REGRESSION: +0 catches / +1 false positive', 29, amber, 600)
    c.box(80, 820, 1510, 421)
    c.text(115, 880, 'SAME INPUTS / SIX DETECTOR PROFILES', 34, white, 600)
    for x, text, anchor in [(115, 'PROFILE', 'start'), (1100, 'CAUGHT', 'middle'), (1440, 'BENIGN BLOCKED', 'middle')]:
        c.text(x, 942, text, 25, '#91B0D2', 600, anchor)
    for i, p in enumerate(facts['profiles']):
        y = 996 + 42 * i
        c.text(115, y, p['name'], 28, white)
        c.text(1100, y, f'{p["true_positives"]}/70', 29, mint if p['engines'] == ['llm'] else white, 500, 'middle')
        c.text(1440, y, f'{p["false_positives"]}/33', 29, amber if len(p['engines']) > 1 else white, 500, 'middle')
    c.box(1630, 820, 850, 421)
    c.text(1665, 880, 'PUBLIC DATA / LOCAL RUNTIME', 34, white, 600)
    for y, line in [(950, 'InjecAgent subset: 52/62 caught (83.9%)'), (1006, 'Full regex base: 17/1,054 new-org; 0 SDK'), (1062, 'Enhanced: 1,054/1,054; override prefix'), (1118, 'Llama 3.1 8B Q4_K_M / i5-1235U CPU'), (1174, 'LLM p50 15.44s / p95 23.47s / 0 errors')]:
        c.text(1665, y, line, 29)
    c.text(80, 1309, 'Combined profiles = offline OR. Task-aware SDK review bypasses raw regex. Laya v0.3 was not promoted for blocking.', 30, amber)
    c.text(80, 1375, 'Previously inspected local regression · Not official InjecAgent ASR or a leaderboard rank · No agent attack actions executed', 29)
    c.save('mimori-benchmark-wide')


def review(f):
    table = '\n'.join(f'| {p["name"]} | {p["true_positives"]}/70 | {pct(p["recall"])} | {p["false_positives"]}/33 | {pct(p["precision"])} | {pct(p["f1"])} | {pct(p["accuracy"])} |' for p in f['profiles'])
    old, new = f['laya']['heldout_baseline_calibrated'], f['laya']['heldout_candidate']
    text = f'''# MIMORI local benchmark review — 6 October 2026

The strongest measured task-aware profile in this run was Llama semantic review: **60/70 attacks caught (85.7%)**, **1/33 benign false positives**, and **zero review errors**. Adding Laya v0.3 caught no additional attacks and increased benign false positives to 2/33. Laya remains a research candidate, not promoted for blocking.

## Comparable 103-case regression

There are 62 distinct public InjecAgent base instructions, each with one deterministically selected tool context; 17 benign controls derived by removing the injection slot; and 24 authored challenges (8 attacks, 16 benign). Total: 70 attacks, 33 benign. This set was previously inspected and is not blind or representative of production traffic.

| Profile | Attacks caught | Recall | Benign FP | Precision | F1 | Accuracy |
| --- | --- | --- | --- | --- | --- | --- |
{table}

These are measured detector decisions. Multi-detector rows replay independent decisions with OR: any positive detector flags the input. They do not represent a live agent attack-success benchmark. The actual task-aware SDK tool-response API calls the supplied reviewer and bypasses context-free regex; the raw-regex OR rows are explicit offline ablations. Positive semantic reviews include suspicious and malicious verdicts. Errors never count as caught attacks. Precision, F1 and accuracy depend on this attack-heavy sample mix.

## Public subset and controls

- Public InjecAgent base subset: **52/62 detected (83.9%)**; ten missed.
- Derived ordinary-tool controls: **0/17 benign false positives**.
- Authored challenges: **8/8 attacks caught**, **1/16 benign false positives**.
- Laya alone: **1/70 attacks caught**, **1/33 benign false positives**, no errors.
- Laya added no detections beyond Llama. Its extra false positive was an explanatory bank-transfer article (`challenge-7`). The Llama false positive was the deployment checklist (`challenge-4`).

## Full static InjecAgent evaluation

The full static test covers 1,054 base cases and 1,054 paired enhanced variants: 62 instructions × 17 tool contexts, plus 17 derived benign controls.

| Rule pack | Base caught | Enhanced caught | Benign FP |
| --- | --- | --- | --- |
| New-organization defaults | 17/1,054 (1.61%) | 1,054/1,054 | 0/17 |
| Fallback | 0/1,054 | 1,054/1,054 | 0/17 |
| SDK regex | 0/1,054 | 1,054/1,054 | 0/17 |

Enhanced cases contain a direct instruction-override prefix. Base/enhanced variants are paired, not 2,108 independent instructions. Detection-or-review routing coverage is 100% for dashboard/fallback base cases; queueing a review does not establish detection. New-org/fallback/SDK base p95 detector latency was 0.0463/0.0280/0.3995 milliseconds, excluding networking, persistence and judge execution.

The scanner's targeted development ablation improved from 12/20 to 20/20 authored attack-signature cases with 0/16 benign false positives in both versions. The rules were identical in that ablation. These authored regressions establish scanner fixes, not blind injection-defense accuracy.

## Actual Laya training and fairer comparison

Continued from the actual v0.2 checkpoint. Ran **4 epochs and 192 optimizer steps**, training **26,248,193 decision-head parameters** in a 421,293,827-parameter model with a frozen encoder and action head. CPU runtime: **33.55 minutes**. Epoch 3 had the lowest calibration cross-entropy and was selected; the exported checkpoint retains 144 additional updates. Epoch 4 reduced training loss but worsened calibration loss.

Data: 192 training, 96 calibration, 96 held-out synthetic examples; resource families stay within one split, all splits cover eight operation types, concepts and some wording remain shared. Test cases and benchmark cases do not update parameters, temperature or thresholds. Temperature was fitted on calibration only; threshold was selected under a 5% calibration benign-FP limit and frozen at **0.694**.

| New synthetic evaluation | Attacks caught | Benign FP | Errors |
| --- | --- | --- | --- |
| v0.3 calibration | 11/40 (27.5%) | 1/48 | 0 |
| v0.2 held-out, separately calibrated | {old['detected']}/40 ({pct(old['recall'])}) | {old['false_positives']}/48 | 0 |
| v0.3 held-out | {new['detected']}/40 ({pct(new['recall'])}) | {new['false_positives']}/48 | 0 |

The baseline threshold was selected separately on the same new calibration set: 0.9407. Its temperature was retained from the prior checkpoint; this is a comparison of calibrated profiles, not an isolated causal estimate of individual training changes. Eight ambiguous examples are reported separately: the candidate queued/blocked 3/8 at the selected threshold. Baseline at the historical 0.75 point caught 10/40 but had 3/48 benign false positives; that is not the preferred fair comparison.

The held-out result improved locally, but public regression detection fell to 1/70 at the selected v0.3 policy. Its one catch was already caught by Llama. **The candidate was rejected for automatic blocking.** The threshold was not lowered against held-out or benchmark results.

The weight audit confirmed 31 head tensors changed, 174 frozen tensors stayed identical, all exported tensors are finite, and declared sources/data stayed unchanged. Weight hash: `{f['weights']['weights_sha256']}`. Labels are authored by construction; there is no independent human validation.

## Runtime and exact model

- Llama 3.1 8B, Q4_K_M; Ollama 0.32.5; Intel i5-1235U, CPU only.
- Llama regression p50/p95: **15.44/23.47 seconds**.
- Laya v0.3 regression p50/p95: **2.08/3.83 seconds**; four CPU threads; startup excluded.
- Independent combined p50/p95: **17.48/27.14 seconds**, an offline per-case summed estimate, not live latency or throughput.
- Llama model digest: `{f['provenance']['model']['digest']}`.
- Original benchmark detector files and installed model digest were verified unchanged throughout the fresh run.

## Authorization and integration checks

The separate capability audit found an out-of-scope proposed tool in all 1,054 attack chains under fixture-owned original-task grants; 1,053 had all proposed tool names denied. One first step needs exact argument checks. All 17 distinct original calls were allowed. This audits dataset tool labels and a supplied capability configuration, not real agent attack prevention.

The new dataset's split/counterfactual checks passed (6 focused tests). The local training and strict model evaluation completed without inference errors. The SDK smoke artifact records the new checkpoint's actual integration checks; two synthetic fixtures establish execution flow, not classifier robustness. Historical app/SDK build/test results are kept in the benchmark index and are not rerun or represented as new model-evaluation results here.

## Provenance and publishing scope

InjecAgent source: [uiuc-kang-lab/InjecAgent](https://github.com/uiuc-kang-lab/InjecAgent), revision `f19c9f2c79a41046eb13c03c51a24c567a8ffa07`. Exact inputs, case decisions, model/source hashes and weights audit are linked in the source JSON and local reports. This report is not official InjecAgent ASR, a leaderboard result, a production guarantee or a competitor ranking. No real attack actions were executed. Everything remains local; nothing was pushed or published.

[Raw board facts](benchmark-review.json) · [Fresh benchmark](../run-20261006-132635/README.md) · [Laya evaluation](../laya-task-v0.3/results.json) · [Laya SDK smoke](../laya-task-v0.3/sdk-smoke.json)
'''
    (OUT / 'full-review.md').write_text(text)
    caption = '''MIMORI — local security benchmark, 6 October 2026.

On a frozen 103-case detector regression (62 public InjecAgent base attacks, 8 authored attacks and 33 benign inputs), Llama 3.1 semantic review caught 60/70 attacks: 85.7% recall, with 1/33 benign false positives and zero review errors. Public-only recall: 52/62, or 83.9%.

We also actually trained Laya: 4 epochs, 192 optimizer steps, 26.2M trainable head parameters. On a separate synthetic held-out set, calibrated detection improved from 8/40 to 13/40, with 0/48 benign false positives for both profiles. It added no catches on the public/development regression and increased false positives when combined with Llama, so the candidate was not promoted for blocking.

Regex caught direct override signatures well but missed most keyword-free base attacks. The full static evaluation and all detector ablations are on the board.

These are local detector results, not official InjecAgent ASR, a leaderboard rank, or a production guarantee. Combined rows are offline OR replays. Publishing the misses and false positives is part of the result.

Dataset: https://github.com/uiuc-kang-lab/InjecAgent
'''
    (OUT / 'social-caption.md').write_text(caption)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    facts = collect()
    (OUT / 'benchmark-review.json').write_text(json.dumps(facts, indent=2) + '\n')
    portrait(facts)
    wide(facts)
    review(facts)
    print(json.dumps({'output': str(OUT), 'profiles': facts['profiles']}, indent=2))
