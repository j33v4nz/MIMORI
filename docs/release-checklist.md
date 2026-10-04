# v1 Public Beta Release Checklist

The GitHub release tag is `v1`; dashboard and SDK package metadata are `1.1.0`.
GitHub source publication does not publish a matching package to PyPI.

- [ ] Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Run `npm run check:npm-audit`. Production dependencies must have no known advisories. The current full-tree audit has one narrow, expiring exception for GHSA-vfj7-8cjw-p6xm in the Tailwind 3 development-toolchain graph; the check fails if the advisory graph changes or another finding appears.
- [ ] Run `pip install -e './sdk[dev]'` and `python -m pytest sdk/tests`.
- [ ] Run `npm run test:security-pipeline` after installing the base Python SDK; it proves redacted SDK events still produce configured detections.
- [ ] Run `npm run check:database` with Docker. It creates a disposable PostgreSQL database, applies every migration, tests signup rules, reruns the core seed, and asserts tenant, detection-rule provenance and worker permissions. It also exercises concurrent replay, a hard database crash, interrupted judge-job recovery, pending detection markers and backup/restore. It never reads operator database configuration. See [durability scope](durability.md); hosted Supabase auth still needs the separate setup check below.
- [ ] Require the **Native integrations** workflow for the exact release commit. Review the pinned [native version matrix](integrations.md), fixture-provider scope and experimental MetaGPT override.
- [ ] If distributing a Laya model, publish exact datasets, training manifest, strict evaluation, model card, upstream license and checksums. A synthetic test result does not establish independent security efficacy.
- [ ] Install `build` (`python -m pip install build`) and run `bash scripts/release/check-sdk-distribution.sh`. This builds wheel and source distributions in a temporary copy, installs the wheel into a clean environment, checks imports/CLI/assets, and removes temporary artifacts.
- [ ] Install Gitleaks and run `python scripts/release/check-secrets.py` from a full clone. Review file/commit metadata for history and tracked working files; revoke or rotate any genuine credentials before public visibility. The scanner suppresses matched values.
- [ ] Verify managed Supabase setup from a clean checkout: migrations, core rules, sign-up, API-key creation, demo, and attack evaluation.
- [ ] Verify local Supabase setup from a clean checkout: `npm run setup` (or manual `npx supabase start` and `npx supabase db reset`), sign-up, API-key creation, demo, and attack evaluation.
- [ ] Review database migrations for RLS, role grants, functions, views, and service-role use.
- [ ] On existing installations, audit parent/tenant mismatches before validating the new composite foreign keys. They are initially `NOT VALID` to preserve historical rows while enforcing all new inserts and updates. A fresh-database gate does not prove an existing database is free of inconsistent rows.
- [ ] Confirm documentation contains no genuine credentials and distinguishes asynchronous observation/detection from the explicit in-process guardrail that can block protected operations.
- [ ] Run the GitHub **Release validation** workflow against the exact release commit and require every gate to pass. Local checks do not establish remote CI success.
- [ ] After deliberate public/package publication, verify an anonymous clone and `pip install mimori-sdk==1.1.0` in a fresh environment; local artifact checks do not establish PyPI availability.
- [ ] Record migration, SDK compatibility, and rule-pack changes in `CHANGELOG.md`, tag the release, and publish the release notes.

The secret gate checks tracked files plus all nonignored candidate files, including notebooks and training data. Reviewed synthetic samples are allowed only by exact file and matched-content SHA256; test directories are not excluded. Unknown matches fail the check.

The npm audit exception is recorded in `scripts/release/npm-audit-allowlist.json` and reviewed by `scripts/release/check-npm-audit.py`. At review time, the advisory has no patched `braces` release; it is reachable through the Tailwind 3 development dependency tree. The production audit remains clean. The exception expires on 2026-10-10 and must be reassessed sooner if upstream publishes a fix.

A clean scanner result is not security certification or proof that every kind of private data has been detected.

For an existing database, run these read-only mismatch counts through its SQL editor. Resolve any nonzero counts deliberately, then validate the constraints. The release checks never modify an operator's database.

```sql
SELECT 'sessions' AS relation, count(*) AS mismatches FROM public.sessions s
JOIN public.agents a ON a.id=s.agent_id WHERE s.org_id IS DISTINCT FROM a.org_id
UNION ALL
SELECT 'events', count(*) FROM public.events e
JOIN public.sessions s ON s.id=e.session_id WHERE e.org_id IS DISTINCT FROM s.org_id
UNION ALL
SELECT 'detections', count(*) FROM public.detections d
JOIN public.events e ON e.id=d.event_id WHERE d.org_id IS DISTINCT FROM e.org_id
UNION ALL
SELECT 'judge_jobs', count(*) FROM public.llm_judge_jobs j
JOIN public.events e ON e.id=j.event_id WHERE j.org_id IS DISTINCT FROM e.org_id
UNION ALL
SELECT 'rate_counters', count(*) FROM public.rate_limit_counters c
LEFT JOIN public.api_keys k ON k.id=c.api_key_id WHERE k.id IS NULL;
```

After the counts are zero, validate with:

```sql
ALTER TABLE public.sessions VALIDATE CONSTRAINT sessions_agent_org_fk;
ALTER TABLE public.events VALIDATE CONSTRAINT events_session_org_fk;
ALTER TABLE public.detections VALIDATE CONSTRAINT detections_event_org_fk;
ALTER TABLE public.llm_judge_jobs VALIDATE CONSTRAINT judge_jobs_event_org_fk;
ALTER TABLE public.rate_limit_counters VALIDATE CONSTRAINT rate_limit_api_key_fk;
```
