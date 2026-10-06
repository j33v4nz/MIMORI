# MIMORI documentation

## Start here

- [Quickstart](../README.md#quickstart)
- [Local or managed Supabase setup](local-development.md)
- [Python SDK and framework adapters](../sdk/README.md)
- [Integration matrix: frameworks, JavaScript, and custom runtimes](integrations.md)
- [Runnable examples](../sdk/examples/README.md)
- [Silent demo and live-model example](demo-video/README.md)

## Understand the system

- [Architecture](architecture.md)
- [Product specification](product-spec.md)
- [Database model](data-model.md)
- [Ingestion and comparison API](api-spec.md) · [OpenAPI schema](openapi.yaml)
- [Behavior comparison and limits](behavior-diff.md)
- [Detection rules](detection-rules.md) and [rule packs](rule-packs.md)

## Operate and contribute

- [Security architecture](security-architecture.md)
- [Tool-response review and task-scoped authorization](tool-response-security.md)
- [Task-aware Laya training and calibration](laya-task-training.md)
- [Telemetry, retention, and privacy](telemetry-best-practices.md)
- [Crash recovery, replay, and backup/restore checks](durability.md)
- [Judge prompts and worker execution](judge-prompts.md)
- [Release checklist](release-checklist.md)
- [Contributing](../CONTRIBUTING.md), [security reporting](../SECURITY.md), and [governance](../GOVERNANCE.md)
- [Roadmap](roadmap.md)

## Experimental work

[Laya training and evaluation](laya-finetuning.md) covers actual pinned-weight decision-head training, disjoint data splits and strict inference. The separate [trained research checkpoint and measured limitations](laya-model-card.md) are experimental; it does not meet a production classifier quality gate. The [notebook](../notebooks/finetune_laya_mimori_kaggle.ipynb) runs the same training scripts.

[Release verification](verification.md) records native framework, local recovery, browser, distribution and model evidence with its scope.
