-- =====================================================================
-- PilatesFlow — 0012 Dashboard, relatórios, risco de evasão, fluxo de caixa e busca global
-- Todas as funções verificam permissões; números financeiros só para quem tem finance.view.
-- =====================================================================

-- Views (security_invoker: respeitam o RLS do usuário)
create or replace view public.v_receivables with (security_invoker = true) as
select ar.*,
       (ar.amount - ar.discount + ar.surcharge - ar.amount_paid)::numeric(12,2) as open_amount,
       greatest((now() at time zone o.timezone)::date - ar.due_date, 0) as days_overdue,
       p.full_name as patient_name, p.phone as patient_phone, p.whatsapp as patient_whatsapp, p.email as patient_email,
       fc.name as category_name
  from public.accounts_receivable ar
  join public.organizations o on o.id = ar.organization_id
  left join public.patients p on p.id = ar.patient_id
  left join public.financial_categories fc on fc.id = ar.category_id;

create or replace view public.v_payables with (security_invoker = true) as
select ap.*, s.trade_name as supplier_trade_name, s.legal_name as supplier_name, fc.name as category_name,
       greatest((now() at time zone o.timezone)::date - ap.due_date, 0) as days_overdue
  from public.accounts_payable ap
  join public.organizations o on o.id = ap.organization_id
  left join public.suppliers s on s.id = ap.supplier_id
  left join public.financial_categories fc on fc.id = ap.category_id
 where ap.deleted_at is null;

grant select on public.v_receivables, public.v_payables to authenticated;

-- ---------------------------------------------------------------------
-- Dashboard: indicadores
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(p_org uuid, p_unit uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := private.org_tz(p_org);
  v_today date := (now() at time zone v_tz)::date;
  v_from timestamptz := p_from::timestamp at time zone v_tz;
  v_to timestamptz := (p_to + 1)::timestamp at time zone v_tz;
  v_fin boolean := public.has_permission(p_org, 'finance.view');
  v jsonb;
  v_revenue numeric; v_expense numeric; v_payers int; v_due numeric; v_overdue numeric;
begin
  if not public.has_permission(p_org, 'dashboard.view') then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_unit is not null and not public.has_unit_access(p_org, p_unit) then raise exception 'Sem acesso à unidade.' using errcode = '42501'; end if;

  select jsonb_build_object(
    'active_patients', count(*) filter (where status = 'active'),
    'inactive_patients', count(*) filter (where status in ('inactive','cancelled')),
    'paused_patients', count(*) filter (where status = 'paused'),
    'trial_patients', count(*) filter (where status = 'trial'),
    'new_patients', count(*) filter (where created_at >= v_from and created_at < v_to and status <> 'lead')
  ) into v from patients where organization_id = p_org and deleted_at is null and (p_unit is null or unit_id = p_unit);

  v := v || (select jsonb_build_object(
    'classes_today', count(*) filter (where (starts_at at time zone v_tz)::date = v_today),
    'classes_week', count(*) filter (where (starts_at at time zone v_tz)::date between v_today - extract(dow from v_today)::int
                                                                         and v_today - extract(dow from v_today)::int + 6)
  ) from appointments where organization_id = p_org and status <> 'cancelled' and (p_unit is null or unit_id = p_unit)
       and starts_at between ((v_today - 7)::timestamp at time zone v_tz) and ((v_today + 8)::timestamp at time zone v_tz));

  v := v || (select jsonb_build_object(
    'occupancy_rate', case when sum(a.capacity) > 0 then round(100.0 * sum(
        (select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled')) / sum(a.capacity), 1) end
  ) from appointments a where a.organization_id = p_org and a.status <> 'cancelled' and (p_unit is null or a.unit_id = p_unit)
       and a.starts_at >= v_from and a.starts_at < v_to);

  v := v || (select jsonb_build_object(
    'presences', count(*) filter (where ap.status in ('present','completed')),
    'absences', count(*) filter (where ap.status = 'absent'),
    'cancellations', count(*) filter (where ap.status = 'cancelled')
  ) from appointment_participants ap join appointments a on a.id = ap.appointment_id
     where a.organization_id = p_org and (p_unit is null or a.unit_id = p_unit) and a.starts_at >= v_from and a.starts_at < v_to);

  v := v || jsonb_build_object('pending_replacements', (
    select count(*) from replacement_credits rc join patients p on p.id = rc.patient_id
     where rc.organization_id = p_org and rc.status = 'available' and (rc.expires_at is null or rc.expires_at > now())
       and (p_unit is null or p.unit_id = p_unit)));

  if v_fin then
    select coalesce(sum(amount) filter (where status = 'confirmed'), 0), count(distinct patient_id) filter (where status = 'confirmed')
      into v_revenue, v_payers
      from payments where organization_id = p_org and (p_unit is null or unit_id = p_unit) and paid_at >= v_from and paid_at < v_to;
    select coalesce(sum(amount) filter (where type = 'out'), 0) - coalesce(sum(amount) filter (where type = 'out' and source = 'refund'), 0)
      into v_expense
      from cash_movements where organization_id = p_org and (p_unit is null or unit_id = p_unit) and occurred_on between p_from and p_to;
    select coalesce(sum(amount - discount + surcharge), 0) into v_due from accounts_receivable
     where organization_id = p_org and (p_unit is null or unit_id = p_unit) and status <> 'cancelled' and due_date between p_from and least(p_to, v_today);
    select coalesce(sum(amount - discount + surcharge - amount_paid), 0) into v_overdue from accounts_receivable
     where organization_id = p_org and (p_unit is null or unit_id = p_unit) and status in ('overdue','partial','pending') and due_date < v_today;
    v := v || jsonb_build_object(
      'revenue', v_revenue,
      'expenses', v_expense,
      'result', v_revenue - v_expense,
      'average_ticket', case when v_payers > 0 then round(v_revenue / v_payers, 2) end,
      'overdue_amount', v_overdue,
      'overdue_count', (select count(*) from accounts_receivable where organization_id = p_org and (p_unit is null or unit_id = p_unit)
                          and status in ('overdue','partial','pending') and due_date < v_today),
      'receivable_open', (select coalesce(sum(amount - discount + surcharge - amount_paid), 0) from accounts_receivable
                           where organization_id = p_org and (p_unit is null or unit_id = p_unit) and status in ('pending','overdue','partial')),
      'payable_open', (select coalesce(sum(amount), 0) from accounts_payable where organization_id = p_org and deleted_at is null
                         and (p_unit is null or unit_id = p_unit) and status in ('pending','overdue')),
      'default_rate', case when v_due > 0 then round(100.0 * (select coalesce(sum(amount - discount + surcharge - amount_paid), 0)
                         from accounts_receivable where organization_id = p_org and (p_unit is null or unit_id = p_unit)
                          and status in ('overdue','partial','pending') and due_date between p_from and least(p_to, v_today - 1)) / v_due, 1) end
    );
  end if;
  return v || jsonb_build_object('finance_visible', v_fin, 'from', p_from, 'to', p_to);
end $$;

-- Séries mensais para gráficos
create or replace function public.dashboard_charts(p_org uuid, p_unit uuid, p_months int default 12) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := private.org_tz(p_org); v_fin boolean := public.has_permission(p_org, 'finance.view');
  v_start date := (date_trunc('month', now() at time zone v_tz) - make_interval(months => greatest(p_months, 1) - 1))::date;
begin
  if not public.has_permission(p_org, 'dashboard.view') then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'monthly', (select jsonb_agg(row_to_json(m) order by m.month) from (
      select to_char(mo, 'YYYY-MM') as month,
        case when v_fin then (select coalesce(sum(amount), 0) from payments where organization_id = p_org and status = 'confirmed'
              and (p_unit is null or unit_id = p_unit) and (paid_at at time zone v_tz)::date >= mo and (paid_at at time zone v_tz)::date < mo + interval '1 month') end as revenue,
        case when v_fin then (select coalesce(sum(amount), 0) from cash_movements where organization_id = p_org and type = 'out' and source <> 'refund'
              and (p_unit is null or unit_id = p_unit) and occurred_on >= mo and occurred_on < mo + interval '1 month') end as expenses,
        (select count(*) from patients where organization_id = p_org and deleted_at is null and status <> 'lead' and (p_unit is null or unit_id = p_unit)
              and (created_at at time zone v_tz)::date >= mo and (created_at at time zone v_tz)::date < mo + interval '1 month') as new_patients,
        (select count(*) from subscriptions where organization_id = p_org and status = 'cancelled' and (p_unit is null or unit_id = p_unit)
              and (cancelled_at at time zone v_tz)::date >= mo and (cancelled_at at time zone v_tz)::date < mo + interval '1 month') as cancellations,
        (select round(100.0 * count(*) filter (where ap.status in ('present','completed')) / nullif(count(*) filter (where ap.status in ('present','completed','absent')), 0), 1)
           from appointment_participants ap join appointments a on a.id = ap.appointment_id
          where a.organization_id = p_org and (p_unit is null or a.unit_id = p_unit)
            and (a.starts_at at time zone v_tz)::date >= mo and (a.starts_at at time zone v_tz)::date < mo + interval '1 month') as attendance_rate,
        (select round(100.0 * sum((select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled')) / nullif(sum(a.capacity), 0), 1)
           from appointments a where a.organization_id = p_org and a.status <> 'cancelled' and (p_unit is null or a.unit_id = p_unit)
            and (a.starts_at at time zone v_tz)::date >= mo and (a.starts_at at time zone v_tz)::date < mo + interval '1 month') as occupancy_rate,
        case when v_fin then (select round(100.0 * coalesce(sum(amount - discount + surcharge - amount_paid) filter (where status in ('overdue','partial','pending') and due_date < (now() at time zone v_tz)::date), 0)
              / nullif(sum(amount - discount + surcharge), 0), 1)
           from accounts_receivable where organization_id = p_org and status <> 'cancelled' and (p_unit is null or unit_id = p_unit)
            and due_date >= mo and due_date < mo + interval '1 month') end as default_rate,
        (select count(*) from subscriptions s where s.organization_id = p_org and (p_unit is null or s.unit_id = p_unit)
            and s.start_date < mo and (s.end_date is null or s.end_date >= mo) and (s.cancelled_at is null or (s.cancelled_at at time zone v_tz)::date >= mo)
            and s.status in ('active','paused','cancelled','expired')) as active_at_start,
        (select count(*) from subscriptions s where s.organization_id = p_org and (p_unit is null or s.unit_id = p_unit)
            and ((s.status = 'cancelled' and (s.cancelled_at at time zone v_tz)::date >= mo and (s.cancelled_at at time zone v_tz)::date < mo + interval '1 month')
              or (s.status = 'expired' and s.end_date >= mo and s.end_date < mo + interval '1 month'
                  and not exists (select 1 from subscriptions n where n.renewed_from_id = s.id or (n.patient_id = s.patient_id and n.start_date > s.start_date))))) as churned
      from generate_series(v_start, date_trunc('month', now() at time zone v_tz)::date, interval '1 month') mo
    ) m),
    'occupancy_by_hour', (select coalesce(jsonb_agg(row_to_json(h) order by h.hour), '[]') from (
      select extract(hour from a.starts_at at time zone v_tz)::int as hour,
             round(100.0 * sum((select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled')) / nullif(sum(a.capacity), 0), 1) as occupancy,
             count(*) as sessions
        from appointments a where a.organization_id = p_org and a.status <> 'cancelled' and (p_unit is null or a.unit_id = p_unit)
         and a.starts_at >= now() - interval '30 days' and a.starts_at < now() + interval '7 days'
       group by 1) h),
    'occupancy_by_staff', (select coalesce(jsonb_agg(row_to_json(s) order by s.occupancy desc nulls last), '[]') from (
      select st.full_name as staff, count(*) as sessions,
             round(100.0 * sum((select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled')) / nullif(sum(a.capacity), 0), 1) as occupancy
        from appointments a join staff st on st.id = a.staff_id
       where a.organization_id = p_org and a.status <> 'cancelled' and (p_unit is null or a.unit_id = p_unit)
         and a.starts_at >= now() - interval '30 days' and a.starts_at < now() + interval '7 days'
       group by st.full_name) s)
  );
end $$;

-- Listas de atenção do dashboard
create or replace function public.dashboard_lists(p_org uuid, p_unit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := private.org_tz(p_org); v_today date := (now() at time zone v_tz)::date; v jsonb := '{}'::jsonb;
begin
  if not public.has_permission(p_org, 'dashboard.view') then raise exception 'Acesso negado.' using errcode = '42501'; end if;

  if public.has_permission(p_org, 'patients.view') then
    v := v || jsonb_build_object('birthdays', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name,
        'date', to_char(birth_date, 'DD/MM'), 'whatsapp', whatsapp) order by next_bd), '[]') from (
        select *, make_date(extract(year from v_today)::int, extract(month from birth_date)::int,
                            least(extract(day from birth_date)::int, 28)) as next_bd
          from patients where organization_id = p_org and deleted_at is null and status in ('active','paused','trial')
           and birth_date is not null and (p_unit is null or unit_id = p_unit)) b
        where (to_char(b.birth_date, 'MMDD') between to_char(v_today, 'MMDD') and to_char(v_today + 7, 'MMDD'))
           or (to_char(v_today, 'MMDD') > to_char(v_today + 7, 'MMDD')
               and (to_char(b.birth_date, 'MMDD') >= to_char(v_today, 'MMDD') or to_char(b.birth_date, 'MMDD') <= to_char(v_today + 7, 'MMDD')))));

    v := v || jsonb_build_object('frequent_absences', (select coalesce(jsonb_agg(x order by (x ->> 'absences')::int desc), '[]') from (
        select jsonb_build_object('id', p.id, 'name', p.full_name, 'absences', count(*)) as x
          from appointment_participants ap join appointments a on a.id = ap.appointment_id join patients p on p.id = ap.patient_id
         where a.organization_id = p_org and ap.status = 'absent' and a.starts_at >= now() - interval '30 days'
           and (p_unit is null or a.unit_id = p_unit)
         group by p.id, p.full_name having count(*) >= 3 limit 10) t));
  end if;

  if public.has_permission(p_org, 'finance.view') then
    v := v || jsonb_build_object('overdue_payments', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'patient_id', patient_id,
        'name', patient_name, 'amount', open_amount, 'due_date', due_date, 'days', days_overdue, 'whatsapp', patient_whatsapp)
        order by due_date), '[]') from (
        select * from v_receivables where organization_id = p_org and status in ('overdue','partial','pending') and due_date < v_today
           and (p_unit is null or unit_id = p_unit) order by due_date limit 8) r));
  end if;

  if public.has_permission(p_org, 'contracts.view') then
    v := v || jsonb_build_object('contracts_expiring', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'patient_id', c.patient_id,
        'name', p.full_name, 'end_date', c.end_date) order by c.end_date), '[]')
        from contracts c join patients p on p.id = c.patient_id
       where c.organization_id = p_org and c.status in ('sent','accepted') and c.end_date between v_today and v_today + 30
         and (p_unit is null or c.unit_id = p_unit)));
  end if;

  if public.has_permission(p_org, 'plans.view') then
    v := v || jsonb_build_object('plans_expiring', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'patient_id', s.patient_id,
        'name', p.full_name, 'plan', pl.name, 'end_date', s.end_date, 'auto_renew', s.auto_renew,
        'sessions_left', case when s.sessions_total is not null then s.sessions_total + s.sessions_extra - s.sessions_used end)
        order by s.end_date), '[]')
        from subscriptions s join patients p on p.id = s.patient_id join plans pl on pl.id = s.plan_id
       where s.organization_id = p_org and s.status = 'active' and (p_unit is null or s.unit_id = p_unit)
         and ((s.end_date between v_today and v_today + 15 and not s.auto_renew)
              or (s.sessions_total is not null and s.sessions_total + s.sessions_extra - s.sessions_used <= 2))));
  end if;

  if public.has_permission(p_org, 'assessments.view') then
    v := v || jsonb_build_object('reassessment_due', (select coalesce(jsonb_agg(jsonb_build_object('id', r.patient_id, 'name', r.full_name,
        'last', r.last_assessment, 'days', r.days_since)), '[]') from public.patients_due_reassessment(p_org, 8) r));
  end if;

  if public.has_permission(p_org, 'equipment.view') then
    v := v || jsonb_build_object('maintenance_due', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name,
        'date', next_maintenance_date) order by next_maintenance_date), '[]')
        from equipment where organization_id = p_org and deleted_at is null and status <> 'inactive'
         and next_maintenance_date <= v_today + 15 and (p_unit is null or unit_id = p_unit)));
  end if;

  if public.has_permission(p_org, 'crm.view') then
    v := v || jsonb_build_object('leads_waiting', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stage', stage,
        'next_contact_at', next_contact_at, 'created_at', created_at, 'phone', coalesce(whatsapp, phone)) order by coalesce(next_contact_at, created_at)), '[]')
        from (select * from leads where organization_id = p_org and deleted_at is null and (p_unit is null or unit_id = p_unit or unit_id is null)
                and (stage = 'new' or (next_contact_at is not null and next_contact_at <= now() and stage not in ('enrolled','lost')))
               order by coalesce(next_contact_at, created_at) limit 10) l));
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Risco de evasão (regras transparentes; apenas indicativo, sem ações automáticas)
-- ---------------------------------------------------------------------
create or replace function public.patient_risk(p_org uuid, p_unit uuid default null, p_patient uuid default null)
returns table (patient_id uuid, full_name text, level text, score int, reasons jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := private.org_tz(p_org); v_today date := (now() at time zone v_tz)::date;
begin
  if not public.has_permission(p_org, 'patients.view') then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query
  with base as (
    select p.id, p.full_name,
      (select count(*) from appointment_participants ap join appointments a on a.id = ap.appointment_id
        where ap.patient_id = p.id and ap.status = 'absent' and a.starts_at >= now() - interval '30 days') as absences_30,
      (select count(*) from appointment_participants ap join appointments a on a.id = ap.appointment_id
        where ap.patient_id = p.id and ap.status in ('present','completed') and a.starts_at >= now() - interval '30 days') as att_30,
      (select count(*) from appointment_participants ap join appointments a on a.id = ap.appointment_id
        where ap.patient_id = p.id and ap.status in ('present','completed') and a.starts_at >= now() - interval '60 days'
          and a.starts_at < now() - interval '30 days') as att_prev_30,
      exists (select 1 from appointment_participants ap join appointments a on a.id = ap.appointment_id
        where ap.patient_id = p.id and ap.status in ('scheduled','confirmed','replacement') and a.starts_at > now()) as has_future,
      (select max(a.starts_at) from appointment_participants ap join appointments a on a.id = ap.appointment_id
        where ap.patient_id = p.id and ap.status in ('present','completed')) as last_attendance,
      (select s.end_date from subscriptions s where s.patient_id = p.id and s.status = 'active' order by s.end_date desc nulls first limit 1) as plan_end,
      (select bool_or(not s.auto_renew) from subscriptions s where s.patient_id = p.id and s.status = 'active') as no_renew,
      exists (select 1 from accounts_receivable r where r.patient_id = p.id and r.status in ('overdue','partial') and r.due_date < v_today) as overdue
    from patients p
    where p.organization_id = p_org and p.status = 'active' and p.deleted_at is null
      and (p_unit is null or p.unit_id = p_unit) and (p_patient is null or p.id = p_patient)
  ), scored as (
    select b.*,
      (case when absences_30 >= 3 then 3 when absences_30 = 2 then 1 else 0 end)
      + (case when att_prev_30 >= 4 and att_30 <= att_prev_30 / 2 then 2 else 0 end)
      + (case when not has_future then 2 else 0 end)
      + (case when plan_end is not null and plan_end <= v_today + 15 and coalesce(no_renew, false) then 2 else 0 end)
      + (case when overdue then 2 else 0 end)
      + (case when last_attendance is null or last_attendance < now() - interval '21 days' then 3 else 0 end) as sc,
      array_remove(array[
        case when absences_30 >= 2 then format('%s faltas nos últimos 30 dias', absences_30) end,
        case when att_prev_30 >= 4 and att_30 <= att_prev_30 / 2 then format('Frequência caiu de %s para %s aulas (30 dias)', att_prev_30, att_30) end,
        case when not has_future then 'Nenhuma aula futura agendada' end,
        case when plan_end is not null and plan_end <= v_today + 15 and coalesce(no_renew, false) then 'Plano vence em ' || to_char(plan_end, 'DD/MM') || ' sem renovação automática' end,
        case when overdue then 'Pagamento em atraso' end,
        case when last_attendance is null then 'Nunca compareceu' when last_attendance < now() - interval '21 days'
             then format('%s dias sem comparecer', (v_today - (last_attendance at time zone v_tz)::date)) end
      ], null) as rs
    from base b
  )
  select s.id, s.full_name, case when s.sc >= 5 then 'Alto' when s.sc >= 3 then 'Médio' else 'Baixo' end, s.sc, to_jsonb(s.rs)
    from scored s order by s.sc desc, s.full_name;
end $$;

-- ---------------------------------------------------------------------
-- Fluxo de caixa (diário / mensal) com previsto x realizado
-- ---------------------------------------------------------------------
create or replace function public.cash_flow(p_org uuid, p_unit uuid, p_from date, p_to date, p_group text default 'day')
returns table (period date, opening numeric, inflow numeric, outflow numeric, closing numeric, forecast_in numeric, forecast_out numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_open numeric; v_trunc text := case when p_group = 'month' then 'month' when p_group = 'year' then 'year' else 'day' end;
begin
  if not public.has_permission(p_org, 'finance.view') then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select coalesce((select sum(opening_balance) from cash_accounts where organization_id = p_org and (p_unit is null or unit_id = p_unit)), 0)
       + coalesce((select sum(case when type = 'in' then amount else -amount end) from cash_movements
                    where organization_id = p_org and (p_unit is null or unit_id = p_unit) and occurred_on < p_from), 0)
    into v_open;
  return query
  with periods as (
    select generate_series(date_trunc(v_trunc, p_from::timestamp), date_trunc(v_trunc, p_to::timestamp), ('1 ' || v_trunc)::interval)::date as p
  ), mv as (
    select date_trunc(v_trunc, occurred_on::timestamp)::date as p,
           sum(amount) filter (where type = 'in') as i, sum(amount) filter (where type = 'out') as o
      from cash_movements where organization_id = p_org and (p_unit is null or unit_id = p_unit) and occurred_on between p_from and p_to
     group by 1
  ), fin as (
    select date_trunc(v_trunc, due_date::timestamp)::date as p, sum(amount - discount + surcharge - amount_paid) as v
      from accounts_receivable where organization_id = p_org and (p_unit is null or unit_id = p_unit)
       and status in ('pending','overdue','partial') and due_date between p_from and p_to group by 1
  ), fout as (
    select date_trunc(v_trunc, due_date::timestamp)::date as p, sum(amount) as v
      from accounts_payable where organization_id = p_org and deleted_at is null and (p_unit is null or unit_id = p_unit)
       and status in ('pending','overdue') and due_date between p_from and p_to group by 1
  ), joined as (
    select pr.p, coalesce(mv.i, 0) as i, coalesce(mv.o, 0) as o, coalesce(fin.v, 0) as fi, coalesce(fout.v, 0) as fo
      from periods pr left join mv on mv.p = pr.p left join fin on fin.p = pr.p left join fout on fout.p = pr.p
  )
  select j.p,
         v_open + coalesce(sum(j.i - j.o) over (order by j.p rows between unbounded preceding and 1 preceding), 0),
         j.i, j.o,
         v_open + sum(j.i - j.o) over (order by j.p rows between unbounded preceding and current row),
         j.fi, j.fo
    from joined j order by j.p;
end $$;

-- ---------------------------------------------------------------------
-- Relatórios
-- ---------------------------------------------------------------------
create or replace function public.report_schedule(p_org uuid, p_unit uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := private.org_tz(p_org);
  v_from timestamptz := p_from::timestamp at time zone v_tz; v_to timestamptz := (p_to + 1)::timestamp at time zone v_tz;
begin
  if not public.has_permission(p_org, 'reports.view') or not public.has_permission(p_org, 'schedule.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'totals', (select jsonb_build_object(
        'sessions', count(distinct a.id) filter (where a.status <> 'cancelled'),
        'cancelled_sessions', count(distinct a.id) filter (where a.status = 'cancelled'),
        'presences', count(ap.id) filter (where ap.status in ('present','completed')),
        'absences', count(ap.id) filter (where ap.status = 'absent'),
        'cancellations', count(ap.id) filter (where ap.status = 'cancelled'),
        'replacements', count(ap.id) filter (where ap.replacement_credit_id is not null and ap.status <> 'cancelled'))
      from appointments a left join appointment_participants ap on ap.appointment_id = a.id
     where a.organization_id = p_org and (p_unit is null or a.unit_id = p_unit) and a.starts_at >= v_from and a.starts_at < v_to),
    'by_slot', (select coalesce(jsonb_agg(row_to_json(x) order by x.weekday, x.hour), '[]') from (
        select extract(dow from a.starts_at at time zone v_tz)::int as weekday, extract(hour from a.starts_at at time zone v_tz)::int as hour,
               count(*) as sessions, sum(a.capacity) as capacity,
               sum((select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled')) as booked
          from appointments a where a.organization_id = p_org and a.status <> 'cancelled' and (p_unit is null or a.unit_id = p_unit)
           and a.starts_at >= v_from and a.starts_at < v_to group by 1, 2) x),
    'empty_sessions', (select count(*) from appointments a where a.organization_id = p_org and a.status <> 'cancelled'
        and (p_unit is null or a.unit_id = p_unit) and a.starts_at >= v_from and a.starts_at < v_to
        and not exists (select 1 from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled')),
    'full_sessions', (select count(*) from appointments a where a.organization_id = p_org and a.status <> 'cancelled'
        and (p_unit is null or a.unit_id = p_unit) and a.starts_at >= v_from and a.starts_at < v_to
        and (select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled') >= a.capacity),
    'by_service', (select coalesce(jsonb_agg(row_to_json(x)), '[]') from (
        select s.name as service, count(distinct a.id) as sessions,
               count(ap.id) filter (where ap.status in ('present','completed')) as presences,
               count(ap.id) filter (where ap.status = 'absent') as absences
          from appointments a join services s on s.id = a.service_id left join appointment_participants ap on ap.appointment_id = a.id
         where a.organization_id = p_org and a.status <> 'cancelled' and (p_unit is null or a.unit_id = p_unit)
           and a.starts_at >= v_from and a.starts_at < v_to group by s.name order by 2 desc) x)
  );
end $$;

create or replace function public.report_staff(p_org uuid, p_unit uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := private.org_tz(p_org);
  v_from timestamptz := p_from::timestamp at time zone v_tz; v_to timestamptz := (p_to + 1)::timestamp at time zone v_tz;
  v_comm boolean := public.has_permission(p_org, 'commissions.view');
begin
  if not public.has_permission(p_org, 'reports.view') then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.sessions desc), '[]') from (
    select st.id, st.full_name as staff,
           count(distinct a.id) as sessions,
           round((select sum(extract(epoch from a2.ends_at - a2.starts_at)) / 3600.0 from appointments a2
                   where a2.staff_id = st.id and a2.status <> 'cancelled' and a2.starts_at >= v_from and a2.starts_at < v_to
                     and (p_unit is null or a2.unit_id = p_unit))::numeric, 1) as hours,
           count(ap.id) filter (where ap.status in ('present','completed')) as presences,
           count(ap.id) filter (where ap.status = 'absent') as absences,
           round(100.0 * count(ap.id) filter (where ap.status <> 'cancelled') / nullif(
             (select sum(capacity) from appointments a3 where a3.staff_id = st.id and a3.status <> 'cancelled'
               and a3.starts_at >= v_from and a3.starts_at < v_to and (p_unit is null or a3.unit_id = p_unit)), 0), 1) as occupancy,
           case when v_comm then (select coalesce(sum(c.amount), 0) from commissions c where c.staff_id = st.id and c.status <> 'cancelled'
                   and c.period_month between date_trunc('month', p_from)::date and date_trunc('month', p_to)::date) end as commissions
      from staff st
      join appointments a on a.staff_id = st.id and a.status <> 'cancelled' and a.starts_at >= v_from and a.starts_at < v_to
                          and (p_unit is null or a.unit_id = p_unit)
      left join appointment_participants ap on ap.appointment_id = a.id
     where st.organization_id = p_org
     group by st.id, st.full_name) x);
end $$;

create or replace function public.report_finance(p_org uuid, p_unit uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := private.org_tz(p_org);
  v_from timestamptz := p_from::timestamp at time zone v_tz; v_to timestamptz := (p_to + 1)::timestamp at time zone v_tz;
begin
  if not public.has_permission(p_org, 'reports.view') or not public.has_permission(p_org, 'finance.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'revenue', (select coalesce(sum(amount), 0) from payments where organization_id = p_org and status = 'confirmed'
                  and (p_unit is null or unit_id = p_unit) and paid_at >= v_from and paid_at < v_to),
    'expenses', (select coalesce(sum(amount), 0) from cash_movements where organization_id = p_org and type = 'out' and source <> 'refund'
                  and (p_unit is null or unit_id = p_unit) and occurred_on between p_from and p_to),
    'refunds', (select coalesce(sum(amount), 0) from cash_movements where organization_id = p_org and source = 'refund'
                  and (p_unit is null or unit_id = p_unit) and occurred_on between p_from and p_to),
    'receivable_open', (select coalesce(sum(amount - discount + surcharge - amount_paid), 0) from accounts_receivable
                  where organization_id = p_org and (p_unit is null or unit_id = p_unit) and status in ('pending','overdue','partial')),
    'payable_open', (select coalesce(sum(amount), 0) from accounts_payable where organization_id = p_org and deleted_at is null
                  and (p_unit is null or unit_id = p_unit) and status in ('pending','overdue')),
    'by_category', (select coalesce(jsonb_agg(row_to_json(x) order by x.total desc), '[]') from (
        select coalesce(fc.name, 'Sem categoria') as category, cm.type, sum(cm.amount) as total
          from cash_movements cm left join financial_categories fc on fc.id = cm.category_id
         where cm.organization_id = p_org and (p_unit is null or cm.unit_id = p_unit) and cm.occurred_on between p_from and p_to
           and cm.source <> 'refund'
         group by 1, 2) x),
    'by_method', (select coalesce(jsonb_agg(row_to_json(x) order by x.total desc), '[]') from (
        select method, count(*) as payments, sum(amount) as total from payments
         where organization_id = p_org and status = 'confirmed' and (p_unit is null or unit_id = p_unit) and paid_at >= v_from and paid_at < v_to
         group by method) x),
    'by_plan', (select coalesce(jsonb_agg(row_to_json(x) order by x.total desc), '[]') from (
        select coalesce(pl.name, 'Avulsos / outros') as plan, sum(pm.amount) as total
          from payments pm left join accounts_receivable ar on ar.id = pm.receivable_id
          left join subscriptions s on s.id = ar.subscription_id left join plans pl on pl.id = s.plan_id
         where pm.organization_id = p_org and pm.status = 'confirmed' and (p_unit is null or pm.unit_id = p_unit)
           and pm.paid_at >= v_from and pm.paid_at < v_to group by 1) x),
    'by_unit', (select coalesce(jsonb_agg(row_to_json(x) order by x.total desc), '[]') from (
        select coalesce(u.name, 'Sem unidade') as unit, sum(pm.amount) as total
          from payments pm left join units u on u.id = pm.unit_id
         where pm.organization_id = p_org and pm.status = 'confirmed' and pm.paid_at >= v_from and pm.paid_at < v_to group by 1) x),
    -- Receita por profissional: valor da sessão (preço do plano ÷ aulas do plano) × aulas atendidas no período
    'by_staff', (select coalesce(jsonb_agg(row_to_json(x) order by x.total desc), '[]') from (
        select st.full_name as staff, count(*) as attended,
               round(sum(case when s.sessions_total > 0 then s.price * (1 - s.discount_percent / 100.0) / s.sessions_total else coalesce(sv.price, 0) end), 2) as total
          from appointment_participants ap join appointments a on a.id = ap.appointment_id
          join staff st on st.id = a.staff_id join services sv on sv.id = a.service_id
          left join subscriptions s on s.id = ap.subscription_id
         where a.organization_id = p_org and ap.status in ('present','completed') and (p_unit is null or a.unit_id = p_unit)
           and a.starts_at >= v_from and a.starts_at < v_to group by st.full_name) x),
    'default', (select jsonb_build_object(
        'overdue_amount', coalesce(sum(amount - discount + surcharge - amount_paid), 0), 'overdue_count', count(*))
        from accounts_receivable where organization_id = p_org and (p_unit is null or unit_id = p_unit)
         and status in ('overdue','partial','pending') and due_date < (now() at time zone v_tz)::date)
  );
end $$;

create or replace function public.report_marketing(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text := private.org_tz(p_org);
  v_from timestamptz := p_from::timestamp at time zone v_tz; v_to timestamptz := (p_to + 1)::timestamp at time zone v_tz;
begin
  if not public.has_permission(p_org, 'reports.view') or not public.has_permission(p_org, 'crm.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'leads', (select count(*) from leads where organization_id = p_org and deleted_at is null and created_at >= v_from and created_at < v_to),
    'by_origin', (select coalesce(jsonb_agg(row_to_json(x) order by x.leads desc), '[]') from (
        select origin, count(*) as leads, count(*) filter (where stage = 'enrolled') as enrolled,
               round(100.0 * count(*) filter (where stage = 'enrolled') / nullif(count(*), 0), 1) as conversion,
               round(avg(acquisition_cost), 2) as avg_cost
          from leads where organization_id = p_org and deleted_at is null and created_at >= v_from and created_at < v_to group by origin) x),
    'by_stage', (select coalesce(jsonb_object_agg(stage, n), '{}') from (
        select stage, count(*) as n from leads where organization_id = p_org and deleted_at is null and created_at >= v_from and created_at < v_to group by stage) x),
    'trials', (select jsonb_build_object(
        'scheduled', count(*) filter (where trial_appointment_id is not null),
        'attended', count(*) filter (where trial_attended),
        'converted', count(*) filter (where trial_attended and stage = 'enrolled'),
        'conversion_rate', round(100.0 * count(*) filter (where trial_attended and stage = 'enrolled') / nullif(count(*) filter (where trial_attended), 0), 1))
        from leads where organization_id = p_org and deleted_at is null and created_at >= v_from and created_at < v_to),
    'lost_reasons', (select coalesce(jsonb_agg(row_to_json(x) order by x.n desc), '[]') from (
        select coalesce(lost_reason, 'Não informado') as reason, count(*) as n from leads
         where organization_id = p_org and stage = 'lost' and deleted_at is null and stage_changed_at >= v_from and stage_changed_at < v_to group by 1) x),
    'cost_per_acquisition', (select round(sum(acquisition_cost) / nullif(count(*) filter (where stage = 'enrolled'), 0), 2)
        from leads where organization_id = p_org and deleted_at is null and acquisition_cost is not null and created_at >= v_from and created_at < v_to)
  );
end $$;

-- ---------------------------------------------------------------------
-- Busca global (respeita permissões)
-- ---------------------------------------------------------------------
create or replace function public.search_global(p_org uuid, p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := trim(coalesce(p_q, '')); v_digits text := private.only_digits(p_q); v jsonb := '[]'::jsonb;
  v_like text := '%' || public.f_unaccent(lower(trim(coalesce(p_q, '')))) || '%';
begin
  if length(v_q) < 2 or not public.is_org_member(p_org) then return v; end if;
  if public.has_permission(p_org, 'patients.view') then
    v := v || (select coalesce(jsonb_agg(jsonb_build_object('type', 'patient', 'id', id, 'title', full_name,
              'subtitle', concat_ws(' · ', coalesce(whatsapp, phone), case status when 'active' then 'Ativo' when 'trial' then 'Experimental'
                when 'paused' then 'Pausado' when 'inactive' then 'Inativo' when 'cancelled' then 'Cancelado' else 'Lead' end),
              'href', '/app/alunos/' || id)), '[]')
       from (select * from patients where organization_id = p_org and deleted_at is null and public.has_unit_access(p_org, unit_id)
               and (public.f_unaccent(lower(full_name)) like v_like or public.f_unaccent(lower(coalesce(social_name, ''))) like v_like
                    or lower(coalesce(email, '')) like v_like
                    or (length(v_digits) >= 4 and (private.only_digits(phone) like '%' || v_digits || '%'
                        or private.only_digits(whatsapp) like '%' || v_digits || '%' or private.only_digits(cpf) like v_digits || '%')))
              order by status = 'active' desc, full_name limit 8) p);
  end if;
  if public.has_permission(p_org, 'staff.view') or public.has_permission(p_org, 'schedule.view') then
    v := v || (select coalesce(jsonb_agg(jsonb_build_object('type', 'staff', 'id', id, 'title', full_name, 'subtitle', profession,
              'href', '/app/equipe/' || id)), '[]')
       from (select * from staff where organization_id = p_org and deleted_at is null
               and public.f_unaccent(lower(full_name)) like v_like order by full_name limit 5) s);
  end if;
  if public.has_permission(p_org, 'crm.view') then
    v := v || (select coalesce(jsonb_agg(jsonb_build_object('type', 'lead', 'id', id, 'title', name, 'subtitle', 'Lead',
              'href', '/app/crm?lead=' || id)), '[]')
       from (select * from leads where organization_id = p_org and deleted_at is null and patient_id is null
               and (public.f_unaccent(lower(name)) like v_like or (length(v_digits) >= 4 and private.only_digits(phone) like '%' || v_digits || '%'))
              limit 5) l);
  end if;
  if public.has_permission(p_org, 'schedule.view') then
    v := v || (select coalesce(jsonb_agg(jsonb_build_object('type', 'appointment', 'id', a.id,
              'title', p.full_name || ' — ' || s.name,
              'subtitle', to_char(a.starts_at at time zone private.org_tz(p_org), 'DD/MM/YYYY HH24:MI'),
              'href', '/app/agenda?data=' || to_char(a.starts_at at time zone private.org_tz(p_org), 'YYYY-MM-DD') || '&ag=' || a.id)), '[]')
       from (select * from appointments where organization_id = p_org and status <> 'cancelled'
               and starts_at between now() - interval '30 days' and now() + interval '60 days') a
       join appointment_participants ap on ap.appointment_id = a.id and ap.status <> 'cancelled'
       join patients p on p.id = ap.patient_id join services s on s.id = a.service_id
      where public.f_unaccent(lower(p.full_name)) like v_like
      limit 5);
  end if;
  if public.has_permission(p_org, 'finance.view') and length(v_digits) > 0 then
    v := v || (select coalesce(jsonb_agg(jsonb_build_object('type', 'payment', 'id', pm.id,
              'title', 'Recibo nº ' || pm.receipt_number || ' — ' || coalesce(p.full_name, ''),
              'subtitle', 'R$ ' || to_char(pm.amount, 'FM999G990D00'), 'href', '/app/financeiro/receber?pagamento=' || pm.id)), '[]')
       from payments pm left join patients p on p.id = pm.patient_id
      where pm.organization_id = p_org and pm.receipt_number::text = v_digits limit 3);
  end if;
  if public.has_permission(p_org, 'documents.view') then
    v := v || (select coalesce(jsonb_agg(jsonb_build_object('type', 'document', 'id', d.id, 'title', d.title, 'subtitle', 'Documento',
              'href', '/app/documentos?doc=' || d.id)), '[]')
       from (select * from documents where organization_id = p_org and deleted_at is null
               and (not is_clinical or public.has_permission(p_org, 'medical_records.view'))
               and public.f_unaccent(lower(title)) like v_like limit 5) d);
  end if;
  return v;
end $$;
