-- =====================================================================
-- PilatesFlow — 0001 Fundação
-- Organizações, unidades, perfis, papéis (RBAC), permissões, membros,
-- configurações, auditoria e funções auxiliares de segurança.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Schema privado: funções internas NÃO expostas pela API (PostgREST expõe só "public").
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Utilitários genéricos
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.set_created_by() returns trigger
language plpgsql as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

-- Busca sem acento (usada em índices de busca global)
create or replace function public.f_unaccent(text) returns text
language sql immutable parallel safe strict as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

create or replace function private.only_digits(text) returns text
language sql immutable as $$ select regexp_replace(coalesce($1, ''), '\D', '', 'g') $$;

-- ---------------------------------------------------------------------
-- Organizações (empresa / clínica)
-- ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 2 and 120),
  legal_name text,
  cnpj text,
  email text,
  phone text,
  whatsapp text,
  website text,
  instagram text,
  logo_path text,
  address jsonb not null default '{}'::jsonb,
  currency text not null default 'BRL',
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  app_name text not null default 'PilatesFlow',
  primary_color text not null default '#3F6F5E',
  onboarding_step int not null default 1,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create trigger trg_organizations_updated before update on public.organizations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Unidades
-- ---------------------------------------------------------------------
create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  cnpj text,
  phone text,
  whatsapp text,
  email text,
  address_street text,
  address_number text,
  address_complement text,
  address_district text,
  address_city text,
  address_state text check (address_state is null or length(address_state) = 2),
  address_zip text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  manager_name text,
  -- {"0":[], "1":[{"start":"06:00","end":"21:00"}], ...}  (0 = domingo)
  business_hours jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_units_org on public.units(organization_id) where deleted_at is null;
create trigger trg_units_updated before update on public.units
  for each row execute function private.set_updated_at();
create trigger trg_units_created_by before insert on public.units
  for each row execute function private.set_created_by();

-- ---------------------------------------------------------------------
-- Perfis de usuário (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_path text,
  last_organization_id uuid references public.organizations(id) on delete set null,
  last_unit_id uuid references public.units(id) on delete set null,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function private.set_updated_at();

-- Cria perfil automaticamente ao criar usuário no Auth
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Catálogo de permissões (global)
-- ---------------------------------------------------------------------
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  action text not null,
  module_label text not null,
  action_label text not null,
  is_sensitive boolean not null default false,
  sort_order int not null default 0
);

insert into public.permissions (key, module, action, module_label, action_label, is_sensitive, sort_order)
select m.module || '.' || a.action, m.module, a.action, m.label, a.label,
       m.sensitive or a.action in ('delete','export'), m.sort * 100 + a.sort
from (values
  ('dashboard','Dashboard',false,1,'{view}'),
  ('schedule','Agenda',false,2,'{view,create,edit,delete,export,override}'),
  ('patients','Alunos / Pacientes',false,3,'{view,create,edit,delete,export}'),
  ('medical_records','Prontuário e evoluções',true,4,'{view,create,edit,export}'),
  ('assessments','Avaliações e anamneses',true,5,'{view,create,edit,delete,export}'),
  ('exercises','Exercícios e programas',false,6,'{view,create,edit,delete}'),
  ('plans','Planos e assinaturas',false,7,'{view,create,edit,delete}'),
  ('contracts','Contratos',false,8,'{view,create,edit,delete,export}'),
  ('finance','Financeiro',true,9,'{view,create,edit,delete,export,refund}'),
  ('crm','CRM e leads',false,10,'{view,create,edit,delete,export}'),
  ('communication','Comunicação',false,11,'{view,create}'),
  ('staff','Equipe',false,12,'{view,create,edit,delete}'),
  ('commissions','Comissões',true,13,'{view,create,edit,export}'),
  ('inventory','Estoque e fornecedores',false,14,'{view,create,edit,delete,export}'),
  ('equipment','Equipamentos e manutenção',false,15,'{view,create,edit,delete}'),
  ('reports','Relatórios',false,16,'{view,export}'),
  ('documents','Documentos',true,17,'{view,create,edit,delete}'),
  ('tasks','Tarefas',false,18,'{view,create,edit,delete}'),
  ('website','Site público',false,19,'{view,edit}'),
  ('settings','Configurações',false,20,'{view,edit}'),
  ('users','Usuários e perfis',true,21,'{view,manage}'),
  ('audit','Auditoria',true,22,'{view}'),
  ('lgpd','LGPD / Titulares',true,23,'{view,manage}'),
  ('portal','Portal do aluno',false,24,'{access}')
) as m(module, label, sensitive, sort, actions)
cross join lateral unnest(m.actions::text[]) as act(action)
join (values
  ('view','Visualizar',1),('create','Criar',2),('edit','Editar',3),('delete','Excluir',4),
  ('export','Exportar',5),('refund','Estornar pagamentos',6),('manage','Gerenciar',7),('access','Acessar',8),
  ('override','Autorizar exceções (fora do horário, feriado)',9)
) as a(action, label, sort) on a.action = act.action;

-- ---------------------------------------------------------------------
-- Papéis (perfis de acesso) por organização
-- ---------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);
create trigger trg_roles_updated before update on public.roles
  for each row execute function private.set_updated_at();

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- ---------------------------------------------------------------------
-- Membros (vínculo usuário ↔ organização) e acesso por unidade
-- ---------------------------------------------------------------------
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  status text not null default 'active' check (status in ('active','invited','suspended')),
  all_units boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, user_id),
  -- vínculo com o perfil (permite consultar nome/e-mail dos membros via API)
  constraint fk_members_profile foreign key (user_id) references public.profiles(id) on delete cascade
);
create index idx_members_user on public.organization_members(user_id);
create trigger trg_members_updated before update on public.organization_members
  for each row execute function private.set_updated_at();

create table public.member_units (
  member_id uuid not null references public.organization_members(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  primary key (member_id, unit_id)
);

-- ---------------------------------------------------------------------
-- Funções de segurança (usadas pelo RLS e pelas RPCs)
-- ---------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function public.is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m join roles r on r.id = m.role_id
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active' and r.key = 'owner'
  )
$$;

-- Verdadeiro se o usuário logado possui a permissão na organização.
-- O proprietário (role key = 'owner') possui todas as permissões.
create or replace function public.has_permission(p_org uuid, p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from organization_members m
    join roles r on r.id = m.role_id
    left join role_permissions rp on rp.role_id = m.role_id and rp.permission_key = p_permission
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (r.key = 'owner' or rp.permission_key is not null)
  )
$$;

-- Verdadeiro se o usuário pode ver dados da unidade (null = registro da organização inteira)
create or replace function public.has_unit_access(p_org uuid, p_unit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_unit is null or exists (
    select 1 from organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      and (m.all_units or exists (select 1 from member_units mu where mu.member_id = m.id and mu.unit_id = p_unit))
  )
$$;

-- Lança erro amigável quando não há permissão (usado nas RPCs)
create or replace function private.require_permission(p_org uuid, p_permission text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Faça login novamente.' using errcode = '28000';
  end if;
  if not public.has_permission(p_org, p_permission) then
    raise exception 'Você não tem permissão para esta ação (%).', p_permission using errcode = '42501';
  end if;
end $$;

-- Permissões efetivas do usuário logado (para montar o menu no frontend)
create or replace function public.my_permissions(p_org uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select p.key from permissions p
  where public.has_permission(p_org, p.key)
$$;

-- ---------------------------------------------------------------------
-- Configurações chave/valor por organização
-- ---------------------------------------------------------------------
create table public.system_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, key)
);

-- Lê uma configuração com valor padrão
create or replace function private.setting(p_org uuid, p_key text, p_default jsonb default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from system_settings where organization_id = p_org and key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------
-- Auditoria (somente inserção; ninguém altera ou apaga)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  unit_id uuid,
  user_id uuid,
  user_email text,
  action text not null,               -- insert | update | delete | soft_delete | login | export | download | refund | finalize | ...
  entity text not null,               -- nome da tabela/entidade
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  ip text,
  user_agent text,
  context jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_org_created on public.audit_logs(organization_id, created_at desc);
create index idx_audit_entity on public.audit_logs(entity, entity_id);

create or replace function private.block_audit_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'Registros de auditoria não podem ser alterados ou excluídos.' using errcode = '42501';
end $$;
create trigger trg_audit_immutable before update or delete on public.audit_logs
  for each row execute function private.block_audit_changes();

create or replace function private.request_ip() returns text
language sql stable as $$
  select nullif(split_part(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'),
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip'), ''), ',', 1), '')
$$;

create or replace function private.request_user_agent() returns text
language sql stable as $$
  select left(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', 300)
$$;

-- Registro manual de evento de auditoria (exportações, downloads, login...)
create or replace function public.log_audit_event(
  p_org uuid, p_action text, p_entity text, p_entity_id text default null, p_context jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_org_member(p_org) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  insert into audit_logs (organization_id, user_id, user_email, action, entity, entity_id, context, ip, user_agent)
  values (p_org, auth.uid(), (select email from profiles where id = auth.uid()), left(p_action, 40),
          left(p_entity, 60), left(p_entity_id, 80), p_context, private.request_ip(), private.request_user_agent());
end $$;

-- Gatilho genérico de auditoria: registra valor anterior e novo
create or replace function private.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_action text := lower(tg_op);
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k) into v_changed
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k);
    if v_changed is null then
      return new; -- nada mudou
    end if;
    if (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
      v_action := 'soft_delete';
    end if;
  end if;

  insert into audit_logs (organization_id, unit_id, user_id, user_email, action, entity, entity_id,
                          old_data, new_data, changed_fields, ip, user_agent)
  values (
    case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid else (v_row ->> 'organization_id')::uuid end,
    case when v_row ? 'unit_id' then nullif(v_row ->> 'unit_id', '')::uuid end,
    auth.uid(),
    (select email from profiles where id = auth.uid()),
    v_action, tg_table_name, v_row ->> 'id',
    v_old, v_new, v_changed, private.request_ip(), private.request_user_agent()
  );
  return coalesce(new, old);
end $$;

-- Habilita auditoria em uma tabela
create or replace function private.enable_audit(p_table regclass) returns void
language plpgsql as $$
begin
  if exists (select 1 from pg_trigger where tgrelid = p_table and tgname = 'trg_audit') then
    execute format('drop trigger trg_audit on %s', p_table);
  end if;
  execute format('create trigger trg_audit after insert or update or delete on %s for each row execute function private.audit_trigger()', p_table);
end $$;

select private.enable_audit('public.organizations');
select private.enable_audit('public.units');
select private.enable_audit('public.roles');
select private.enable_audit('public.organization_members');
select private.enable_audit('public.system_settings');

-- Auditoria de mudanças de permissões (role_permissions não tem organization_id)
create or replace function private.audit_role_permissions() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role roles%rowtype;
begin
  select * into v_role from roles where id = coalesce(new.role_id, old.role_id);
  insert into audit_logs (organization_id, user_id, user_email, action, entity, entity_id, old_data, new_data, ip, user_agent)
  values (v_role.organization_id, auth.uid(), (select email from profiles where id = auth.uid()),
          case when tg_op = 'INSERT' then 'grant_permission' else 'revoke_permission' end,
          'role_permissions', v_role.id::text,
          case when tg_op = 'DELETE' then jsonb_build_object('role', v_role.name, 'permission', old.permission_key) end,
          case when tg_op = 'INSERT' then jsonb_build_object('role', v_role.name, 'permission', new.permission_key) end,
          private.request_ip(), private.request_user_agent());
  return coalesce(new, old);
end $$;
create trigger trg_audit_role_permissions after insert or delete on public.role_permissions
  for each row execute function private.audit_role_permissions();
