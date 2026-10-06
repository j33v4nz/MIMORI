#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Never connect to an operator's configured database. This disposable container
# has no published ports or network and is removed even when a migration fails.
container="mimori-release-db-${RANDOM}-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --detach --name "$container" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16 >/dev/null
for attempt in {1..60}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null
sql() { docker exec -i "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -q; }
sql < scripts/release/database-fixture.sql
for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  sql < "$migration"
done
sql <<'SQL'
INSERT INTO organizations(id,name) VALUES('10000000-0000-0000-0000-000000000099','Seed rerun fixture');
DO $$ BEGIN
 IF (SELECT count(*) FROM rules WHERE org_id='10000000-0000-0000-0000-000000000099') <> 12 THEN
   RAISE EXCEPTION 'New organization requires manual seed';
 END IF;
END $$;
UPDATE rules SET enabled=false WHERE id=(SELECT id FROM rules WHERE org_id='10000000-0000-0000-0000-000000000099' ORDER BY name LIMIT 1);
SQL
sql < supabase/seed/001_rules.sql
# Prove seed reruns are safe, as documented for existing installations.
sql < supabase/seed/001_rules.sql
sql <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM rules WHERE org_id='10000000-0000-0000-0000-000000000099') <> 12
 OR (SELECT count(*) FROM rules WHERE org_id='10000000-0000-0000-0000-000000000099' AND NOT enabled) <> 1 THEN
   RAISE EXCEPTION 'Repeated seeds duplicated rules or reset operator toggles';
 END IF;
END $$;
SQL
sql < scripts/release/database-assertions.sql
python3 scripts/release/check-durability.py "$container"
echo "Migrations, repeatable core seed, and tenant/worker isolation checks passed."
