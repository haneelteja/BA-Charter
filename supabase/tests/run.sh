#!/usr/bin/env bash
# Applies every migration to a fresh database on a plain Postgres 16 with
# pgvector, then runs the role/exploit tests.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres supabase/tests/run.sh
#
# Needs a superuser (it creates roles). Uses the standard libpq PG* env vars.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="${TEST_DB:-ba_charter_test}"
psql_admin=(psql -v ON_ERROR_STOP=1 -q -d postgres)
psql_db=(psql -v ON_ERROR_STOP=1 -q -d "$db")

"${psql_admin[@]}" -c "drop database if exists $db" >/dev/null
"${psql_admin[@]}" -c "create database $db" >/dev/null

"${psql_db[@]}" -f "$here/supabase_shim.sql" >/dev/null
for f in "$here"/../migrations/*.sql; do
  "${psql_db[@]}" -f "$f" >/dev/null 2>"$here/.last-migration.err" || {
    echo "Migration failed: $f"; cat "$here/.last-migration.err"; exit 1;
  }
done
rm -f "$here/.last-migration.err"
echo "Applied $(ls "$here"/../migrations/*.sql | wc -l) migrations."

out="$(psql -d "$db" -f "$here/security.test.sql" 2>&1 | grep -E '^(PASS|FAIL|INFO)' || true)"
echo "$out"
pass=$(grep -c '^PASS' <<<"$out" || true)
fail=$(grep -c '^FAIL' <<<"$out" || true)
echo "$pass passed, $fail failed."
[ "$fail" -eq 0 ] && [ "$pass" -gt 0 ]
