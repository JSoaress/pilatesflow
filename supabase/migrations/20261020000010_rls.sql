-- =====================================================================
-- PilatesFlow — 0010 Row Level Security, privilégios e integridade entre organizações
-- Princípio: menor privilégio. O usuário anônimo não acessa tabelas
-- diretamente (somente RPCs públicas específicas). Usuários autenticados
-- acessam apenas dados da(s) organização(ões) em que são membros ativos,
-- conforme as permissões do seu perfil.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Privilégios base
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema private to service_role;

-- Tabelas sem acesso direto do usuário
revoke all on public.org_counters, public.gateway_webhook_events from authenticated;

-- Escritas somente via funções (RPCs) com regras de negócio
revoke insert, update, delete on public.payments, public.appointments, public.attendance,
  public.appointment_events, public.medical_record_history, public.lead_stage_history,
  public.audit_logs, public.backup_runs, public.commissions, public.anamnesis,
  public.payment_gateway_charges, public.permissions
  from authenticated;
revoke update, delete on public.cash_movements, public.inventory_movements from authenticated;
revoke delete on public.medical_records, public.organizations from authenticated;

-- Atualizações restritas por coluna (status/valores calculados só mudam via RPC)
revoke update on public.accounts_receivable from authenticated;
grant update (description, amount, discount, surcharge, due_date, competence_date, payment_method, notes, category_id,
              last_contact_at, unit_id) on public.accounts_receivable to authenticated;
revoke update on public.accounts_payable from authenticated;
grant update (supplier_id, category_id, description, amount, due_date, competence_date, payment_method, document_number,
              receipt_path, notes, unit_id, deleted_at) on public.accounts_payable to authenticated;
revoke update on public.subscriptions from authenticated;
grant update (price, discount_percent, end_date, due_day, weekly_frequency, sessions_total, sessions_extra,
              replacements_allowed, auto_renew, notes, seller_staff_id, unit_id) on public.subscriptions to authenticated;
revoke update on public.appointment_participants from authenticated;
grant update (notes) on public.appointment_participants to authenticated;
revoke update on public.recurrences from authenticated;
grant update (name, notes, ends_on) on public.recurrences to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert on public.notifications from authenticated;
revoke update on public.messages from authenticated;
grant update (status) on public.messages to authenticated;
revoke insert on public.messages from authenticated;
revoke update on public.waitlist from authenticated;
grant update (status) on public.waitlist to authenticated;
revoke update on public.contracts from authenticated;
grant update (status, sent_at, pdf_path, signature_provider, signature_external_id, cancelled_at) on public.contracts to authenticated;
revoke update on public.replacement_credits from authenticated;
grant update (status, notes, expires_at) on public.replacement_credits to authenticated;
revoke update on public.organization_members from authenticated;
grant update (role_id, status, all_units) on public.organization_members to authenticated;
revoke update on public.patients from authenticated;
grant update (unit_id, photo_path, full_name, social_name, birth_date, cpf, rg, gender, profession, phone, whatsapp, email,
              address_street, address_number, address_complement, address_district, address_city, address_state, address_zip,
              origin, referred_by_patient_id, referred_by_name, status, notes, checkin_pin, deleted_at) on public.patients to authenticated;
revoke update on public.organizations from authenticated;
grant update (name, legal_name, cnpj, email, phone, whatsapp, website, instagram, logo_path, address, currency, locale,
              timezone, app_name, primary_color, onboarding_step, onboarding_completed_at) on public.organizations to authenticated;

-- ---------------------------------------------------------------------
-- Gerador de policies padrão por módulo
-- ---------------------------------------------------------------------
create or replace function private.std_policies(
  p_table text, p_module text, p_unit boolean default false,
  p_select_extra text default null, p_ops text[] default array['select','insert','update','delete']
) returns void language plpgsql as $$
declare
  v_unit text := case when p_unit then ' and public.has_unit_access(organization_id, unit_id)' else '' end;
  v_sel text := format('(public.has_permission(organization_id, %L)%s)%s', p_module || '.view',
                       coalesce(' or ' || p_select_extra, ''), v_unit);
begin
  execute format('alter table public.%I enable row level security', p_table);
  if 'select' = any(p_ops) then
    execute format('create policy %I on public.%I for select to authenticated using (%s)', p_table || '_select', p_table, v_sel);
  end if;
  if 'insert' = any(p_ops) then
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_permission(organization_id, %L)%s)',
                   p_table || '_insert', p_table, p_module || '.create', v_unit);
  end if;
  if 'update' = any(p_ops) then
    execute format('create policy %I on public.%I for update to authenticated using (public.has_permission(organization_id, %L)%s) with check (public.has_permission(organization_id, %L)%s)',
                   p_table || '_update', p_table, p_module || '.edit', v_unit, p_module || '.edit', v_unit);
  end if;
  if 'delete' = any(p_ops) then
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_permission(organization_id, %L)%s)',
                   p_table || '_delete', p_table, p_module || '.delete', v_unit);
  end if;
end $$;

-- Para configurações de apoio: qualquer membro lê; escreve quem tem a permissão indicada
create or replace function private.member_read_policies(p_table text, p_write_permission text) returns void
language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('create policy %I on public.%I for select to authenticated using (public.is_org_member(organization_id))', p_table || '_select', p_table);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.has_permission(organization_id, %L))', p_table || '_insert', p_table, p_write_permission);
  execute format('create policy %I on public.%I for update to authenticated using (public.has_permission(organization_id, %L)) with check (public.has_permission(organization_id, %L))', p_table || '_update', p_table, p_write_permission, p_write_permission);
  execute format('create policy %I on public.%I for delete to authenticated using (public.has_permission(organization_id, %L))', p_table || '_delete', p_table, p_write_permission);
end $$;

-- ---------------------------------------------------------------------
-- Fundação
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;
create policy organizations_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_permission(id, 'settings.edit')) with check (public.has_permission(id, 'settings.edit'));

alter table public.units enable row level security;
create policy units_select on public.units for select to authenticated using (public.is_org_member(organization_id));
create policy units_insert on public.units for insert to authenticated with check (public.has_permission(organization_id, 'settings.edit'));
create policy units_update on public.units for update to authenticated
  using (public.has_permission(organization_id, 'settings.edit')) with check (public.has_permission(organization_id, 'settings.edit'));

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.organization_members me join public.organization_members other on other.organization_id = me.organization_id
     where me.user_id = auth.uid() and me.status = 'active' and other.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.permissions enable row level security;
create policy permissions_select on public.permissions for select to authenticated using (true);

alter table public.roles enable row level security;
create policy roles_select on public.roles for select to authenticated using (public.is_org_member(organization_id));
create policy roles_insert on public.roles for insert to authenticated with check (public.has_permission(organization_id, 'users.manage') and not is_system);
create policy roles_update on public.roles for update to authenticated
  using (public.has_permission(organization_id, 'users.manage') and key <> 'owner')
  with check (public.has_permission(organization_id, 'users.manage') and key <> 'owner');
create policy roles_delete on public.roles for delete to authenticated using (public.has_permission(organization_id, 'users.manage') and not is_system);

alter table public.role_permissions enable row level security;
create policy role_permissions_select on public.role_permissions for select to authenticated using (
  exists (select 1 from public.roles r where r.id = role_id and public.is_org_member(r.organization_id)));
create policy role_permissions_insert on public.role_permissions for insert to authenticated with check (
  exists (select 1 from public.roles r where r.id = role_id and r.key <> 'owner' and public.has_permission(r.organization_id, 'users.manage')));
create policy role_permissions_delete on public.role_permissions for delete to authenticated using (
  exists (select 1 from public.roles r where r.id = role_id and r.key <> 'owner' and public.has_permission(r.organization_id, 'users.manage')));

alter table public.organization_members enable row level security;
create policy members_select on public.organization_members for select to authenticated using (
  user_id = auth.uid() or public.is_org_member(organization_id));
create policy members_insert on public.organization_members for insert to authenticated with check (public.has_permission(organization_id, 'users.manage'));
create policy members_update on public.organization_members for update to authenticated
  using (public.has_permission(organization_id, 'users.manage')) with check (public.has_permission(organization_id, 'users.manage'));
create policy members_delete on public.organization_members for delete to authenticated using (public.has_permission(organization_id, 'users.manage'));

alter table public.member_units enable row level security;
create policy member_units_select on public.member_units for select to authenticated using (
  exists (select 1 from public.organization_members m where m.id = member_id and public.is_org_member(m.organization_id)));
create policy member_units_write on public.member_units for all to authenticated
  using (exists (select 1 from public.organization_members m where m.id = member_id and public.has_permission(m.organization_id, 'users.manage')))
  with check (exists (select 1 from public.organization_members m where m.id = member_id and public.has_permission(m.organization_id, 'users.manage')));

-- Proteções do proprietário
create or replace function private.protect_owner_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner_role uuid; v_owners int;
begin
  select id into v_owner_role from roles where organization_id = coalesce(new.organization_id, old.organization_id) and key = 'owner';
  -- somente o proprietário concede o papel de proprietário
  if tg_op in ('INSERT','UPDATE') and new.role_id = v_owner_role and (tg_op = 'INSERT' or old.role_id <> v_owner_role)
     and auth.uid() is not null and not public.is_org_owner(new.organization_id)
     and exists (select 1 from organization_members x where x.organization_id = new.organization_id and x.role_id = v_owner_role) then
    raise exception 'Somente o proprietário pode conceder o perfil de proprietário.' using errcode = '42501';
  end if;
  -- não permitir remover/rebaixar/suspender o último proprietário
  if tg_op in ('UPDATE','DELETE') and old.role_id = v_owner_role and old.status = 'active'
     and (tg_op = 'DELETE' or new.role_id <> v_owner_role or new.status <> 'active') then
    select count(*) into v_owners from organization_members where organization_id = old.organization_id and role_id = v_owner_role
       and status = 'active' and id <> old.id;
    if v_owners = 0 then raise exception 'A organização precisa de pelo menos um proprietário ativo.'; end if;
    if auth.uid() is not null and not public.is_org_owner(old.organization_id) then
      raise exception 'Somente o proprietário pode alterar outro proprietário.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_members_protect_owner before insert or update or delete on public.organization_members
  for each row execute function private.protect_owner_membership();

alter table public.system_settings enable row level security;
create policy settings_select on public.system_settings for select to authenticated using (public.is_org_member(organization_id));
create policy settings_write on public.system_settings for all to authenticated
  using (public.has_permission(organization_id, 'settings.edit')) with check (public.has_permission(organization_id, 'settings.edit'));

alter table public.audit_logs enable row level security;
create policy audit_select on public.audit_logs for select to authenticated using (public.has_permission(organization_id, 'audit.view'));

alter table public.org_counters enable row level security;
alter table public.gateway_webhook_events enable row level security;
alter table public.backup_runs enable row level security;
create policy backup_runs_select on public.backup_runs for select to authenticated using (
  organization_id is null and exists (select 1 from organization_members m join roles r on r.id = m.role_id
                                       where m.user_id = auth.uid() and m.status = 'active' and r.key in ('owner','manager'))
  or public.has_permission(organization_id, 'settings.view'));

-- ---------------------------------------------------------------------
-- Pessoas e recursos
-- ---------------------------------------------------------------------
select private.std_policies('suppliers', 'inventory', false, 'public.has_permission(organization_id, ''finance.view'') or public.has_permission(organization_id, ''equipment.view'')');
select private.std_policies('staff', 'staff', false, 'public.has_permission(organization_id, ''schedule.view'')');
select private.std_policies('staff_units', 'staff', false, null, '{}');
alter table public.staff_units enable row level security;
create policy staff_units_select on public.staff_units for select to authenticated using (
  exists (select 1 from public.staff s where s.id = staff_id and public.is_org_member(s.organization_id)));
create policy staff_units_write on public.staff_units for all to authenticated
  using (exists (select 1 from public.staff s where s.id = staff_id and public.has_permission(s.organization_id, 'staff.edit')))
  with check (exists (select 1 from public.staff s where s.id = staff_id and public.has_permission(s.organization_id, 'staff.edit')));
select private.std_policies('staff_working_hours', 'staff', false, 'public.has_permission(organization_id, ''schedule.view'')', '{select}');
create policy staff_working_hours_write on public.staff_working_hours for all to authenticated
  using (public.has_permission(organization_id, 'staff.edit')) with check (public.has_permission(organization_id, 'staff.edit'));
select private.std_policies('staff_time_off', 'staff', false, 'public.has_permission(organization_id, ''schedule.view'')', '{select}');
create policy staff_time_off_write on public.staff_time_off for all to authenticated
  using (public.has_permission(organization_id, 'staff.edit') or public.has_permission(organization_id, 'schedule.override'))
  with check (public.has_permission(organization_id, 'staff.edit') or public.has_permission(organization_id, 'schedule.override'));

select private.std_policies('patients', 'patients', true, 'public.has_permission(organization_id, ''schedule.view'') or public.has_permission(organization_id, ''finance.view'')');
select private.std_policies('emergency_contacts', 'patients', false, null, '{select,insert}');
create policy emergency_contacts_update on public.emergency_contacts for update to authenticated
  using (public.has_permission(organization_id, 'patients.edit')) with check (public.has_permission(organization_id, 'patients.edit'));
create policy emergency_contacts_delete on public.emergency_contacts for delete to authenticated using (public.has_permission(organization_id, 'patients.edit'));

select private.member_read_policies('rooms', 'settings.edit');
select private.member_read_policies('services', 'settings.edit');
select private.member_read_policies('holidays', 'schedule.override');
select private.member_read_policies('schedule_blocks', 'schedule.override');
select private.std_policies('equipment', 'equipment', false, 'public.has_permission(organization_id, ''schedule.view'')');

-- ---------------------------------------------------------------------
-- Planos e financeiro
-- ---------------------------------------------------------------------
select private.member_read_policies('plans', 'plans.edit');
alter table public.plan_services enable row level security;
create policy plan_services_select on public.plan_services for select to authenticated using (
  exists (select 1 from public.plans p where p.id = plan_id and public.is_org_member(p.organization_id)));
create policy plan_services_write on public.plan_services for all to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and public.has_permission(p.organization_id, 'plans.edit')))
  with check (exists (select 1 from public.plans p where p.id = plan_id and public.has_permission(p.organization_id, 'plans.edit')));
select private.std_policies('subscriptions', 'plans', true, 'public.has_permission(organization_id, ''finance.view'') or public.has_permission(organization_id, ''patients.view'')', '{select,update}');
select private.std_policies('contract_templates', 'contracts');
select private.std_policies('contracts', 'contracts', true, null, '{select,update}');
select private.member_read_policies('financial_categories', 'finance.edit');
select private.member_read_policies('payment_methods', 'finance.edit');
select private.member_read_policies('cash_accounts', 'finance.edit');
select private.std_policies('accounts_receivable', 'finance', true);
select private.std_policies('payments', 'finance', true, null, '{select}');
select private.std_policies('accounts_payable', 'finance', true, null, '{select,insert,update}');
select private.std_policies('cash_movements', 'finance', true, null, '{select,insert}');
select private.std_policies('invoices', 'finance', true, null, '{select,insert,update}');
select private.std_policies('payment_gateway_charges', 'finance', false, null, '{select}');

-- Movimentos manuais de caixa: somente origem manual/ajuste
drop policy cash_movements_insert on public.cash_movements;
create policy cash_movements_insert on public.cash_movements for insert to authenticated with check (
  public.has_permission(organization_id, 'finance.create') and source in ('manual','adjustment')
  and payment_id is null and payable_id is null and public.has_unit_access(organization_id, unit_id));

-- ---------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------
select private.std_policies('recurrences', 'schedule', true, 'public.has_permission(organization_id, ''patients.view'')', '{select,update}');
select private.std_policies('recurrence_members', 'schedule', false, 'public.has_permission(organization_id, ''patients.view'')', '{select}');
select private.std_policies('appointments', 'schedule', true, null, '{select}');
select private.std_policies('appointment_participants', 'schedule', false, 'public.has_permission(organization_id, ''patients.view'')', '{select,update}');
select private.std_policies('attendance', 'schedule', false, 'public.has_permission(organization_id, ''patients.view'')', '{select}');
select private.std_policies('waitlist', 'schedule', false, null, '{select,update}');
select private.std_policies('replacement_credits', 'schedule', false, 'public.has_permission(organization_id, ''patients.view'')', '{select,update}');
select private.std_policies('appointment_events', 'schedule', false, 'public.has_permission(organization_id, ''patients.view'')', '{select}');
drop policy replacement_credits_update on public.replacement_credits;
create policy replacement_credits_update on public.replacement_credits for update to authenticated
  using (public.has_permission(organization_id, 'schedule.override')) with check (public.has_permission(organization_id, 'schedule.override'));

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Clínico (permissões especialmente restritas)
-- ---------------------------------------------------------------------
select private.std_policies('medical_records', 'medical_records', false, null, '{select,insert,update}');
select private.std_policies('medical_record_history', 'medical_records', false, null, '{select}');
select private.std_policies('evolution_templates', 'medical_records', false, null, '{select}');
create policy evolution_templates_write on public.evolution_templates for all to authenticated
  using (public.has_permission(organization_id, 'medical_records.edit')) with check (public.has_permission(organization_id, 'medical_records.edit'));
select private.std_policies('clinical_evolutions', 'medical_records', false, null, '{select,insert}');
create policy clinical_evolutions_update on public.clinical_evolutions for update to authenticated
  using (public.has_permission(organization_id, 'medical_records.create') and status = 'draft'
         and (author_id = auth.uid() or public.has_permission(organization_id, 'medical_records.edit')))
  with check (public.has_permission(organization_id, 'medical_records.create'));
create policy clinical_evolutions_delete on public.clinical_evolutions for delete to authenticated
  using (status = 'draft' and author_id = auth.uid());

select private.std_policies('anamnesis_templates', 'assessments', false, null, '{select}');
create policy anamnesis_templates_write on public.anamnesis_templates for all to authenticated
  using (public.has_permission(organization_id, 'assessments.edit')) with check (public.has_permission(organization_id, 'assessments.edit'));
select private.std_policies('anamnesis_questions', 'assessments', false, null, '{select}');
create policy anamnesis_questions_write on public.anamnesis_questions for all to authenticated
  using (public.has_permission(organization_id, 'assessments.edit')) with check (public.has_permission(organization_id, 'assessments.edit'));
select private.std_policies('anamnesis', 'assessments', false, 'public.has_permission(organization_id, ''medical_records.view'')', '{select}');
select private.std_policies('assessment_fields', 'assessments', false, null, '{select}');
create policy assessment_fields_write on public.assessment_fields for all to authenticated
  using (public.has_permission(organization_id, 'settings.edit')) with check (public.has_permission(organization_id, 'settings.edit'));
select private.std_policies('assessments', 'assessments', false, 'public.has_permission(organization_id, ''medical_records.view'')');
select private.std_policies('postural_photos', 'assessments', false, null, '{select,insert,update}');

alter table public.attachments enable row level security;
create policy attachments_select on public.attachments for select to authenticated using (
  case when is_clinical then public.has_permission(organization_id, 'medical_records.view') or public.has_permission(organization_id, 'assessments.view')
       else public.has_permission(organization_id, 'documents.view') end);
create policy attachments_insert on public.attachments for insert to authenticated with check (
  case when is_clinical then public.has_permission(organization_id, 'medical_records.create') or public.has_permission(organization_id, 'assessments.create')
       else public.has_permission(organization_id, 'documents.create') end);
create policy attachments_update on public.attachments for update to authenticated
  using (public.has_permission(organization_id, 'documents.delete')) with check (public.has_permission(organization_id, 'documents.delete'));

select private.member_read_policies('exercise_categories', 'exercises.edit');
select private.std_policies('exercises', 'exercises');
select private.std_policies('patient_programs', 'exercises');
select private.std_policies('patient_program_exercises', 'exercises', false, null, '{select}');
create policy ppe_write on public.patient_program_exercises for all to authenticated
  using (public.has_permission(organization_id, 'exercises.edit') or public.has_permission(organization_id, 'exercises.create'))
  with check (public.has_permission(organization_id, 'exercises.edit') or public.has_permission(organization_id, 'exercises.create'));

-- ---------------------------------------------------------------------
-- CRM, comunicação, tarefas, integrações
-- ---------------------------------------------------------------------
select private.std_policies('leads', 'crm', true);
select private.std_policies('lead_stage_history', 'crm', false, null, '{select}');
select private.std_policies('crm_interactions', 'crm', false, 'public.has_permission(organization_id, ''patients.view'')', '{select,insert}');
select private.std_policies('message_templates', 'communication', false, null, '{select}');
create policy message_templates_write on public.message_templates for all to authenticated
  using (public.has_permission(organization_id, 'settings.edit')) with check (public.has_permission(organization_id, 'settings.edit'));
select private.std_policies('messages', 'communication', false, null, '{select}');
create policy messages_update on public.messages for update to authenticated
  using (public.has_permission(organization_id, 'communication.create') and status = 'queued')
  with check (status = 'cancelled');

select private.std_policies('tasks', 'tasks', false, 'assignee_id = auth.uid()', '{select,insert,delete}');
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_permission(organization_id, 'tasks.edit') or (assignee_id = auth.uid() and public.is_org_member(organization_id)))
  with check (public.is_org_member(organization_id));

select private.std_policies('integrations', 'settings', false, null, '{select}');
create policy integrations_write on public.integrations for all to authenticated
  using (public.has_permission(organization_id, 'settings.edit')) with check (public.has_permission(organization_id, 'settings.edit'));
select private.std_policies('calendar_connections', 'settings', false, 'user_id = auth.uid()', '{select}');
create policy calendar_connections_write on public.calendar_connections for all to authenticated
  using (user_id = auth.uid() or public.has_permission(organization_id, 'settings.edit'))
  with check (user_id = auth.uid() or public.has_permission(organization_id, 'settings.edit'));

-- ---------------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------------
select private.std_policies('inventory_products', 'inventory', true);
select private.std_policies('inventory_movements', 'inventory', false, null, '{select}');
create policy inventory_movements_insert on public.inventory_movements for insert to authenticated
  with check (public.has_permission(organization_id, 'inventory.edit') and type <> 'sale');
select private.std_policies('equipment_maintenance', 'equipment');
select private.std_policies('commission_rules', 'commissions', false, null, '{select}');
create policy commission_rules_write on public.commission_rules for all to authenticated
  using (public.has_permission(organization_id, 'commissions.edit')) with check (public.has_permission(organization_id, 'commissions.edit'));
select private.std_policies('commissions', 'commissions', false, null, '{select}');
grant update (status, approved_by, paid_at) on public.commissions to authenticated;
create policy commissions_update on public.commissions for update to authenticated
  using (public.has_permission(organization_id, 'commissions.edit')) with check (public.has_permission(organization_id, 'commissions.edit'));

-- ---------------------------------------------------------------------
-- Documentos, LGPD, site
-- ---------------------------------------------------------------------
select private.std_policies('document_templates', 'documents');
alter table public.documents enable row level security;
create policy documents_select on public.documents for select to authenticated using (
  public.has_permission(organization_id, 'documents.view') and (not is_clinical or public.has_permission(organization_id, 'medical_records.view')));
create policy documents_insert on public.documents for insert to authenticated with check (public.has_permission(organization_id, 'documents.create'));
create policy documents_update on public.documents for update to authenticated
  using (public.has_permission(organization_id, 'documents.edit')) with check (public.has_permission(organization_id, 'documents.edit'));
create policy documents_delete on public.documents for delete to authenticated using (public.has_permission(organization_id, 'documents.delete') and status = 'draft');

select private.member_read_policies('legal_documents', 'lgpd.manage');
select private.std_policies('consents', 'lgpd', false, 'public.has_permission(organization_id, ''patients.view'')', '{select}');
create policy consents_insert on public.consents for insert to authenticated with check (
  public.has_permission(organization_id, 'patients.edit') or public.has_permission(organization_id, 'lgpd.manage'));
grant update (revoked_at) on public.consents to authenticated;
create policy consents_update on public.consents for update to authenticated
  using (public.has_permission(organization_id, 'lgpd.manage') or public.has_permission(organization_id, 'patients.edit'))
  with check (public.has_permission(organization_id, 'lgpd.manage') or public.has_permission(organization_id, 'patients.edit'));
select private.std_policies('data_subject_requests', 'lgpd', false, null, '{select}');
create policy dsr_write on public.data_subject_requests for all to authenticated
  using (public.has_permission(organization_id, 'lgpd.manage')) with check (public.has_permission(organization_id, 'lgpd.manage'));

select private.std_policies('site_posts', 'website', false, null, '{select}');
create policy site_posts_write on public.site_posts for all to authenticated
  using (public.has_permission(organization_id, 'website.edit')) with check (public.has_permission(organization_id, 'website.edit'));
select private.std_policies('site_testimonials', 'website', false, null, '{select}');
create policy site_testimonials_write on public.site_testimonials for all to authenticated
  using (public.has_permission(organization_id, 'website.edit')) with check (public.has_permission(organization_id, 'website.edit'));
select private.std_policies('site_faqs', 'website', false, null, '{select}');
create policy site_faqs_write on public.site_faqs for all to authenticated
  using (public.has_permission(organization_id, 'website.edit')) with check (public.has_permission(organization_id, 'website.edit'));
select private.std_policies('site_gallery', 'website', false, null, '{select}');
create policy site_gallery_write on public.site_gallery for all to authenticated
  using (public.has_permission(organization_id, 'website.edit')) with check (public.has_permission(organization_id, 'website.edit'));

-- ---------------------------------------------------------------------
-- Integridade: referências devem pertencer à mesma organização
-- uso: trigger ... execute function private.check_same_org('coluna','tabela', 'coluna2','tabela2', ...)
-- ---------------------------------------------------------------------
create or replace function private.check_same_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare i int := 0; v_col text; v_tab text; v_ref uuid; v_ok boolean;
begin
  while i < tg_nargs loop
    v_col := tg_argv[i]; v_tab := tg_argv[i + 1];
    execute format('select ($1).%I', v_col) using new into v_ref;
    if v_ref is not null then
      execute format('select exists (select 1 from public.%I where id = $1 and organization_id = $2)', v_tab)
        using v_ref, new.organization_id into v_ok;
      if not v_ok then
        raise exception 'Referência inválida (%): o registro não pertence a esta organização.', v_col using errcode = '42501';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end $$;

create trigger trg_same_org before insert or update on public.units for each row execute function private.check_same_org();
create trigger trg_same_org before insert or update on public.patients for each row execute function private.check_same_org('unit_id','units','referred_by_patient_id','patients');
create trigger trg_same_org before insert or update on public.staff for each row execute function private.check_same_org('unit_id','units');
create trigger trg_same_org before insert or update on public.emergency_contacts for each row execute function private.check_same_org('patient_id','patients');
create trigger trg_same_org before insert or update on public.staff_working_hours for each row execute function private.check_same_org('staff_id','staff','unit_id','units');
create trigger trg_same_org before insert or update on public.staff_time_off for each row execute function private.check_same_org('staff_id','staff');
create trigger trg_same_org before insert or update on public.rooms for each row execute function private.check_same_org('unit_id','units');
create trigger trg_same_org before insert or update on public.equipment for each row execute function private.check_same_org('unit_id','units','room_id','rooms','supplier_id','suppliers');
create trigger trg_same_org before insert or update on public.schedule_blocks for each row execute function private.check_same_org('unit_id','units','room_id','rooms','staff_id','staff','equipment_id','equipment');
create trigger trg_same_org before insert or update on public.holidays for each row execute function private.check_same_org('unit_id','units');
create trigger trg_same_org before insert or update on public.plans for each row execute function private.check_same_org('unit_id','units','contract_template_id','contract_templates');
create trigger trg_same_org before insert or update on public.subscriptions for each row execute function private.check_same_org('patient_id','patients','plan_id','plans','unit_id','units','seller_staff_id','staff');
create trigger trg_same_org before insert or update on public.accounts_receivable for each row execute function private.check_same_org('patient_id','patients','unit_id','units','category_id','financial_categories','subscription_id','subscriptions');
create trigger trg_same_org before insert or update on public.accounts_payable for each row execute function private.check_same_org('supplier_id','suppliers','unit_id','units','category_id','financial_categories','cash_account_id','cash_accounts');
create trigger trg_same_org before insert or update on public.cash_movements for each row execute function private.check_same_org('unit_id','units','cash_account_id','cash_accounts','category_id','financial_categories');
create trigger trg_same_org before insert or update on public.cash_accounts for each row execute function private.check_same_org('unit_id','units');
create trigger trg_same_org before insert or update on public.financial_categories for each row execute function private.check_same_org('parent_id','financial_categories');
create trigger trg_same_org before insert or update on public.medical_records for each row execute function private.check_same_org('patient_id','patients','responsible_staff_id','staff');
create trigger trg_same_org before insert or update on public.clinical_evolutions for each row execute function private.check_same_org('patient_id','patients','appointment_id','appointments','staff_id','staff');
create trigger trg_same_org before insert or update on public.assessments for each row execute function private.check_same_org('patient_id','patients','staff_id','staff','appointment_id','appointments');
create trigger trg_same_org before insert or update on public.postural_photos for each row execute function private.check_same_org('patient_id','patients','assessment_id','assessments');
create trigger trg_same_org before insert or update on public.attachments for each row execute function private.check_same_org('patient_id','patients');
create trigger trg_same_org before insert or update on public.exercises for each row execute function private.check_same_org('category_id','exercise_categories');
create trigger trg_same_org before insert or update on public.patient_programs for each row execute function private.check_same_org('patient_id','patients','staff_id','staff');
create trigger trg_same_org before insert or update on public.patient_program_exercises for each row execute function private.check_same_org('program_id','patient_programs','exercise_id','exercises');
create trigger trg_same_org before insert or update on public.anamnesis_questions for each row execute function private.check_same_org('template_id','anamnesis_templates');
create trigger trg_same_org before insert or update on public.leads for each row execute function private.check_same_org('unit_id','units','service_id','services','patient_id','patients','offered_plan_id','plans');
create trigger trg_same_org before insert or update on public.crm_interactions for each row execute function private.check_same_org('lead_id','leads','patient_id','patients');
create trigger trg_same_org before insert or update on public.tasks for each row execute function private.check_same_org('patient_id','patients','lead_id','leads','unit_id','units');
create trigger trg_same_org before insert or update on public.inventory_products for each row execute function private.check_same_org('unit_id','units','supplier_id','suppliers');
create trigger trg_same_org before insert or update on public.inventory_movements for each row execute function private.check_same_org('product_id','inventory_products','patient_id','patients');
create trigger trg_same_org before insert or update on public.equipment_maintenance for each row execute function private.check_same_org('equipment_id','equipment','supplier_id','suppliers');
create trigger trg_same_org before insert or update on public.commission_rules for each row execute function private.check_same_org('staff_id','staff','service_id','services','plan_id','plans');
create trigger trg_same_org before insert or update on public.documents for each row execute function private.check_same_org('patient_id','patients','template_id','document_templates');
create trigger trg_same_org before insert or update on public.consents for each row execute function private.check_same_org('patient_id','patients','lead_id','leads');
create trigger trg_same_org before insert or update on public.data_subject_requests for each row execute function private.check_same_org('patient_id','patients');
create trigger trg_same_org before insert or update on public.organization_members for each row execute function private.check_same_org('role_id','roles');
create trigger trg_same_org before insert or update on public.recurrence_members for each row execute function private.check_same_org('recurrence_id','recurrences','patient_id','patients');

-- Recalcula título quando valores são editados diretamente
create or replace function private.receivable_values_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform private.recalc_receivable(new.id);
  return null;
end $$;
create trigger trg_ar_values_changed after update of amount, discount, surcharge, due_date on public.accounts_receivable
  for each row execute function private.receivable_values_changed();

-- Cancelamento de conta a pagar / assinatura (status só via RPC)
create or replace function public.cancel_payable(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare a accounts_payable%rowtype;
begin
  select * into a from accounts_payable where id = p_id for update;
  if not found then raise exception 'Conta não encontrada.'; end if;
  perform private.require_permission(a.organization_id, 'finance.edit');
  if a.status = 'paid' then raise exception 'Conta já paga não pode ser cancelada. Lance um estorno/ajuste no caixa.'; end if;
  update accounts_payable set status = 'cancelled', notes = concat_ws(E'\n', notes, 'Cancelada: ' || p_reason) where id = p_id;
end $$;

create or replace function public.change_subscription_status(
  p_id uuid, p_status text, p_reason text default null, p_paused_until date default null, p_cancel_open_receivables boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare s subscriptions%rowtype;
begin
  select * into s from subscriptions where id = p_id for update;
  if not found then raise exception 'Assinatura não encontrada.'; end if;
  perform private.require_permission(s.organization_id, 'plans.edit');
  if p_status not in ('active','paused','cancelled') then raise exception 'Status inválido.'; end if;
  if p_status = 'cancelled' and coalesce(trim(p_reason), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
  update subscriptions set status = p_status,
         paused_at = case when p_status = 'paused' then current_date end,
         paused_until = case when p_status = 'paused' then p_paused_until end,
         cancelled_at = case when p_status = 'cancelled' then now() end,
         cancel_reason = case when p_status = 'cancelled' then p_reason else cancel_reason end,
         auto_renew = case when p_status = 'cancelled' then false else auto_renew end
   where id = p_id;
  if p_status = 'cancelled' and p_cancel_open_receivables then
    update accounts_receivable set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Plano cancelado: ' || p_reason
     where subscription_id = p_id and status in ('pending','overdue') and amount_paid = 0;
  end if;
  if p_status = 'cancelled' and not exists (select 1 from subscriptions where patient_id = s.patient_id and status = 'active') then
    update patients set status = 'cancelled' where id = s.patient_id and status = 'active';
  elsif p_status = 'paused' then
    update patients set status = 'paused' where id = s.patient_id and status = 'active';
  elsif p_status = 'active' then
    update patients set status = 'active' where id = s.patient_id and status in ('paused','cancelled','inactive');
  end if;
end $$;

-- Crédito manual de reposição (exceção autorizada)
create or replace function public.grant_manual_credit(p_patient_id uuid, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organization_id into v_org from patients where id = p_patient_id;
  perform private.require_permission(v_org, 'schedule.override');
  if coalesce(trim(p_notes), '') = '' then raise exception 'Informe o motivo do crédito manual.'; end if;
  return private.grant_credit(v_org, p_patient_id, null, 'manual', p_notes);
end $$;

-- Funções RPC: anon não executa nada exceto as públicas liberadas na migration seguinte
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.refresh_overdue(uuid), public.renew_subscriptions(uuid),
  public.generate_all_recurrences(uuid), public.expire_replacement_credits(), public.check_rate_limit(text, int, int)
  from authenticated;
