-- =====================================================================
-- PilatesFlow — 0006 CRM, comunicação, tarefas e integrações
-- =====================================================================

-- ---------------------------------------------------------------------
-- Leads e funil
-- ---------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  name text not null check (length(trim(name)) >= 2),
  phone text,
  whatsapp text,
  email text,
  instagram text,
  origin text not null default 'other' check (origin in ('instagram','google','referral','whatsapp','website','walk_in','event','other')),
  interest text,
  service_id uuid references public.services(id) on delete set null,
  stage text not null default 'new' check (stage in ('new','contacted','trial_scheduled','trial_done','negotiation','enrolled','lost')),
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  next_contact_at timestamptz,
  trial_appointment_id uuid references public.appointments(id) on delete set null,
  trial_attended boolean,
  offered_plan_id uuid references public.plans(id) on delete set null,
  lost_reason text,
  patient_id uuid references public.patients(id) on delete set null,
  converted_at timestamptz,
  acquisition_cost numeric(12,2),
  utm jsonb,
  privacy_consent_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_leads_org_stage on public.leads(organization_id, stage) where deleted_at is null;
create index idx_leads_next_contact on public.leads(organization_id, next_contact_at) where deleted_at is null and stage not in ('enrolled','lost');

create table public.lead_stage_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index idx_lsh_lead on public.lead_stage_history(lead_id, changed_at);

create or replace function private.lead_stage_tracking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into lead_stage_history (organization_id, lead_id, from_stage, to_stage) values (new.organization_id, new.id, null, new.stage);
  elsif new.stage is distinct from old.stage then
    insert into lead_stage_history (organization_id, lead_id, from_stage, to_stage) values (new.organization_id, new.id, old.stage, new.stage);
  end if;
  return null;
end $$;
create trigger trg_leads_stage after insert or update of stage on public.leads
  for each row execute function private.lead_stage_tracking();

create or replace function private.lead_stage_changed_at() returns trigger
language plpgsql as $$
begin
  if new.stage is distinct from old.stage then new.stage_changed_at := now(); end if;
  return new;
end $$;
create trigger trg_leads_stage_at before update on public.leads
  for each row execute function private.lead_stage_changed_at();

create table public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  channel text not null check (channel in ('call','whatsapp','email','in_person','instagram','sms','other')),
  direction text not null default 'outbound' check (direction in ('inbound','outbound')),
  summary text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (lead_id is not null or patient_id is not null)
);
create index idx_crm_int_lead on public.crm_interactions(lead_id, occurred_at desc);
create index idx_crm_int_patient on public.crm_interactions(patient_id, occurred_at desc);

-- Converte lead em aluno (ficha criada)
create or replace function public.convert_lead_to_patient(p_lead_id uuid, p_status text default 'trial') returns uuid
language plpgsql security definer set search_path = public as $$
declare l leads%rowtype; v_patient uuid;
begin
  select * into l from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead não encontrado.'; end if;
  perform private.require_permission(l.organization_id, 'patients.create');
  if l.patient_id is not null then return l.patient_id; end if;
  insert into patients (organization_id, unit_id, full_name, phone, whatsapp, email, origin, status, notes, registered_by)
  values (l.organization_id, l.unit_id, l.name, l.phone, coalesce(l.whatsapp, l.phone), l.email, l.origin,
          case when p_status in ('lead','trial','active') then p_status else 'trial' end,
          nullif(concat_ws(E'\n', 'Interesse: ' || l.interest, l.notes), ''), auth.uid())
  returning id into v_patient;
  update leads set patient_id = v_patient where id = l.id;
  return v_patient;
end $$;

-- Agenda aula experimental a partir do lead
create or replace function public.schedule_trial_class(p_lead_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare l leads%rowtype; v_patient uuid; v_appt uuid;
begin
  select * into l from leads where id = p_lead_id;
  if not found then raise exception 'Lead não encontrado.'; end if;
  perform private.require_permission(l.organization_id, 'schedule.create');
  v_patient := public.convert_lead_to_patient(p_lead_id, 'trial');
  v_appt := public.create_appointment(p || jsonb_build_object('patient_ids', jsonb_build_array(v_patient), 'kind', 'trial'));
  update leads set stage = 'trial_scheduled', trial_appointment_id = v_appt where id = l.id;
  return v_appt;
end $$;

-- Registra resultado da experimental / conversão
create or replace function public.register_trial_outcome(
  p_lead_id uuid, p_attended boolean, p_converted boolean, p_offered_plan_id uuid default null, p_lost_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare l leads%rowtype;
begin
  select * into l from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead não encontrado.'; end if;
  perform private.require_permission(l.organization_id, 'crm.edit');
  update leads set
    trial_attended = p_attended,
    offered_plan_id = coalesce(p_offered_plan_id, offered_plan_id),
    stage = case when p_converted then 'enrolled' when not p_attended then 'contacted'
                 when p_lost_reason is not null then 'lost' else 'trial_done' end,
    lost_reason = case when p_converted then null else coalesce(p_lost_reason, lost_reason) end,
    converted_at = case when p_converted then now() else converted_at end
   where id = l.id;
  if l.trial_appointment_id is not null then
    update appointment_participants ap set status = case when p_attended then 'completed' else 'absent' end
      from patients p
     where ap.appointment_id = l.trial_appointment_id and ap.patient_id = p.id and p.id = l.patient_id
       and ap.status in ('scheduled','confirmed');
  end if;
  if p_converted and l.patient_id is not null then
    update patients set status = 'active' where id = l.patient_id and status in ('lead','trial');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Comunicação: modelos e histórico de mensagens (fila de saída)
-- ---------------------------------------------------------------------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key in ('appointment_confirmation','appointment_reminder','cancellation','replacement',
    'payment_due_soon','payment_overdue','birthday','contract_expiring','plan_expiring','satisfaction_survey',
    'reactivation','waitlist_spot','anamnesis_link','custom')),
  channel text not null check (channel in ('whatsapp','email','sms','push')),
  name text not null,
  subject text,
  body text not null,
  provider_template_name text,      -- nome do template aprovado na API oficial do WhatsApp
  language text not null default 'pt_BR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_msg_templates_org on public.message_templates(organization_id, key, channel);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  channel text not null check (channel in ('whatsapp','email','sms','push')),
  template_id uuid references public.message_templates(id) on delete set null,
  template_key text,
  patient_id uuid references public.patients(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  to_address text not null,
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','read','failed','cancelled')),
  error text,
  attempts int not null default 0,
  provider text,
  provider_message_id text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  related_entity text,
  related_id uuid,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index idx_messages_queue on public.messages(status, scheduled_for) where status = 'queued';
create index idx_messages_patient on public.messages(patient_id, created_at desc);
create unique index uq_messages_dedupe on public.messages(organization_id, dedupe_key) where dedupe_key is not null;

-- Substitui {{variavel}} pelos valores do JSON
create or replace function private.render_template(p_body text, p_vars jsonb) returns text
language plpgsql immutable as $$
declare k text; v text; r text := p_body;
begin
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    r := replace(r, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  return regexp_replace(r, '\{\{[a-z_]+\}\}', '', 'g');
end $$;

-- Enfileira mensagem a partir de um modelo. O envio real é feito pelo worker do servidor
-- somente se a integração do canal estiver conectada; caso contrário a mensagem falha com
-- o erro "Integração não configurada" (nunca é marcada como enviada sem envio real).
create or replace function public.queue_message(
  p_org uuid, p_template_key text, p_channel text, p_patient_id uuid default null, p_lead_id uuid default null,
  p_vars jsonb default '{}'::jsonb, p_custom_body text default null, p_scheduled_for timestamptz default now(),
  p_dedupe_key text default null, p_related_entity text default null, p_related_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t message_templates%rowtype; v_to text; v_name text; v_vars jsonb; v_id uuid; v_body text;
begin
  if auth.uid() is not null then
    perform private.require_permission(p_org, 'communication.create');
  end if;
  select * into t from message_templates
   where organization_id = p_org and key = p_template_key and channel = p_channel and is_active
   order by created_at limit 1;
  if t.id is null and p_custom_body is null then
    raise exception 'Nenhum modelo ativo "%" para o canal %.', p_template_key, p_channel;
  end if;

  if p_patient_id is not null then
    select case p_channel when 'email' then email when 'push' then user_id::text else coalesce(whatsapp, phone) end,
           coalesce(social_name, full_name)
      into v_to, v_name from patients where id = p_patient_id and organization_id = p_org;
  elsif p_lead_id is not null then
    select case p_channel when 'email' then email else coalesce(whatsapp, phone) end, name
      into v_to, v_name from leads where id = p_lead_id and organization_id = p_org;
  end if;
  if coalesce(v_to, '') = '' then
    raise exception 'O destinatário não possui % cadastrado.', case p_channel when 'email' then 'e-mail' else 'telefone/WhatsApp' end;
  end if;

  v_vars := jsonb_build_object('nome', split_part(v_name, ' ', 1), 'nome_completo', v_name,
                               'clinica', (select name from organizations where id = p_org)) || coalesce(p_vars, '{}'::jsonb);
  v_body := private.render_template(coalesce(p_custom_body, t.body), v_vars);

  insert into messages (organization_id, channel, template_id, template_key, patient_id, lead_id, to_address, subject, body,
                        scheduled_for, dedupe_key, related_entity, related_id)
  values (p_org, p_channel, t.id, p_template_key, p_patient_id, p_lead_id, v_to,
          private.render_template(t.subject, v_vars), v_body, coalesce(p_scheduled_for, now()), p_dedupe_key,
          p_related_entity, p_related_id)
  on conflict (organization_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Tarefas
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  title text not null check (length(trim(title)) >= 2),
  description text,
  assignee_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  patient_id uuid references public.patients(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_tasks_org_status on public.tasks(organization_id, status, due_at);
create index idx_tasks_assignee on public.tasks(assignee_id, status);

create or replace function private.task_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger trg_tasks_completed before insert or update on public.tasks
  for each row execute function private.task_completed_at();

create or replace function private.task_notify_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform private.notify_user(new.organization_id, new.assignee_id, 'task', 'Nova tarefa para você', new.title,
                                '/app/tarefas', 'tasks', new.id);
  end if;
  return null;
end $$;
create trigger trg_tasks_notify after insert or update of assignee_id on public.tasks
  for each row execute function private.task_notify_assignee();

-- ---------------------------------------------------------------------
-- Integrações (status apenas; credenciais ficam em variáveis de ambiente do servidor)
-- ---------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('whatsapp','google_calendar','email','sms','asaas','mercadopago','stripe',
                                             'nfse','wellhub','totalpass','sentry')),
  status text not null default 'not_connected' check (status in ('not_connected','connected','error','config_required')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,     -- somente dados não secretos (ex.: número remetente, ambiente)
  last_checked_at timestamptz,
  last_error text,
  connected_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

-- Conexões individuais do Google Calendar (por profissional)
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  status text not null default 'not_connected' check (status in ('not_connected','connected','error')),
  calendar_id text,
  sync_direction text not null default 'push' check (sync_direction in ('push','pull','both')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (staff_id, provider)
);

do $$
declare t text;
begin
  foreach t in array array['leads','message_templates','messages','tasks','integrations'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function private.set_updated_at()', t);
  end loop;
  foreach t in array array['leads','message_templates','tasks'] loop
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
  end loop;
  foreach t in array array['leads','crm_interactions','message_templates','tasks','integrations'] loop
    perform private.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;
