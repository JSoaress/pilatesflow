-- =====================================================================
-- PilatesFlow — 0004 Agenda
-- Recorrências (horários fixos/turmas), agendamentos, participantes,
-- presença/check-in, lista de espera, créditos de reposição, eventos,
-- notificações internas e regras de conflito.
-- =====================================================================

create or replace function private.org_tz(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from organizations where id = p_org), 'America/Sao_Paulo')
$$;

-- Regras padrão de reposição/cancelamento (sobrescritas por system_settings.key = 'schedule_rules')
create or replace function private.schedule_rules(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'replacements_per_month', 2,          -- usado quando o plano não define quantidade
    'replacement_validity_days', 30,
    'min_cancel_notice_hours', 3,
    'absence_generates_credit', false,
    'absence_consumes_session', true,
    'holiday_generates_credit', true,
    'staff_absence_generates_credit', true,
    'recurrence_horizon_days', 60,
    'waitlist_hold_hours', 2,
    'checkin_window_minutes', 60
  ) || coalesce((select value from system_settings where organization_id = p_org and key = 'schedule_rules'), '{}'::jsonb)
$$;

-- ---------------------------------------------------------------------
-- Notificações internas (sino)
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,               -- overdue_payment, new_appointment, cancellation, replacement_request, contract_expiring,
                                    -- low_stock, maintenance, new_lead, message, waitlist_spot, reassessment_due, task
  title text not null,
  body text,
  link text,
  entity text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on public.notifications(user_id, read_at, created_at desc);
create index idx_notifications_dedupe on public.notifications(user_id, type, entity_id, created_at desc);

-- Envia notificação a todos os membros ativos com determinada permissão
create or replace function private.notify_permission(
  p_org uuid, p_permission text, p_type text, p_title text, p_body text,
  p_link text default null, p_entity text default null, p_entity_id uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into notifications (organization_id, user_id, type, title, body, link, entity, entity_id)
  select distinct p_org, m.user_id, p_type, p_title, p_body, p_link, p_entity, p_entity_id
    from organization_members m
    join roles r on r.id = m.role_id
   where m.organization_id = p_org and m.status = 'active'
     and (r.key = 'owner' or exists (select 1 from role_permissions rp where rp.role_id = m.role_id and rp.permission_key = p_permission))
     -- evita duplicar o mesmo aviso no mesmo dia
     and not exists (select 1 from notifications n where n.user_id = m.user_id and n.type = p_type
                     and n.entity_id is not distinct from p_entity_id and n.created_at > now() - interval '20 hours');
  get diagnostics v = row_count;
  return v;
end $$;

create or replace function private.notify_user(
  p_org uuid, p_user uuid, p_type text, p_title text, p_body text,
  p_link text default null, p_entity text default null, p_entity_id uuid default null
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (organization_id, user_id, type, title, body, link, entity, entity_id)
  select p_org, p_user, p_type, p_title, p_body, p_link, p_entity, p_entity_id where p_user is not null
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids))
$$;

-- ---------------------------------------------------------------------
-- Recorrências: horários fixos semanais (1 linha por dia da semana)
-- ---------------------------------------------------------------------
create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  name text,                                   -- nome da turma (opcional)
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  duration_min int not null check (duration_min between 5 and 480),
  capacity int not null default 1 check (capacity between 1 and 200),
  starts_on date not null,
  ends_on date,
  status text not null default 'active' check (status in ('active','paused','ended')),
  paused_from date,
  paused_until date,
  generated_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_recurrences_org on public.recurrences(organization_id, status);

create table public.recurrence_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recurrence_id uuid not null references public.recurrences(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  starts_on date not null,
  ends_on date,
  status text not null default 'active' check (status in ('active','paused','ended')),
  paused_from date,
  paused_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create unique index uq_recurrence_member_active on public.recurrence_members(recurrence_id, patient_id) where status <> 'ended';
create index idx_recurrence_members_patient on public.recurrence_members(patient_id);

-- ---------------------------------------------------------------------
-- Agendamentos (sessões) e participantes
-- ---------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  recurrence_id uuid references public.recurrences(id) on delete set null,
  occurrence_date date,                      -- data original da ocorrência (recorrências)
  kind text not null,                        -- tipo de atendimento (copiado da modalidade, editável)
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null default 1 check (capacity between 1 and 200),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  is_exception boolean not null default false,  -- ocorrência alterada individualmente
  substitute_for_staff_id uuid references public.staff(id) on delete set null,
  cancel_reason text,
  cancel_reason_kind text check (cancel_reason_kind in ('staff_absence','holiday','clinic','patient','other')),
  cancelled_at timestamptz,
  notes text,
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '12 hours')
);
create index idx_appt_org_period on public.appointments(organization_id, starts_at);
create index idx_appt_unit_period on public.appointments(unit_id, starts_at) where status <> 'cancelled';
create index idx_appt_staff_period on public.appointments(staff_id, starts_at) where status <> 'cancelled';
create index idx_appt_room_period on public.appointments(room_id, starts_at) where status <> 'cancelled';
create index idx_appt_equipment_period on public.appointments(equipment_id, starts_at) where status <> 'cancelled';
create unique index uq_appt_recurrence_date on public.appointments(recurrence_id, occurrence_date) where recurrence_id is not null;

create table public.appointment_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  recurrence_member_id uuid references public.recurrence_members(id) on delete set null,
  status text not null default 'scheduled' check (status in
    ('scheduled','confirmed','replacement','present','completed','cancelled','absent')),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  credit_consumed boolean not null default false,
  replacement_credit_id uuid,
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  checkin_method text check (checkin_method in ('manual','qr','pin','facial','portal')),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancel_reason text,
  cancelled_with_notice boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (appointment_id, patient_id)
);
create index idx_part_patient on public.appointment_participants(patient_id, status);
create index idx_part_appt on public.appointment_participants(appointment_id);

-- Registro de check-ins
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  participant_id uuid not null references public.appointment_participants(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  method text not null check (method in ('manual','qr','pin','facial','portal')),
  checked_in_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);
create index idx_attendance_patient on public.attendance(patient_id, checked_in_at desc);

-- Lista de espera
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  position int not null,
  status text not null default 'waiting' check (status in ('waiting','notified','accepted','expired','cancelled')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create unique index uq_waitlist_active on public.waitlist(appointment_id, patient_id) where status in ('waiting','notified');

-- Créditos de reposição
create table public.replacement_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  origin_participant_id uuid references public.appointment_participants(id) on delete set null,
  reason text not null check (reason in ('cancel_notice','absence','holiday','staff_absence','clinic','manual')),
  status text not null default 'available' check (status in ('available','used','expired','cancelled')),
  expires_at timestamptz,
  used_participant_id uuid references public.appointment_participants(id) on delete set null,
  used_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_credits_patient on public.replacement_credits(patient_id, status, expires_at);
alter table public.appointment_participants add constraint fk_part_credit
  foreign key (replacement_credit_id) references public.replacement_credits(id) on delete set null;

-- Histórico de eventos da agenda (timeline)
create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  participant_id uuid references public.appointment_participants(id) on delete set null,
  patient_id uuid references public.patients(id) on delete cascade,
  event text not null,
  details jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index idx_appt_events_patient on public.appointment_events(patient_id, created_at desc);
create index idx_appt_events_appt on public.appointment_events(appointment_id);

-- Gatilhos padrão
do $$
declare t text;
begin
  foreach t in array array['recurrences','recurrence_members','appointments','appointment_participants'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function private.set_updated_at()', t);
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
    perform private.enable_audit(('public.' || t)::regclass);
  end loop;
  perform private.enable_audit('public.replacement_credits');
  execute 'create trigger trg_credits_created_by before insert on public.replacement_credits for each row execute function private.set_created_by()';
end $$;

-- Mantém o cache de saldo de reposições no aluno
create or replace function private.refresh_replacement_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_patient uuid := coalesce(new.patient_id, old.patient_id);
begin
  update patients set replacement_balance = (
    select count(*) from replacement_credits
     where patient_id = v_patient and status = 'available' and (expires_at is null or expires_at > now())
  ) where id = v_patient;
  return null;
end $$;
create trigger trg_credits_balance after insert or update or delete on public.replacement_credits
  for each row execute function private.refresh_replacement_balance();

create or replace function private.log_event(
  p_org uuid, p_appointment uuid, p_participant uuid, p_patient uuid, p_event text, p_details jsonb default null
) returns void language sql security definer set search_path = public as $$
  insert into appointment_events (organization_id, appointment_id, participant_id, patient_id, event, details)
  values (p_org, p_appointment, p_participant, p_patient, p_event, p_details)
$$;

-- =====================================================================
-- CONFLITOS
-- =====================================================================
-- Núcleo da verificação (sem checagem de permissão; uso interno)
create or replace function private.schedule_conflicts(
  p_org uuid,
  p_unit uuid,
  p_starts timestamptz,
  p_ends timestamptz,
  p_staff uuid default null,
  p_room uuid default null,
  p_equipment uuid default null,
  p_patient_ids uuid[] default '{}',
  p_capacity int default 1,
  p_exclude_appointment uuid default null
) returns table (code text, severity text, message text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := private.org_tz(p_org);
  v_local_start timestamp := p_starts at time zone v_tz;
  v_local_end timestamp := p_ends at time zone v_tz;
  r record;
  v_room rooms%rowtype;
  v_used int;
  v_has_hours boolean;
begin
  if p_ends <= p_starts then
    return query select 'invalid_time', 'error', 'O horário final deve ser depois do horário inicial.';
    return;
  end if;

  -- Profissional ocupado
  if p_staff is not null then
    for r in
      select a.starts_at, a.ends_at, s.name as service, st.full_name
        from appointments a join services s on s.id = a.service_id join staff st on st.id = a.staff_id
       where a.organization_id = p_org and a.staff_id = p_staff and a.status <> 'cancelled'
         and a.starts_at < p_ends and a.ends_at > p_starts
         and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
       limit 3
    loop
      return query select 'staff_busy', 'error', format('%s já tem atendimento das %s às %s (%s).',
        r.full_name, to_char(r.starts_at at time zone v_tz, 'HH24:MI'), to_char(r.ends_at at time zone v_tz, 'HH24:MI'), r.service);
    end loop;

    -- Férias, folgas e bloqueios
    for r in
      select o.kind, o.starts_at, o.ends_at, st.full_name from staff_time_off o join staff st on st.id = o.staff_id
       where o.staff_id = p_staff and o.starts_at < p_ends and o.ends_at > p_starts limit 1
    loop
      return query select 'staff_time_off', 'error', format('%s está indisponível (%s) de %s até %s.', r.full_name,
        case r.kind when 'vacation' then 'férias' when 'day_off' then 'folga' when 'sick_leave' then 'afastamento' else 'bloqueio' end,
        to_char(r.starts_at at time zone v_tz, 'DD/MM HH24:MI'), to_char(r.ends_at at time zone v_tz, 'DD/MM HH24:MI'));
    end loop;

    -- Fora do horário de trabalho (se houver jornada cadastrada)
    select exists (select 1 from staff_working_hours where staff_id = p_staff) into v_has_hours;
    if v_has_hours and (v_local_start::date <> v_local_end::date or not exists (
        select 1 from staff_working_hours h
         where h.staff_id = p_staff and h.weekday = extract(dow from v_local_start)::int
           and (h.unit_id is null or h.unit_id = p_unit)
           and h.start_time <= v_local_start::time and h.end_time >= v_local_end::time
           and (h.break_start is null or v_local_end::time <= h.break_start or v_local_start::time >= h.break_end)
    )) then
      return query select 'outside_hours', 'override',
        (select full_name from staff where id = p_staff) || ' não trabalha neste horário (fora da jornada cadastrada).';
    end if;
  end if;

  -- Sala ocupada / capacidade da sala
  if p_room is not null then
    select * into v_room from rooms where id = p_room;
    select coalesce(sum(a.capacity), 0) into v_used
      from appointments a
     where a.room_id = p_room and a.status <> 'cancelled' and a.starts_at < p_ends and a.ends_at > p_starts
       and (p_exclude_appointment is null or a.id <> p_exclude_appointment);
    if v_used > 0 and v_used + coalesce(p_capacity, 1) > v_room.capacity then
      return query select 'room_busy', 'error', format('A sala "%s" já está ocupada neste horário (%s de %s lugares em uso).',
        v_room.name, v_used, v_room.capacity);
    end if;
  end if;

  -- Equipamento ocupado ou em manutenção
  if p_equipment is not null then
    for r in
      select e.name, e.status from equipment e where e.id = p_equipment and e.status in ('maintenance','inactive')
    loop
      return query select 'equipment_unavailable', 'error', format('O equipamento "%s" está %s.', r.name,
        case r.status when 'maintenance' then 'em manutenção' else 'inativo' end);
    end loop;
    for r in
      select a.starts_at, a.ends_at, e.name from appointments a join equipment e on e.id = a.equipment_id
       where a.equipment_id = p_equipment and a.status <> 'cancelled' and a.starts_at < p_ends and a.ends_at > p_starts
         and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
       limit 1
    loop
      return query select 'equipment_busy', 'error', format('O equipamento "%s" já está reservado das %s às %s.', r.name,
        to_char(r.starts_at at time zone v_tz, 'HH24:MI'), to_char(r.ends_at at time zone v_tz, 'HH24:MI'));
    end loop;
  end if;

  -- Bloqueios de agenda (unidade, sala, profissional, equipamento)
  for r in
    select b.reason, b.starts_at, b.ends_at from schedule_blocks b
     where b.organization_id = p_org and b.starts_at < p_ends and b.ends_at > p_starts
       and (b.unit_id is null or b.unit_id = p_unit)
       and ((b.staff_id is null and b.room_id is null and b.equipment_id is null)
            or b.staff_id = p_staff or b.room_id = p_room or b.equipment_id = p_equipment)
     limit 1
  loop
    return query select 'blocked', 'error', format('Horário bloqueado: %s (%s às %s).', coalesce(r.reason, 'sem motivo informado'),
      to_char(r.starts_at at time zone v_tz, 'DD/MM HH24:MI'), to_char(r.ends_at at time zone v_tz, 'HH24:MI'));
  end loop;

  -- Feriado
  for r in
    select h.name from holidays h where h.organization_id = p_org and h.date = v_local_start::date
       and (h.unit_id is null or h.unit_id = p_unit) limit 1
  loop
    return query select 'holiday', 'override', format('%s é feriado (%s).', to_char(v_local_start, 'DD/MM/YYYY'), r.name);
  end loop;

  -- Aluno já agendado em horário conflitante
  if p_patient_ids is not null and array_length(p_patient_ids, 1) > 0 then
    for r in
      select p.full_name, a.starts_at, a.ends_at, s.name as service
        from appointment_participants ap
        join appointments a on a.id = ap.appointment_id
        join patients p on p.id = ap.patient_id
        join services s on s.id = a.service_id
       where ap.patient_id = any(p_patient_ids) and ap.status not in ('cancelled')
         and a.status <> 'cancelled' and a.starts_at < p_ends and a.ends_at > p_starts
         and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
       limit 5
    loop
      return query select 'patient_busy', 'error', format('%s já está agendado(a) das %s às %s (%s).', r.full_name,
        to_char(r.starts_at at time zone v_tz, 'HH24:MI'), to_char(r.ends_at at time zone v_tz, 'HH24:MI'), r.service);
    end loop;
  end if;

  if p_capacity is not null and p_patient_ids is not null and coalesce(array_length(p_patient_ids, 1), 0) > p_capacity then
    return query select 'capacity', 'error', format('A turma comporta %s aluno(s), mas %s foram selecionados.',
      p_capacity, array_length(p_patient_ids, 1));
  end if;
end $$;

-- Versão pública (RPC): a interface consulta antes de salvar para mostrar os avisos
create or replace function public.check_schedule_conflicts(
  p_org uuid, p_unit uuid, p_starts timestamptz, p_ends timestamptz, p_staff uuid default null, p_room uuid default null,
  p_equipment uuid default null, p_patient_ids uuid[] default '{}', p_capacity int default 1, p_exclude_appointment uuid default null
) returns table (code text, severity text, message text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission(p_org, 'schedule.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query select * from private.schedule_conflicts(p_org, p_unit, p_starts, p_ends, p_staff, p_room, p_equipment,
                                                        p_patient_ids, p_capacity, p_exclude_appointment);
end $$;

-- Valida conflitos e lança exceção com a lista de problemas
create or replace function private.assert_no_conflicts(
  p_org uuid, p_unit uuid, p_starts timestamptz, p_ends timestamptz, p_staff uuid, p_room uuid,
  p_equipment uuid, p_patient_ids uuid[], p_capacity int, p_exclude uuid, p_override boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare v_msgs text;
begin
  select string_agg(message, ' ' order by severity, code) into v_msgs
    from private.schedule_conflicts(p_org, p_unit, p_starts, p_ends, p_staff, p_room, p_equipment,
                                    p_patient_ids, p_capacity, p_exclude) c
   where c.severity = 'error'
      or (c.severity = 'override' and not (coalesce(p_override, false) and public.has_permission(p_org, 'schedule.override')));
  if v_msgs is not null then
    raise exception 'Conflito de agenda: %', v_msgs using errcode = 'P0001', hint = 'schedule_conflict';
  end if;
end $$;

-- Assinatura ativa do aluno para uma data
create or replace function private.active_subscription(p_patient uuid, p_date date) returns uuid
language sql stable security definer set search_path = public as $$
  select id from subscriptions
   where patient_id = p_patient and status = 'active' and start_date <= p_date and (end_date is null or end_date >= p_date)
   order by start_date desc limit 1
$$;

-- Saldo do aluno: aulas e reposições
create or replace function public.patient_balance(p_patient uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_sub subscriptions%rowtype; v_tz text;
begin
  select organization_id into v_org from patients where id = p_patient;
  if v_org is null then return null; end if;
  if not (public.has_permission(v_org, 'patients.view')
          or exists (select 1 from patients where id = p_patient and user_id = auth.uid())) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  v_tz := private.org_tz(v_org);
  select * into v_sub from subscriptions where id = private.active_subscription(p_patient, (now() at time zone v_tz)::date);
  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan_name', (select name from plans where id = v_sub.plan_id),
    'sessions_total', v_sub.sessions_total,
    'sessions_used', v_sub.sessions_used,
    'sessions_remaining', case when v_sub.sessions_total is null then null
                               else v_sub.sessions_total + v_sub.sessions_extra - v_sub.sessions_used end,
    'end_date', v_sub.end_date,
    'replacement_credits', (select count(*) from replacement_credits where patient_id = p_patient and status = 'available'
                              and (expires_at is null or expires_at > now())),
    'next_credit_expiration', (select min(expires_at) from replacement_credits where patient_id = p_patient
                                 and status = 'available' and expires_at > now())
  );
end $$;

-- Consome uma aula do plano (idempotente por participante)
create or replace function private.consume_session(p_participant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ap appointment_participants%rowtype; a appointments%rowtype; s services%rowtype; v_sub uuid;
begin
  select * into ap from appointment_participants where id = p_participant for update;
  if ap.credit_consumed or ap.replacement_credit_id is not null then return; end if;
  select * into a from appointments where id = ap.appointment_id;
  select * into s from services where id = a.service_id;
  if not s.consumes_plan_credit then return; end if;
  v_sub := coalesce(ap.subscription_id, private.active_subscription(ap.patient_id, (a.starts_at at time zone private.org_tz(a.organization_id))::date));
  if v_sub is null then return; end if;
  update subscriptions set sessions_used = sessions_used + 1 where id = v_sub;
  update appointment_participants set credit_consumed = true, subscription_id = v_sub where id = p_participant;
end $$;

-- Devolve a aula ao plano (ex.: presença lançada por engano)
create or replace function private.release_session(p_participant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ap appointment_participants%rowtype;
begin
  select * into ap from appointment_participants where id = p_participant for update;
  if not ap.credit_consumed or ap.subscription_id is null then return; end if;
  update subscriptions set sessions_used = greatest(sessions_used - 1, 0) where id = ap.subscription_id;
  update appointment_participants set credit_consumed = false where id = p_participant;
end $$;

-- Gera crédito de reposição
create or replace function private.grant_credit(p_org uuid, p_patient uuid, p_participant uuid, p_reason text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rules jsonb := private.schedule_rules(p_org);
begin
  insert into replacement_credits (organization_id, patient_id, origin_participant_id, reason, expires_at, notes)
  values (p_org, p_patient, p_participant, p_reason,
          now() + make_interval(days => (v_rules ->> 'replacement_validity_days')::int), p_notes)
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
-- CRIAR / EDITAR AGENDAMENTOS
-- =====================================================================
create or replace function public.create_appointment(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_unit uuid := (p ->> 'unit_id')::uuid;
  v_service services%rowtype;
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz;
  v_ends timestamptz;
  v_capacity int;
  v_patients uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'patient_ids', '[]'::jsonb))::uuid), '{}');
  v_id uuid;
  v_pid uuid;
  v_use_credit boolean := coalesce((p ->> 'use_replacement_credit')::boolean, false);
  v_credit uuid;
  v_part uuid;
begin
  select organization_id into v_org from units where id = v_unit and deleted_at is null;
  if v_org is null then raise exception 'Unidade inválida.'; end if;
  perform private.require_permission(v_org, 'schedule.create');
  if not public.has_unit_access(v_org, v_unit) then raise exception 'Sem acesso a esta unidade.' using errcode = '42501'; end if;

  select * into v_service from services where id = (p ->> 'service_id')::uuid and organization_id = v_org and deleted_at is null;
  if not found then raise exception 'Selecione uma modalidade válida.'; end if;
  if v_starts is null then raise exception 'Informe data e horário.'; end if;
  v_ends := coalesce((p ->> 'ends_at')::timestamptz, v_starts + make_interval(mins => v_service.default_duration_min));
  v_capacity := coalesce((p ->> 'capacity')::int, v_service.default_capacity);

  -- Os recursos precisam pertencer à mesma organização
  if (p ->> 'staff_id') is not null and not exists (select 1 from staff where id = (p ->> 'staff_id')::uuid and organization_id = v_org and status = 'active' and deleted_at is null) then
    raise exception 'Profissional inválido ou inativo.';
  end if;
  if (p ->> 'room_id') is not null and not exists (select 1 from rooms where id = (p ->> 'room_id')::uuid and unit_id = v_unit and deleted_at is null) then
    raise exception 'Sala inválida para esta unidade.';
  end if;
  if (p ->> 'equipment_id') is not null and not exists (select 1 from equipment where id = (p ->> 'equipment_id')::uuid and unit_id = v_unit and deleted_at is null) then
    raise exception 'Equipamento inválido para esta unidade.';
  end if;
  if exists (select 1 from unnest(v_patients) x where not exists (select 1 from patients where id = x and organization_id = v_org and deleted_at is null)) then
    raise exception 'Aluno inválido.';
  end if;

  -- Serializa por profissional/sala para evitar dupla reserva simultânea
  perform pg_advisory_xact_lock(hashtext(coalesce(p ->> 'staff_id', '') || coalesce(p ->> 'room_id', v_unit::text)));

  perform private.assert_no_conflicts(v_org, v_unit, v_starts, v_ends, (p ->> 'staff_id')::uuid, (p ->> 'room_id')::uuid,
    (p ->> 'equipment_id')::uuid, v_patients, v_capacity, null, coalesce((p ->> 'override')::boolean, false));

  insert into appointments (organization_id, unit_id, service_id, staff_id, room_id, equipment_id, kind,
                            starts_at, ends_at, capacity, notes)
  values (v_org, v_unit, v_service.id, (p ->> 'staff_id')::uuid, (p ->> 'room_id')::uuid, (p ->> 'equipment_id')::uuid,
          coalesce(p ->> 'kind', v_service.kind), v_starts, v_ends, v_capacity, p ->> 'notes')
  returning id into v_id;

  foreach v_pid in array v_patients loop
    v_credit := null;
    if v_use_credit then
      select id into v_credit from replacement_credits
       where patient_id = v_pid and status = 'available' and (expires_at is null or expires_at > now())
       order by expires_at nulls last, created_at limit 1 for update;
      if v_credit is null then
        raise exception 'O aluno não possui créditos de reposição disponíveis.';
      end if;
    end if;
    insert into appointment_participants (organization_id, appointment_id, patient_id, status, replacement_credit_id)
    values (v_org, v_id, v_pid, case when v_credit is not null then 'replacement' else 'scheduled' end, v_credit)
    returning id into v_part;
    if v_credit is not null then
      update replacement_credits set status = 'used', used_participant_id = v_part, used_at = now() where id = v_credit;
    end if;
    perform private.log_event(v_org, v_id, v_part, v_pid, case when v_credit is null then 'scheduled' else 'replacement_scheduled' end,
                              jsonb_build_object('starts_at', v_starts, 'service', v_service.name));
  end loop;
  return v_id;
end $$;

-- Editar/mover agendamento. p_scope: 'one' (só esta) ou 'future' (esta e futuras da recorrência)
create or replace function public.update_appointment(p_id uuid, p jsonb, p_scope text default 'one') returns int
language plpgsql security definer set search_path = public as $$
declare
  a appointments%rowtype;
  v_new_starts timestamptz;
  v_new_ends timestamptz;
  v_delta interval;
  v_staff uuid; v_room uuid; v_equipment uuid; v_capacity int;
  v_patients uuid[];
  occ record;
  v_count int := 0;
  v_tz text;
  v_override boolean := coalesce((p ->> 'override')::boolean, false);
  v_errors text := '';
begin
  select * into a from appointments where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  perform private.require_permission(a.organization_id, 'schedule.edit');
  if a.status = 'cancelled' then raise exception 'Não é possível alterar um agendamento cancelado.'; end if;
  v_tz := private.org_tz(a.organization_id);

  v_new_starts := coalesce((p ->> 'starts_at')::timestamptz, a.starts_at);
  v_new_ends := coalesce((p ->> 'ends_at')::timestamptz, v_new_starts + (a.ends_at - a.starts_at));
  v_delta := v_new_starts - a.starts_at;
  v_staff := case when p ? 'staff_id' then (p ->> 'staff_id')::uuid else a.staff_id end;
  v_room := case when p ? 'room_id' then (p ->> 'room_id')::uuid else a.room_id end;
  v_equipment := case when p ? 'equipment_id' then (p ->> 'equipment_id')::uuid else a.equipment_id end;
  v_capacity := coalesce((p ->> 'capacity')::int, a.capacity);

  if v_capacity < (select count(*) from appointment_participants where appointment_id = a.id and status <> 'cancelled') then
    raise exception 'A capacidade não pode ser menor que o número de alunos já agendados.';
  end if;

  if p_scope = 'future' and a.recurrence_id is not null then
    for occ in
      select * from appointments
       where recurrence_id = a.recurrence_id and starts_at >= a.starts_at and status = 'scheduled'
       order by starts_at
    loop
      select coalesce(array_agg(patient_id), '{}') into v_patients from appointment_participants
       where appointment_id = occ.id and status <> 'cancelled';
      begin
        perform private.assert_no_conflicts(a.organization_id, a.unit_id, occ.starts_at + v_delta,
          occ.starts_at + v_delta + (v_new_ends - v_new_starts), v_staff, v_room, v_equipment, v_patients, v_capacity, occ.id, v_override);
      exception when others then
        v_errors := v_errors || to_char(occ.starts_at at time zone v_tz, 'DD/MM') || ': ' || replace(sqlerrm, 'Conflito de agenda: ', '') || E'\n';
      end;
    end loop;
    if v_errors <> '' then
      raise exception 'Conflito de agenda nas ocorrências futuras: %', v_errors using hint = 'schedule_conflict';
    end if;
    update appointments set
      starts_at = starts_at + v_delta,
      ends_at = starts_at + v_delta + (v_new_ends - v_new_starts),
      staff_id = v_staff, room_id = v_room, equipment_id = v_equipment, capacity = v_capacity,
      notes = case when p ? 'notes' and id = a.id then p ->> 'notes' else notes end
     where recurrence_id = a.recurrence_id and starts_at >= a.starts_at and status = 'scheduled';
    get diagnostics v_count = row_count;
    update recurrences set
      start_time = (v_new_starts at time zone v_tz)::time,
      weekday = extract(dow from v_new_starts at time zone v_tz)::int,
      duration_min = extract(epoch from (v_new_ends - v_new_starts))::int / 60,
      staff_id = v_staff, room_id = v_room, equipment_id = v_equipment, capacity = v_capacity
     where id = a.recurrence_id;
  else
    select coalesce(array_agg(patient_id), '{}') into v_patients from appointment_participants
     where appointment_id = a.id and status <> 'cancelled';
    perform private.assert_no_conflicts(a.organization_id, a.unit_id, v_new_starts, v_new_ends, v_staff, v_room,
      v_equipment, v_patients, v_capacity, a.id, v_override);
    update appointments set
      starts_at = v_new_starts, ends_at = v_new_ends, staff_id = v_staff, room_id = v_room, equipment_id = v_equipment,
      capacity = v_capacity,
      service_id = coalesce((p ->> 'service_id')::uuid, service_id),
      kind = coalesce(p ->> 'kind', kind),
      notes = case when p ? 'notes' then p ->> 'notes' else notes end,
      is_exception = recurrence_id is not null,
      substitute_for_staff_id = case when v_staff is distinct from a.staff_id and a.recurrence_id is not null
                                     then coalesce(substitute_for_staff_id, a.staff_id) else substitute_for_staff_id end
     where id = a.id;
    v_count := 1;
  end if;

  insert into appointment_events (organization_id, appointment_id, event, details)
  values (a.organization_id, a.id, case when v_delta <> interval '0' then 'rescheduled' else 'updated' end,
          jsonb_build_object('from', a.starts_at, 'to', v_new_starts, 'scope', p_scope,
                             'staff_changed', v_staff is distinct from a.staff_id));
  return v_count;
end $$;

-- Adicionar aluno a um agendamento existente (turma)
create or replace function public.add_participant(
  p_appointment_id uuid, p_patient_id uuid, p_use_credit boolean default false, p_override boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype; v_used int; v_id uuid; v_credit uuid; v_existing appointment_participants%rowtype;
begin
  select * into a from appointments where id = p_appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if not (public.has_permission(a.organization_id, 'schedule.create')
          or exists (select 1 from patients where id = p_patient_id and user_id = auth.uid() and organization_id = a.organization_id)) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if a.status = 'cancelled' then raise exception 'Este horário foi cancelado.'; end if;
  if a.ends_at < now() - interval '1 day' and not public.has_permission(a.organization_id, 'schedule.edit') then
    raise exception 'Este horário já passou.';
  end if;
  if not exists (select 1 from patients where id = p_patient_id and organization_id = a.organization_id and deleted_at is null) then
    raise exception 'Aluno inválido.';
  end if;

  select count(*) into v_used from appointment_participants where appointment_id = a.id and status <> 'cancelled';
  if v_used >= a.capacity then
    raise exception 'Turma lotada (% de % vagas). Adicione o aluno à lista de espera.', v_used, a.capacity using hint = 'class_full';
  end if;

  perform private.assert_no_conflicts(a.organization_id, a.unit_id, a.starts_at, a.ends_at, null, null, null,
    array[p_patient_id], null, a.id, p_override);

  if p_use_credit then
    select id into v_credit from replacement_credits
     where patient_id = p_patient_id and status = 'available' and (expires_at is null or expires_at > now())
     order by expires_at nulls last, created_at limit 1 for update;
    if v_credit is null then raise exception 'O aluno não possui créditos de reposição disponíveis.'; end if;
  end if;

  select * into v_existing from appointment_participants where appointment_id = a.id and patient_id = p_patient_id;
  if found then
    update appointment_participants set status = case when v_credit is not null then 'replacement' else 'scheduled' end,
           replacement_credit_id = v_credit, cancelled_at = null, cancel_reason = null, cancelled_with_notice = null
     where id = v_existing.id returning id into v_id;
  else
    insert into appointment_participants (organization_id, appointment_id, patient_id, status, replacement_credit_id)
    values (a.organization_id, a.id, p_patient_id, case when v_credit is not null then 'replacement' else 'scheduled' end, v_credit)
    returning id into v_id;
  end if;
  if v_credit is not null then
    update replacement_credits set status = 'used', used_participant_id = v_id, used_at = now() where id = v_credit;
  end if;
  update waitlist set status = 'accepted' where appointment_id = a.id and patient_id = p_patient_id and status in ('waiting','notified');
  perform private.log_event(a.organization_id, a.id, v_id, p_patient_id,
    case when v_credit is null then 'scheduled' else 'replacement_scheduled' end, jsonb_build_object('starts_at', a.starts_at));
  return v_id;
end $$;

-- Lista de espera
create or replace function public.join_waitlist(p_appointment_id uuid, p_patient_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype; v_id uuid;
begin
  select * into a from appointments where id = p_appointment_id;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if not (public.has_permission(a.organization_id, 'schedule.create')
          or exists (select 1 from patients where id = p_patient_id and user_id = auth.uid() and organization_id = a.organization_id)) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if exists (select 1 from appointment_participants where appointment_id = a.id and patient_id = p_patient_id and status <> 'cancelled') then
    raise exception 'O aluno já está agendado neste horário.';
  end if;
  insert into waitlist (organization_id, appointment_id, patient_id, position)
  values (a.organization_id, a.id, p_patient_id,
          coalesce((select max(position) from waitlist where appointment_id = a.id), 0) + 1)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then raise exception 'O aluno já está na lista de espera deste horário.'; end if;
  perform private.log_event(a.organization_id, a.id, null, p_patient_id, 'waitlist_joined', null);
  return v_id;
end $$;

-- Notifica o próximo da lista de espera quando surge vaga
create or replace function private.notify_waitlist(p_appointment_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype; w waitlist%rowtype; v_patient patients%rowtype; v_tz text;
begin
  select * into a from appointments where id = p_appointment_id;
  if a.status = 'cancelled' or a.starts_at < now() then return null; end if;
  if (select count(*) from appointment_participants where appointment_id = a.id and status <> 'cancelled') >= a.capacity then
    return null;
  end if;
  select * into w from waitlist where appointment_id = a.id and status = 'waiting' order by position limit 1 for update;
  if not found then return null; end if;
  select * into v_patient from patients where id = w.patient_id;
  v_tz := private.org_tz(a.organization_id);
  update waitlist set status = 'notified', notified_at = now() where id = w.id;
  perform private.notify_permission(a.organization_id, 'schedule.edit', 'waitlist_spot',
    'Vaga liberada na lista de espera',
    format('%s é o próximo da lista para %s.', v_patient.full_name, to_char(a.starts_at at time zone v_tz, 'DD/MM "às" HH24:MI')),
    '/app/agenda?data=' || to_char(a.starts_at at time zone v_tz, 'YYYY-MM-DD'), 'appointments', a.id);
  perform private.notify_user(a.organization_id, v_patient.user_id, 'waitlist_spot', 'Abriu uma vaga para você!',
    format('Há uma vaga em %s. Acesse o portal para confirmar.', to_char(a.starts_at at time zone v_tz, 'DD/MM "às" HH24:MI')),
    '/portal/aulas', 'appointments', a.id);
  perform private.log_event(a.organization_id, a.id, null, w.patient_id, 'waitlist_notified', null);
  return w.id;
end $$;

-- =====================================================================
-- CANCELAMENTOS
-- =====================================================================
-- Cancela a participação de um aluno. Aplica regras de antecedência e gera crédito quando cabível.
create or replace function public.cancel_participation(p_participant_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ap appointment_participants%rowtype;
  a appointments%rowtype;
  v_rules jsonb;
  v_is_patient boolean;
  v_hours numeric;
  v_with_notice boolean;
  v_credit uuid;
  v_limit int;
  v_month_count int;
  v_sub subscriptions%rowtype;
  v_tz text;
  v_credit_msg text;
begin
  select * into ap from appointment_participants where id = p_participant_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  select * into a from appointments where id = ap.appointment_id;
  v_is_patient := exists (select 1 from patients where id = ap.patient_id and user_id = auth.uid());
  if not (public.has_permission(a.organization_id, 'schedule.edit') or v_is_patient) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if ap.status in ('cancelled') then raise exception 'Este agendamento já está cancelado.'; end if;
  if ap.status in ('present','completed','absent') then raise exception 'Não é possível cancelar uma aula já registrada.'; end if;

  v_rules := private.schedule_rules(a.organization_id);
  v_tz := private.org_tz(a.organization_id);
  v_hours := extract(epoch from (a.starts_at - now())) / 3600.0;
  if v_is_patient and v_hours < 0 then raise exception 'Esta aula já começou.'; end if;
  v_with_notice := v_hours >= (v_rules ->> 'min_cancel_notice_hours')::numeric;

  update appointment_participants
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason,
         cancelled_with_notice = v_with_notice
   where id = ap.id;

  if ap.credit_consumed then perform private.release_session(ap.id); end if;

  if v_with_notice then
    if ap.replacement_credit_id is not null then
      -- reposição cancelada com antecedência: devolve o crédito utilizado
      update replacement_credits set status = 'available', used_participant_id = null, used_at = null
       where id = ap.replacement_credit_id;
      v_credit := ap.replacement_credit_id;
      v_credit_msg := 'Crédito de reposição devolvido.';
    else
      select * into v_sub from subscriptions
       where id = private.active_subscription(ap.patient_id, (a.starts_at at time zone v_tz)::date);
      if v_sub.id is not null then
        v_limit := case when coalesce(v_sub.replacements_allowed, 0) > 0 then v_sub.replacements_allowed
                        else (v_rules ->> 'replacements_per_month')::int end;
        select count(*) into v_month_count from replacement_credits
         where patient_id = ap.patient_id and reason = 'cancel_notice'
           and date_trunc('month', created_at at time zone v_tz) = date_trunc('month', now() at time zone v_tz);
        if v_month_count < v_limit then
          v_credit := private.grant_credit(a.organization_id, ap.patient_id, ap.id, 'cancel_notice');
          v_credit_msg := 'Crédito de reposição gerado.';
        else
          v_credit_msg := format('Limite de %s reposições no mês atingido — sem crédito.', v_limit);
        end if;
      else
        v_credit_msg := 'Aluno sem plano ativo — sem crédito de reposição.';
      end if;
    end if;
  else
    v_credit_msg := format('Cancelamento com menos de %s h de antecedência — sem crédito.', v_rules ->> 'min_cancel_notice_hours');
  end if;

  perform private.log_event(a.organization_id, a.id, ap.id, ap.patient_id, 'cancelled',
    jsonb_build_object('reason', p_reason, 'with_notice', v_with_notice, 'credit_id', v_credit, 'by_patient', v_is_patient));

  if v_is_patient then
    perform private.notify_permission(a.organization_id, 'schedule.edit', 'cancellation', 'Cancelamento pelo portal',
      format('%s cancelou a aula de %s.', (select full_name from patients where id = ap.patient_id),
             to_char(a.starts_at at time zone v_tz, 'DD/MM "às" HH24:MI')),
      '/app/agenda?data=' || to_char(a.starts_at at time zone v_tz, 'YYYY-MM-DD'), 'appointment_participants', ap.id);
  end if;

  perform private.notify_waitlist(a.id);
  return jsonb_build_object('with_notice', v_with_notice, 'credit_id', v_credit, 'message', v_credit_msg);
end $$;

-- Cancela o horário inteiro (todos os alunos). p_scope = 'one' | 'future' (cancela a série)
create or replace function public.cancel_appointment(
  p_id uuid, p_reason text, p_reason_kind text default 'other', p_scope text default 'one'
) returns int
language plpgsql security definer set search_path = public as $$
declare
  a appointments%rowtype; occ record; ap record; v_rules jsonb; v_count int := 0; v_gen boolean;
begin
  select * into a from appointments where id = p_id;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  perform private.require_permission(a.organization_id, 'schedule.edit');
  if coalesce(trim(p_reason), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
  v_rules := private.schedule_rules(a.organization_id);
  v_gen := case p_reason_kind
             when 'staff_absence' then (v_rules ->> 'staff_absence_generates_credit')::boolean
             when 'holiday' then (v_rules ->> 'holiday_generates_credit')::boolean
             when 'clinic' then true
             else false end;

  for occ in
    select * from appointments
     where (id = a.id or (p_scope = 'future' and a.recurrence_id is not null and recurrence_id = a.recurrence_id and starts_at >= a.starts_at))
       and status <> 'cancelled'
  loop
    for ap in select * from appointment_participants where appointment_id = occ.id and status not in ('cancelled','present','completed','absent') loop
      update appointment_participants set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
             cancel_reason = p_reason, cancelled_with_notice = true where id = ap.id;
      if ap.credit_consumed then perform private.release_session(ap.id); end if;
      if ap.replacement_credit_id is not null then
        update replacement_credits set status = 'available', used_participant_id = null, used_at = null where id = ap.replacement_credit_id;
      elsif v_gen and p_scope = 'one' then
        perform private.grant_credit(a.organization_id, ap.patient_id, ap.id, case p_reason_kind when 'staff_absence' then 'staff_absence'
                                     when 'holiday' then 'holiday' else 'clinic' end, p_reason);
      end if;
      perform private.log_event(a.organization_id, occ.id, ap.id, ap.patient_id, 'session_cancelled',
        jsonb_build_object('reason', p_reason, 'kind', p_reason_kind));
    end loop;
    update appointments set status = 'cancelled', cancel_reason = p_reason, cancel_reason_kind = p_reason_kind, cancelled_at = now()
     where id = occ.id;
    update waitlist set status = 'cancelled' where appointment_id = occ.id and status in ('waiting','notified');
    v_count := v_count + 1;
  end loop;

  if p_scope = 'future' and a.recurrence_id is not null then
    update recurrences set status = 'ended', ends_on = (a.starts_at at time zone private.org_tz(a.organization_id))::date - 1
     where id = a.recurrence_id;
    update recurrence_members set status = 'ended', ends_on = (a.starts_at at time zone private.org_tz(a.organization_id))::date - 1
     where recurrence_id = a.recurrence_id and status <> 'ended';
  end if;
  return v_count;
end $$;

-- =====================================================================
-- PRESENÇA / CHECK-IN
-- =====================================================================
create or replace function public.set_attendance(p_participant_id uuid, p_status text, p_method text default 'manual') returns void
language plpgsql security definer set search_path = public as $$
declare ap appointment_participants%rowtype; a appointments%rowtype; v_rules jsonb;
begin
  select * into ap from appointment_participants where id = p_participant_id for update;
  if not found then raise exception 'Registro não encontrado.'; end if;
  select * into a from appointments where id = ap.appointment_id;
  perform private.require_permission(a.organization_id, 'schedule.edit');
  if p_status not in ('scheduled','confirmed','present','completed','absent') then raise exception 'Status inválido.'; end if;
  if ap.status = 'cancelled' then raise exception 'Agendamento cancelado. Reative-o adicionando o aluno novamente.'; end if;
  if p_status in ('present','completed','absent') and a.starts_at > now() + interval '2 hours' then
    raise exception 'Só é possível registrar presença/falta próximo do horário da aula.';
  end if;
  v_rules := private.schedule_rules(a.organization_id);

  update appointment_participants set
    status = p_status,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    checked_in_at = case when p_status in ('present','completed') then coalesce(checked_in_at, now()) else null end,
    checkin_method = case when p_status in ('present','completed') then coalesce(checkin_method, p_method) else null end
   where id = ap.id;

  if p_status in ('present','completed') then
    if ap.status not in ('present','completed') then
      insert into attendance (organization_id, participant_id, appointment_id, patient_id, method, recorded_by)
      values (a.organization_id, ap.id, a.id, ap.patient_id, coalesce(p_method, 'manual'), auth.uid());
    end if;
    perform private.consume_session(ap.id);
  elsif p_status = 'absent' then
    if (v_rules ->> 'absence_consumes_session')::boolean then
      perform private.consume_session(ap.id);
    else
      perform private.release_session(ap.id);
    end if;
    if (v_rules ->> 'absence_generates_credit')::boolean and ap.status <> 'absent' and ap.replacement_credit_id is null then
      perform private.grant_credit(a.organization_id, ap.patient_id, ap.id, 'absence');
    end if;
  else
    perform private.release_session(ap.id);
  end if;

  -- Turma inteira registrada => sessão concluída
  if p_status in ('present','completed','absent') and not exists (
     select 1 from appointment_participants where appointment_id = a.id and status in ('scheduled','confirmed','replacement')) then
    update appointments set status = 'completed' where id = a.id and status = 'scheduled';
  end if;

  perform private.log_event(a.organization_id, a.id, ap.id, ap.patient_id,
    case p_status when 'present' then 'checked_in' when 'completed' then 'completed' when 'absent' then 'absent'
                  when 'confirmed' then 'confirmed' else 'status_changed' end,
    jsonb_build_object('method', p_method));
end $$;

-- Check-in por QR Code (token do aluno) ou PIN — usado no tablet da recepção
create or replace function public.check_in(p_org uuid, p_token uuid default null, p_pin text default null, p_patient_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_patient patients%rowtype; v_part record; v_rules jsonb; v_method text;
begin
  perform private.require_permission(p_org, 'schedule.edit');
  if p_token is not null then
    select * into v_patient from patients where checkin_token = p_token and organization_id = p_org and deleted_at is null;
    v_method := 'qr';
  elsif p_pin is not null and p_patient_id is not null then
    select * into v_patient from patients where id = p_patient_id and organization_id = p_org and checkin_pin = p_pin and deleted_at is null;
    v_method := 'pin';
  end if;
  if v_patient.id is null then raise exception 'Aluno não identificado. Verifique o QR Code ou PIN.'; end if;
  v_rules := private.schedule_rules(p_org);

  select ap.id, a.starts_at into v_part
    from appointment_participants ap join appointments a on a.id = ap.appointment_id
   where ap.patient_id = v_patient.id and ap.status in ('scheduled','confirmed','replacement') and a.status <> 'cancelled'
     and a.starts_at between now() - make_interval(mins => (v_rules ->> 'checkin_window_minutes')::int)
                         and now() + make_interval(mins => (v_rules ->> 'checkin_window_minutes')::int)
   order by abs(extract(epoch from a.starts_at - now())) limit 1;
  if v_part.id is null then
    raise exception '% não possui aula agendada para agora.', v_patient.full_name;
  end if;
  perform public.set_attendance(v_part.id, 'present', v_method);
  return jsonb_build_object('patient', v_patient.full_name, 'starts_at', v_part.starts_at, 'participant_id', v_part.id);
end $$;

-- =====================================================================
-- RECORRÊNCIAS (horários fixos)
-- =====================================================================
-- Gera ocorrências para uma recorrência até a data limite
create or replace function private.generate_recurrence(p_recurrence_id uuid, p_until date) returns int
language plpgsql security definer set search_path = public as $$
declare
  r recurrences%rowtype; s services%rowtype; v_tz text; v_rules jsonb;
  v_date date; v_from date; v_to date; v_appt uuid; v_count int := 0; m record; v_part uuid;
  v_starts timestamptz;
begin
  select * into r from recurrences where id = p_recurrence_id for update;
  if r.status = 'ended' then return 0; end if;
  select * into s from services where id = r.service_id;
  v_tz := private.org_tz(r.organization_id);
  v_rules := private.schedule_rules(r.organization_id);
  v_from := greatest(r.starts_on, coalesce(r.generated_until + 1, r.starts_on), (now() at time zone v_tz)::date);
  v_to := least(p_until, coalesce(r.ends_on, p_until));
  if v_from > v_to then return 0; end if;

  -- primeiro dia da semana correspondente
  v_date := v_from + ((r.weekday - extract(dow from v_from)::int + 7) % 7);
  while v_date <= v_to loop
    if r.status = 'paused' and v_date between coalesce(r.paused_from, v_date) and coalesce(r.paused_until, v_date) then
      v_date := v_date + 7; continue;
    end if;
    if exists (select 1 from holidays h where h.organization_id = r.organization_id and h.date = v_date
               and (h.unit_id is null or h.unit_id = r.unit_id)) then
      -- feriado: não gera aula; credita reposição se a regra mandar
      if (v_rules ->> 'holiday_generates_credit')::boolean then
        for m in select * from recurrence_members where recurrence_id = r.id and status = 'active'
                   and starts_on <= v_date and (ends_on is null or ends_on >= v_date) loop
          perform private.grant_credit(r.organization_id, m.patient_id, null, 'holiday', 'Feriado em ' || to_char(v_date, 'DD/MM/YYYY'));
        end loop;
      end if;
      v_date := v_date + 7; continue;
    end if;

    v_starts := (v_date + r.start_time) at time zone v_tz;
    insert into appointments (organization_id, unit_id, service_id, staff_id, room_id, equipment_id, recurrence_id,
                              occurrence_date, kind, starts_at, ends_at, capacity, created_by)
    values (r.organization_id, r.unit_id, r.service_id, r.staff_id, r.room_id, r.equipment_id, r.id, v_date, s.kind,
            v_starts, v_starts + make_interval(mins => r.duration_min), r.capacity, r.created_by)
    on conflict (recurrence_id, occurrence_date) where recurrence_id is not null do nothing
    returning id into v_appt;

    if v_appt is not null then
      v_count := v_count + 1;
      for m in select * from recurrence_members where recurrence_id = r.id and status <> 'ended'
                 and starts_on <= v_date and (ends_on is null or ends_on >= v_date)
                 and not (status = 'paused' and v_date between coalesce(paused_from, v_date) and coalesce(paused_until, v_date))
      loop
        insert into appointment_participants (organization_id, appointment_id, patient_id, recurrence_member_id, subscription_id, created_by)
        values (r.organization_id, v_appt, m.patient_id, m.id, m.subscription_id, r.created_by)
        on conflict (appointment_id, patient_id) do nothing;
      end loop;
    end if;
    v_date := v_date + 7;
  end loop;

  update recurrences set generated_until = greatest(coalesce(generated_until, v_to), v_to) where id = r.id;
  return v_count;
end $$;

-- Rotina diária: gera ocorrências de todas as recorrências ativas
create or replace function public.generate_all_recurrences(p_org uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_total int := 0;
begin
  for r in select rc.id, rc.organization_id from recurrences rc
            where rc.status <> 'ended' and (p_org is null or rc.organization_id = p_org) loop
    v_total := v_total + private.generate_recurrence(r.id,
      (now() at time zone private.org_tz(r.organization_id))::date + (private.schedule_rules(r.organization_id) ->> 'recurrence_horizon_days')::int);
  end loop;
  return v_total;
end $$;
revoke execute on function public.generate_all_recurrences(uuid) from public, anon, authenticated;

-- Cadastra horário fixo: cria (ou reaproveita) a recorrência de cada dia e inclui o aluno.
-- p: { unit_id, service_id, staff_id, room_id, equipment_id, weekdays:[1,3], start_time:"18:00", duration_min,
--      capacity, starts_on, ends_on, patient_ids:[...], subscription_id, name, notes }
create or replace function public.create_fixed_schedule(p jsonb) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_unit uuid := (p ->> 'unit_id')::uuid; v_service services%rowtype;
  v_wd int; v_rec uuid; v_ids uuid[] := '{}'; v_pid uuid; v_active int; v_capacity int; v_duration int;
  v_start time := (p ->> 'start_time')::time; v_starts_on date := coalesce((p ->> 'starts_on')::date, current_date);
  v_patients uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'patient_ids', '[]'::jsonb))::uuid), '{}');
  v_tz text; v_first date; v_check_start timestamptz;
begin
  select organization_id into v_org from units where id = v_unit;
  if v_org is null then raise exception 'Unidade inválida.'; end if;
  perform private.require_permission(v_org, 'schedule.create');
  select * into v_service from services where id = (p ->> 'service_id')::uuid and organization_id = v_org;
  if not found then raise exception 'Modalidade inválida.'; end if;
  if v_start is null then raise exception 'Informe o horário.'; end if;
  if jsonb_array_length(coalesce(p -> 'weekdays', '[]'::jsonb)) = 0 then raise exception 'Selecione ao menos um dia da semana.'; end if;
  v_duration := coalesce((p ->> 'duration_min')::int, v_service.default_duration_min);
  v_capacity := coalesce((p ->> 'capacity')::int, v_service.default_capacity);
  v_tz := private.org_tz(v_org);

  for v_wd in select jsonb_array_elements_text(p -> 'weekdays')::int loop
    -- reaproveita horário fixo existente equivalente (mesma unidade, modalidade, profissional, dia e hora)
    select id into v_rec from recurrences
     where organization_id = v_org and unit_id = v_unit and service_id = v_service.id and status <> 'ended'
       and staff_id is not distinct from (p ->> 'staff_id')::uuid and weekday = v_wd and start_time = v_start
       and room_id is not distinct from (p ->> 'room_id')::uuid
     limit 1;

    if v_rec is null then
      -- verifica conflitos da primeira ocorrência (profissional, sala, equipamento, jornada)
      v_first := v_starts_on + ((v_wd - extract(dow from v_starts_on)::int + 7) % 7);
      v_check_start := (v_first + v_start) at time zone v_tz;
      perform private.assert_no_conflicts(v_org, v_unit, v_check_start, v_check_start + make_interval(mins => v_duration),
        (p ->> 'staff_id')::uuid, (p ->> 'room_id')::uuid, (p ->> 'equipment_id')::uuid, v_patients, v_capacity, null,
        coalesce((p ->> 'override')::boolean, false));
      insert into recurrences (organization_id, unit_id, service_id, staff_id, room_id, equipment_id, name, weekday,
                               start_time, duration_min, capacity, starts_on, ends_on, notes)
      values (v_org, v_unit, v_service.id, (p ->> 'staff_id')::uuid, (p ->> 'room_id')::uuid, (p ->> 'equipment_id')::uuid,
              p ->> 'name', v_wd, v_start, v_duration, v_capacity, v_starts_on, (p ->> 'ends_on')::date, p ->> 'notes')
      returning id into v_rec;
    end if;

    select count(*) into v_active from recurrence_members where recurrence_id = v_rec and status <> 'ended';
    if v_active + coalesce(array_length(v_patients, 1), 0) > (select capacity from recurrences where id = v_rec) then
      raise exception 'O horário fixo de % às % já está lotado (% de % vagas).',
        (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[v_wd + 1], to_char(v_start, 'HH24:MI'),
        v_active, (select capacity from recurrences where id = v_rec);
    end if;

    foreach v_pid in array v_patients loop
      if not exists (select 1 from patients where id = v_pid and organization_id = v_org) then raise exception 'Aluno inválido.'; end if;
      insert into recurrence_members (organization_id, recurrence_id, patient_id, subscription_id, starts_on)
      values (v_org, v_rec, v_pid, coalesce((p ->> 'subscription_id')::uuid, private.active_subscription(v_pid, v_starts_on)), v_starts_on)
      on conflict do nothing;
      -- inclui o aluno nas ocorrências já geradas
      insert into appointment_participants (organization_id, appointment_id, patient_id, recurrence_member_id, created_by)
      select v_org, a.id, v_pid, (select id from recurrence_members where recurrence_id = v_rec and patient_id = v_pid and status <> 'ended'), auth.uid()
        from appointments a
       where a.recurrence_id = v_rec and a.occurrence_date >= v_starts_on and a.status = 'scheduled'
         and (select count(*) from appointment_participants x where x.appointment_id = a.id and x.status <> 'cancelled') < a.capacity
      on conflict (appointment_id, patient_id) do nothing;
    end loop;

    perform private.generate_recurrence(v_rec, (now() at time zone v_tz)::date + (private.schedule_rules(v_org) ->> 'recurrence_horizon_days')::int);
    v_ids := v_ids || v_rec;
  end loop;
  return v_ids;
end $$;

-- Pausar/encerrar participação de um aluno em horário fixo
create or replace function public.update_recurrence_member(
  p_member_id uuid, p_action text, p_from date, p_until date default null
) returns int
language plpgsql security definer set search_path = public as $$
declare m recurrence_members%rowtype; v_count int; v_tz text;
begin
  select * into m from recurrence_members where id = p_member_id for update;
  if not found then raise exception 'Horário fixo não encontrado.'; end if;
  perform private.require_permission(m.organization_id, 'schedule.edit');
  v_tz := private.org_tz(m.organization_id);
  if p_action = 'pause' then
    if p_until is null or p_until < p_from then raise exception 'Informe o período da pausa.'; end if;
    update recurrence_members set status = 'paused', paused_from = p_from, paused_until = p_until where id = m.id;
  elsif p_action = 'resume' then
    update recurrence_members set status = 'active', paused_from = null, paused_until = null where id = m.id;
    return 0;
  elsif p_action = 'end' then
    update recurrence_members set status = 'ended', ends_on = p_from - 1 where id = m.id;
  else
    raise exception 'Ação inválida.';
  end if;

  update appointment_participants ap set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = case p_action when 'pause' then 'Horário fixo pausado' else 'Horário fixo encerrado' end,
         cancelled_with_notice = true
    from appointments a
   where a.id = ap.appointment_id and ap.recurrence_member_id = m.id and ap.status in ('scheduled','confirmed')
     and a.occurrence_date >= p_from and (p_action = 'end' or a.occurrence_date <= p_until);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Pausar / retomar uma recorrência inteira (turma)
create or replace function public.pause_recurrence(p_recurrence_id uuid, p_from date, p_until date) returns int
language plpgsql security definer set search_path = public as $$
declare r recurrences%rowtype; v_count int := 0; occ record;
begin
  select * into r from recurrences where id = p_recurrence_id for update;
  if not found then raise exception 'Recorrência não encontrada.'; end if;
  perform private.require_permission(r.organization_id, 'schedule.edit');
  if p_until < p_from then raise exception 'Período inválido.'; end if;
  update recurrences set status = 'paused', paused_from = p_from, paused_until = p_until where id = r.id;
  for occ in select id from appointments where recurrence_id = r.id and occurrence_date between p_from and p_until and status = 'scheduled' loop
    update appointment_participants set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
           cancel_reason = 'Horário pausado', cancelled_with_notice = true
     where appointment_id = occ.id and status in ('scheduled','confirmed','replacement');
    update appointments set status = 'cancelled', cancel_reason = 'Horário pausado', cancel_reason_kind = 'clinic', cancelled_at = now()
     where id = occ.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.resume_recurrence(p_recurrence_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r recurrences%rowtype;
begin
  select * into r from recurrences where id = p_recurrence_id;
  perform private.require_permission(r.organization_id, 'schedule.edit');
  update recurrences set status = 'active', paused_from = null, paused_until = null where id = r.id;
  perform private.generate_recurrence(r.id, (now() at time zone private.org_tz(r.organization_id))::date
    + (private.schedule_rules(r.organization_id) ->> 'recurrence_horizon_days')::int);
end $$;

-- Expira créditos vencidos (cron diário)
create or replace function public.expire_replacement_credits() returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update replacement_credits set status = 'expired' where status = 'available' and expires_at < now();
  get diagnostics v = row_count;
  return v;
end $$;
revoke execute on function public.expire_replacement_credits() from public, anon, authenticated;
