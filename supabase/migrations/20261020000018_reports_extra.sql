-- =====================================================================
-- Relatórios administrativos complementares
-- =====================================================================

-- Alunos ativos sem plano/assinatura ativa
create or replace function public.report_patients_without_plan(p_org uuid, p_unit uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission(p_org, 'reports.view') or not public.has_permission(p_org, 'patients.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.full_name), '[]') from (
    select p.id, p.full_name, coalesce(p.whatsapp, p.phone) as phone,
           (select pl.name from subscriptions s join plans pl on pl.id = s.plan_id where s.patient_id = p.id order by s.start_date desc limit 1) as last_plan,
           (select coalesce(s.end_date, (s.cancelled_at)::date) from subscriptions s where s.patient_id = p.id order by s.start_date desc limit 1) as last_end,
           (select max(a.starts_at) from appointment_participants ap join appointments a on a.id = ap.appointment_id
             where ap.patient_id = p.id and ap.status in ('present','completed')) as last_attendance
      from patients p
     where p.organization_id = p_org and p.deleted_at is null and p.status = 'active'
       and (p_unit is null or p.unit_id = p_unit)
       and not exists (select 1 from subscriptions s where s.patient_id = p.id and s.status in ('active','paused','pending'))) x);
end $$;

-- Visão administrativa: alunos por status, origem, faixa etária, aniversariantes do mês, planos ativos
create or replace function public.report_admin(p_org uuid, p_unit uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := private.org_tz(p_org); v_today date := (now() at time zone v_tz)::date;
  v_from timestamptz := p_from::timestamp at time zone v_tz; v_to timestamptz := (p_to + 1)::timestamp at time zone v_tz;
begin
  if not public.has_permission(p_org, 'reports.view') or not public.has_permission(p_org, 'patients.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
        select status, count(*) n from patients where organization_id = p_org and deleted_at is null
           and (p_unit is null or unit_id = p_unit) group by status) x),
    'by_origin', (select coalesce(jsonb_agg(row_to_json(x) order by x.n desc), '[]') from (
        select coalesce(origin, 'other') as origin, count(*) n from patients where organization_id = p_org and deleted_at is null
           and status <> 'lead' and (p_unit is null or unit_id = p_unit) and created_at >= v_from and created_at < v_to group by 1) x),
    'by_age', (select coalesce(jsonb_agg(row_to_json(x) order by x.ord), '[]') from (
        select case when age < 18 then 'Até 17' when age < 30 then '18–29' when age < 45 then '30–44' when age < 60 then '45–59'
                    when age < 75 then '60–74' else '75+' end as faixa,
               min(age) as ord, count(*) n
          from (select extract(year from age(v_today, birth_date))::int as age from patients
                 where organization_id = p_org and deleted_at is null and status = 'active' and birth_date is not null
                   and (p_unit is null or unit_id = p_unit)) a group by 1) x),
    'birthdays_month', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'day', extract(day from birth_date)::int,
         'whatsapp', whatsapp) order by extract(day from birth_date)), '[]')
        from patients where organization_id = p_org and deleted_at is null and status in ('active','paused','trial')
         and birth_date is not null and extract(month from birth_date) = extract(month from v_today) and (p_unit is null or unit_id = p_unit)),
    'active_by_plan', (select coalesce(jsonb_agg(row_to_json(x) order by x.n desc), '[]') from (
        select pl.name as plan, count(*) n from subscriptions s join plans pl on pl.id = s.plan_id
         where s.organization_id = p_org and s.status = 'active' and (p_unit is null or s.unit_id = p_unit) group by pl.name) x),
    'new_patients', (select count(*) from patients where organization_id = p_org and deleted_at is null and status <> 'lead'
         and (p_unit is null or unit_id = p_unit) and created_at >= v_from and created_at < v_to),
    'cancelled_subscriptions', (select count(*) from subscriptions where organization_id = p_org and status = 'cancelled'
         and (p_unit is null or unit_id = p_unit) and cancelled_at >= v_from and cancelled_at < v_to),
    'cancel_reasons', (select coalesce(jsonb_agg(row_to_json(x) order by x.n desc), '[]') from (
        select coalesce(nullif(trim(cancel_reason), ''), 'Não informado') as reason, count(*) n from subscriptions
         where organization_id = p_org and status = 'cancelled' and (p_unit is null or unit_id = p_unit)
           and cancelled_at >= v_from and cancelled_at < v_to group by 1) x)
  );
end $$;
