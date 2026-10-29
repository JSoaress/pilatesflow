#!/usr/bin/env bash
# Recria um banco de teste local e aplica stub Supabase + migrations + testes.
set -euo pipefail
PSQL="psql -h ${PGHOST:-/var/pgtest} -p ${PGPORT:-54329} -U postgres -v ON_ERROR_STOP=1 -q"
DB=pilatesflow_test
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d $DB -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "→ $f"; $PSQL -d $DB -f "$f" >/dev/null; done
for f in supabase/tests/[1-9]*.sql; do [ -e "$f" ] || continue; echo "→ teste $f"; $PSQL -d $DB -f "$f"; done
echo "OK"
