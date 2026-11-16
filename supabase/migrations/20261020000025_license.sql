-- =====================================================================
-- Licença de uso: 7 dias de teste por clínica + painel da plataforma
-- ---------------------------------------------------------------------
-- * Toda clínica nova nasce em teste por 7 dias.
-- * Vencido o prazo (ou suspensa), has_permission() passa a negar tudo:
--   o bloqueio vale no banco (RLS), não só na tela.
-- * Só administradores da plataforma (tabela platform_admins) liberam,
--   estendem ou suspendem — pelo painel /plataforma.
-- * O portal do aluno continua acessível (direito do titular — LGPD).
-- =====================================================================

alter table public.organizations
  add column if not exists license_status text not null default 'trial',
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '7 days'),
  add column if not exists license_expires_at timestamptz,
  add column if not exists license_note text;

alter table public.organizations drop constraint if exists organizations_license_status_check;
alter table public.organizations add constraint organizations_license_status_check
  check (license_status in ('trial', 'active', 'suspended'));

-- Clínicas que já existiam ganham 7 dias a partir de agora.
update public.organizations set license_status = 'trial', trial_ends_at = now() + interval '7 days'
 where license_status = 'trial' and trial_ends_at < now() + interval '7 days';

-- Administradores da plataforma (dono do sistema). Sem acesso direto pela API.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- Histórico de toda mudança de licença
create table if not exists public.license_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null,
  days int,
  note text,
  old_status text, new_status text,
  old_until timestamptz, new_until timestamptz,
  actor uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_license_events_org on public.license_events(organization_id, created_at desc);
alter table public.license_events enable row level security;
revoke all on public.license_events from anon, authenticated;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- A licença da clínica está válida agora?
create or replace function private.license_ok(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case o.license_status
             when 'active' then o.license_expires_at is null or o.license_expires_at > now()
             when 'trial'  then o.trial_ends_at > now()
             else false end
      from organizations o where o.id = p_org), false)
$$;

-- Situação da licença para a interface
create or replace function private.license_info(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', o.license_status,
    'ok', private.license_ok(o.id),
    'until', case o.license_status when 'trial' then o.trial_ends_at when 'active' then o.license_expires_at end,
    'trial_ends_at', o.trial_ends_at,
    'expires_at', o.license_expires_at)
  from organizations o where o.id = p_org
$$;

-- Permissões passam a depender da licença válida.
create or replace function public.has_permission(p_org uuid, p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select private.license_ok(p_org) and exists (
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

-- Contexto da sessão: inclui licença e se é administrador da plataforma.
create or replace function public.app_bootstrap(p_org uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_orgs jsonb; v_org uuid; v_prof profiles%rowtype;
begin
  if v_uid is null then return null; end if;
  v_orgs := public.my_organizations();
  select * into v_prof from profiles where id = v_uid;
  if jsonb_array_length(coalesce(v_orgs, '[]')) = 0 then
    return jsonb_build_object('orgs', '[]'::jsonb, 'profile', to_jsonb(v_prof) - 'mfa_enabled',
      'is_patient', exists (select 1 from patients where user_id = v_uid and deleted_at is null),
      'is_platform_admin', public.is_platform_admin());
  end if;
  select (o ->> 'id')::uuid into v_org from jsonb_array_elements(v_orgs) o
   where (o ->> 'id')::uuid = coalesce(p_org, v_prof.last_organization_id) limit 1;
  if v_org is null then v_org := (v_orgs -> 0 ->> 'id')::uuid; end if;
  return jsonb_build_object(
    'orgs', v_orgs,
    'org_id', v_org,
    'profile', jsonb_build_object('full_name', v_prof.full_name, 'avatar_path', v_prof.avatar_path, 'theme', v_prof.theme),
    'permissions', (select coalesce(jsonb_agg(k), '[]') from public.my_permissions(v_org) k),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by created_at), '[]')
                from units where organization_id = v_org and deleted_at is null and is_active and public.has_unit_access(v_org, id)),
    'staff_id', (select id from staff where organization_id = v_org and user_id = v_uid and deleted_at is null limit 1),
    'license', private.license_info(v_org),
    'is_platform_admin', public.is_platform_admin()
  );
end $$;
revoke execute on function public.app_bootstrap(uuid) from anon, public;
grant execute on function public.app_bootstrap(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Painel da plataforma
-- ---------------------------------------------------------------------
create or replace function public.platform_orgs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração da plataforma.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
        'id', o.id, 'name', o.name, 'slug', o.slug, 'email', o.email, 'phone', coalesce(o.whatsapp, o.phone),
        'created_at', o.created_at, 'deleted', o.deleted_at is not null,
        'license', private.license_info(o.id), 'note', o.license_note,
        'owner', (select jsonb_build_object('name', p.full_name, 'email', u.email)
                    from organization_members m join roles r on r.id = m.role_id and r.key = 'owner'
                    join auth.users u on u.id = m.user_id left join profiles p on p.id = m.user_id
                   where m.organization_id = o.id and m.status = 'active' order by m.created_at limit 1),
        'members', (select count(*) from organization_members m where m.organization_id = o.id and m.status = 'active'),
        'patients', (select count(*) from patients pa where pa.organization_id = o.id and pa.deleted_at is null),
        'last_seen', (select max(u.last_sign_in_at) from organization_members m join auth.users u on u.id = m.user_id where m.organization_id = o.id),
        'events', (select coalesce(jsonb_agg(jsonb_build_object('action', e.action, 'days', e.days, 'note', e.note, 'at', e.created_at, 'new_until', e.new_until) order by e.created_at desc), '[]')
                     from (select * from license_events le where le.organization_id = o.id order by le.created_at desc limit 5) e)
      ) x
      from organizations o
    ) s), '[]');
end $$;

-- p_action: 'extend_trial' | 'activate' | 'suspend'
-- p_days: dias a somar (null em 'activate' = sem prazo de validade)
create or replace function public.platform_set_license(p_org uuid, p_action text, p_days int default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o organizations%rowtype; v_status text; v_until timestamptz; v_old_until timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração da plataforma.' using errcode = '42501';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3660) then
    raise exception 'Informe entre 1 e 3660 dias.' using errcode = '22023';
  end if;
  select * into o from organizations where id = p_org for update;
  if not found then raise exception 'Clínica não encontrada.' using errcode = 'P0002'; end if;
  v_old_until := case o.license_status when 'trial' then o.trial_ends_at when 'active' then o.license_expires_at end;

  if p_action = 'extend_trial' then
    v_status := 'trial';
    v_until := greatest(now(), o.trial_ends_at) + make_interval(days => coalesce(p_days, 7));
    update organizations set license_status = 'trial', trial_ends_at = v_until where id = p_org;
  elsif p_action = 'activate' then
    v_status := 'active';
    v_until := case when p_days is null then null
                    else greatest(now(), case when o.license_status = 'active' then coalesce(o.license_expires_at, now()) else now() end) + make_interval(days => p_days) end;
    update organizations set license_status = 'active', license_expires_at = v_until where id = p_org;
  elsif p_action = 'suspend' then
    v_status := 'suspended'; v_until := null;
    update organizations set license_status = 'suspended' where id = p_org;
  else
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;
  if p_note is not null then
    update organizations set license_note = left(nullif(trim(p_note), ''), 500) where id = p_org;
  end if;
  insert into license_events (organization_id, action, days, note, old_status, new_status, old_until, new_until)
  values (p_org, p_action, p_days, left(nullif(trim(p_note), ''), 500), o.license_status, v_status, v_old_until, v_until);
  return private.license_info(p_org);
end $$;

revoke execute on function public.platform_orgs() from anon, public;
revoke execute on function public.platform_set_license(uuid, text, int, text) from anon, public;
revoke execute on function public.is_platform_admin() from anon, public;
grant execute on function public.platform_orgs() to authenticated;
grant execute on function public.platform_set_license(uuid, text, int, text) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
