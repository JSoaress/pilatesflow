-- =====================================================================
-- PilatesFlow — 0013 Criação de organização (onboarding) e padrões
-- =====================================================================

-- Conjuntos de permissões dos perfis padrão
create or replace function private.default_role_permissions(p_role text) returns text[]
language sql immutable as $$
  select case p_role
    when 'manager' then array(select key from public.permissions where key not in ('users.manage','lgpd.manage','portal.access'))
    when 'receptionist' then array[
      'dashboard.view','schedule.view','schedule.create','schedule.edit','patients.view','patients.create','patients.edit',
      'plans.view','contracts.view','contracts.create','finance.view','finance.create','crm.view','crm.create','crm.edit',
      'communication.view','communication.create','tasks.view','tasks.create','tasks.edit','documents.view','documents.create',
      'exercises.view','equipment.view','inventory.view','staff.view']
    when 'physiotherapist' then array[
      'dashboard.view','schedule.view','schedule.create','schedule.edit','patients.view','patients.edit',
      'medical_records.view','medical_records.create','medical_records.edit','assessments.view','assessments.create',
      'assessments.edit','exercises.view','exercises.create','exercises.edit','documents.view','documents.create',
      'tasks.view','tasks.create','tasks.edit','equipment.view','staff.view','communication.view']
    when 'instructor' then array[
      'dashboard.view','schedule.view','schedule.edit','patients.view','exercises.view','exercises.create','exercises.edit',
      'assessments.view','tasks.view','tasks.edit','equipment.view']
    when 'finance' then array[
      'dashboard.view','patients.view','plans.view','plans.create','plans.edit','contracts.view','contracts.create',
      'contracts.export','finance.view','finance.create','finance.edit','finance.export','finance.refund','commissions.view',
      'commissions.create','commissions.edit','commissions.export','reports.view','reports.export','inventory.view',
      'communication.view','communication.create','tasks.view','tasks.create','tasks.edit']
    when 'patient' then array['portal.access']
    else array[]::text[] end
$$;

create or replace function private.seed_org_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role record; v_role_id uuid; v_tpl uuid; v_cat_parent uuid;
begin
  -- Perfis de acesso
  for v_role in select * from (values
    ('owner','Administrador / Proprietário','Acesso total, inclusive usuários, permissões e LGPD.'),
    ('manager','Gerente','Gestão completa da operação, exceto usuários e LGPD.'),
    ('receptionist','Recepcionista','Agenda, alunos, CRM, recebimentos e comunicação.'),
    ('physiotherapist','Fisioterapeuta','Agenda, prontuário, avaliações e exercícios.'),
    ('instructor','Professor / Instrutor','Agenda, presença e exercícios. Sem financeiro e sem prontuário.'),
    ('finance','Financeiro','Financeiro, planos, contratos, comissões e relatórios.'),
    ('patient','Aluno / Paciente','Acesso somente ao Portal do Aluno.')
  ) as r(key, name, description) loop
    insert into roles (organization_id, key, name, description, is_system)
    values (p_org, v_role.key, v_role.name, v_role.description, true)
    on conflict (organization_id, key) do nothing returning id into v_role_id;
    if v_role_id is not null and v_role.key <> 'owner' then
      insert into role_permissions (role_id, permission_key)
      select v_role_id, k from unnest(private.default_role_permissions(v_role.key)) k
       where exists (select 1 from permissions where key = k)
      on conflict do nothing;
    end if;
  end loop;

  -- Configurações
  insert into system_settings (organization_id, key, value) values
    (p_org, 'schedule_rules', jsonb_build_object('replacements_per_month', 2, 'replacement_validity_days', 30,
       'min_cancel_notice_hours', 3, 'absence_generates_credit', false, 'absence_consumes_session', true,
       'holiday_generates_credit', true, 'staff_absence_generates_credit', true, 'recurrence_horizon_days', 60,
       'waitlist_hold_hours', 2, 'checkin_window_minutes', 60)),
    (p_org, 'online_booking', jsonb_build_object('enabled', true, 'min_advance_hours', 2, 'max_days_ahead', 30, 'slot_step_minutes', 0)),
    (p_org, 'reassessment_interval_days', '90'::jsonb),
    (p_org, 'clinical_retention_years', '20'::jsonb),
    (p_org, 'automations', jsonb_build_object('appointment_reminder_hours', 24, 'appointment_reminder_enabled', false,
       'payment_due_reminder_days', 2, 'payment_due_reminder_enabled', false, 'overdue_reminder_enabled', false,
       'overdue_reminder_every_days', 7, 'birthday_message_enabled', false, 'channel', 'whatsapp')),
    (p_org, 'backup_policy', jsonb_build_object('database', 'Backups diários automáticos do provedor (Supabase) + exportação semanal via script',
       'storage', 'Cópia semanal dos buckets privados via script', 'retention_days', 30)),
    (p_org, 'website', jsonb_build_object(
       'hero_title', 'Movimento com consciência, saúde para a vida toda',
       'hero_subtitle', 'Pilates em aparelhos e solo com acompanhamento profissional, turmas reduzidas e atendimento individualizado.',
       'about_title', 'Sobre a clínica',
       'about_text', 'Somos um studio dedicado ao Pilates e à reabilitação, com profissionais qualificados e atenção a cada aluno.',
       'pilates_text', 'O Pilates é um método de exercícios que trabalha força, flexibilidade, postura e consciência corporal, com movimentos controlados e adaptados a cada pessoa.',
       'structure_text', 'Ambiente climatizado, aparelhos completos e salas preparadas para aulas individuais e em pequenos grupos.',
       'cta_label', 'Agende sua aula experimental',
       'seo_title', '', 'seo_description', '', 'google_maps_embed_url', '', 'show_prices', true))
  on conflict do nothing;

  -- Categorias financeiras
  insert into financial_categories (organization_id, type, name, key) values
    (p_org, 'income', 'Mensalidades', 'tuition'), (p_org, 'income', 'Avaliações', 'assessment'),
    (p_org, 'income', 'Sessões avulsas', 'single_session'), (p_org, 'income', 'Produtos', 'products'),
    (p_org, 'income', 'Taxas', 'fees'), (p_org, 'income', 'Outras receitas', 'other_income'),
    (p_org, 'expense', 'Aluguel', 'rent'), (p_org, 'expense', 'Funcionários', 'staff_costs'),
    (p_org, 'expense', 'Energia', 'energy'), (p_org, 'expense', 'Água', 'water'), (p_org, 'expense', 'Internet', 'internet'),
    (p_org, 'expense', 'Marketing', 'marketing'), (p_org, 'expense', 'Contabilidade', 'accounting'),
    (p_org, 'expense', 'Manutenção', 'maintenance'), (p_org, 'expense', 'Compra de produtos', 'product_purchase'),
    (p_org, 'expense', 'Impostos', 'taxes'), (p_org, 'expense', 'Outras despesas', 'other_expense')
  on conflict do nothing;

  insert into payment_methods (organization_id, key, name) values
    (p_org, 'pix', 'Pix'), (p_org, 'cash', 'Dinheiro'), (p_org, 'credit_card', 'Cartão de crédito'),
    (p_org, 'debit_card', 'Cartão de débito'), (p_org, 'boleto', 'Boleto'), (p_org, 'transfer', 'Transferência'),
    (p_org, 'other', 'Outro')
  on conflict do nothing;

  insert into cash_accounts (organization_id, name, kind) values (p_org, 'Caixa', 'cash'), (p_org, 'Conta bancária', 'bank');

  insert into exercise_categories (organization_id, key, name, sort_order) values
    (p_org, 'reformer', 'Reformer', 1), (p_org, 'cadillac', 'Cadillac', 2), (p_org, 'chair', 'Chair', 3),
    (p_org, 'ladder_barrel', 'Ladder Barrel', 4), (p_org, 'spine_corrector', 'Spine Corrector', 5),
    (p_org, 'mat', 'Mat Pilates', 6), (p_org, 'accessories', 'Acessórios', 7)
  on conflict do nothing;

  insert into assessment_fields (organization_id, section, key, label, unit, higher_is_better, sort_order) values
    (p_org, 'circumferences', 'waist', 'Cintura', 'cm', false, 10),
    (p_org, 'circumferences', 'abdomen', 'Abdômen', 'cm', false, 11),
    (p_org, 'circumferences', 'hip', 'Quadril', 'cm', null, 12),
    (p_org, 'circumferences', 'thigh_right', 'Coxa direita', 'cm', null, 13),
    (p_org, 'circumferences', 'arm_right', 'Braço direito', 'cm', null, 14),
    (p_org, 'rom', 'shoulder_flexion_right', 'Flexão de ombro D', '°', true, 20),
    (p_org, 'rom', 'shoulder_flexion_left', 'Flexão de ombro E', '°', true, 21),
    (p_org, 'rom', 'hip_flexion_right', 'Flexão de quadril D', '°', true, 22),
    (p_org, 'rom', 'hip_flexion_left', 'Flexão de quadril E', '°', true, 23),
    (p_org, 'flexibility', 'sit_and_reach', 'Sentar e alcançar (banco de Wells)', 'cm', true, 30),
    (p_org, 'strength', 'plank', 'Prancha ventral', 's', true, 40),
    (p_org, 'strength', 'sit_to_stand_30s', 'Sentar e levantar em 30 s', 'reps', true, 41),
    (p_org, 'balance', 'single_leg_right', 'Apoio unipodal D', 's', true, 50),
    (p_org, 'balance', 'single_leg_left', 'Apoio unipodal E', 's', true, 51),
    (p_org, 'mobility', 'thoracic_rotation', 'Rotação torácica', '°', true, 60),
    (p_org, 'coordination', 'coordination_score', 'Coordenação (0–10)', 'pontos', true, 70),
    (p_org, 'endurance', 'six_min_walk', 'Caminhada de 6 minutos', 'm', true, 80),
    (p_org, 'functional_tests', 'tug', 'Timed Up and Go', 's', false, 90)
  on conflict do nothing;

  -- Anamnese padrão
  insert into anamnesis_templates (organization_id, name, description, is_default)
  values (p_org, 'Anamnese padrão de Pilates', 'Perguntas iniciais antes da avaliação.', true) returning id into v_tpl;
  insert into anamnesis_questions (organization_id, template_id, section, label, type, options, required, sort_order, scale_min, scale_max) values
    (p_org, v_tpl, 'Objetivos', 'Qual é o seu principal objetivo com o Pilates?', 'multi_select',
       '["Aliviar dores","Melhorar postura","Fortalecimento","Flexibilidade","Reabilitação","Condicionamento","Gestação","Bem-estar"]', true, 1, null, null),
    (p_org, v_tpl, 'Saúde', 'Sente alguma dor atualmente?', 'yes_no', '[]', true, 2, null, null),
    (p_org, v_tpl, 'Saúde', 'Se sim, onde e há quanto tempo?', 'textarea', '[]', false, 3, null, null),
    (p_org, v_tpl, 'Saúde', 'Intensidade da dor (0 = nenhuma, 10 = máxima)', 'scale', '[]', false, 4, 0, 10),
    (p_org, v_tpl, 'Saúde', 'Possui alguma doença diagnosticada?', 'textarea', '[]', false, 5, null, null),
    (p_org, v_tpl, 'Saúde', 'Já realizou cirurgias? Quais e quando?', 'textarea', '[]', false, 6, null, null),
    (p_org, v_tpl, 'Saúde', 'Faz uso de medicamentos? Quais?', 'textarea', '[]', false, 7, null, null),
    (p_org, v_tpl, 'Saúde', 'Possui alergias?', 'text', '[]', false, 8, null, null),
    (p_org, v_tpl, 'Saúde', 'Está gestante?', 'select', '["Não","Sim","Não se aplica"]', false, 9, null, null),
    (p_org, v_tpl, 'Hábitos', 'Pratica atividade física atualmente?', 'textarea', '[]', false, 10, null, null),
    (p_org, v_tpl, 'Hábitos', 'Como avalia sua qualidade de sono?', 'select', '["Boa","Regular","Ruim"]', false, 11, null, null),
    (p_org, v_tpl, 'Hábitos', 'Profissão / postura no trabalho', 'text', '[]', false, 12, null, null),
    (p_org, v_tpl, 'Declaração', 'Declaro que as informações acima são verdadeiras.', 'signature', '[]', true, 13, null, null);

  insert into evolution_templates (organization_id, name, defaults) values
    (p_org, 'Sessão de Pilates', jsonb_build_object('patient_state', 'Paciente chegou disposto(a), sem queixas novas.',
       'treatment_response', 'Boa resposta aos exercícios propostos.', 'guidance', 'Manter exercícios domiciliares orientados.')),
    (p_org, 'Sessão de fisioterapia', jsonb_build_object('complaints', '', 'next_conduct', 'Progressão de carga conforme tolerância.'));

  -- Modelos de mensagem (WhatsApp e e-mail)
  insert into message_templates (organization_id, key, channel, name, subject, body) values
    (p_org, 'appointment_confirmation', 'whatsapp', 'Confirmação de aula', null,
     'Olá, {{nome}}! Sua aula de {{modalidade}} está agendada para {{data}} às {{hora}}. Até lá! — {{clinica}}'),
    (p_org, 'appointment_reminder', 'whatsapp', 'Lembrete de aula', null,
     'Oi, {{nome}}! Lembrete: sua aula é amanhã ({{data}}) às {{hora}}. Precisa remarcar? Acesse {{link}}'),
    (p_org, 'cancellation', 'whatsapp', 'Cancelamento', null,
     'Olá, {{nome}}. Sua aula de {{data}} às {{hora}} foi cancelada. {{detalhe}}'),
    (p_org, 'replacement', 'whatsapp', 'Reposição', null,
     'Olá, {{nome}}! Você tem {{creditos}} crédito(s) de reposição disponível(is) até {{validade}}. Agende pelo portal: {{link}}'),
    (p_org, 'payment_due_soon', 'whatsapp', 'Mensalidade próxima do vencimento', null,
     'Olá, {{nome}}! Sua mensalidade de {{valor}} vence em {{vencimento}}. {{pix}}'),
    (p_org, 'payment_overdue', 'whatsapp', 'Mensalidade vencida', null,
     'Olá, {{nome}}. Identificamos a mensalidade de {{valor}} vencida em {{vencimento}}. Se já pagou, desconsidere. Qualquer dúvida, estamos à disposição.'),
    (p_org, 'birthday', 'whatsapp', 'Feliz aniversário', null,
     'Feliz aniversário, {{nome}}! 🎉 Toda a equipe da {{clinica}} deseja um ano cheio de saúde e movimento.'),
    (p_org, 'contract_expiring', 'whatsapp', 'Contrato vencendo', null,
     'Olá, {{nome}}! Seu contrato vence em {{data_fim}}. Vamos conversar sobre a renovação?'),
    (p_org, 'plan_expiring', 'whatsapp', 'Plano vencendo', null,
     'Olá, {{nome}}! Seu plano {{plano}} vence em {{data_fim}}. Fale com a recepção para renovar.'),
    (p_org, 'satisfaction_survey', 'whatsapp', 'Pesquisa de satisfação', null,
     'Olá, {{nome}}! Sua opinião é muito importante. De 0 a 10, quanto você recomendaria a {{clinica}}?'),
    (p_org, 'reactivation', 'whatsapp', 'Reativação', null,
     'Oi, {{nome}}! Sentimos sua falta na {{clinica}}. Que tal voltar? Temos horários disponíveis esta semana.'),
    (p_org, 'waitlist_spot', 'whatsapp', 'Vaga na lista de espera', null,
     'Olá, {{nome}}! Abriu uma vaga em {{data}} às {{hora}}. Responda esta mensagem ou acesse o portal para confirmar.'),
    (p_org, 'anamnesis_link', 'whatsapp', 'Link da anamnese', null,
     'Olá, {{nome}}! Antes da sua avaliação, preencha a anamnese neste link: {{link}}'),
    (p_org, 'appointment_confirmation', 'email', 'Confirmação de aula (e-mail)', 'Aula agendada — {{data}} às {{hora}}',
     'Olá, {{nome}}!\n\nSua aula de {{modalidade}} está agendada para {{data}} às {{hora}}.\n\nAté breve,\n{{clinica}}'),
    (p_org, 'payment_due_soon', 'email', 'Mensalidade próxima do vencimento (e-mail)', 'Sua mensalidade vence em {{vencimento}}',
     'Olá, {{nome}}!\n\nLembramos que sua mensalidade de {{valor}} vence em {{vencimento}}.\n{{pix}}\n\n{{clinica}}');

  -- Contrato e documentos
  insert into contract_templates (organization_id, name, body) values (p_org, 'Contrato de prestação de serviços de Pilates',
'CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATADA: {{empresa}}, CNPJ {{cnpj_empresa}}, unidade {{unidade}}.
CONTRATANTE: {{nome_aluno}}, CPF {{cpf}}.

1. OBJETO. Prestação de serviços de Pilates conforme o plano {{plano}}, na frequência de {{frequencia}}.
2. VIGÊNCIA. De {{data_inicio}} a {{data_fim}}.
3. VALOR. O CONTRATANTE pagará {{valor}} conforme as condições do plano contratado.
4. FALTAS E REPOSIÇÕES. Cancelamentos e reposições seguem as regras vigentes da clínica, informadas ao CONTRATANTE.
5. SAÚDE. O CONTRATANTE declara ter informado suas condições de saúde e se compromete a comunicar alterações.
6. DADOS PESSOAIS. Os dados serão tratados conforme a Política de Privacidade da CONTRATADA e a Lei nº 13.709/2018 (LGPD).

Data: {{data_hoje}}

(Modelo inicial — revise com sua assessoria jurídica antes de usar.)');

  insert into document_templates (organization_id, type, name, body, requires_signature) values
    (p_org, 'consent_term', 'Termo de consentimento para prática de Pilates',
'Eu, {{nome_aluno}}, CPF {{cpf}}, declaro estar ciente de que a prática de Pilates envolve esforço físico e que informei à {{empresa}} minhas condições de saúde. Comprometo-me a comunicar qualquer alteração.

{{data_hoje}}

(Modelo inicial — revise com sua assessoria jurídica.)', true),
    (p_org, 'image_authorization', 'Autorização de uso de imagem',
'Eu, {{nome_aluno}}, autorizo a {{empresa}} a utilizar minha imagem em fotos e vídeos para divulgação institucional, sem fins comerciais diretos, podendo revogar esta autorização a qualquer momento.

{{data_hoje}}', true);

  -- Documentos legais (versão 1 — modelos para revisão)
  insert into legal_documents (organization_id, kind, version, title, content, published_at, is_current) values
    (p_org, 'privacy_policy', 1, 'Política de Privacidade',
'Esta Política explica como tratamos seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

1. Dados coletados: dados de identificação e contato, informações de agendamento, financeiras e, quando você for aluno/paciente, dados de saúde necessários ao atendimento.
2. Finalidades: agendamento, prestação dos serviços, registros clínicos exigidos pela atuação profissional, cobrança, comunicação e cumprimento de obrigações legais.
3. Bases legais: execução de contrato, cumprimento de obrigação legal/regulatória, tutela da saúde, legítimo interesse e consentimento, quando aplicável.
4. Compartilhamento: apenas com prestadores necessários à operação (hospedagem, meios de pagamento, comunicação), sob obrigações de confidencialidade.
5. Segurança: controle de acesso por perfil, criptografia em trânsito, armazenamento privado de arquivos clínicos e registros de auditoria.
6. Retenção: os dados são mantidos pelo tempo necessário às finalidades e pelos prazos legais; registros clínicos seguem os prazos de guarda aplicáveis à profissão.
7. Seus direitos: confirmação, acesso, correção, anonimização, portabilidade, eliminação (quando cabível), informação sobre compartilhamentos e revogação do consentimento. Solicite pelos nossos canais de contato.

(Modelo inicial — revise com sua assessoria jurídica e publique uma nova versão em Configurações → LGPD.)', now(), true),
    (p_org, 'terms_of_use', 1, 'Termos de Uso',
'Ao utilizar o site e o portal do aluno você concorda em fornecer informações verdadeiras, manter sua senha em sigilo e utilizar os serviços de acordo com as regras de agendamento, cancelamento e pagamento da clínica.

(Modelo inicial — revise com sua assessoria jurídica.)', now(), true);

  insert into integrations (organization_id, provider, status)
  select p_org, x, 'not_connected' from unnest(array['whatsapp','google_calendar','email','sms','asaas','mercadopago','stripe',
                                                     'nfse','wellhub','totalpass','sentry']) x
  on conflict do nothing;
end $$;

-- Cria a organização no primeiro acesso (onboarding)
create or replace function public.create_organization(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_unit uuid; v_slug text; v_owner_role uuid; v_count int;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.' using errcode = '28000'; end if;
  select count(*) into v_count from organization_members m join roles r on r.id = m.role_id
   where m.user_id = auth.uid() and r.key = 'owner';
  if v_count >= 3 then raise exception 'Limite de organizações por usuário atingido.'; end if;
  if coalesce(length(trim(p ->> 'name')), 0) < 2 then raise exception 'Informe o nome da clínica.'; end if;

  v_slug := lower(regexp_replace(regexp_replace(public.f_unaccent(coalesce(nullif(p ->> 'slug', ''), p ->> 'name')), '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'));
  if length(v_slug) < 2 then v_slug := 'clinica'; end if;
  while exists (select 1 from organizations where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into organizations (slug, name, legal_name, cnpj, email, phone, whatsapp, website, instagram, timezone, created_by, onboarding_step)
  values (v_slug, trim(p ->> 'name'), p ->> 'legal_name', p ->> 'cnpj', p ->> 'email', p ->> 'phone', p ->> 'whatsapp',
          p ->> 'website', p ->> 'instagram', coalesce(nullif(p ->> 'timezone', ''), 'America/Sao_Paulo'), auth.uid(), 2)
  returning id into v_org;

  perform private.seed_org_defaults(v_org);
  select id into v_owner_role from roles where organization_id = v_org and key = 'owner';
  insert into organization_members (organization_id, user_id, role_id, status, all_units, created_by)
  values (v_org, auth.uid(), v_owner_role, 'active', true, auth.uid());
  update profiles set last_organization_id = v_org where id = auth.uid();
  return v_org;
end $$;

-- Organizações do usuário logado (seletor) com perfil
create or replace function public.my_organizations() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'logo_path', o.logo_path,
           'app_name', o.app_name, 'timezone', o.timezone, 'onboarding_completed_at', o.onboarding_completed_at,
           'onboarding_step', o.onboarding_step, 'role_key', r.key, 'role_name', r.name, 'all_units', m.all_units) order by o.name), '[]')
    from organization_members m join organizations o on o.id = m.organization_id join roles r on r.id = m.role_id
   where m.user_id = auth.uid() and m.status = 'active' and o.deleted_at is null
$$;

-- Vincula usuário convidado (chamado pelo servidor com service role após inviteUserByEmail)
create or replace function private.attach_member(p_org uuid, p_user uuid, p_role uuid, p_unit_ids uuid[], p_staff uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_member uuid;
begin
  insert into organization_members (organization_id, user_id, role_id, status, all_units)
  values (p_org, p_user, p_role, 'active', coalesce(array_length(p_unit_ids, 1), 0) = 0)
  on conflict (organization_id, user_id) do update set role_id = excluded.role_id, status = 'active', all_units = excluded.all_units
  returning id into v_member;
  delete from member_units where member_id = v_member;
  insert into member_units (member_id, unit_id) select v_member, u from unnest(coalesce(p_unit_ids, '{}')) u;
  if p_staff is not null then
    update staff set user_id = p_user where id = p_staff and organization_id = p_org;
  end if;
  return v_member;
end $$;

-- Remove o acesso ao portal de um aluno (equipe)
create or replace function public.revoke_portal_access(p_patient_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organization_id into v_org from patients where id = p_patient_id;
  perform private.require_permission(v_org, 'patients.edit');
  update patients set user_id = null where id = p_patient_id;
end $$;
