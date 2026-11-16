#!/bin/sh
# Aplica supabase/migrations/*.sql em ordem, uma vez cada.
# Registra em supabase_migrations.schema_migrations (mesma tabela do Supabase CLI),
# então reexecutar é seguro e os dois caminhos (Docker e CLI) são compatíveis.
set -eu
. /docker/lib.sh

: "${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

wait_for_db
pick_admin

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

applied=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$f" ] || { echo "Nenhuma migration em $MIGRATIONS_DIR" >&2; exit 1; }
  base=$(basename "$f" .sql)
  version=${base%%_*}
  name=${base#*_}
  done_already=$(psql -X -At -c "select 1 from supabase_migrations.schema_migrations where version = '$version'")
  if [ "$done_already" = "1" ]; then
    echo "· $base (já aplicada)"
    continue
  fi
  echo "→ $base"
  psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$f" -c \
    "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name')"
  applied=$((applied + 1))
done

# Faz o PostgREST enxergar o schema novo sem reiniciar.
psql -X -q -c "notify pgrst, 'reload schema'" || true
echo "migrate concluído: $applied nova(s) migration(s)."
