"""Verify actual local weight changes and the predeclared training inputs."""
import hashlib
import json
from pathlib import Path

import torch
from safetensors import safe_open

torch.set_num_threads(2)
root = Path('.private/laya-task-v0.3')
plan = json.loads((root / 'training-plan.json').read_text())
checkpoint = root / 'checkpoint'
manifest = json.loads((checkpoint / 'training-manifest.json').read_text())
assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest() == expected
           for path, expected in plan['source_sha256'].items())
data_manifest = json.loads((Path(plan['data']) / 'manifest.json').read_text())
assert manifest['dataset_sha256'] == data_manifest['sha256']
assert manifest['steps'] == 192 and manifest['epochs'] == 4
assert len(manifest['calibration_losses']) == 4
assert manifest['selected_epoch'] == min(range(4), key=lambda index: manifest['calibration_losses'][index]) + 1
old_path = Path(plan['initial_checkpoint']) / 'model.safetensors'
new_path = checkpoint / 'model.safetensors'
assert hashlib.sha256(old_path.read_bytes()).hexdigest() == manifest['initial_weights_sha256']
changed, frozen = [], []
with safe_open(old_path, framework='pt', device='cpu') as old, safe_open(new_path, framework='pt', device='cpu') as new:
    assert set(old.keys()) == set(new.keys())
    for key in old.keys():
        a, b = old.get_tensor(key), new.get_tensor(key)
        assert torch.isfinite(b).all(), key
        same = torch.equal(a, b)
        if key.startswith(('encoder.', 'act_head.')):
            assert same, f'Frozen tensor changed: {key}'
            frozen.append(key)
        elif not same:
            assert key.startswith(('head.', 'type_emb.', 'scorer.')), key
            changed.append(key)
assert changed, 'No trainable weights changed'
report = {
    'actual_decision_head_weights_changed': True,
    'changed_tensors': changed,
    'frozen_encoder_and_action_head_identical': True,
    'frozen_tensors_checked': len(frozen),
    'all_exported_tensors_finite': True,
    'predeclared_sources_and_data_unchanged': True,
    'checkpoint_selection_matches_minimum_calibration_loss': True,
    'selected_epoch': manifest['selected_epoch'],
    'steps': manifest['steps'],
    'weights_sha256': hashlib.sha256(new_path.read_bytes()).hexdigest(),
}
(root / 'weight-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
