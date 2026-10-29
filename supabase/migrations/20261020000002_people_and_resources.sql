-- =====================================================================
-- PilatesFlow — 0002 Pessoas e recursos
-- Alunos/pacientes, contatos de emergência, equipe, horários, salas,
-- equipamentos, fornecedores, modalidades, feriados e bloqueios.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fornecedores
-- ---------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text not null check (length(trim(legal_name)) >= 2),
  trade_name text,
  cnpj text,
  contact_name text,
  phone text,
  whatsapp text,
  email text,
  address text,
  products_services text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_suppliers_org on public.suppliers(organization_id) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Equipe / profissionais
-- ---------------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,         -- unidade principal
  user_id uuid references auth.users(id) on delete set null,           -- login (opcional)
  photo_path text,
  full_name text not null check (length(trim(full_name)) >= 2),
  cpf text,
  birth_date date,
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb,
  profession text,
  kind text not null default 'instructor' check (kind in
    ('physiotherapist','pe_professional','instructor','receptionist','admin','finance','other')),
  professional_registry text,          -- CREFITO, CREF...
  specialties text[] not null default '{}',
  bio text,                             -- exibida no site (equipe)
  show_on_website boolean not null default false,
  hired_at date,
  status text not null default 'active' check (status in ('active','inactive','on_leave')),
  color text not null default '#3F6F5E',
  is_bookable boolean not null default true,       -- aparece na agenda
  allow_online_booking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_staff_org on public.staff(organization_id) where deleted_at is null;
create unique index uq_staff_user on public.staff(organization_id, user_id) where user_id is not null and deleted_at is null;

create table public.staff_units (
  staff_id uuid not null references public.staff(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  primary key (staff_id, unit_id)
);

-- Jornada semanal
create table public.staff_working_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),  -- 0 = domingo
  start_time time not null,
  end_time time not null,
  break_start time,
  break_end time,
  check (end_time > start_time),
  check ((break_start is null and break_end is null) or (break_start is not null and break_end is not null and break_end > break_start))
);
create index idx_swh_staff on public.staff_working_hours(staff_id, weekday);

-- Férias, folgas, bloqueios do profissional
create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  kind text not null default 'block' check (kind in ('vacation','day_off','block','sick_leave','other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (ends_at > starts_at)
);
create index idx_sto_staff_period on public.staff_time_off(staff_id, starts_at, ends_at);

-- ---------------------------------------------------------------------
-- Alunos / pacientes
-- ---------------------------------------------------------------------
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,          -- acesso ao portal
  photo_path text,
  full_name text not null check (length(trim(full_name)) >= 2),
  social_name text,
  birth_date date,
  cpf text,
  rg text,
  gender text check (gender in ('female','male','other','not_informed')),
  profession text,
  phone text,
  whatsapp text,
  email text,
  address_street text,
  address_number text,
  address_complement text,
  address_district text,
  address_city text,
  address_state text,
  address_zip text,
  origin text check (origin in ('instagram','google','referral','whatsapp','website','walk_in','event','other')),
  referred_by_patient_id uuid references public.patients(id) on delete set null,
  referred_by_name text,
  registered_by uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('lead','trial','active','paused','inactive','cancelled')),
  status_changed_at timestamptz not null default now(),
  notes text,                                -- observações administrativas (não clínicas)
  checkin_pin text,                          -- PIN de 4–6 dígitos para check-in
  checkin_token uuid not null default gen_random_uuid(),   -- conteúdo do QR Code
  replacement_balance int not null default 0,              -- cache do saldo de reposições
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_patients_org_status on public.patients(organization_id, status) where deleted_at is null;
create index idx_patients_unit on public.patients(unit_id);
create index idx_patients_birth_md on public.patients(organization_id, extract(month from birth_date), extract(day from birth_date));
create index idx_patients_search on public.patients using gin (
  to_tsvector('simple', public.f_unaccent(coalesce(full_name,'') || ' ' || coalesce(social_name,'') || ' ' || coalesce(email,'')))
);
create index idx_patients_phone on public.patients(organization_id, (private.only_digits(phone)));
create unique index uq_patients_cpf on public.patients(organization_id, (private.only_digits(cpf)))
  where cpf is not null and cpf <> '' and deleted_at is null;
create unique index uq_patients_user on public.patients(organization_id, user_id) where user_id is not null;
create unique index uq_patients_checkin_token on public.patients(checkin_token);

create or replace function private.patients_status_changed() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;
create trigger trg_patients_status before update on public.patients
  for each row execute function private.patients_status_changed();

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null,
  relationship text,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_emergency_patient on public.emergency_contacts(patient_id);

-- ---------------------------------------------------------------------
-- Salas e equipamentos
-- ---------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  name text not null,
  capacity int not null default 1 check (capacity between 1 and 200),
  description text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_rooms_unit on public.rooms(unit_id) where deleted_at is null;

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  name text not null,
  type text not null default 'reformer' check (type in
    ('reformer','cadillac','chair','ladder_barrel','spine_corrector','tower','mat','accessory','other')),
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  purchase_value numeric(12,2) check (purchase_value is null or purchase_value >= 0),
  status text not null default 'available' check (status in ('available','in_use','maintenance','inactive')),
  maintenance_interval_days int check (maintenance_interval_days is null or maintenance_interval_days > 0),
  next_maintenance_date date,
  photo_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_equipment_unit on public.equipment(unit_id) where deleted_at is null;
create index idx_equipment_next_maint on public.equipment(organization_id, next_maintenance_date) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Modalidades / serviços
-- ---------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'pilates_apparatus' check (kind in (
    'pilates_apparatus','pilates_mat','pilates_individual','pilates_duo','pilates_group',
    'assessment','reassessment','physiotherapy','trial','other')),
  description text,
  default_duration_min int not null default 50 check (default_duration_min between 5 and 480),
  default_capacity int not null default 1 check (default_capacity between 1 and 200),
  color text not null default '#3F6F5E',
  price numeric(12,2) check (price is null or price >= 0),   -- valor de sessão avulsa
  consumes_plan_credit boolean not null default true,
  allow_online_booking boolean not null default false,
  show_on_website boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_services_org on public.services(organization_id) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Feriados e bloqueios de agenda
-- ---------------------------------------------------------------------
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,     -- null = todas as unidades
  date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, unit_id, date)
);
create index idx_holidays_org_date on public.holidays(organization_id, date);

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (ends_at > starts_at)
);
create index idx_blocks_period on public.schedule_blocks(organization_id, starts_at, ends_at);

-- updated_at / created_by / auditoria
do $$
declare t text;
begin
  foreach t in array array['suppliers','staff','patients','emergency_contacts','rooms','equipment','services'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function private.set_updated_at()', t);
  end loop;
  foreach t in array array['suppliers','staff','patients','rooms','equipment','services','staff_time_off','schedule_blocks'] loop
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
  end loop;
  foreach t in array array['suppliers','staff','patients','emergency_contacts','rooms','equipment','services',
                           'staff_working_hours','staff_time_off','holidays','schedule_blocks'] loop
    perform private.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;
