#!/usr/bin/env python3
"""Reproducible supervised Laya decision-head fine-tuning with a frozen encoder.

CPU training caches encoder features once. This trains the real pinned Laya
checkpoint; it is not full encoder training or reinforcement learning.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import time

BASE_REVISION = '7b928d828b7b0e022f929d9bd2e44165aa270148'


def read_rows(path):
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    if not rows:
        raise ValueError(f'Empty dataset: {path}')
    return rows


def verify_splits(data_dir):
    splits = {name: read_rows(Path(data_dir) / f'{name}.jsonl')
              for name in ('train', 'calibration', 'test')}
    for name, rows in splits.items():
        if any(not r.get('family_id') for r in rows):
            raise ValueError(f'{name}: missing source family identifiers; regenerate data')
    for a, b in [('train', 'calibration'), ('train', 'test'), ('calibration', 'test')]:
        if {r['family_id'] for r in splits[a]} & {r['family_id'] for r in splits[b]}:
            raise ValueError(f'Dataset leakage between {a} and {b}')
        if {r['raw_text'] for r in splits[a]} & {r['raw_text'] for r in splits[b]}:
            raise ValueError(f'Duplicate text between {a} and {b}')
    return splits


def fit_temperature(predictions):
    import torch
    log_t = torch.zeros(1, requires_grad=True)
    optimizer = torch.optim.LBFGS([log_t], lr=.1, max_iter=50)
    def closure():
        optimizer.zero_grad()
        loss = sum(-(target * torch.log_softmax(z / log_t.exp(), -1)).sum()
                   for z, target in predictions) / len(predictions)
        loss.backward()
        return loss
    optimizer.step(closure)
    # Match the supported inference runtime's temperature bounds.
    return float(log_t.exp().clamp(.5, 5).item())


def train(args, splits):
    import torch
    from huggingface_hub import snapshot_download
    from safetensors.torch import load_file, save_file
    from laya.common import build_model, build_sequence, QTYPES
    from laya.agent import _load_tokenizer
    torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    started = time.time()
    base = args.initial_checkpoint or snapshot_download(args.base_model, revision=args.revision,
                            allow_patterns=['model.safetensors', 'encoder/*', 'tokenizer/*',
                                            'rl_agent_config.json', 'LICENSE', 'README.md'])
    schema_path = Path(args.data_dir) / 'task-schema.json'
    schema = json.loads(schema_path.read_text()) if schema_path.exists() else None
    question_ids = args.question_ids.split(',')
    if schema and (question_ids != ['verdict'] or any(json.loads(row['questions']) != schema['questions']
                                                   for rows in splits.values() for row in rows)):
        raise ValueError('Task-aware rows and question IDs must match the versioned task schema')
    cfg = json.loads((Path(base) / 'rl_agent_config.json').read_text())
    tok = _load_tokenizer(str(Path(base) / 'tokenizer'), cfg)
    model = build_model(cfg, encoder_dir=str(Path(base) / 'encoder'), pretrained=False)
    model.load_state_dict(load_file(str(Path(base) / 'model.safetensors')), strict=True)
    model.float()
    model.encoder.config.reference_compile = False
    for p in model.encoder.parameters():
        p.requires_grad_(False)
    for p in model.act_head.parameters():
        p.requires_grad_(False)
    model.eval()

    def prepare(rows):
        cached = []
        for index, row in enumerate(rows):
            questions, gold = json.loads(row['questions']), json.loads(row['gold'])
            for qid in question_ids:
                q = questions[qid]
                keys = list(q['criteria'])
                ids, markers, stats = build_sequence(tok, json.loads(row['state']),
                    {'t': q['type'], 'ins': q['instructions'], 'crit': q['criteria']},
                    cfg.get('max_len', 512), cfg.get('head_max_len', 128), return_truncation_stats=True)
                if stats['truncated']:
                    raise ValueError('Training state was truncated; refusing incomplete supervision')
                if len(markers) != len(keys):
                    raise ValueError('Question options were truncated')
                ids = torch.tensor([ids])
                with torch.no_grad():
                    h = model.encoder(input_ids=ids, attention_mask=torch.ones_like(ids)).last_hidden_state[0]
                target = torch.tensor([gold[qid]['probabilities'][k] for k in keys])
                target /= target.sum()
                cached.append((h.half(), torch.tensor(markers), QTYPES[q['type']], target))
            if (index + 1) % 25 == 0:
                print(f'Cached {index + 1}/{len(rows)} rows', flush=True)
        return cached

    # Test rows are not used for training or temperature fitting.
    training = prepare(splits['train'])
    calibration = prepare(splits['calibration'])

    def forward(items):
        n, length = len(items), max(len(x[0]) for x in items)
        options = max(len(x[1]) for x in items)
        h = torch.zeros(n, length, model.encoder.config.hidden_size)
        pad = torch.ones(n, length, dtype=torch.bool)
        pos = torch.zeros(n, options, dtype=torch.long)
        mask = torch.zeros(n, options, dtype=torch.bool)
        target = torch.zeros(n, options)
        for i, (features, markers, qtype, labels) in enumerate(items):
            h[i, :len(features)] = features.float()
            pad[i, :len(features)] = False
            pos[i, :len(markers)] = markers
            mask[i, :len(markers)] = True
            target[i, :len(labels)] = labels
        h = h + model.type_emb(torch.tensor([x[2] for x in items]))[:, None, :]
        if model.head is not None:
            for layer in model.head.layers:
                h = layer(h, src_key_padding_mask=pad)
        m = torch.gather(h, 1, pos[:, :, None].expand(-1, -1, h.size(-1)))
        z = model.scorer(m).squeeze(-1).masked_fill(~mask, -1e4)
        return z, target

    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.lr)
    losses, steps = [], 0
    calibration_losses = []
    best_loss, best_epoch, best_state = float('inf'), None, None
    for epoch in range(args.epochs):
        model.train()
        model.encoder.eval()
        random.shuffle(training)
        total, batches = 0., 0
        for start in range(0, len(training), args.batch_size):
            z, target = forward(training[start:start + args.batch_size])
            loss = -(target * torch.log_softmax(z, -1)).sum(-1).mean()
            if not torch.isfinite(loss):
                raise ValueError('Non-finite training loss')
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.)
            optimizer.step()
            total += float(loss.detach())
            steps += 1
            batches += 1
        losses.append(total / batches)
        print(f'Epoch {epoch + 1}/{args.epochs}: loss={losses[-1]:.5f}', flush=True)
        if args.select_best_calibration:
            model.eval()
            with torch.no_grad():
                validation = []
                for start in range(0, len(calibration), args.batch_size):
                    z, target = forward(calibration[start:start + args.batch_size])
                    validation.extend((-(target * torch.log_softmax(z, -1)).sum(-1)).tolist())
            value = sum(validation) / len(validation)
            if not torch.isfinite(torch.tensor(value)):
                raise ValueError('Non-finite calibration loss')
            calibration_losses.append(value)
            print(f'Calibration epoch {epoch + 1}: loss={value:.5f}', flush=True)
            if value < best_loss:
                best_loss, best_epoch = value, epoch + 1
                # Only the trainable head needs a copy; the encoder is frozen.
                best_state = {name: parameter.detach().clone()
                              for name, parameter in model.named_parameters() if parameter.requires_grad}
    if best_state is not None:
        with torch.no_grad():
            for name, parameter in model.named_parameters():
                if name in best_state:
                    parameter.copy_(best_state[name])
    model.eval()
    predictions = []
    with torch.no_grad():
        for item in calibration:
            z, target = forward([item])
            predictions.append((z[0], target[0]))
    temperature = fit_temperature(predictions)
    # Laya indexes this list by its three supported question types.
    cfg['temperature'] = [temperature] * len(QTYPES)
    cfg.pop('temperature_by_options', None)
    cfg.pop('temperature_by_qtype', None)
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    save_file({k: v.detach().half().cpu().contiguous() for k, v in model.state_dict().items()},
              str(output / 'model.safetensors'))
    tok.save_pretrained(output / 'tokenizer')
    model.encoder.config.save_pretrained(output / 'encoder')
    (output / 'rl_agent_config.json').write_text(json.dumps(cfg, indent=2))
    if schema:
        shutil.copyfile(schema_path, output / 'task-schema.json')
    manifest = {'base_model': args.base_model, 'base_revision': args.revision,
                'initial_checkpoint': str(base),
                'initial_weights_sha256': hashlib.sha256((Path(base) / 'model.safetensors').read_bytes()).hexdigest(),
                'question_ids': question_ids,
                'method': 'supervised decision-head fine-tuning; frozen encoder; cached features',
                'seed': args.seed, 'epochs': args.epochs, 'steps': steps, 'losses': losses,
                'checkpoint_selection': 'minimum calibration cross-entropy' if args.select_best_calibration else 'last epoch',
                'calibration_losses': calibration_losses, 'selected_epoch': best_epoch or args.epochs,
                'learning_rate': args.lr, 'batch_size': args.batch_size, 'threads': args.threads,
                'torch_version': torch.__version__,
                'trained_parameters': sum(p.numel() for p in model.parameters() if p.requires_grad),
                'total_parameters': sum(p.numel() for p in model.parameters()),
                'seconds': round(time.time() - started, 2), 'temperature': cfg['temperature'],
                'counts': {k: len(v) for k, v in splits.items()},
                'dataset_sha256': {k: hashlib.sha256((Path(args.data_dir) / f'{k}.jsonl').read_bytes()).hexdigest()
                                   for k in splits}, 'experimental': True}
    manifest['trainer_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    manifest['dataset_manifest'] = json.loads((Path(args.data_dir) / 'manifest.json').read_text()) if (Path(args.data_dir) / 'manifest.json').exists() else None
    (output / 'training-manifest.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--base-model', default='convaiinnovations/laya')
    p.add_argument('--revision', default=BASE_REVISION)
    p.add_argument('--initial-checkpoint', help='Local checkpoint to initialize from without a download')
    p.add_argument('--question-ids', default='verdict,category')
    p.add_argument('--data-dir', default='scripts/laya/data')
    p.add_argument('--output-dir', default='scripts/laya/checkpoint')
    p.add_argument('--epochs', type=int, default=3)
    p.add_argument('--batch-size', type=int, default=8)
    p.add_argument('--lr', type=float, default=2e-5)
    p.add_argument('--threads', type=int, default=4)
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--select-best-calibration', action='store_true',
                   help='Select the epoch using calibration loss only; test rows remain unused')
    p.add_argument('--dry-run', action='store_true')
    args = p.parse_args()
    if min(args.epochs, args.batch_size, args.threads) <= 0 or args.lr <= 0:
        p.error('epochs, batch size, threads and learning rate must be positive')
    if int(os.environ.get('WORLD_SIZE', '1')) != 1:
        p.error('This frozen-encoder trainer is single-process; do not use torchrun')
    splits = verify_splits(args.data_dir)
    if args.dry_run:
        print(json.dumps({'mode': 'validation-only; no checkpoint trained',
                          'counts': {k: len(v) for k, v in splits.items()}}))
        return
    if (Path(args.output_dir) / 'model.safetensors').exists():
        p.error('Use a fresh output directory; existing checkpoints are not overwritten')
    try:
        train(args, splits)
    except ImportError as exc:
        raise SystemExit(f'Training dependencies missing: {exc}. Install scripts/laya/requirements.txt. No training performed.')


if __name__ == '__main__':
    main()
