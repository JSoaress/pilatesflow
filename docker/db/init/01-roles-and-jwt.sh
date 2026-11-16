#!/bin/sh
# Serviço db-init: garante o contrato Supabase no banco antes de GoTrue,
# PostgREST e Storage subirem. Idempotente — pode rodar a cada `up`.
#   - roles (anon, authenticated, service_role, authenticator, admins de auth/storage)
#   - senhas dos roles internos = POSTGRES_PASSWORD
#   - schemas extensions/auth/storage e funções auth.uid()/role()/jwt()
#   - JWT_SECRET no banco (app.settings.*)
set -eu
. /docker/lib.sh

: "${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD}"
: "${JWT_SECRET:?defina JWT_SECRET}"
JWT_EXPIRY="${JWT_EXPIRY:-3600}"

wait_for_db
pick_admin

# A imagem do Supabase termina de criar os roles no primeiro boot; dá um tempo
# para o `authenticator` aparecer. Se não aparecer (Postgres comum), criamos abaixo.
i=0
while [ "$i" -lt 15 ] && [ "$(psql -X -At -c "select count(*) from pg_roles where rolname = 'authenticator'")" = "0" ]; do
  i=$((i + 1)); sleep 2
done

psql -X -v ON_ERROR_STOP=1 -v pgpass="$POSTGRES_PASSWORD" -v jwt_secret="$JWT_SECRET" -v jwt_exp="$JWT_EXPIRY" <<'SQL'
-- 1. Roles ---------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon          nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role  nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin')    then create role supabase_auth_admin    noinherit createrole login; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin noinherit createrole login; end if;
end $$;

-- Garante que os roles de serviço podem logar
alter role authenticator           login;
alter role supabase_auth_admin     login;
alter role supabase_storage_admin  login;

grant anon, authenticated, service_role to authenticator;

-- 2. Senhas (só roles que existem; pgbouncer/dashboard_user são opcionais) -----
select format('alter role %I with password %L', rolname, :'pgpass')
  from pg_roles
 where rolname in ('authenticator', 'supabase_auth_admin', 'supabase_storage_admin',
                   'supabase_admin', 'pgbouncer', 'dashboard_user', 'postgres')
\gexec

-- 3. Permissões no banco e schemas --------------------------------------
select format('grant create on database %I to supabase_auth_admin, supabase_storage_admin', current_database())
\gexec

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin, supabase_storage_admin;

create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;

create schema if not exists storage authorization supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

-- 4. Funções da plataforma Supabase (não são do GoTrue) ------------------
do $do$ begin
  if to_regprocedure('auth.uid()') is null then
    execute $f$
      create function auth.uid() returns uuid language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$
    $f$;
  end if;
  if to_regprocedure('auth.role()') is null then
    execute $f$
      create function auth.role() returns text language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$
    $f$;
  end if;
  if to_regprocedure('auth.jwt()') is null then
    execute $f$
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                        nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$
    $f$;
  end if;
end $do$;
-- Dono = admin do GoTrue, para que as migrations dele possam `create or replace`.
alter function auth.uid()  owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.jwt()  owner to supabase_auth_admin;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- 5. JWT no banco -------------------------------------------------------
select format('alter database %I set "app.settings.jwt_secret" to %L', current_database(), :'jwt_secret')
\gexec
select format('alter database %I set "app.settings.jwt_exp" to %L', current_database(), :'jwt_exp')
\gexec
SQL

# 6. Testa o login de cada serviço (falha cedo, com mensagem clara)
for r in supabase_auth_admin authenticator supabase_storage_admin; do
  if PGUSER="$r" PGPASSWORD="$POSTGRES_PASSWORD" psql -X -At -c 'select 1' >/dev/null 2>&1; then
    echo "✔ login de $r ok"
  else
    echo "✘ $r não conseguiu logar com POSTGRES_PASSWORD (verifique pg_hba/senha)" >&2
    exit 1
  fi
done
echo "db-init concluído."
