#!/bin/sh
# Funções comuns aos scripts de banco. Uso: . /docker/lib.sh

: "${PGHOST:=db}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=postgres}"
export PGHOST PGPORT PGDATABASE

# Espera o Postgres aceitar conexões TCP.
wait_for_db() {
  i=0
  until pg_isready -q -h "$PGHOST" -p "$PGPORT"; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && { echo "Postgres não respondeu em 120s" >&2; return 1; }
    sleep 2
  done
}

# Escolhe um usuário superuser que consiga conectar com POSTGRES_PASSWORD.
# A imagem do Supabase usa `supabase_admin`; um Postgres comum usa `postgres`.
# Exporta PGUSER e PGPASSWORD.
pick_admin() {
  export PGPASSWORD="$POSTGRES_PASSWORD"
  for u in supabase_admin postgres; do
    if [ "$(psql -X -At -U "$u" -c 'select rolsuper from pg_roles where rolname = current_user' 2>/dev/null)" = "t" ]; then
      export PGUSER="$u"
      echo "→ usando o usuário administrativo: $u"
      return 0
    fi
  done
  echo "Nenhum superuser (supabase_admin/postgres) conectou com POSTGRES_PASSWORD." >&2
  return 1
}
