# Contributing to MIMORI

Hey, thanks for wanting to help out! Here's how to get going.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

1. Fork the repo and clone it locally.
2. Run `npm ci`. If you're working on the SDK, also do `pip install -e './sdk[dev]'`.
3. Follow [docs/local-development.md](docs/local-development.md) to set up either a managed or local Supabase project. Don't commit `.env.local`, API keys, or real telemetry — ever.
4. Create a branch: `git checkout -b feature/your-feature-name`

## Code style

The optional pre-commit hook runs the same full-checkout secret review used by release checks. Install Python 3 and Gitleaks, then enable it with `git config core.hooksPath .githooks`. Reviewed synthetic fixtures are handled by the release scanner; never bypass it to commit genuine credentials.

- For dashboard changes: run `npm run lint`, `npm run typecheck`, and `npm test` before pushing.
- For SDK changes: run `python -m pytest sdk/tests`. Format Python with `black`.

## Pull requests

- Keep PRs focused on one thing. Explain what it does, what you tested, and flag any security or migration impact.
- Make sure `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass.
- Open your PR against `main` using the provided template.

## How to Add a Detection Rule

The deterministic rule engine uses regex and keyword matching. It is designed to be easy to extend for new vulnerabilities or policy violations.

### 1. Define the Rule in the Seed SQL
Open `supabase/seed/001_rules.sql`. Add your rule to the `rule_pack` values. For a standalone local SQL example, use the statement below after the local organization seed has run. Be sure to provide a unique `id`, a descriptive `name`, the `pattern`, and a `severity`.

Example:
```sql
INSERT INTO public.rules (id, org_id, name, category, severity, pattern_type, pattern)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001', -- local sandbox org; use your org ID otherwise
    'Reject unauthorized admin commands',
    'excessive_agency',
    'high',
    'regex',
    '(?i)\b(sudo\s+|rm\s+-rf\s+)'
) ON CONFLICT (org_id, name) DO NOTHING;
```

### 2. Add Rule Tests
Open `app/lib/detection/rules.test.ts` (if available) or create a new test file. Write positive and negative test cases to ensure your pattern behaves as expected against real payload strings without false positives.

### 3. Verify Locally
Run the test suite to verify your rule logic:
```bash
npm run test
```

You can also run the local demo script to see it match live telemetry in your dashboard:
```bash
# Set your local test key and run the script
export MIMORI_DEV_API_KEY="mmr_dev_..."
npm run demo
```

Thanks for contributing!
