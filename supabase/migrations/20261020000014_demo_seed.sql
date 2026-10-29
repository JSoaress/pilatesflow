-- =====================================================================
-- PilatesFlow — 0014 Dados de demonstração (função; NÃO executa sozinha)
-- Executada apenas pelo script "npm run seed" (service role), após criar
-- os usuários de demonstração no Auth. Todos os dados são fictícios.
-- Utiliza as próprias regras de negócio (RPCs) para gerar os dados.
-- =====================================================================

create or replace function private.seed_demo(
  p_owner uuid, p_physio uuid default null, p_instructor uuid default null,
  p_reception uuid default null, p_patient_user uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_unit uuid; v_tz text := 'America/Sao_Paulo';
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  r_aparelhos uuid; r_solo uuid; r_fisio uuid;
  e_reformer uuid; e_cadillac uuid; e_chair uuid;
  st_mariana uuid; st_carlos uuid; st_juliana uuid;
  sv_aparelhos uuid; sv_solo uuid; sv_individual uuid; sv_dupla uuid; sv_avaliacao uuid; sv_trial uuid; sv_fisio uuid;
  pl_1x uuid; pl_2x uuid; pl_3x uuid; pl_pacote uuid; pl_tri uuid;
  v_patients uuid[] := '{}'; v_pid uuid; v_sub uuid; v_rec uuid[]; v_i int; v_ar record; v_appt uuid; v_part uuid;
  v_date date; v_rec_row record; v_member record; v_status text; v_ev uuid; v_as uuid; v_prog uuid;
  v_ex uuid[] := '{}'; v_tpl uuid; v_contract uuid; v_payable uuid; v_anam uuid; v_role uuid;
  v_names text[] := array['Ana Beatriz Rocha','Bruno Henrique Matos','Camila Ferreira Nunes','Daniela Prado Lopes',
    'Eduardo Nogueira Lima','Fernanda Castro Reis','Gabriela Moura Teixeira','Helena Duarte Campos','Isabela Martins Freitas',
    'João Pedro Arantes','Larissa Vieira Pinto','Marcos Antônio Ribeiro','Natália Gomes Cardoso','Olívia Barros Sampaio',
    'Paulo Sérgio Monteiro'];
begin
  -- age como o proprietário (auth.uid()) para que as regras e auditoria funcionem normalmente
  perform set_config('request.jwt.claim.sub', p_owner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_owner, 'role', 'authenticated')::text, true);

  if exists (select 1 from organizations where slug = 'studio-movimento') then
    raise exception 'Os dados de demonstração já existem (organização studio-movimento).';
  end if;

  v_org := public.create_organization(jsonb_build_object('name', 'Studio Movimento Pilates', 'slug', 'studio-movimento',
    'legal_name', 'Studio Movimento Pilates (Demonstração)', 'email', 'contato@studiomovimento.exemplo',
    'phone', '(11) 3000-0000', 'whatsapp', '(11) 90000-0000', 'instagram', '@studiomovimento.exemplo'));

  insert into units (organization_id, name, phone, whatsapp, address_street, address_number, address_district, address_city,
                     address_state, address_zip, manager_name, business_hours)
  values (v_org, 'Centro', '(11) 3000-0000', '(11) 90000-0000', 'Rua Exemplo', '100', 'Centro', 'São Paulo', 'SP', '01000-000',
          'Mariana Souza', jsonb_build_object(
            '0', '[]'::jsonb, '1', '[{"start":"06:00","end":"21:00"}]'::jsonb, '2', '[{"start":"06:00","end":"21:00"}]'::jsonb,
            '3', '[{"start":"06:00","end":"21:00"}]'::jsonb, '4', '[{"start":"06:00","end":"21:00"}]'::jsonb,
            '5', '[{"start":"06:00","end":"20:00"}]'::jsonb, '6', '[{"start":"08:00","end":"12:00"}]'::jsonb))
  returning id into v_unit;

  insert into rooms (organization_id, unit_id, name, capacity, description) values (v_org, v_unit, 'Sala de Aparelhos', 3, 'Reformer, Cadillac e Chair') returning id into r_aparelhos;
  insert into rooms (organization_id, unit_id, name, capacity, description) values (v_org, v_unit, 'Sala de Solo', 8, 'Mat Pilates e acessórios') returning id into r_solo;
  insert into rooms (organization_id, unit_id, name, capacity, description) values (v_org, v_unit, 'Consultório', 1, 'Avaliações e fisioterapia') returning id into r_fisio;

  insert into equipment (organization_id, unit_id, room_id, name, type, brand, model, serial_number, purchase_date, purchase_value, maintenance_interval_days, next_maintenance_date)
  values (v_org, v_unit, r_aparelhos, 'Reformer 1', 'reformer', 'Marca Exemplo', 'RF-200', 'DEMO-RF-0001', v_today - 400, 9800, 180, v_today + 8) returning id into e_reformer;
  insert into equipment (organization_id, unit_id, room_id, name, type, brand, model, serial_number, purchase_date, purchase_value, maintenance_interval_days, next_maintenance_date)
  values (v_org, v_unit, r_aparelhos, 'Cadillac', 'cadillac', 'Marca Exemplo', 'CD-100', 'DEMO-CD-0001', v_today - 400, 12500, 180, v_today + 60) returning id into e_cadillac;
  insert into equipment (organization_id, unit_id, room_id, name, type, brand, model, serial_number, purchase_date, purchase_value, maintenance_interval_days, next_maintenance_date)
  values (v_org, v_unit, r_aparelhos, 'Chair', 'chair', 'Marca Exemplo', 'CH-50', 'DEMO-CH-0001', v_today - 300, 3900, 180, v_today + 90) returning id into e_chair;

  insert into equipment_maintenance (organization_id, equipment_id, type, performed_on, provider_name, cost, description, parts_replaced, next_maintenance_on)
  values (v_org, e_cadillac, 'preventive', v_today - 120, 'Técnico Exemplo', 280, 'Revisão geral, lubrificação e troca de molas.', '2 molas médias', v_today + 60);

  -- Equipe (dados fictícios)
  insert into staff (organization_id, unit_id, user_id, full_name, email, phone, profession, kind, professional_registry, specialties, bio,
                     show_on_website, hired_at, color, allow_online_booking)
  values (v_org, v_unit, p_physio, 'Mariana Souza', 'mariana@studiomovimento.exemplo', '(11) 90000-0001', 'Fisioterapeuta', 'physiotherapist',
          'CREFITO-3 000000-F (exemplo)', array['Pilates clínico','Coluna','Reabilitação'], 'Fisioterapeuta com foco em Pilates clínico e reabilitação de coluna.',
          true, v_today - 900, '#3F6F5E', true) returning id into st_mariana;
  insert into staff (organization_id, unit_id, user_id, full_name, email, phone, profession, kind, professional_registry, specialties, bio,
                     show_on_website, hired_at, color, allow_online_booking)
  values (v_org, v_unit, p_instructor, 'Carlos Lima', 'carlos@studiomovimento.exemplo', '(11) 90000-0002', 'Profissional de Educação Física', 'instructor',
          'CREF 000000-G/SP (exemplo)', array['Pilates em aparelhos','Mat Pilates'], 'Instrutor de Pilates em aparelhos e solo.',
          true, v_today - 500, '#8A6F4D', true) returning id into st_carlos;
  insert into staff (organization_id, unit_id, user_id, full_name, email, kind, is_bookable, hired_at, color)
  values (v_org, v_unit, p_reception, 'Juliana Alves', 'juliana@studiomovimento.exemplo', 'receptionist', false, v_today - 200, '#64748B')
  returning id into st_juliana;

  insert into staff_working_hours (organization_id, staff_id, unit_id, weekday, start_time, end_time, break_start, break_end)
  select v_org, st_mariana, v_unit, d, '07:00', '20:00', '12:00', '13:00' from generate_series(1, 5) d;
  insert into staff_working_hours (organization_id, staff_id, unit_id, weekday, start_time, end_time)
  select v_org, st_carlos, v_unit, d, '06:00', '21:00' from generate_series(1, 5) d;
  insert into staff_working_hours (organization_id, staff_id, unit_id, weekday, start_time, end_time) values (v_org, st_carlos, v_unit, 6, '08:00', '12:00');

  if p_physio is not null then
    select id into v_role from roles where organization_id = v_org and key = 'physiotherapist';
    perform private.attach_member(v_org, p_physio, v_role, null, st_mariana);
  end if;
  if p_instructor is not null then
    select id into v_role from roles where organization_id = v_org and key = 'instructor';
    perform private.attach_member(v_org, p_instructor, v_role, null, st_carlos);
  end if;
  if p_reception is not null then
    select id into v_role from roles where organization_id = v_org and key = 'receptionist';
    perform private.attach_member(v_org, p_reception, v_role, null, st_juliana);
  end if;

  -- Modalidades
  insert into services (organization_id, name, kind, default_duration_min, default_capacity, color, price, allow_online_booking, description)
  values (v_org, 'Pilates aparelhos', 'pilates_apparatus', 50, 3, '#3F6F5E', 80, false, 'Aulas em Reformer, Cadillac e Chair em turmas de até 3 alunos.') returning id into sv_aparelhos;
  insert into services (organization_id, name, kind, default_duration_min, default_capacity, color, price, allow_online_booking, description)
  values (v_org, 'Pilates solo', 'pilates_mat', 50, 8, '#6B8F71', 50, false, 'Mat Pilates com acessórios em pequenos grupos.') returning id into sv_solo;
  insert into services (organization_id, name, kind, default_duration_min, default_capacity, color, price, description)
  values (v_org, 'Pilates individual', 'pilates_individual', 50, 1, '#2F4F4F', 140, 'Atendimento exclusivo com o profissional.') returning id into sv_individual;
  insert into services (organization_id, name, kind, default_duration_min, default_capacity, color, price, description)
  values (v_org, 'Pilates em dupla', 'pilates_duo', 50, 2, '#4A7C74', 100, 'Aulas para duas pessoas.') returning id into sv_dupla;
  insert into services (organization_id, name, kind, default_duration_min, default_capacity, color, price, consumes_plan_credit, description)
  values (v_org, 'Avaliação', 'assessment', 60, 1, '#B07D48', 150, false, 'Avaliação física, funcional e postural.') returning id into sv_avaliacao;
  insert into services (organization_id, name, kind, default_duration_min, default_capacity, color, price, consumes_plan_credit, allow_online_booking, description)
  values (v_org, 'Aula experimental', 'trial', 50, 1, '#C08A5B', 0, false, true, 'Conheça o método com uma aula experimental.') returning id into sv_trial;
  insert into services (organization_id, name, kind, default_duration_min, default_capacity, color, price, consumes_plan_credit, description)
  values (v_org, 'Fisioterapia', 'physiotherapy', 50, 1, '#5B6B8A', 180, false, 'Atendimento fisioterapêutico individual.') returning id into sv_fisio;

  -- Planos
  insert into plans (organization_id, name, description, price, cycle_months, weekly_frequency, replacements_allowed, enrollment_fee, billing_type, sort_order)
  values (v_org, '1x por semana', 'Mensal, 1 aula por semana', 260, 1, 1, 1, 50, 'monthly', 1) returning id into pl_1x;
  insert into plans (organization_id, name, description, price, cycle_months, weekly_frequency, replacements_allowed, enrollment_fee, billing_type, sort_order)
  values (v_org, '2x por semana', 'Mensal, 2 aulas por semana', 390, 1, 2, 2, 50, 'monthly', 2) returning id into pl_2x;
  insert into plans (organization_id, name, description, price, cycle_months, weekly_frequency, replacements_allowed, enrollment_fee, billing_type, sort_order)
  values (v_org, '3x por semana', 'Mensal, 3 aulas por semana', 490, 1, 3, 3, 50, 'monthly', 3) returning id into pl_3x;
  insert into plans (organization_id, name, description, price, cycle_months, weekly_frequency, replacements_allowed, billing_type, installments_count, discount_percent, sort_order)
  values (v_org, 'Trimestral 2x por semana', '3 meses, 2 aulas por semana, 10% de desconto', 1170, 3, 2, 2, 'installments', 3, 10, 4) returning id into pl_tri;
  insert into plans (organization_id, name, description, price, total_sessions, validity_days, replacements_allowed, billing_type, sort_order, auto_renew)
  values (v_org, 'Pacote 10 sessões', '10 aulas avulsas com validade de 60 dias', 900, 10, 60, 1, 'upfront', 5, false) returning id into pl_pacote;
  insert into plan_services (plan_id, service_id)
  select p, s from unnest(array[pl_1x, pl_2x, pl_3x, pl_tri, pl_pacote]) p cross join unnest(array[sv_aparelhos, sv_solo, sv_dupla]) s;

  update plans set contract_template_id = (select id from contract_templates where organization_id = v_org limit 1) where organization_id = v_org;

  -- Feriados (geram crédito de reposição pelas regras)
  insert into holidays (organization_id, date, name) values
    (v_org, make_date(extract(year from v_today)::int, 11, 2), 'Finados'),
    (v_org, make_date(extract(year from v_today)::int, 11, 15), 'Proclamação da República'),
    (v_org, make_date(extract(year from v_today)::int, 11, 20), 'Dia da Consciência Negra'),
    (v_org, make_date(extract(year from v_today)::int, 12, 25), 'Natal')
  on conflict do nothing;

  -- Alunos fictícios
  for v_i in 1..15 loop
    insert into patients (organization_id, unit_id, user_id, full_name, birth_date, gender, profession, phone, whatsapp, email,
                          address_city, address_state, origin, status, checkin_pin, created_at)
    values (v_org, v_unit, case when v_i = 1 then p_patient_user end, v_names[v_i],
            (v_today - ((25 + v_i * 3) * 365 + v_i * 17))::date,
            case when v_i in (2,5,10,12,15) then 'male' else 'female' end,
            (array['Professora','Engenheiro','Advogada','Designer','Analista','Médica','Arquiteta','Contadora','Estudante','Empresário',
                   'Enfermeira','Aposentado','Jornalista','Psicóloga','Corretor'])[v_i],
            format('(11) 9%s-%s', lpad((1000 + v_i)::text, 4, '0'), lpad((2000 + v_i)::text, 4, '0')),
            format('(11) 9%s-%s', lpad((1000 + v_i)::text, 4, '0'), lpad((2000 + v_i)::text, 4, '0')),
            format('aluno%s@exemplo.com', v_i), 'São Paulo', 'SP',
            (array['instagram','google','referral','whatsapp','website','walk_in'])[1 + v_i % 6],
            case when v_i = 13 then 'paused' when v_i = 14 then 'inactive' when v_i = 15 then 'trial' else 'active' end,
            lpad((1000 + v_i * 7)::text, 4, '0'),
            now() - make_interval(days => (15 - v_i) * 9))
    returning id into v_pid;
    v_patients := v_patients || v_pid;
  end loop;
  -- aniversariante desta semana
  update patients set birth_date = make_date(1988, extract(month from v_today + 2)::int, extract(day from v_today + 2)::int) where id = v_patients[3];

  insert into emergency_contacts (organization_id, patient_id, name, relationship, phone) values
    (v_org, v_patients[1], 'Contato Exemplo 1', 'Mãe', '(11) 98888-0001'),
    (v_org, v_patients[2], 'Contato Exemplo 2', 'Cônjuge', '(11) 98888-0002'),
    (v_org, v_patients[12], 'Contato Exemplo 3', 'Filha', '(11) 98888-0003');

  -- Assinaturas (gera mensalidades); vencimento dia 10
  for v_i in 1..12 loop
    v_sub := public.create_subscription(v_patients[v_i],
      case when v_i in (1,4,7,10) then pl_2x when v_i in (2,5,8) then pl_1x when v_i in (3,6) then pl_3x
           when v_i = 11 then pl_tri else pl_pacote end,
      case when v_i <= 6 then (v_month_start - interval '2 months')::date else v_month_start end,
      null, null, case when v_i = 12 then null else 10 end, true, null);
    update subscriptions set seller_staff_id = case when v_i % 2 = 0 then st_juliana else st_mariana end where id = v_sub;
  end loop;
  -- assinaturas antigas mensais: renova para gerar histórico do mês atual
  perform public.renew_subscriptions(v_org);
  perform public.renew_subscriptions(v_org);

  -- Pagamentos: quita títulos vencidos de quase todos; deixa 3 inadimplentes
  for v_ar in
    select ar.* from accounts_receivable ar where ar.organization_id = v_org and ar.status <> 'cancelled' and ar.due_date <= v_today
     order by ar.due_date
  loop
    if v_ar.patient_id in (v_patients[4], v_patients[8]) and v_ar.due_date >= v_month_start - 35 then
      continue; -- inadimplentes
    end if;
    if v_ar.patient_id = v_patients[6] and v_ar.due_date >= v_month_start then
      perform public.register_payment(v_ar.id, round(v_ar.amount / 2, 2), 'pix', least(v_ar.due_date::timestamp + interval '10 hours', now())::timestamptz, null, 'Pagamento parcial');
      continue;
    end if;
    perform public.register_payment(v_ar.id, v_ar.amount, (array['pix','credit_card','cash','debit_card','transfer'])[1 + (extract(day from v_ar.due_date)::int % 5)],
                                    least((v_ar.due_date - 1)::timestamp + interval '15 hours', now())::timestamptz, null, null);
  end loop;
  perform public.refresh_overdue(v_org);

  -- Horários fixos (gera a agenda das próximas semanas)
  v_rec := public.create_fixed_schedule(jsonb_build_object('unit_id', v_unit, 'service_id', sv_aparelhos, 'staff_id', st_carlos,
    'room_id', r_aparelhos, 'weekdays', jsonb_build_array(1, 3), 'start_time', '07:00', 'capacity', 3, 'name', 'Aparelhos manhã',
    'starts_on', v_today - 21, 'patient_ids', jsonb_build_array(v_patients[1], v_patients[2], v_patients[3])));
  v_rec := public.create_fixed_schedule(jsonb_build_object('unit_id', v_unit, 'service_id', sv_aparelhos, 'staff_id', st_carlos,
    'room_id', r_aparelhos, 'weekdays', jsonb_build_array(2, 4), 'start_time', '18:00', 'capacity', 3, 'name', 'Aparelhos noite',
    'starts_on', v_today - 21, 'patient_ids', jsonb_build_array(v_patients[4], v_patients[6], v_patients[7])));
  v_rec := public.create_fixed_schedule(jsonb_build_object('unit_id', v_unit, 'service_id', sv_aparelhos, 'staff_id', st_mariana,
    'room_id', r_aparelhos, 'weekdays', jsonb_build_array(1, 3, 5), 'start_time', '17:00', 'capacity', 3, 'name', 'Pilates clínico',
    'starts_on', v_today - 21, 'patient_ids', jsonb_build_array(v_patients[5], v_patients[10], v_patients[6])));
  v_rec := public.create_fixed_schedule(jsonb_build_object('unit_id', v_unit, 'service_id', sv_solo, 'staff_id', st_carlos,
    'room_id', r_solo, 'weekdays', jsonb_build_array(5), 'start_time', '09:00', 'capacity', 8, 'name', 'Mat Pilates sexta',
    'starts_on', v_today - 21, 'patient_ids', jsonb_build_array(v_patients[8], v_patients[9], v_patients[11], v_patients[12], v_patients[1])));

  -- Histórico das últimas 3 semanas (aulas passadas com presença/falta)
  for v_rec_row in select * from recurrences where organization_id = v_org loop
    v_date := v_today - 21 + ((v_rec_row.weekday - extract(dow from v_today - 21)::int + 7) % 7);
    while v_date < v_today loop
      if not exists (select 1 from holidays where organization_id = v_org and date = v_date) then
        insert into appointments (organization_id, unit_id, service_id, staff_id, room_id, recurrence_id, occurrence_date, kind,
                                  starts_at, ends_at, capacity)
        values (v_org, v_unit, v_rec_row.service_id, v_rec_row.staff_id, v_rec_row.room_id, v_rec_row.id, v_date,
                (select kind from services where id = v_rec_row.service_id),
                (v_date + v_rec_row.start_time) at time zone v_tz,
                (v_date + v_rec_row.start_time) at time zone v_tz + make_interval(mins => v_rec_row.duration_min), v_rec_row.capacity)
        on conflict do nothing returning id into v_appt;
        if v_appt is not null then
          for v_member in select * from recurrence_members where recurrence_id = v_rec_row.id loop
            insert into appointment_participants (organization_id, appointment_id, patient_id, recurrence_member_id)
            values (v_org, v_appt, v_member.patient_id, v_member.id) returning id into v_part;
            v_status := case when (extract(day from v_date)::int + length(v_member.patient_id::text) + ascii(substr(v_member.patient_id::text, 1, 1))) % 7 = 0
                             then 'absent' else 'completed' end;
            perform public.set_attendance(v_part, v_status, 'manual');
          end loop;
        end if;
      end if;
      v_date := v_date + 7;
    end loop;
  end loop;
  -- faltas frequentes para um aluno (alerta no dashboard e risco de evasão)
  update appointment_participants set status = 'absent'
   where patient_id = v_patients[7] and status = 'completed'
     and appointment_id in (select id from appointments where starts_at < now() and organization_id = v_org);

  -- Avaliação e aula experimental avulsas
  v_appt := public.create_appointment(jsonb_build_object('unit_id', v_unit, 'service_id', sv_avaliacao, 'staff_id', st_mariana,
    'room_id', r_fisio, 'starts_at', ((v_today + 1) + time '10:00') at time zone v_tz, 'override', true, 'patient_ids', jsonb_build_array(v_patients[9])));
  v_appt := public.create_appointment(jsonb_build_object('unit_id', v_unit, 'service_id', sv_trial, 'staff_id', st_carlos,
    'room_id', r_aparelhos, 'starts_at', ((v_today + 2) + time '19:00') at time zone v_tz, 'override', true, 'patient_ids', jsonb_build_array(v_patients[15])));

  -- Um cancelamento com antecedência (gera crédito de reposição)
  select ap.id into v_part from appointment_participants ap join appointments a on a.id = ap.appointment_id
   where ap.patient_id = v_patients[2] and a.starts_at > now() + interval '2 days' and ap.status = 'scheduled' order by a.starts_at limit 1;
  if v_part is not null then perform public.cancel_participation(v_part, 'Viagem a trabalho'); end if;

  -- Prontuários e evoluções (dados clínicos fictícios)
  insert into medical_records (organization_id, patient_id, responsible_staff_id, chief_complaint, current_history, medications, allergies,
                               goals, limitations, contraindications, physio_diagnosis, therapeutic_goals, treatment_plan)
  values
   (v_org, v_patients[5], st_mariana, 'Dor lombar ao permanecer sentado por longos períodos.', 'Dor há cerca de 6 meses, piora no fim do dia.',
    'Nenhum de uso contínuo', 'Não relata', 'Reduzir dor e melhorar postura no trabalho.', 'Evitar flexão de tronco com carga.', 'Nenhuma conhecida',
    'Disfunção de movimento da coluna lombar (exemplo).', 'Fortalecer core e melhorar mobilidade de quadril.', 'Pilates clínico 3x/semana por 12 semanas.'),
   (v_org, v_patients[10], st_mariana, 'Rigidez em ombro direito.', 'Após período de imobilização.', null, null,
    'Recuperar amplitude de movimento.', 'Evitar carga acima da cabeça.', null, null, null, null),
   (v_org, v_patients[1], st_mariana, 'Condicionamento e postura.', null, null, null, 'Melhorar postura e flexibilidade.', null, null, null, null, null);

  for v_part in select ap.id from appointment_participants ap join appointments a on a.id = ap.appointment_id
                 where ap.patient_id = v_patients[5] and ap.status = 'completed' order by a.starts_at limit 3 loop
    insert into clinical_evolutions (organization_id, unit_id, patient_id, appointment_id, participant_id, staff_id, author_id, occurred_at,
                                     complaints, patient_state, exercises, pain_before, pain_after, treatment_response, guidance, next_conduct)
    select v_org, v_unit, v_patients[5], ap.appointment_id, ap.id, st_mariana, coalesce(p_physio, p_owner), a.ends_at,
           'Leve desconforto lombar ao acordar.', 'Disposto, boa mobilidade.',
           '[{"name":"Footwork","springs":"2 vermelhas","sets":2,"reps":"10"},{"name":"Bridging","sets":2,"reps":"10"},{"name":"Cat stretch","sets":1,"reps":"8"}]'::jsonb,
           4, 2, 'Redução da dor após a sessão.', 'Pausas ativas a cada 1 hora no trabalho.', 'Progredir para exercícios em extensão.'
      from appointment_participants ap join appointments a on a.id = ap.appointment_id where ap.id = v_part
    returning id into v_ev;
    perform public.finalize_evolution(v_ev);
  end loop;

  -- Avaliações (paciente 5 com duas para comparação)
  insert into assessments (organization_id, unit_id, patient_id, staff_id, type, assessed_on, height_cm, weight_kg, pain_scale, borg_scale, data, notes, conclusion, next_assessment_on)
  values (v_org, v_unit, v_patients[5], st_mariana, 'physical', v_today - 100, 178, 86.5, 6, 13,
          '{"waist":96,"abdomen":99,"hip":104,"sit_and_reach":14,"plank":35,"sit_to_stand_30s":12,"single_leg_right":18,"single_leg_left":15,"tug":7.9}',
          'Avaliação inicial.', 'Encaminhado para Pilates clínico 3x/semana.', v_today - 10) returning id into v_as;
  perform public.finalize_assessment(v_as);
  insert into assessments (organization_id, unit_id, patient_id, staff_id, type, assessed_on, height_cm, weight_kg, pain_scale, borg_scale, data, notes, conclusion, next_assessment_on)
  values (v_org, v_unit, v_patients[5], st_mariana, 'reassessment', v_today - 8, 178, 83.2, 3, 12,
          '{"waist":92,"abdomen":95,"hip":102,"sit_and_reach":19,"plank":58,"sit_to_stand_30s":15,"single_leg_right":28,"single_leg_left":24,"tug":7.1}',
          'Reavaliação após 12 semanas.', 'Melhora de força, flexibilidade e redução da dor.', v_today + 82) returning id into v_as;
  perform public.finalize_assessment(v_as);
  insert into assessments (organization_id, unit_id, patient_id, staff_id, type, assessed_on, height_cm, weight_kg, pain_scale, data, notes, status)
  values (v_org, v_unit, v_patients[10], st_mariana, 'physical', v_today - 30, 165, 61, 5, '{"waist":74,"sit_and_reach":22,"plank":40}',
          'Avaliação inicial — ombro.', 'draft');

  -- Anamnese preenchida
  v_anam := public.create_anamnesis(v_patients[1], (select id from anamnesis_templates where organization_id = v_org limit 1));
  perform public.submit_anamnesis(v_anam, (select jsonb_object_agg(q ->> 'id',
      case q ->> 'type' when 'multi_select' then '["Melhorar postura","Flexibilidade"]'::jsonb when 'yes_no' then 'false'::jsonb
                        when 'signature' then '"Ana Beatriz Rocha"'::jsonb when 'scale' then '0'::jsonb else '"Não"'::jsonb end)
      from anamnesis a, jsonb_array_elements(a.questions_snapshot) q where a.id = v_anam), 'Ana Beatriz Rocha');

  -- Biblioteca de exercícios
  insert into exercises (organization_id, category_id, name, objective, muscles, level, springs_config, start_position, execution, repetitions, is_custom, description)
  select v_org, (select id from exercise_categories where organization_id = v_org and key = x.cat), x.name, x.obj, x.mus, x.lvl, x.spr, x.pos, x.exe, x.rep, false, x.descr
    from (values
      ('reformer','Footwork','Ativar membros inferiores e alinhamento','{Quadríceps,Isquiotibiais,Panturrilha}'::text[],'beginner','2 vermelhas + 1 azul','Decúbito dorsal, pés na barra','Estender e flexionar os joelhos mantendo pelve neutra.','10 a 12','Exercício de aquecimento clássico do Reformer.'),
      ('reformer','Hundred','Ativação do core e respiração','{Abdominais,Flexores de quadril}'::text[],'intermediate','1 vermelha','Decúbito dorsal, alças nas mãos','Bombear os braços coordenando a respiração (5 inspirações, 5 expirações).','100 batidas','Clássico de aquecimento respiratório.'),
      ('reformer','Short Spine','Mobilidade da coluna','{Abdominais,Extensores da coluna}'::text[],'advanced','1 vermelha','Decúbito dorsal, pés nas alças','Articular a coluna vértebra por vértebra.','5 a 6','Exige bom controle de core.'),
      ('cadillac','Roll Down com barra','Mobilidade e controle da coluna','{Abdominais,Extensores da coluna}'::text[],'beginner','1 mola de braço','Sentado, mãos na barra','Rolar a coluna para trás e retornar com controle.','6 a 8','Ótimo para iniciantes.'),
      ('cadillac','Leg Springs Circles','Mobilidade de quadril','{Adutores,Glúteos}'::text[],'intermediate','Molas de perna','Decúbito dorsal, pés nas alças','Círculos com as pernas estabilizando a pelve.','8 cada sentido',null),
      ('chair','Footwork na Chair','Força de membros inferiores','{Quadríceps,Glúteos,Panturrilha}'::text[],'beginner','2 molas médias','Sentado na Chair','Empurrar o pedal com controle.','10',null),
      ('ladder_barrel','Swan no Barrel','Extensão de coluna','{Extensores da coluna,Glúteos}'::text[],'intermediate',null,'Decúbito ventral sobre o barril','Estender o tronco mantendo o abdômen ativo.','6',null),
      ('spine_corrector','Side Lift','Estabilidade lateral','{Oblíquos,Quadrado lombar}'::text[],'intermediate',null,'Decúbito lateral sobre o corretor','Elevar o tronco lateralmente com controle.','6 cada lado',null),
      ('mat','Bridging','Ativação de glúteos e mobilidade','{Glúteos,Isquiotibiais,Abdominais}'::text[],'beginner',null,'Decúbito dorsal, joelhos flexionados','Elevar a pelve articulando a coluna.','8 a 10','Indicado em programas para coluna lombar.'),
      ('accessories','Cat Stretch com bola','Mobilidade da coluna','{Extensores da coluna,Abdominais}'::text[],'beginner',null,'Quatro apoios','Alternar flexão e extensão da coluna.','8',null)
    ) x(cat, name, obj, mus, lvl, spr, pos, exe, rep, descr);
  select array_agg(id order by name) into v_ex from exercises where organization_id = v_org;

  -- Modelo de programa + programa do aluno
  insert into patient_programs (organization_id, is_template, name, goal, notes)
  values (v_org, true, 'Pilates lombar', 'Estabilização lombar e mobilidade', 'Modelo de apoio — ajuste conforme avaliação profissional.')
  returning id into v_tpl;
  insert into patient_program_exercises (organization_id, program_id, exercise_id, sort_order, sets, repetitions, springs, progression)
  select v_org, v_tpl, e.id, row_number() over (order by e.name), 2, '10', e.springs_config, 'Aumentar repetições quando executar sem dor.'
    from exercises e where e.organization_id = v_org and e.name in ('Footwork','Bridging','Cat Stretch com bola','Roll Down com barra');
  insert into patient_programs (organization_id, is_template, name, goal) values
    (v_org, true, 'Idoso iniciante', 'Equilíbrio, força funcional e confiança'),
    (v_org, true, 'Fortalecimento de core', 'Estabilidade central');
  v_prog := public.apply_program_template(v_tpl, v_patients[5], v_today - 60);

  -- Contratos (1 enviado, 1 aceito)
  v_contract := public.generate_contract((select id from subscriptions where patient_id = v_patients[1] and status = 'active' order by start_date desc limit 1), null);
  update contracts set status = 'sent', sent_at = now() - interval '20 days' where id = v_contract;
  perform private.accept_contract(v_contract, 'Ana Beatriz Rocha');
  v_contract := public.generate_contract((select id from subscriptions where patient_id = v_patients[2] and status = 'active' order by start_date desc limit 1), null);
  update contracts set status = 'sent', sent_at = now() - interval '1 day' where id = v_contract;

  -- Leads (funil)
  insert into leads (organization_id, unit_id, name, phone, whatsapp, origin, interest, stage, notes, next_contact_at, assigned_to, created_at) values
    (v_org, v_unit, 'Renata Albuquerque', '(11) 97777-0001', '(11) 97777-0001', 'instagram', 'Pilates para dor nas costas', 'new', null, null, p_reception, now() - interval '3 hours'),
    (v_org, v_unit, 'Tiago Menezes', '(11) 97777-0002', '(11) 97777-0002', 'google', 'Pilates aparelhos', 'contacted', 'Pediu valores do plano 2x.', now() - interval '1 hour', p_reception, now() - interval '3 days'),
    (v_org, v_unit, 'Vanessa Queiroz', '(11) 97777-0003', '(11) 97777-0003', 'referral', 'Pilates gestante', 'negotiation', 'Fez experimental, avaliando plano trimestral.', now() + interval '1 day', p_reception, now() - interval '10 days'),
    (v_org, v_unit, 'Wagner Fonseca', '(11) 97777-0004', '(11) 97777-0004', 'website', 'Fisioterapia', 'lost', null, null, p_reception, now() - interval '25 days'),
    (v_org, v_unit, 'Yasmin Correia', '(11) 97777-0005', '(11) 97777-0005', 'walk_in', 'Mat Pilates', 'new', null, null, null, now() - interval '30 minutes');
  update leads set lost_reason = 'Horários incompatíveis' where organization_id = v_org and stage = 'lost';
  update leads set trial_attended = true where organization_id = v_org and stage = 'negotiation';
  insert into leads (organization_id, unit_id, name, phone, whatsapp, origin, interest, stage, patient_id, trial_appointment_id, created_at)
  values (v_org, v_unit, v_names[15], '(11) 91015-2015', '(11) 91015-2015', 'instagram', 'Aula experimental', 'trial_scheduled', v_patients[15], v_appt, now() - interval '2 days');
  insert into crm_interactions (organization_id, lead_id, channel, summary)
  select v_org, id, 'whatsapp', 'Primeiro contato realizado, enviado valores.' from leads where organization_id = v_org and stage in ('contacted','negotiation');

  -- Despesas
  insert into accounts_payable (organization_id, unit_id, category_id, description, amount, due_date, competence_date, payment_method)
  values (v_org, v_unit, (select id from financial_categories where organization_id = v_org and key = 'rent'), 'Aluguel do mês', 4500, v_month_start + 4, v_month_start, 'transfer')
  returning id into v_payable;
  perform public.pay_payable(v_payable, least(v_month_start + 4, v_today), null, 'transfer', null);
  insert into accounts_payable (organization_id, unit_id, category_id, description, amount, due_date, competence_date, payment_method)
  values (v_org, v_unit, (select id from financial_categories where organization_id = v_org and key = 'energy'), 'Conta de energia', 620.40, v_today + 6, v_month_start, 'boleto');
  insert into accounts_payable (organization_id, unit_id, category_id, description, amount, due_date, competence_date, payment_method)
  values (v_org, v_unit, (select id from financial_categories where organization_id = v_org and key = 'marketing'), 'Impulsionamento redes sociais', 350, v_today - 3, v_month_start, 'credit_card');
  insert into accounts_payable (organization_id, unit_id, category_id, description, amount, due_date, competence_date, payment_method)
  values (v_org, v_unit, (select id from financial_categories where organization_id = v_org and key = 'accounting'), 'Honorários contábeis', 480, v_month_start - 20, v_month_start - 30, 'pix')
  returning id into v_payable;
  perform public.pay_payable(v_payable, v_month_start - 20, null, 'pix', null);
  perform public.refresh_overdue(v_org);

  -- Estoque
  insert into inventory_products (organization_id, unit_id, name, category, sku, quantity, min_quantity, cost, price, is_for_sale) values
    (v_org, v_unit, 'Faixa elástica média', 'Acessórios', 'FX-M', 12, 4, 18, null, false),
    (v_org, v_unit, 'Bola suíça 65 cm', 'Acessórios', 'BL-65', 4, 2, 65, null, false),
    (v_org, v_unit, 'Meia antiderrapante', 'Produtos vendidos', 'MEIA-AD', 3, 5, 14, 35, true),
    (v_org, v_unit, 'Álcool 70% (1 L)', 'Limpeza', 'ALC-1L', 6, 3, 12, null, false),
    (v_org, v_unit, 'Papel toalha (fardo)', 'Limpeza', 'PT-FD', 2, 2, 28, null, false);
  insert into inventory_movements (organization_id, product_id, type, quantity, unit_cost, notes)
  select v_org, id, 'in', 10, cost, 'Compra inicial' from inventory_products where organization_id = v_org and sku = 'FX-M';
  insert into inventory_movements (organization_id, product_id, type, quantity, notes)
  select v_org, id, 'out', 2, 'Uso nas aulas' from inventory_products where organization_id = v_org and sku = 'FX-M';

  -- Comissões
  insert into commission_rules (organization_id, staff_id, name, basis, value) values (v_org, st_carlos, 'Por aula ministrada', 'per_session', 25);
  insert into commission_rules (organization_id, staff_id, name, basis, value, is_percent) values (v_org, st_mariana, 'Percentual sobre vendas', 'per_sale', 5, true);
  perform public.calculate_commissions(v_org, v_month_start);

  -- Tarefas
  insert into tasks (organization_id, unit_id, title, description, assignee_id, due_at, priority, patient_id) values
    (v_org, v_unit, 'Ligar para ' || v_names[4], 'Mensalidade em atraso — combinar pagamento.', p_reception, now() + interval '4 hours', 'high', v_patients[4]),
    (v_org, v_unit, 'Renovar contrato de ' || v_names[2], null, p_reception, now() + interval '2 days', 'normal', v_patients[2]),
    (v_org, v_unit, 'Solicitar manutenção do Reformer 1', 'Revisão preventiva próxima.', p_owner, now() + interval '5 days', 'normal', null),
    (v_org, v_unit, 'Cobrar ' || v_names[8], null, p_reception, now() - interval '1 day', 'urgent', v_patients[8]);

  -- Site: FAQ, post do blog e depoimento de exemplo (não publicado)
  insert into site_faqs (organization_id, question, answer, sort_order) values
    (v_org, 'Preciso ter experiência para começar?', 'Não. As aulas são adaptadas ao seu nível e começam com uma avaliação.', 1),
    (v_org, 'Quantas pessoas há em cada turma?', 'Nas aulas em aparelhos, no máximo 3 alunos por horário.', 2),
    (v_org, 'Posso repor uma aula?', 'Sim. Cancelamentos feitos com antecedência geram crédito de reposição conforme o seu plano.', 3),
    (v_org, 'Que roupa devo usar?', 'Roupas confortáveis e meias antiderrapantes.', 4);
  insert into site_posts (organization_id, slug, title, excerpt, content, status, published_at) values
    (v_org, 'beneficios-do-pilates', 'Benefícios do Pilates para o dia a dia',
     'Força, mobilidade e consciência corporal: entenda como o método pode ajudar você.',
     'O Pilates trabalha o corpo de forma integrada, com ênfase no controle do movimento, na respiração e no fortalecimento do centro do corpo.\n\nEntre os objetivos mais comuns de quem procura o método estão a melhora da postura, o ganho de flexibilidade e o fortalecimento muscular. Cada aluno deve ser avaliado individualmente para que as aulas respeitem suas necessidades.',
     'published', now() - interval '5 days');
  insert into site_testimonials (organization_id, author_name, content, is_published)
  values (v_org, 'Exemplo — substitua', 'Cadastre aqui depoimentos reais, somente com autorização do autor.', false);

  -- Notificações iniciais
  perform private.notify_permission(v_org, 'finance.view', 'overdue_payment', 'Mensalidades vencidas',
    'Há mensalidades vencidas aguardando cobrança.', '/app/financeiro/inadimplencia', 'accounts_receivable', null);
  perform private.notify_permission(v_org, 'equipment.view', 'maintenance', 'Manutenção próxima', 'Reformer 1: manutenção preventiva em 8 dias.',
    '/app/equipamentos', 'equipment', e_reformer);
  perform private.notify_permission(v_org, 'inventory.view', 'low_stock', 'Estoque baixo', 'Meia antiderrapante: 3 unidades (mínimo 5).',
    '/app/estoque', 'inventory_products', null);

  update organizations set onboarding_completed_at = now(), onboarding_step = 10, website = 'https://studiomovimento.exemplo' where id = v_org;
  return v_org;
end $$;
revoke all on function private.seed_demo(uuid, uuid, uuid, uuid, uuid) from public, authenticated, anon;

-- Wrapper chamável pelo script (service role) via RPC
create or replace function public.seed_demo_data(p_owner uuid, p_physio uuid default null, p_instructor uuid default null,
  p_reception uuid default null, p_patient_user uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Somente o script de seed (service role) pode executar esta função.' using errcode = '42501';
  end if;
  return private.seed_demo(p_owner, p_physio, p_instructor, p_reception, p_patient_user);
end $$;
revoke all on function public.seed_demo_data(uuid, uuid, uuid, uuid, uuid) from public, authenticated, anon;
grant execute on function public.seed_demo_data(uuid, uuid, uuid, uuid, uuid) to service_role;
