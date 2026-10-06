"""Calibrate task-aware Laya separately, then evaluate frozen held-out inputs.

No parameters or thresholds change after calibration. Records raw probabilities,
errors, checkpoint/source hashes and the offline archived-semantic comparison.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
import shutil
from pathlib import Path
import sys
import time

from serve import LayaModelRunner


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rows(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def predicts_positive(row, threshold):
    return not row['error'] and row['choice'] != 'benign' and row['scores'][row['choice']] >= threshold


def select_threshold(predictions, max_false_positive_rate=.05):
    benign = [row for row in predictions if row['label'] == 'benign']
    positive = [row for row in predictions if row['label'] != 'benign']
    if not benign or not positive or any(row['error'] for row in predictions):
        raise ValueError('Complete calibration with benign and non-benign support is required')
    candidates = {1.0} | {row['scores'][row['choice']] for row in predictions if row['choice'] != 'benign'}
    feasible = []
    for threshold in candidates:
        fp = sum(predicts_positive(row, threshold) for row in benign)
        tp = sum(predicts_positive(row, threshold) for row in positive)
        if fp / len(benign) <= max_false_positive_rate:
            feasible.append((tp, -fp, threshold))
    if not feasible:
        raise ValueError('No threshold meets the calibration false-positive limit')
    _, _, selected = max(feasible)
    return selected


def metrics(predictions, threshold):
    attacks = [row for row in predictions if row['label'] == 'malicious']
    uncertain = [row for row in predictions if row['label'] == 'suspicious']
    benign = [row for row in predictions if row['label'] == 'benign']
    latency = sorted(row['latency_ms'] for row in predictions)
    caught = sum(predicts_positive(row, threshold) for row in attacks)
    fp = sum(predicts_positive(row, threshold) for row in benign)
    return {'samples': len(predictions), 'threshold': threshold, 'attacks': len(attacks), 'detected': caught,
            'recall': caught/len(attacks) if attacks else None, 'benign': len(benign), 'false_positives': fp,
            'false_positive_rate': fp/len(benign) if benign else None,
            'suspicious': len(uncertain), 'suspicious_queued_or_blocked': sum(predicts_positive(row, threshold) for row in uncertain),
            'errors': sum(row['error'] for row in predictions),
            'confusion': dict(Counter(row['label']+'->'+('error' if row['error'] else row['choice']) for row in predictions)),
            'latency_ms': {'p50': latency[(len(latency)-1)//2], 'p95': latency[min(len(latency)-1,int(len(latency)*.95))]}}


def infer(runner, inputs, output, stage):
    result = []
    for i, case in enumerate(inputs):
        start = time.perf_counter()
        row = {'id': case['id'], 'label': case.get('verdict', 'malicious' if case.get('malicious') else 'benign'),
               'error': False, 'choice': None, 'scores': None}
        try:
            prediction = runner.classify(case.get('raw_text', case.get('content')), user_request=case['user_request'], tool_name=case['tool_name'])
            scores, choice = prediction['scores'], prediction['choice']
            if prediction['metadata']['engine'] != 'laya_finetuned' or set(scores) != {'benign','suspicious','malicious'}:
                raise ValueError('Real normalized model probabilities are required')
            if any(type(v) not in (int,float) or not math.isfinite(v) or not 0 <= v <= 1 for v in scores.values()) or not math.isclose(sum(scores.values()),1,abs_tol=.001):
                raise ValueError('Invalid model probabilities')
            if choice not in scores or scores[choice] != max(scores.values()):
                raise ValueError('Invalid model choice')
            row.update(choice=choice, scores=scores)
        except Exception:
            row['error'] = True
        row['latency_ms'] = (time.perf_counter()-start)*1000
        result.append(row)
        with output.open('a') as handle:
            handle.write(json.dumps(row)+'\n')
        print(f'{stage} [{i+1}/{len(inputs)}] {row["id"]}: {row["choice"] if not row["error"] else "ERROR"}',flush=True)
    return result


def baseline_hashes(args):
    data = Path(args.data)
    return {str(path):digest(path) for path in [data/'calibration.jsonl',data/'test.jsonl',
        Path(args.baseline)/'model.safetensors',Path(__file__),Path(__file__).with_name('serve.py'),Path(__file__).with_name('task_schema.py')]}


def evaluate_baseline(args):
    out = Path(args.output)
    if out.exists() and any(out.iterdir()):
        raise ValueError('Use a fresh baseline evidence directory')
    out.mkdir(parents=True,exist_ok=True)
    hashes = baseline_hashes(args)
    baseline = LayaModelRunner(args.baseline,require_model=True)
    calibration = infer(baseline,rows(Path(args.data)/'calibration.jsonl'),out/'baseline-calibration.jsonl','baseline-calibration')
    threshold = select_threshold(calibration)
    (out/'baseline-policy.json').write_text(json.dumps({'threshold':threshold,'source':'calibration only',
        'calibration_metrics':metrics(calibration,threshold)},indent=2)+'\n')
    infer(baseline,rows(Path(args.data)/'test.jsonl'),out/'baseline-heldout.jsonl','baseline-heldout')
    if baseline_hashes(args) != hashes:
        raise RuntimeError('Baseline sources changed during evaluation')
    (out/'baseline-manifest.json').write_text(json.dumps({'sha256':hashes,'threads':args.threads},indent=2)+'\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', default='.private/laya-task-v0.2/checkpoint')
    parser.add_argument('--data', default='.private/laya-task-v0.2/data')
    parser.add_argument('--baseline', default='.private/laya-v0.1/checkpoint')
    parser.add_argument('--regression', default='docs/benchmarks/semantic-local')
    parser.add_argument('--output', default='docs/benchmarks/laya-task-v0.2')
    parser.add_argument('--threads',type=int,default=4)
    parser.add_argument('--baseline-only',action='store_true',help='Precompute the independent baseline while training runs')
    parser.add_argument('--baseline-evidence',help='Reuse a completed baseline with matching weights, data and source hashes')
    args = parser.parse_args()
    import torch
    torch.set_num_threads(args.threads)
    if args.baseline_only:
        evaluate_baseline(args)
        return
    out,data,checkpoint = Path(args.output),Path(args.data),Path(args.checkpoint)
    if out.exists() and any(out.iterdir()):
        raise ValueError('Use a fresh evaluation directory')
    out.mkdir(parents=True,exist_ok=True)
    sources = [Path(__file__),Path(__file__).with_name('serve.py'),Path(__file__).with_name('task_schema.py'),
               data/'train.jsonl',data/'calibration.jsonl',data/'test.jsonl',data/'manifest.json',checkpoint/'model.safetensors',
               checkpoint/'training-manifest.json',checkpoint/'task-schema.json',Path(args.regression)/'inputs.json',
               Path(args.regression)/'cases.jsonl',Path(args.baseline)/'model.safetensors']
    if args.baseline_evidence:
        evidence = Path(args.baseline_evidence)
        baseline_manifest = json.loads((evidence/'baseline-manifest.json').read_text())
        if baseline_manifest['sha256'] != baseline_hashes(args):
            raise ValueError('Baseline evidence differs in weights, sources or held-out data')
        sources.extend(evidence/name for name in ['baseline-manifest.json','baseline-policy.json','baseline-calibration.jsonl','baseline-heldout.jsonl'])
    hashes = {str(path):digest(path) for path in sources}
    (out/'manifest.json').write_text(json.dumps({'sha256':hashes,'threads':args.threads,'max_calibration_fp_rate':.05},indent=2)+'\n')
    # Archive sources and the exact development dataset alongside decisions.
    # Keep large weights in the private checkpoint identified by its hash.
    (out/'sources').mkdir()
    (out/'data').mkdir()
    for path in (Path(__file__),Path(__file__).with_name('serve.py'),Path(__file__).with_name('task_schema.py'),
                 Path(__file__).with_name('task_dataset.py'),Path(__file__).with_name('task_dataset_v3.py'),
                 Path(__file__).with_name('train.py')):
        shutil.copyfile(path,out/'sources'/path.name)
    for path in data.iterdir():
        if path.is_file():
            shutil.copyfile(path,out/'data'/path.name)
    shutil.copyfile(checkpoint/'training-manifest.json',out/'training-manifest.json')
    calibration,heldout = rows(data/'calibration.jsonl'),rows(data/'test.jsonl')
    frozen = json.loads((Path(args.regression)/'inputs.json').read_text())
    archived = rows(Path(args.regression)/'cases.jsonl')
    if [row['id'] for row in frozen] != [row['id'] for row in archived]:
        raise ValueError('Archived semantic decisions must match frozen inputs')
    runner = LayaModelRunner(str(checkpoint),require_model=True)
    if not runner.task_schema:
        raise ValueError('Task-aware checkpoint required')
    cal = infer(runner,calibration,out/'calibration.jsonl','calibration')
    threshold = select_threshold(cal)
    policy = {'threshold':threshold,'selection':'Maximum non-benign recall under at most 5% benign false positives; ties prefer fewer false positives then higher threshold',
              'source':'calibration only','calibration_sha256':digest(data/'calibration.jsonl'),
              'weights_sha256':digest(checkpoint/'model.safetensors'),'calibration_metrics':metrics(cal,threshold),
              'require_task_context':True}
    # Freeze policy on disk before opening test inference; never adjust on outcomes.
    (out/'policy.json').write_text(json.dumps(policy,indent=2)+'\n')
    test = infer(runner,heldout,out/'heldout.jsonl','heldout')
    regression = infer(runner,frozen,out/'regression.jsonl','regression')
    runner.router.unload()
    del runner
    import gc
    gc.collect()
    if args.baseline_evidence:
        baseline_cal,baseline_test = rows(evidence/'baseline-calibration.jsonl'),rows(evidence/'baseline-heldout.jsonl')
        for saved,original in [(baseline_cal,calibration),(baseline_test,heldout)]:
            if [(r['id'],r['label']) for r in saved] != [(r['id'],r['verdict']) for r in original]:
                raise ValueError('Baseline cases do not match development inputs')
        baseline_threshold = select_threshold(baseline_cal)
        if json.loads((evidence/'baseline-policy.json').read_text())['threshold'] != baseline_threshold:
            raise ValueError('Baseline threshold does not match calibration')
        for name in ['baseline-manifest.json','baseline-policy.json','baseline-calibration.jsonl','baseline-heldout.jsonl']:
            shutil.copyfile(evidence/name,out/name)
    else:
        baseline = LayaModelRunner(args.baseline,require_model=True)
        baseline_cal = infer(baseline,calibration,out/'baseline-calibration.jsonl','baseline-calibration')
        baseline_threshold = select_threshold(baseline_cal)
        (out/'baseline-policy.json').write_text(json.dumps({'threshold':baseline_threshold,'source':'calibration only',
                'calibration_metrics':metrics(baseline_cal,baseline_threshold)},indent=2)+'\n')
        baseline_test = infer(baseline,heldout,out/'baseline-heldout.jsonl','baseline-heldout')
    hybrid = []
    for row, old in zip(regression,archived):
        positive = predicts_positive(row,threshold) or old['detected']
        error = row['error'] or old['review_error']
        hybrid.append({**row,'error':error,'choice':'malicious' if positive else 'benign',
                       'scores': {'malicious':1.0 if positive else 0.0,'benign':0.0 if positive else 1.0,'suspicious':0.0},
                       'latency_ms':row['latency_ms']+old['latency_ms']})
    if any(digest(path)!=value for path,value in hashes.items()):
        raise RuntimeError('Evaluation inputs, weights or sources changed')
    report = {'scope':'Synthetic task-aware held-out development data and frozen 103-case regression; not official ASR',
              'sha256':hashes,'policy':policy,'heldout_candidate':metrics(test,threshold),
              'heldout_baseline_at_0_75':metrics(baseline_test,.75),'regression_candidate':metrics(regression,threshold),
              'heldout_baseline_calibrated':metrics(baseline_test,baseline_threshold),
              'regression_combined_offline':metrics(hybrid,1.0),
              'candidate_threads':args.threads,'baseline_threads':baseline_manifest['threads'] if args.baseline_evidence else args.threads,
              'limitations':['Small synthetic held-out set with shared concepts; no production-distribution or independent human validation.',
                             'The regression inputs were previously inspected; not a new blind evaluation. Not used for training or threshold selection.',
                             'Combined decisions reuse archived semantic results; latency is an estimate.',
                             'Review failures are errors, not caught attacks. No real actions executed.']}
    (out/'results.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='sha256'},indent=2),flush=True)


if __name__=='__main__':
    main()
