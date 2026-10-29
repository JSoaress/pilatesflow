-- =====================================================================
-- PilatesFlow — 0017 Portal: turmas lotadas (lista de espera) e lista de espera do aluno
-- =====================================================================
create or replace function public.portal_full_classes(p_patient_id uuid, p_service uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id); v_tz text := private.org_tz(pt.organization_id);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'staff_name', st.full_name,
            'waiting', (select count(*) from waitlist w where w.appointment_id = a.id and w.status in ('waiting','notified')),
            'on_list', exists (select 1 from waitlist w where w.appointment_id = a.id and w.patient_id = pt.id and w.status in ('waiting','notified')))
            order by a.starts_at), '[]')
    from appointments a left join staff st on st.id = a.staff_id
   where a.organization_id = pt.organization_id and a.service_id = p_service and a.status = 'scheduled'
     and (a.starts_at at time zone v_tz)::date = p_date and a.starts_at > now()
     and (select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled') >= a.capacity
     and not exists (select 1 from appointment_participants ap where ap.appointment_id = a.id and ap.patient_id = pt.id and ap.status <> 'cancelled'));
end $$;

create or replace function public.portal_join_waitlist(p_patient_id uuid, p_appointment_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id);
begin
  if not exists (select 1 from appointments where id = p_appointment_id and organization_id = pt.organization_id) then
    raise exception 'Horário não encontrado.';
  end if;
  return public.join_waitlist(p_appointment_id, pt.id);
end $$;

create or replace function public.portal_waitlist(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'appointment_id', a.id, 'starts_at', a.starts_at, 'service', s.name,
            'status', w.status, 'position', w.position) order by a.starts_at), '[]')
    from waitlist w join appointments a on a.id = w.appointment_id join services s on s.id = a.service_id
   where w.patient_id = pt.id and w.status in ('waiting','notified') and a.starts_at > now());
end $$;

create or replace function public.portal_leave_waitlist(p_waitlist_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w waitlist%rowtype;
begin
  select * into w from waitlist where id = p_waitlist_id;
  perform private.portal_patient(w.patient_id);
  update waitlist set status = 'cancelled' where id = w.id;
end $$;

-- Aluno do portal pode confirmar/cancelar somente as próprias aulas (cancel_participation já valida)
