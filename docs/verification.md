# Release verification scope

Earlier development evidence, October 4, 2026: both [release CI](https://github.com/j33v4nz/MIMORI/actions/runs/37193583163) and [native integrations](https://github.com/j33v4nz/MIMORI/actions/runs/37193583151) passed at `d61c185` in the archived development repository: 25 jobs total.

The fresh public repository starts with the `v1` release. Its exact source must
pass its own [CI](https://github.com/j33v4nz/MIMORI/actions/workflows/ci.yml) and
[native integration checks](https://github.com/j33v4nz/MIMORI/actions/workflows/native-integrations.yml);
earlier runs do not establish verification of this release commit. The `v1`
release notes record the final checks and their scope.

| Gate | Evidence | Limit |
| --- | --- | --- |
| Native integrations | 16 isolated jobs plus the existing current LangChain agent job | Exact [documented versions and dispatch paths](integrations.md); fixture providers, not every version or live account |
| SDK | Python 3.10, 3.11 and 3.12 CI, current LangChain agent, clean wheel/source install | Published PyPI package/version is a separate distribution |
| Dashboard | Lint, TypeScript, unit tests and production build | No hosted load or uptime assertion |
| Fresh onboarding | New local Supabase setup, sign-up, key creation, custom Python/Node ingestion, findings and comparison | Local browser flow, not hosted auth/provider reachability |
| Detection recovery | Authenticated worker repairs a committed pending event; repeat invocation creates no duplicate finding | Operator must schedule and monitor the worker |
| Database | Concurrent replay, hard crash/restart, stale judge-job recovery and matching backup/restore | Disposable local Postgres, not provider disk corruption/PITR or production soak |
| Secret review | Candidate files and full public Git history pass; exact synthetic model datasets separately scanned | Scanner coverage is finite; no historical credential-revocation claim |
| Laya | Real six-epoch training, changed-head/frozen-encoder verification and strict actual inference | [Experimental model card](laya-model-card.md): poor false positives and below majority-class accuracy |

Later local checks passed 220 SDK tests and the targeted uncertain-classifier review regressions. Native-only tests are skipped in the base SDK job and required independently in their selected native jobs.

## Operational requirements

Apply every migration. Schedule detection recovery, judge and retention endpoints with `CRON_SECRET`; monitor pending age, failures, backup freshness and successful restores. Python SDK queues remain in memory, external alerts are best effort, and hosted durability still requires a real deployment test. [Recovery guide](durability.md).

The trained Laya candidate is available for reproducible research and remains disabled by default. Its availability does not make it a validated security control. Public beta readiness is separate from production certification.
