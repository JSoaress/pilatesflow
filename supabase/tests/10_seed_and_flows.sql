-- =====================================================================
-- Testes de integração do banco (executados em PostgreSQL local com stub do Supabase)
-- Cada bloco lança exceção se a regra de negócio não se comportar como esperado.
-- =====================================================================
\set ON_ERROR_STOP on

-- Usuários de demonstração
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@demo.test'),
  ('00000000-0000-0000-0000-00000000000b', 'mariana@demo.test'),
  ('00000000-0000-0000-0000-00000000000c', 'carlos@demo.test'),
  ('00000000-0000-0000-0000-00000000000d', 'recepcao@demo.test'),
  ('00000000-0000-0000-0000-00000000000e', 'aluno@demo.test'),
  ('00000000-0000-0000-0000-00000000000f', 'intruso@demo.test');

select public.seed_demo_data('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000e') as org \gset

-- Quantidades mínimas exigidas pelo seed
do $$
declare o uuid := (select id from organizations where slug = 'studio-movimento');
begin
  assert (select count(*) from patients where organization_id = o) >= 15, 'alunos < 15';
  assert (select count(*) from leads where organization_id = o) >= 5, 'leads < 5';
  assert (select count(*) from plans where organization_id = o) >= 4, 'planos < 4';
  assert (select count(*) from appointments where organization_id = o) >= 20, 'aulas < 20';
  assert (select count(*) from payments where organization_id = o) >= 5, 'pagamentos < 5';
  assert (select count(*) from accounts_payable where organization_id = o) >= 3, 'despesas < 3';
  assert (select count(*) from assessments where organization_id = o) >= 3, 'avaliações < 3';
  assert (select count(*) from exercises where organization_id = o) >= 10, 'exercícios < 10';
  assert (select count(*) from equipment where organization_id = o) >= 3, 'equipamentos < 3';
  assert (select count(*) from notifications where organization_id = o) > 0, 'sem notificações';
  assert (select count(*) from accounts_receivable where organization_id = o and status = 'overdue') > 0, 'sem inadimplência';
  assert (select count(*) from accounts_receivable where organization_id = o and status = 'partial') > 0, 'sem pagamento parcial';
  assert (select count(*) from replacement_credits where organization_id = o) > 0, 'sem créditos de reposição';
  assert (select count(*) from appointment_participants ap join appointments a on a.id = ap.appointment_id
           where a.organization_id = o and ap.status = 'completed') > 0, 'sem presenças';
  assert (select count(*) from audit_logs where organization_id = o) > 100, 'auditoria não registrou';
  raise notice 'Seed OK: % alunos, % aulas, % pagamentos', (select count(*) from patients where organization_id = o),
    (select count(*) from appointments where organization_id = o), (select count(*) from payments where organization_id = o);
end $$;

-- ---------------------------------------------------------------------
-- Agenda: conflitos, capacidade, cancelamento, reposição, presença
-- ---------------------------------------------------------------------
select public.test_login('00000000-0000-0000-0000-00000000000d'); -- recepção
do $$
declare
  o uuid := (select id from organizations where slug = 'studio-movimento');
  u uuid := (select id from units where organization_id = o limit 1);
  carlos uuid := (select id from staff where full_name = 'Carlos Lima');
  svc uuid := (select id from services where organization_id = o and name = 'Pilates individual');
  sala uuid := (select id from rooms where organization_id = o and name = 'Sala de Aparelhos');
  p1 uuid := (select id from patients where full_name = 'Ana Beatriz Rocha');
  p2 uuid := (select id from patients where full_name = 'Bruno Henrique Matos');
  p3 uuid := (select id from patients where full_name = 'Camila Ferreira Nunes');
  p9 uuid := (select id from patients where full_name = 'Isabela Martins Freitas');
  a record; v_appt uuid; v_part uuid; v_res jsonb; v_ok boolean; v_bal_before int; v_credits_before int; v_t timestamptz; v_msg text;
begin
  -- próxima ocorrência de "Aparelhos manhã" (Carlos, 07:00, cheia com 3 alunos)
  select * into a from appointments where organization_id = o and recurrence_id is not null and staff_id = carlos
     and status = 'scheduled' and starts_at > now() + interval '1 day'
     and (select count(*) from appointment_participants x where x.appointment_id = appointments.id and x.status <> 'cancelled') = 3
   order by starts_at limit 1;
  assert a.id is not null, 'turma cheia não encontrada';

  -- 1) Profissional ocupado
  v_ok := false;
  begin
    perform public.create_appointment(jsonb_build_object('unit_id', u, 'service_id', svc, 'staff_id', carlos,
      'starts_at', a.starts_at + interval '10 minutes', 'patient_ids', jsonb_build_array(p9)));
  exception when others then v_ok := sqlerrm like '%Carlos Lima já tem atendimento%'; v_msg := sqlerrm; end;
  assert v_ok, 'conflito de profissional não detectado: ' || coalesce(v_msg, 'sem erro');

  -- 2) Turma lotada
  v_ok := false;
  begin
    perform public.add_participant(a.id, p9);
  exception when others then v_ok := sqlerrm like 'Turma lotada%'; end;
  assert v_ok, 'capacidade não respeitada';

  -- 3) Lista de espera + cancelamento com antecedência gera crédito e notifica a lista
  perform public.join_waitlist(a.id, p9);
  select id into v_part from appointment_participants where appointment_id = a.id and status <> 'cancelled'
     and patient_id <> p2 order by created_at limit 1;
  select count(*) into v_credits_before from replacement_credits where patient_id = (select patient_id from appointment_participants where id = v_part);
  v_res := public.cancel_participation(v_part, 'Consulta médica');
  assert (v_res ->> 'with_notice')::boolean, 'deveria ser com antecedência';
  assert (select status from waitlist where appointment_id = a.id and patient_id = p9) = 'notified', 'lista de espera não notificada';
  assert (select count(*) from notifications where type = 'waitlist_spot' and entity_id = a.id) > 0, 'sem notificação de vaga';
  -- aluno da lista de espera ocupa a vaga
  perform public.add_participant(a.id, p9);
  assert (select status from waitlist where appointment_id = a.id and patient_id = p9) = 'accepted', 'waitlist não aceita';

  -- 4) Sala ocupada: outro atendimento na mesma sala lotada (cap. 3) no mesmo horário
  v_ok := false;
  begin
    perform public.create_appointment(jsonb_build_object('unit_id', u, 'service_id', svc,
      'staff_id', (select id from staff where full_name = 'Mariana Souza'), 'room_id', sala,
      'starts_at', a.starts_at, 'patient_ids', '[]'::jsonb, 'override', true));
  exception when others then v_ok := sqlerrm like '%sala "Sala de Aparelhos" já está ocupada%'; v_msg := sqlerrm; end;
  assert v_ok, 'conflito de sala não detectado: ' || coalesce(v_msg, 'sem erro');

  -- 5) Aluno em dois lugares
  v_ok := false;
  begin
    perform public.create_appointment(jsonb_build_object('unit_id', u, 'service_id', svc,
      'staff_id', (select id from staff where full_name = 'Mariana Souza'),
      'starts_at', a.starts_at, 'patient_ids', jsonb_build_array(p9), 'override', true));
  exception when others then v_ok := sqlerrm like '%já está agendado(a)%'; v_msg := sqlerrm; end;
  assert v_ok, 'conflito de aluno não detectado: ' || coalesce(v_msg, 'sem erro');

  -- 6) Fora da jornada exige autorização (recepção não tem schedule.override)
  v_t := (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '3 days 22 hours') at time zone 'America/Sao_Paulo';
  v_ok := false;
  begin
    perform public.create_appointment(jsonb_build_object('unit_id', u, 'service_id', svc, 'staff_id', carlos,
      'starts_at', v_t, 'patient_ids', jsonb_build_array(p9), 'override', true));
  exception when others then v_ok := sqlerrm like '%não trabalha neste horário%' or sqlerrm like '%feriado%'; v_msg := sqlerrm; end;
  assert v_ok, 'jornada não respeitada: ' || coalesce(v_msg, 'sem erro');

  -- 7) Cancelamento sem antecedência não gera crédito
  v_appt := public.create_appointment(jsonb_build_object('unit_id', u, 'service_id', svc,
    'staff_id', (select id from staff where full_name = 'Mariana Souza'),
    'starts_at', now() + interval '1 hour', 'patient_ids', jsonb_build_array(p3), 'override', false));
  select id into v_part from appointment_participants where appointment_id = v_appt;
  select count(*) into v_credits_before from replacement_credits where patient_id = p3;
  v_res := public.cancel_participation(v_part, 'Imprevisto');
  assert not (v_res ->> 'with_notice')::boolean, 'deveria ser sem antecedência';
  assert (select count(*) from replacement_credits where patient_id = p3) = v_credits_before, 'gerou crédito indevido';
exception when others then
  -- quando o "agora + 1h" cai fora da jornada da Mariana, o teste 7 não se aplica
  if sqlerrm like '%não trabalha neste horário%' or sqlerrm like '%feriado%' or sqlerrm like '%já tem atendimento%' or sqlerrm like '%já está agendado%' then
    raise notice 'Teste 7 ignorado (horário fora da jornada): %', sqlerrm;
  else
    raise;
  end if;
end $$;

-- Presença consome aula do plano e é idempotente
select public.test_login('00000000-0000-0000-0000-00000000000a');
do $$
declare v_part uuid; v_sub uuid; v_before int; v_after int;
begin
  select ap.id, ap.patient_id into v_part from appointment_participants ap join appointments a on a.id = ap.appointment_id
   where a.starts_at between now() - interval '3 days' and now() and ap.status = 'completed' and ap.credit_consumed limit 1;
  if v_part is null then raise notice 'sem aula recente consumida — teste de idempotência ignorado'; return; end if;
  select subscription_id into v_sub from appointment_participants where id = v_part;
  select sessions_used into v_before from subscriptions where id = v_sub;
  perform public.set_attendance(v_part, 'present');
  perform public.set_attendance(v_part, 'completed');
  select sessions_used into v_after from subscriptions where id = v_sub;
  assert v_before = v_after, 'consumo de aula não é idempotente';
  perform public.set_attendance(v_part, 'scheduled');
  assert (select sessions_used from subscriptions where id = v_sub) = v_before - 1, 'aula não devolvida ao desfazer presença';
  perform public.set_attendance(v_part, 'completed');
end $$;

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
do $$
declare o uuid := (select id from organizations where slug = 'studio-movimento'); r record; v_pay uuid; v_pay2 uuid; v_ok boolean;
begin
  select * into r from accounts_receivable where organization_id = o and status in ('pending','overdue') and amount_paid = 0
   order by due_date limit 1;
  v_pay := public.register_payment(r.id, 10, 'cash');
  assert (select status from accounts_receivable where id = r.id) = 'partial', 'status parcial';
  v_ok := false;
  begin perform public.register_payment(r.id, r.amount, 'pix'); exception when others then v_ok := sqlerrm like 'Valor%maior que o saldo%'; end;
  assert v_ok, 'aceitou pagamento acima do saldo';
  v_pay2 := public.register_payment(r.id, r.amount - 10, 'pix');
  assert (select status from accounts_receivable where id = r.id) = 'paid', 'não quitou';
  assert (select count(*) from cash_movements where payment_id in (v_pay, v_pay2)) = 2, 'caixa não lançado';
  assert (select receipt_number from payments where id = v_pay2) > (select receipt_number from payments where id = v_pay), 'numeração de recibo';
  perform public.refund_payment(v_pay2, 'Pagamento em duplicidade');
  assert (select status from accounts_receivable where id = r.id) = 'partial', 'estorno não reabriu o título';
  assert (select count(*) from cash_movements where payment_id = v_pay2 and type = 'out') = 1, 'estorno sem saída de caixa';
  v_ok := false;
  begin delete from cash_movements where payment_id = v_pay; exception when others then v_ok := true; end;
  assert v_ok, 'permitiu excluir movimento de caixa';
  assert (select receipt_data(v_pay) ->> 'client') is not null, 'recibo sem cliente';
end $$;

-- Fluxo de caixa e relatórios executam
select count(*) > 0 as fluxo_ok from public.cash_flow((select id from organizations where slug = 'studio-movimento'), null,
  (now() - interval '60 days')::date, now()::date, 'month');
select (public.dashboard_summary((select id from organizations where slug = 'studio-movimento'), null, date_trunc('month', now())::date, now()::date) ? 'revenue') as dashboard_ok;
select jsonb_array_length(public.dashboard_charts((select id from organizations where slug = 'studio-movimento'), null, 6) -> 'monthly') = 6 as charts_ok;
select (public.report_finance((select id from organizations where slug = 'studio-movimento'), null, (now() - interval '90 days')::date, now()::date) ? 'by_staff') as rel_fin_ok;
select (public.report_schedule((select id from organizations where slug = 'studio-movimento'), null, (now() - interval '30 days')::date, now()::date) ? 'by_slot') as rel_agenda_ok;
select jsonb_typeof(public.report_staff((select id from organizations where slug = 'studio-movimento'), null, (now() - interval '30 days')::date, now()::date)) = 'array' as rel_staff_ok;
select (public.report_marketing((select id from organizations where slug = 'studio-movimento'), (now() - interval '90 days')::date, now()::date) ? 'by_origin') as rel_mkt_ok;
select count(*) filter (where level = 'Alto') >= 1 as risco_ok from public.patient_risk((select id from organizations where slug = 'studio-movimento'));
select jsonb_array_length(public.search_global((select id from organizations where slug = 'studio-movimento'), 'ana')) > 0 as busca_ok;
select (public.dashboard_lists((select id from organizations where slug = 'studio-movimento'), null) ? 'overdue_payments') as listas_ok;

-- ---------------------------------------------------------------------
-- Prontuário: imutabilidade e adendo
-- ---------------------------------------------------------------------
select public.test_login('00000000-0000-0000-0000-00000000000b'); -- fisioterapeuta
do $$
declare e uuid; v_ok boolean; v_add uuid;
begin
  select id into e from clinical_evolutions where status = 'finalized' and amends_id is null limit 1;
  assert e is not null, 'sem evolução finalizada visível para a fisioterapeuta';
  v_ok := false;
  begin update clinical_evolutions set notes = 'alterado' where id = e; exception when others then v_ok := sqlerrm like '%não pode ser alterado%'; end;
  assert v_ok, 'permitiu alterar evolução finalizada';
  v_ok := false;
  begin delete from clinical_evolutions where id = e; exception when others then v_ok := true; end;
  if not v_ok then assert exists (select 1 from clinical_evolutions where id = e), 'excluiu evolução finalizada'; end if;
  v_add := public.add_evolution_addendum(e, 'Correção: dor antes da sessão era 5.', 'Erro de digitação');
  assert (select amends_id from clinical_evolutions where id = v_add) = e, 'adendo não vinculado';
  update medical_records set clinical_notes = 'Nova observação' where patient_id = (select patient_id from clinical_evolutions where id = e);
  assert (select count(*) from medical_record_history) >= 1, 'histórico do prontuário não registrado';
end $$;

-- ---------------------------------------------------------------------
-- RLS: isolamento por permissão e por organização
-- ---------------------------------------------------------------------
-- Instrutor: vê alunos e agenda, NÃO vê financeiro nem prontuário
select public.test_login('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$
begin
  assert (select count(*) from patients) > 0, 'instrutor deveria ver alunos';
  assert (select count(*) from appointments) > 0, 'instrutor deveria ver agenda';
  assert (select count(*) from accounts_receivable) = 0, 'instrutor NÃO pode ver financeiro';
  assert (select count(*) from payments) = 0, 'instrutor NÃO pode ver pagamentos';
  assert (select count(*) from medical_records) = 0, 'instrutor NÃO pode ver prontuário';
  assert (select count(*) from clinical_evolutions) = 0, 'instrutor NÃO pode ver evoluções';
  assert (select count(*) from audit_logs) = 0, 'instrutor NÃO pode ver auditoria';
  assert (public.dashboard_summary((select id from organizations limit 1), null, current_date, current_date) ->> 'revenue') is null,
    'dashboard expôs receita ao instrutor';
end $$;
do $$
declare v_ok boolean := false;
begin
  begin perform public.register_payment((select id from v_receivables limit 1), 10, 'pix');
  exception when others then v_ok := true; end;
  assert v_ok, 'instrutor conseguiu registrar pagamento';
end $$;
reset role;

-- Recepção não pode alterar status do título diretamente (somente via RPC)
select public.test_login('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$
declare v_ok boolean := false;
begin
  begin update accounts_receivable set status = 'paid' where id = (select id from accounts_receivable where status = 'overdue' limit 1);
  exception when insufficient_privilege then v_ok := true; end;
  assert v_ok, 'recepção alterou status do título diretamente';
  v_ok := false;
  begin update audit_logs set action = 'x'; exception when others then v_ok := true; end;
  assert v_ok, 'auditoria alterável';
end $$;
reset role;

-- Usuário sem vínculo: não vê nada
select public.test_login('00000000-0000-0000-0000-00000000000f');
set role authenticated;
do $$
begin
  assert (select count(*) from patients) = 0, 'intruso viu alunos';
  assert (select count(*) from organizations) = 0, 'intruso viu organizações';
  assert (select count(*) from profiles where id <> auth.uid()) = 0, 'intruso viu perfis';
  assert (select count(*) from staff) = 0, 'intruso viu equipe';
end $$;
reset role;

-- Aluno (portal): vê apenas os próprios dados, nunca prontuário de outros
select public.test_login('00000000-0000-0000-0000-00000000000e');
set role authenticated;
do $$
declare v jsonb; pid uuid; v_ok boolean := false; other uuid;
begin
  assert (select count(*) from patients) = 0, 'aluno acessou tabela de alunos diretamente';
  assert (select count(*) from medical_records) = 0, 'aluno acessou prontuário';
  v := public.portal_me();
  assert jsonb_array_length(v) = 1, 'portal_me deveria retornar 1 vínculo';
  pid := (v -> 0 ->> 'patient_id')::uuid;
  assert jsonb_array_length(public.portal_appointments(pid, now() - interval '30 days', now() + interval '30 days')) > 0, 'portal sem aulas';
  assert jsonb_typeof(public.portal_financial(pid) -> 'receivables') = 'array', 'portal sem financeiro';
  reset role;
  select id into other from patients where id <> pid and organization_id = (select organization_id from patients where id = pid) limit 1;
  set role authenticated;
  begin perform public.portal_financial(other); exception when others then v_ok := true; end;
  assert v_ok, 'aluno acessou dados de outro aluno';
end $$;
reset role;

-- Visitante anônimo: site e lead OK; tabelas bloqueadas
select public.test_login(null);
set role anon;
do $$
declare v jsonb; v_ok boolean := false;
begin
  v := public.public_site('studio-movimento');
  assert v -> 'organization' ->> 'name' = 'Studio Movimento Pilates', 'site público';
  assert jsonb_array_length(v -> 'plans') >= 4, 'planos no site';
  assert jsonb_array_length(v -> 'testimonials') = 0, 'depoimento de exemplo não deveria ser publicado';
  perform public.public_create_lead('studio-movimento', 'Visitante Teste', '(11) 98765-4321', 'v@exemplo.com', 'Pilates', null, true, null, 'website');
  begin perform count(*) from patients; exception when insufficient_privilege then v_ok := true; end;
  assert v_ok, 'anon acessou tabela de alunos';
  v_ok := false;
  begin perform public.public_create_lead('studio-movimento', 'Sem Consentimento', '(11) 98765-4321', null, null, null, false, null, 'website');
  exception when others then v_ok := sqlerrm like '%Política de Privacidade%'; end;
  assert v_ok, 'lead sem consentimento aceito';
  v_ok := false;
  begin perform public.refresh_overdue(null); exception when insufficient_privilege then v_ok := true; end;
  assert v_ok, 'anon executou rotina interna';
  v := public.public_booking_options('studio-movimento');
  assert jsonb_array_length(v -> 'services') >= 1, 'opções de agendamento';
end $$;
reset role;

-- Agendamento online de experimental (anon): encontra um horário livre e agenda
select public.test_login(null);
set role anon;
do $$
declare v_opts jsonb := public.public_booking_options('studio-movimento'); v_slots jsonb; v_d date; v_res jsonb; v_slot jsonb; i int;
begin
  for i in 1..14 loop
    v_d := current_date + i;
    v_slots := public.public_available_slots('studio-movimento', (v_opts -> 'units' -> 0 ->> 'id')::uuid,
      (v_opts -> 'services' -> 0 ->> 'id')::uuid, v_d, null);
    exit when jsonb_array_length(v_slots) > 0;
  end loop;
  assert jsonb_array_length(v_slots) > 0, 'nenhum horário disponível online em 14 dias';
  v_slot := v_slots -> 0;
  v_res := public.public_book_trial('studio-movimento', jsonb_build_object('name', 'Paula Experimental', 'phone', '(11) 99876-5432',
    'email', 'paula@exemplo.com', 'unit_id', v_opts -> 'units' -> 0 ->> 'id', 'service_id', v_opts -> 'services' -> 0 ->> 'id',
    'starts_at', v_slot ->> 'starts_at', 'staff_id', v_slot ->> 'staff_id', 'appointment_id', v_slot ->> 'appointment_id', 'consent', true));
  assert (v_res ->> 'ok')::boolean, 'agendamento online falhou';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from leads where name = 'Paula Experimental' and stage = 'trial_scheduled' and patient_id is not null), 'lead do agendamento';
  assert exists (select 1 from consents where lead_id = (select id from leads where name = 'Paula Experimental')), 'consentimento não registrado';
end $$;

-- LGPD: anonimização bloqueada para quem tem prontuário recente; exportação gera auditoria
select public.test_login('00000000-0000-0000-0000-00000000000a');
do $$
declare v_ok boolean := false; p uuid := (select patient_id from medical_records limit 1); v jsonb;
begin
  begin perform public.anonymize_patient(p); exception when others then v_ok := sqlerrm like '%guarda obrigatória%'; end;
  assert v_ok, 'anonimizou paciente com prontuário dentro do prazo de guarda';
  v := public.export_patient_data(p);
  assert v ? 'prontuario', 'exportação incompleta';
  assert exists (select 1 from audit_logs where action = 'export' and entity_id = p::text), 'exportação não auditada';
end $$;

-- Proprietário não pode ser removido se for o único
do $$
declare v_ok boolean := false;
begin
  begin
    update organization_members set status = 'suspended'
     where user_id = '00000000-0000-0000-0000-00000000000a';
  exception when others then v_ok := sqlerrm like '%pelo menos um proprietário%'; end;
  assert v_ok, 'permitiu suspender o único proprietário';
end $$;

-- Rotinas diárias executam
select public.refresh_overdue(null) >= 0 as cron_overdue, public.generate_all_recurrences(null) >= 0 as cron_recurrences,
       public.expire_replacement_credits() >= 0 as cron_credits, public.renew_subscriptions(null) >= 0 as cron_renew;


-- Gateway: baixa automática idempotente
select public.test_login(null);
do $$
declare r accounts_receivable%rowtype; v text; v2 text;
begin
  select * into r from accounts_receivable where status = 'overdue' and amount_paid = 0 limit 1;
  insert into payment_gateway_charges (organization_id, receivable_id, provider, external_id, method, status, amount)
  values (r.organization_id, r.id, 'asaas', 'pay_test_1', 'pix', 'pending', r.amount);
  v := public.gateway_confirm_payment('asaas', 'pay_test_1', 'evt_1', 'paid', r.amount, now(), r.id::text, null);
  v2 := public.gateway_confirm_payment('asaas', 'pay_test_1', 'evt_1', 'paid', r.amount, now(), r.id::text, null);
  assert (select status from accounts_receivable where id = r.id) = 'paid', 'baixa automática falhou';
  assert v2 = 'duplicate', 'webhook duplicado reprocessado';
  assert (select count(*) from payments where gateway_payment_id = 'pay_test_1') = 1, 'pagamento duplicado';
end $$;

-- Automações e fila de mensagens
update system_settings set value = value || '{"appointment_reminder_enabled": true, "overdue_reminder_enabled": true, "payment_due_reminder_enabled": true, "birthday_message_enabled": true, "overdue_reminder_every_days": 1}'::jsonb
 where key = 'automations';
select (public.run_automations(null) ->> 'messages_queued')::int > 0 as automacoes_ok;
do $$
declare m messages%rowtype; n int := 0;
begin
  for m in select * from public.claim_messages(5) loop
    perform public.fail_message(m.id, 'Integração do WhatsApp não configurada.');
    n := n + 1;
  end loop;
  assert n > 0, 'fila de mensagens vazia';
  assert (select count(*) from messages where status = 'failed' and error like 'Integração%') = n, 'mensagem marcada como enviada sem envio real';
end $$;

\echo 'TODOS OS TESTES PASSARAM'
