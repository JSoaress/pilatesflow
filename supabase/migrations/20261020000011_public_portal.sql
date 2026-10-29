-- =====================================================================
-- PilatesFlow — 0011 Site público, agendamento online e portal do aluno
-- O visitante anônimo só acessa as funções desta migration liberadas
-- explicitamente para "anon". Elas retornam apenas dados públicos.
-- O aluno acessa o portal via vínculo patients.user_id (sem ser membro
-- da equipe), portanto nunca enxerga dados de outros alunos.
-- =====================================================================

alter table public.staff add column public_photo_path text;   -- foto no bucket público "site" (opcional)

create or replace function private.org_by_slug(p_slug text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from organizations where slug = lower(p_slug) and deleted_at is null
$$;

-- ---------------------------------------------------------------------
-- Dados do site institucional
-- ---------------------------------------------------------------------
create or replace function public.public_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := private.org_by_slug(p_slug); o organizations%rowtype;
begin
  if v_org is null then return null; end if;
  select * into o from organizations where id = v_org;
  return jsonb_build_object(
    'organization', jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'app_name', o.app_name,
       'phone', o.phone, 'whatsapp', o.whatsapp, 'email', o.email, 'instagram', o.instagram, 'website', o.website,
       'logo_path', o.logo_path, 'primary_color', o.primary_color, 'timezone', o.timezone),
    'website', coalesce((select value from system_settings where organization_id = v_org and key = 'website'), '{}'::jsonb),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone, 'whatsapp', u.whatsapp,
                 'email', u.email, 'street', u.address_street, 'number', u.address_number, 'district', u.address_district,
                 'city', u.address_city, 'state', u.address_state, 'zip', u.address_zip, 'latitude', u.latitude,
                 'longitude', u.longitude, 'business_hours', u.business_hours) order by u.created_at), '[]')
                from units u where u.organization_id = v_org and u.is_active and u.deleted_at is null),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind,
                   'description', s.description, 'duration', s.default_duration_min, 'allow_online_booking', s.allow_online_booking)
                   order by s.name), '[]')
                   from services s where s.organization_id = v_org and s.is_active and s.show_on_website and s.deleted_at is null),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.full_name, 'kind', st.kind,
               'registry', st.professional_registry, 'specialties', st.specialties, 'bio', st.bio, 'photo_path', st.public_photo_path)
               order by st.full_name), '[]')
               from staff st where st.organization_id = v_org and st.show_on_website and st.status = 'active' and st.deleted_at is null),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description,
               'price', p.price, 'cycle_months', p.cycle_months, 'weekly_frequency', p.weekly_frequency,
               'total_sessions', p.total_sessions, 'billing_type', p.billing_type, 'installments_count', p.installments_count)
               order by p.sort_order, p.price), '[]')
               from plans p where p.organization_id = v_org and p.is_active and p.show_on_website and p.deleted_at is null),
    'testimonials', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'author', t.author_name, 'role', t.author_role,
                      'content', t.content, 'rating', t.rating) order by t.sort_order), '[]')
                      from site_testimonials t where t.organization_id = v_org and t.is_published),
    'faqs', (select coalesce(jsonb_agg(jsonb_build_object('question', f.question, 'answer', f.answer) order by f.sort_order), '[]')
               from site_faqs f where f.organization_id = v_org and f.is_published),
    'gallery', (select coalesce(jsonb_agg(jsonb_build_object('path', g.image_path, 'caption', g.caption, 'section', g.section)
                  order by g.sort_order), '[]')
                  from site_gallery g where g.organization_id = v_org and g.is_published),
    'legal', (select coalesce(jsonb_object_agg(l.kind, jsonb_build_object('title', l.title, 'content', l.content,
                'version', l.version, 'published_at', l.published_at)), '{}')
                from legal_documents l where l.organization_id = v_org and l.is_current)
  );
end $$;

create or replace function public.public_blog_posts(p_slug text, p_limit int default 12, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'title', title, 'excerpt', excerpt, 'cover_path', cover_path,
           'published_at', published_at) order by published_at desc), '[]')
    from (select * from site_posts where organization_id = private.org_by_slug(p_slug) and status = 'published'
           order by published_at desc limit least(p_limit, 50) offset greatest(p_offset, 0)) x
$$;

create or replace function public.public_blog_post(p_slug text, p_post_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('slug', slug, 'title', title, 'excerpt', excerpt, 'content', content, 'cover_path', cover_path,
           'published_at', published_at, 'updated_at', updated_at, 'seo_title', seo_title, 'seo_description', seo_description)
    from site_posts where organization_id = private.org_by_slug(p_slug) and slug = p_post_slug and status = 'published'
$$;

-- Formulário de contato / lead do site (com consentimento LGPD e rate limit)
create or replace function public.public_create_lead(
  p_slug text, p_name text, p_phone text, p_email text default null, p_interest text default null,
  p_message text default null, p_consent boolean default false, p_utm jsonb default null, p_origin text default 'website'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid := private.org_by_slug(p_slug); v_lead uuid; v_ip text := coalesce(private.request_ip(), 'sem-ip');
begin
  if v_org is null then raise exception 'Clínica não encontrada.'; end if;
  if not private.rate_limit('lead:' || v_ip, 5, 600) or not private.rate_limit('lead-org:' || v_org, 200, 3600) then
    raise exception 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  end if;
  if coalesce(length(trim(p_name)), 0) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(private.only_digits(p_phone)) not between 10 and 13 then raise exception 'Informe um telefone válido com DDD.'; end if;
  if p_email is not null and p_email <> '' and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  if not coalesce(p_consent, false) then raise exception 'É necessário concordar com a Política de Privacidade.'; end if;

  insert into leads (organization_id, name, phone, whatsapp, email, origin, interest, notes, utm, privacy_consent_at, stage)
  values (v_org, left(trim(p_name), 120), left(p_phone, 30), left(p_phone, 30), nullif(left(lower(trim(p_email)), 160), ''),
          case when p_origin in ('instagram','google','referral','whatsapp','website','walk_in','event','other') then p_origin else 'website' end,
          left(p_interest, 200), left(p_message, 2000), p_utm, now(), 'new')
  returning id into v_lead;
  insert into consents (organization_id, lead_id, purpose, legal_document_id, granted, channel, ip, user_agent, recorded_by)
  values (v_org, v_lead, 'privacy_policy',
          (select id from legal_documents where organization_id = v_org and kind = 'privacy_policy' and is_current),
          true, 'website', v_ip, private.request_user_agent(), null);
  perform private.notify_permission(v_org, 'crm.view', 'new_lead', 'Novo lead pelo site',
    left(trim(p_name), 120) || coalesce(' — ' || nullif(p_interest, ''), ''), '/app/crm', 'leads', v_lead);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Agendamento online (/agendar)
-- ---------------------------------------------------------------------
create or replace function public.public_booking_options(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by created_at), '[]')
                from units where organization_id = private.org_by_slug(p_slug) and is_active and deleted_at is null),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'duration', default_duration_min,
                   'description', description) order by name), '[]')
                   from services where organization_id = private.org_by_slug(p_slug) and is_active and allow_online_booking and deleted_at is null),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'unit_id', unit_id) order by full_name), '[]')
                from staff where organization_id = private.org_by_slug(p_slug) and status = 'active' and allow_online_booking and deleted_at is null),
    'privacy_policy_version', (select version from legal_documents where organization_id = private.org_by_slug(p_slug)
                                 and kind = 'privacy_policy' and is_current)
  )
$$;

-- Horários disponíveis em um dia: vagas em turmas existentes + horários livres de profissionais
create or replace function private.available_slots(
  p_org uuid, p_unit uuid, p_service uuid, p_date date, p_staff uuid default null
) returns table (starts_at timestamptz, ends_at timestamptz, staff_id uuid, staff_name text, appointment_id uuid, spots_left int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := private.org_tz(p_org);
  s services%rowtype;
  v_min_advance int := coalesce((private.setting(p_org, 'online_booking', '{}'::jsonb) ->> 'min_advance_hours')::int, 2);
  v_max_days int := coalesce((private.setting(p_org, 'online_booking', '{}'::jsonb) ->> 'max_days_ahead')::int, 30);
  v_step int := coalesce((private.setting(p_org, 'online_booking', '{}'::jsonb) ->> 'slot_step_minutes')::int, 0);
  h record; v_t time; v_start timestamptz; v_end timestamptz;
begin
  select * into s from services where id = p_service and organization_id = p_org and is_active and deleted_at is null;
  if not found then return; end if;
  if p_date < (now() at time zone v_tz)::date or p_date > (now() at time zone v_tz)::date + v_max_days then return; end if;
  if exists (select 1 from holidays where organization_id = p_org and date = p_date and (unit_id is null or unit_id = p_unit)) then return; end if;

  -- 1) Turmas/horários existentes com vaga
  return query
  select a.starts_at, a.ends_at, a.staff_id, st.full_name, a.id,
         (a.capacity - (select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled'))::int
    from appointments a left join staff st on st.id = a.staff_id
   where a.organization_id = p_org and a.unit_id = p_unit and a.service_id = p_service and a.status = 'scheduled'
     and (a.starts_at at time zone v_tz)::date = p_date
     and a.starts_at > now() + make_interval(hours => v_min_advance)
     and (p_staff is null or a.staff_id = p_staff)
     and a.capacity > (select count(*) from appointment_participants ap where ap.appointment_id = a.id and ap.status <> 'cancelled')
   order by a.starts_at;

  -- 2) Horários livres na jornada de profissionais que aceitam agendamento online
  for h in
    select wh.*, st.full_name from staff_working_hours wh join staff st on st.id = wh.staff_id
     where wh.organization_id = p_org and wh.weekday = extract(dow from p_date)::int
       and (wh.unit_id is null or wh.unit_id = p_unit)
       and st.status = 'active' and st.allow_online_booking and st.deleted_at is null
       and (p_staff is null or st.id = p_staff)
       and (st.unit_id = p_unit or exists (select 1 from staff_units su where su.staff_id = st.id and su.unit_id = p_unit) or st.unit_id is null)
  loop
    v_t := h.start_time;
    while v_t + make_interval(mins => s.default_duration_min) <= h.end_time loop
      v_start := (p_date + v_t) at time zone v_tz;
      v_end := v_start + make_interval(mins => s.default_duration_min);
      if v_start > now() + make_interval(hours => v_min_advance)
         and not exists (select 1 from private.schedule_conflicts(p_org, p_unit, v_start, v_end, h.staff_id, null, null, '{}', 1, null)) then
        return query select v_start, v_end, h.staff_id, h.full_name, null::uuid, s.default_capacity;
      end if;
      v_t := v_t + make_interval(mins => case when v_step > 0 then v_step else s.default_duration_min end);
    end loop;
  end loop;
end $$;

create or replace function public.public_available_slots(p_slug text, p_unit uuid, p_service uuid, p_date date, p_staff uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := private.org_by_slug(p_slug);
begin
  if v_org is null then return '[]'::jsonb; end if;
  if not exists (select 1 from services where id = p_service and organization_id = v_org and allow_online_booking) then
    return '[]'::jsonb;
  end if;
  if p_staff is not null and not exists (select 1 from staff where id = p_staff and organization_id = v_org and allow_online_booking) then
    return '[]'::jsonb;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('starts_at', x.starts_at, 'ends_at', x.ends_at, 'staff_id', x.staff_id,
            'staff_name', x.staff_name, 'appointment_id', x.appointment_id, 'spots_left', x.spots_left) order by x.starts_at), '[]')
            from (select distinct on (s.starts_at, s.staff_id) s.* from private.available_slots(v_org, p_unit, p_service, p_date, p_staff) s
                  order by s.starts_at, s.staff_id, s.appointment_id nulls last) x);
end $$;

-- Agendamento de aula experimental por visitante (cria lead + ficha "Experimental" + agendamento)
create or replace function public.public_book_trial(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := private.org_by_slug(p_slug);
  v_ip text := coalesce(private.request_ip(), 'sem-ip');
  v_phone text := private.only_digits(p ->> 'phone');
  v_unit uuid := (p ->> 'unit_id')::uuid;
  v_service services%rowtype;
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz;
  v_appt uuid := (p ->> 'appointment_id')::uuid;
  v_staff uuid := (p ->> 'staff_id')::uuid;
  v_lead uuid; v_patient uuid; v_a appointments%rowtype; v_used int; v_tz text; v_part uuid;
begin
  if v_org is null then raise exception 'Clínica não encontrada.'; end if;
  if not private.rate_limit('book:' || v_ip, 5, 3600) or not private.rate_limit('book-phone:' || v_org || v_phone, 3, 86400) then
    raise exception 'Muitas tentativas de agendamento. Entre em contato pelo WhatsApp.';
  end if;
  if coalesce(length(trim(p ->> 'name')), 0) < 3 then raise exception 'Informe seu nome completo.'; end if;
  if length(v_phone) not between 10 and 13 then raise exception 'Informe um telefone válido com DDD.'; end if;
  if not coalesce((p ->> 'consent')::boolean, false) then raise exception 'É necessário concordar com a Política de Privacidade.'; end if;
  select * into v_service from services where id = (p ->> 'service_id')::uuid and organization_id = v_org and allow_online_booking and is_active;
  if not found then raise exception 'Modalidade indisponível para agendamento online.'; end if;
  if not exists (select 1 from units where id = v_unit and organization_id = v_org and is_active) then raise exception 'Unidade inválida.'; end if;
  v_tz := private.org_tz(v_org);

  -- valida se o horário ainda está disponível
  if not exists (select 1 from private.available_slots(v_org, v_unit, v_service.id, (v_starts at time zone v_tz)::date, v_staff) s
                  where s.starts_at = v_starts and (v_appt is null or s.appointment_id = v_appt)
                    and (v_appt is not null or s.staff_id = v_staff)) then
    raise exception 'Este horário acabou de ficar indisponível. Escolha outro horário.';
  end if;

  -- lead (reaproveita lead aberto com o mesmo telefone)
  select id into v_lead from leads where organization_id = v_org and private.only_digits(phone) = v_phone
     and stage not in ('enrolled','lost') and deleted_at is null order by created_at desc limit 1;
  if v_lead is null then
    insert into leads (organization_id, unit_id, name, phone, whatsapp, email, origin, interest, service_id, stage, privacy_consent_at, utm)
    values (v_org, v_unit, left(trim(p ->> 'name'), 120), p ->> 'phone', p ->> 'phone', nullif(lower(trim(p ->> 'email')), ''),
            'website', 'Aula experimental: ' || v_service.name, v_service.id, 'trial_scheduled', now(), p -> 'utm')
    returning id into v_lead;
  end if;
  select patient_id into v_patient from leads where id = v_lead;
  if v_patient is null then
    insert into patients (organization_id, unit_id, full_name, phone, whatsapp, email, origin, status, notes)
    values (v_org, v_unit, left(trim(p ->> 'name'), 120), p ->> 'phone', p ->> 'phone', nullif(lower(trim(p ->> 'email')), ''),
            'website', 'trial', 'Cadastro criado pelo agendamento online.')
    returning id into v_patient;
    update leads set patient_id = v_patient where id = v_lead;
  end if;

  if v_appt is not null then
    select * into v_a from appointments where id = v_appt and organization_id = v_org for update;
    select count(*) into v_used from appointment_participants where appointment_id = v_a.id and status <> 'cancelled';
    if v_used >= v_a.capacity then raise exception 'Esta turma acabou de lotar. Escolha outro horário.'; end if;
  else
    perform pg_advisory_xact_lock(hashtext(v_staff::text));
    if exists (select 1 from private.schedule_conflicts(v_org, v_unit, v_starts, v_starts + make_interval(mins => v_service.default_duration_min),
                                                       v_staff, null, null, array[v_patient], 1, null)) then
      raise exception 'Este horário acabou de ficar indisponível. Escolha outro horário.';
    end if;
    insert into appointments (organization_id, unit_id, service_id, staff_id, kind, starts_at, ends_at, capacity, notes)
    values (v_org, v_unit, v_service.id, v_staff, 'trial', v_starts, v_starts + make_interval(mins => v_service.default_duration_min),
            v_service.default_capacity, 'Agendado pelo site')
    returning * into v_a;
  end if;
  insert into appointment_participants (organization_id, appointment_id, patient_id, status, notes)
  values (v_org, v_a.id, v_patient, 'scheduled', 'Aula experimental (site)')
  on conflict (appointment_id, patient_id) do update set status = 'scheduled'
  returning id into v_part;
  update leads set stage = 'trial_scheduled', trial_appointment_id = v_a.id where id = v_lead;
  insert into consents (organization_id, patient_id, lead_id, purpose, legal_document_id, granted, channel, ip, user_agent, recorded_by)
  values (v_org, v_patient, v_lead, 'privacy_policy',
          (select id from legal_documents where organization_id = v_org and kind = 'privacy_policy' and is_current),
          true, 'website', v_ip, private.request_user_agent(), null);
  perform private.log_event(v_org, v_a.id, v_part, v_patient, 'trial_booked_online', null);
  perform private.notify_permission(v_org, 'schedule.view', 'new_appointment', 'Nova aula experimental (site)',
    format('%s — %s', left(trim(p ->> 'name'), 120), to_char(v_a.starts_at at time zone v_tz, 'DD/MM "às" HH24:MI')),
    '/app/agenda?data=' || to_char(v_a.starts_at at time zone v_tz, 'YYYY-MM-DD'), 'appointments', v_a.id);
  return jsonb_build_object('ok', true, 'starts_at', v_a.starts_at, 'service', v_service.name,
                            'staff', (select full_name from staff where id = v_a.staff_id));
end $$;

-- ---------------------------------------------------------------------
-- Portal do aluno
-- ---------------------------------------------------------------------
create or replace function private.portal_patient(p_patient_id uuid) returns patients
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype;
begin
  select * into pt from patients where id = p_patient_id and user_id = auth.uid() and deleted_at is null;
  if not found or auth.uid() is null then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return pt;
end $$;

create or replace function public.portal_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'patient_id', p.id, 'organization_id', p.organization_id, 'organization_name', o.name, 'organization_slug', o.slug,
    'logo_path', o.logo_path, 'full_name', p.full_name, 'social_name', p.social_name, 'email', p.email, 'phone', p.phone,
    'whatsapp', p.whatsapp, 'address_street', p.address_street, 'address_number', p.address_number,
    'address_complement', p.address_complement, 'address_district', p.address_district, 'address_city', p.address_city,
    'address_state', p.address_state, 'address_zip', p.address_zip, 'checkin_token', p.checkin_token,
    'balance', public.patient_balance(p.id),
    'unread_notifications', (select count(*) from notifications n where n.user_id = auth.uid() and n.read_at is null)
  )), '[]')
  from patients p join organizations o on o.id = p.organization_id
  where p.user_id = auth.uid() and p.deleted_at is null and auth.uid() is not null
$$;

create or replace function public.portal_appointments(p_patient_id uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id); v_rules jsonb := private.schedule_rules(pt.organization_id);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', ap.id, 'appointment_id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', ap.status,
      'service', s.name, 'staff', st.full_name, 'unit', u.name, 'room', r.name,
      'is_replacement', ap.replacement_credit_id is not null,
      'can_cancel', ap.status in ('scheduled','confirmed','replacement') and a.starts_at > now(),
      'cancel_with_credit_until', a.starts_at - make_interval(hours => (v_rules ->> 'min_cancel_notice_hours')::int)
    ) order by a.starts_at), '[]')
    from appointment_participants ap join appointments a on a.id = ap.appointment_id
    join services s on s.id = a.service_id left join staff st on st.id = a.staff_id
    join units u on u.id = a.unit_id left join rooms r on r.id = a.room_id
   where ap.patient_id = pt.id and a.starts_at between p_from and p_to);
end $$;

create or replace function public.portal_confirm(p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ap appointment_participants%rowtype;
begin
  select * into ap from appointment_participants where id = p_participant_id;
  perform private.portal_patient(ap.patient_id);
  if ap.status not in ('scheduled','replacement') then raise exception 'Esta aula não pode ser confirmada.'; end if;
  update appointment_participants set status = case when status = 'replacement' then status else 'confirmed' end, confirmed_at = now()
   where id = ap.id;
  perform private.log_event(ap.organization_id, ap.appointment_id, ap.id, ap.patient_id, 'confirmed', jsonb_build_object('by', 'portal'));
end $$;

-- Saldo disponível considerando aulas futuras já agendadas
create or replace function private.portal_available_sessions(p_patient uuid, p_date date) returns int
language plpgsql stable security definer set search_path = public as $$
declare s subscriptions%rowtype; v_future int;
begin
  select * into s from subscriptions where id = private.active_subscription(p_patient, p_date);
  if s.id is null then return 0; end if;
  if s.sessions_total is null then return 9999; end if;
  select count(*) into v_future from appointment_participants ap join appointments a on a.id = ap.appointment_id
   where ap.patient_id = p_patient and ap.status in ('scheduled','confirmed') and not ap.credit_consumed
     and ap.replacement_credit_id is null and a.status = 'scheduled'
     and a.starts_at::date between s.start_date and coalesce(s.end_date, a.starts_at::date);
  return s.sessions_total + s.sessions_extra - s.sessions_used - v_future;
end $$;

create or replace function public.portal_available_slots(p_patient_id uuid, p_service uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id);
begin
  -- portal agenda apenas em turmas/horários já existentes com vaga
  return (select coalesce(jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at, 'staff_name', s.staff_name,
            'appointment_id', s.appointment_id, 'spots_left', s.spots_left) order by s.starts_at), '[]')
            from private.available_slots(pt.organization_id, coalesce(pt.unit_id,
                   (select id from units where organization_id = pt.organization_id order by created_at limit 1)), p_service, p_date) s
           where s.appointment_id is not null
             and not exists (select 1 from appointment_participants ap where ap.appointment_id = s.appointment_id
                               and ap.patient_id = pt.id and ap.status <> 'cancelled'));
end $$;

create or replace function public.portal_services(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id); v_sub uuid;
begin
  v_sub := private.active_subscription(pt.id, current_date);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]')
            from services s where s.organization_id = pt.organization_id and s.is_active and s.deleted_at is null
             and s.kind not in ('assessment','reassessment','trial')
             and (v_sub is null or not exists (select 1 from plan_services ps join subscriptions sb on sb.plan_id = ps.plan_id where sb.id = v_sub)
                  or exists (select 1 from plan_services ps join subscriptions sb on sb.plan_id = ps.plan_id
                              where sb.id = v_sub and ps.service_id = s.id)));
end $$;

create or replace function public.portal_book(p_patient_id uuid, p_appointment_id uuid, p_use_credit boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id); a appointments%rowtype; v_min int; v_sub uuid;
begin
  select * into a from appointments where id = p_appointment_id and organization_id = pt.organization_id;
  if not found then raise exception 'Horário não encontrado.'; end if;
  v_min := coalesce((private.setting(pt.organization_id, 'online_booking', '{}'::jsonb) ->> 'min_advance_hours')::int, 2);
  if a.starts_at < now() + make_interval(hours => v_min) then
    raise exception 'Agendamentos pelo portal precisam de pelo menos % h de antecedência.', v_min;
  end if;
  if not p_use_credit then
    v_sub := private.active_subscription(pt.id, (a.starts_at at time zone private.org_tz(a.organization_id))::date);
    if v_sub is null then raise exception 'Você não possui plano ativo para esta data. Fale com a recepção.'; end if;
    if exists (select 1 from plan_services ps join subscriptions s on s.plan_id = ps.plan_id where s.id = v_sub)
       and not exists (select 1 from plan_services ps join subscriptions s on s.plan_id = ps.plan_id where s.id = v_sub and ps.service_id = a.service_id) then
      raise exception 'Seu plano não inclui esta modalidade.';
    end if;
    if private.portal_available_sessions(pt.id, (a.starts_at at time zone private.org_tz(a.organization_id))::date) <= 0 then
      raise exception 'Seu saldo de aulas está esgotado. Utilize um crédito de reposição ou fale com a recepção.';
    end if;
  end if;
  return public.add_participant(a.id, pt.id, p_use_credit, false);
end $$;

create or replace function public.portal_financial(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id);
begin
  return jsonb_build_object(
    'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'plan', p.name, 'status', s.status,
        'start_date', s.start_date, 'end_date', s.end_date, 'price', round(s.price * (1 - s.discount_percent / 100.0), 2),
        'sessions_total', s.sessions_total, 'sessions_used', s.sessions_used) order by s.start_date desc), '[]')
        from subscriptions s join plans p on p.id = s.plan_id where s.patient_id = pt.id),
    'receivables', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'description', r.description,
        'amount', r.amount - r.discount + r.surcharge, 'amount_paid', r.amount_paid, 'due_date', r.due_date, 'status', r.status,
        'pix_copy_paste', (select pix_copy_paste from payment_gateway_charges g where g.receivable_id = r.id and g.status in ('created','pending') order by created_at desc limit 1),
        'payment_url', (select payment_url from payment_gateway_charges g where g.receivable_id = r.id and g.status in ('created','pending') order by created_at desc limit 1))
        order by r.due_date desc), '[]')
        from accounts_receivable r where r.patient_id = pt.id and r.status <> 'cancelled'),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', pm.id, 'amount', pm.amount, 'method', pm.method,
        'paid_at', pm.paid_at, 'receipt_number', pm.receipt_number, 'status', pm.status) order by pm.paid_at desc), '[]')
        from payments pm where pm.patient_id = pt.id)
  );
end $$;

create or replace function public.portal_update_profile(p_patient_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id);
begin
  if p ? 'email' and coalesce(p ->> 'email', '') <> '' and (p ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.';
  end if;
  update patients set
    social_name = case when p ? 'social_name' then nullif(left(p ->> 'social_name', 120), '') else social_name end,
    phone = case when p ? 'phone' then left(p ->> 'phone', 30) else phone end,
    whatsapp = case when p ? 'whatsapp' then left(p ->> 'whatsapp', 30) else whatsapp end,
    email = case when p ? 'email' then nullif(lower(left(p ->> 'email', 160)), '') else email end,
    address_street = case when p ? 'address_street' then left(p ->> 'address_street', 160) else address_street end,
    address_number = case when p ? 'address_number' then left(p ->> 'address_number', 20) else address_number end,
    address_complement = case when p ? 'address_complement' then left(p ->> 'address_complement', 80) else address_complement end,
    address_district = case when p ? 'address_district' then left(p ->> 'address_district', 80) else address_district end,
    address_city = case when p ? 'address_city' then left(p ->> 'address_city', 80) else address_city end,
    address_state = case when p ? 'address_state' then upper(left(p ->> 'address_state', 2)) else address_state end,
    address_zip = case when p ? 'address_zip' then left(p ->> 'address_zip', 10) else address_zip end
   where id = pt.id;
end $$;

create or replace function public.portal_documents(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id);
begin
  return jsonb_build_object(
    'contracts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status, 'content', c.content,
        'accepted_at', c.accepted_at, 'created_at', c.created_at) order by c.created_at desc), '[]')
        from contracts c where c.patient_id = pt.id and c.status in ('sent','accepted')),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'type', d.type, 'status', d.status,
        'content', d.content, 'requires_signature', d.requires_signature, 'signed_at', d.signed_at) order by d.created_at desc), '[]')
        from documents d where d.patient_id = pt.id and d.status in ('sent','signed') and not d.is_clinical and d.deleted_at is null),
    'anamnesis', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'status', a.status, 'created_at', a.created_at,
        'questions', case when a.status = 'pending' then a.questions_snapshot end) order by a.created_at desc), '[]')
        from anamnesis a where a.patient_id = pt.id and a.status in ('pending','completed'))
  );
end $$;

create or replace function public.portal_accept_contract(p_contract_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare c contracts%rowtype;
begin
  select * into c from contracts where id = p_contract_id;
  perform private.portal_patient(c.patient_id);
  if coalesce(length(trim(p_name)), 0) < 5 then raise exception 'Digite seu nome completo para registrar o aceite.'; end if;
  perform private.accept_contract(c.id, left(trim(p_name), 150));
  perform private.notify_permission(c.organization_id, 'contracts.view', 'contract_accepted', 'Contrato aceito',
    c.title, '/app/alunos/' || c.patient_id || '?aba=documentos', 'contracts', c.id);
end $$;

create or replace function public.portal_sign_document(p_document_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare d documents%rowtype;
begin
  select * into d from documents where id = p_document_id;
  perform private.portal_patient(d.patient_id);
  if d.status <> 'sent' then raise exception 'Documento indisponível para assinatura.'; end if;
  if coalesce(length(trim(p_name)), 0) < 5 then raise exception 'Digite seu nome completo para assinar.'; end if;
  update documents set status = 'signed', signed_at = now(), signed_name = left(trim(p_name), 150),
         signed_ip = private.request_ip(), signed_user_agent = private.request_user_agent()
   where id = d.id;
  if d.type = 'image_authorization' then
    insert into consents (organization_id, patient_id, user_id, purpose, granted, channel, ip, user_agent)
    values (d.organization_id, d.patient_id, auth.uid(), 'image_use', true, 'portal', private.request_ip(), private.request_user_agent());
  end if;
end $$;

-- Dados do recibo (equipe com financeiro ou o próprio aluno)
create or replace function public.receipt_data(p_payment_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pm payments%rowtype; pt patients%rowtype; o organizations%rowtype; u units%rowtype; r accounts_receivable%rowtype;
begin
  select * into pm from payments where id = p_payment_id;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  select * into pt from patients where id = pm.patient_id;
  if not (public.has_permission(pm.organization_id, 'finance.view') or (pt.user_id is not null and pt.user_id = auth.uid())) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into o from organizations where id = pm.organization_id;
  select * into u from units where id = coalesce(pm.unit_id, pt.unit_id);
  select * into r from accounts_receivable where id = pm.receivable_id;
  return jsonb_build_object(
    'company', coalesce(o.legal_name, o.name), 'trade_name', o.name, 'cnpj', coalesce(u.cnpj, o.cnpj),
    'address', concat_ws(', ', u.address_street, u.address_number, u.address_district, u.address_city || '/' || u.address_state),
    'phone', coalesce(u.phone, o.phone), 'logo_path', o.logo_path,
    'client', pt.full_name, 'cpf', pt.cpf, 'amount', pm.amount, 'reference', coalesce(r.description, pm.notes, 'Serviços de Pilates'),
    'paid_at', pm.paid_at, 'method', pm.method, 'receipt_number', pm.receipt_number, 'payment_id', pm.id,
    'status', pm.status, 'timezone', o.timezone);
end $$;
