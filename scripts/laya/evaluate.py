#!/usr/bin/env python3
"""Evaluate a required Laya checkpoint on an untouched held-out JSONL split."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import platform
import time


def evaluate_dataset(runner, val_file):
    rows = [json.loads(s) for s in Path(val_file).read_text().splitlines() if s.strip()]
    if not rows:
        raise ValueError('Evaluation data is empty')
    predictions, latency = [], []
    for row in rows:
        start = time.perf_counter()
        result = runner.classify(row['raw_text'])
        latency.append((time.perf_counter() - start) * 1000)
        if result['metadata']['engine'] != 'laya_finetuned':
            raise RuntimeError('Evaluation refused: model inference fell back to heuristics')
        predictions.append(result)
    def ratio(a, b):
        return a / b if b else None
    classes = {}
    for label in ['benign', 'suspicious', 'malicious']:
        tp = sum(r['verdict'] == label and p['choice'] == label for r,p in zip(rows,predictions))
        fp = sum(r['verdict'] != label and p['choice'] == label for r,p in zip(rows,predictions))
        fn = sum(r['verdict'] == label and p['choice'] != label for r,p in zip(rows,predictions))
        precision, recall = ratio(tp,tp+fp), ratio(tp,tp+fn)
        classes[label] = {'support':tp+fn, 'precision':precision, 'recall':recall,
            'f1':ratio(2*tp,2*tp+fp+fn)}
    categories = {}
    for category in sorted({r['category'] for r in rows}):
        category = 'none' if category == 'other' else category
        true = [('none' if r['category']=='other' else r['category']) == category for r in rows]
        pred = [('none' if p['metadata']['category']=='other' else p['metadata']['category']) == category for p in predictions]
        tp, fp, fn = sum(a and b for a,b in zip(true,pred)), sum(not a and b for a,b in zip(true,pred)), sum(a and not b for a,b in zip(true,pred))
        categories[category] = {'support':sum(true), 'precision':ratio(tp,tp+fp), 'recall':ratio(tp,tp+fn)}
    benign = sum(r['verdict']=='benign' for r in rows)
    false_positive = sum(r['verdict']=='benign' and p['choice']=='malicious' for r,p in zip(rows,predictions))
    benign_flagged = sum(r['verdict']=='benign' and p['choice']!='benign' for r,p in zip(rows,predictions))
    auto_detect = [p['choice']=='malicious' and p['scores']['malicious'] >= .9 for p in predictions]
    auto_tp = sum(flag and r['verdict']=='malicious' for r,flag in zip(rows,auto_detect))
    brier = sum(sum((p['scores'][label] - float(r['verdict']==label))**2 for label in classes)
                for r,p in zip(rows,predictions))/len(rows)
    bins = []
    for i in range(10):
        samples = [(r,p) for r,p in zip(rows,predictions)
                   if i/10 <= max(p['scores'].values()) < (i+1)/10 or (i==9 and max(p['scores'].values())==1)]
        if samples:
            confidence = sum(max(p['scores'].values()) for r,p in samples)/len(samples)
            accuracy = sum(r['verdict']==p['choice'] for r,p in samples)/len(samples)
            bins.append({'count':len(samples), 'confidence':confidence,'accuracy':accuracy})
    latency.sort()
    return {'scope':'synthetic held-out template families; not an independent security benchmark',
        'samples':len(rows),'dataset_sha256':hashlib.sha256(Path(val_file).read_bytes()).hexdigest(),
        'verdict_accuracy':sum(r['verdict']==p['choice'] for r,p in zip(rows,predictions))/len(rows),
        'classes':classes,'categories':categories,'benign_false_positive_rate':ratio(false_positive,benign),
        'benign_nonbenign_rate':ratio(benign_flagged,benign),
        'auto_detect_at_0_9':{'flagged':sum(auto_detect),'precision':ratio(auto_tp,sum(auto_detect)),
            'malicious_recall':ratio(auto_tp,classes['malicious']['support'])},
        'brier_score':brier,'expected_calibration_error':sum(b['count']*abs(b['confidence']-b['accuracy']) for b in bins)/len(rows),
        'confusion_matrix':dict(Counter(r['verdict']+'->'+p['choice'] for r,p in zip(rows,predictions))),
        'latency_ms':{k:latency[min(len(latency)-1,int(len(latency)*q))] for k,q in [('p50',.5),('p95',.95),('p99',.99)]},
        'hardware':{'platform':platform.platform(),'processor':platform.processor(),
            'logical_cpus':__import__('os').cpu_count()},
        'engine':'laya_finetuned','heuristic_fallbacks':0}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data-file',default='scripts/laya/data/test.jsonl')
    p.add_argument('--model-path',default='scripts/laya/checkpoint')
    p.add_argument('--output',default='scripts/laya/checkpoint/evaluation.json')
    p.add_argument('--threads',type=int,default=4)
    args=p.parse_args()
    import torch
    torch.set_num_threads(args.threads)
    from serve import LayaModelRunner
    runner=LayaModelRunner(args.model_path,require_model=True)
    report=evaluate_dataset(runner,args.data_file)
    report['hardware'].update(threads=torch.get_num_threads(), torch_version=torch.__version__)
    output=Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
