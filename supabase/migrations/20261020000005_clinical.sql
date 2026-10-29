-- =====================================================================
-- PilatesFlow — 0005 Clínico
-- Prontuário, evoluções (imutáveis após finalização, com adendos),
-- anamnese configurável, avaliações físicas/posturais, fotos, anexos,
-- biblioteca de exercícios e programas/planos de exercícios.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Prontuário (1 por aluno), separado dos dados administrativos
-- ---------------------------------------------------------------------
create table public.medical_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null unique references public.patients(id) on delete restrict,
  responsible_staff_id uuid references public.staff(id) on delete set null,
  -- Anamnese clínica geral
  chief_complaint text,
  current_history text,
  condition_history text,
  personal_history text,
  family_history text,
  surgeries text,
  injuries text,
  diseases text,
  medications text,
  allergies text,
  habits text,
  physical_activity text,
  goals text,
  limitations text,
  contraindications text,
  pain_description text,
  clinical_notes text,
  -- Fisioterapia
  clinical_history text,
  physical_exam text,
  complementary_exams text,
  physio_diagnosis text,
  physio_prognosis text,
  therapeutic_goals text,
  conduct text,
  treatment_plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

-- Histórico de versões do prontuário (cada alteração guarda o estado anterior)
create table public.medical_record_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  snapshot jsonb not null,
  changed_fields text[],
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index idx_mrh_record on public.medical_record_history(medical_record_id, changed_at desc);

create or replace function private.medical_record_versioning() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_changed text[];
begin
  select array_agg(k) into v_changed from jsonb_object_keys(to_jsonb(new)) k
   where k not in ('updated_at','updated_by') and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k);
  if v_changed is not null then
    insert into medical_record_history (organization_id, medical_record_id, snapshot, changed_fields, changed_by)
    values (old.organization_id, old.id, to_jsonb(old), v_changed, auth.uid());
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
create trigger trg_medical_records_version before update on public.medical_records
  for each row execute function private.medical_record_versioning();

create or replace function private.block_clinical_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Registros clínicos não podem ser excluídos. Utilize retificação/adendo.' using errcode = '42501';
end $$;
create trigger trg_medical_records_no_delete before delete on public.medical_records
  for each row execute function private.block_clinical_delete();

-- ---------------------------------------------------------------------
-- Evoluções clínicas por atendimento
-- ---------------------------------------------------------------------
create table public.evolution_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  defaults jsonb not null default '{}'::jsonb,   -- valores sugeridos para os campos
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.clinical_evolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  participant_id uuid references public.appointment_participants(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  complaints text,
  patient_state text,
  exercises jsonb not null default '[]'::jsonb,  -- [{exercise_id,name,load,springs,sets,reps,time,notes}]
  pain_before smallint check (pain_before between 0 and 10),
  pain_after smallint check (pain_after between 0 and 10),
  treatment_response text,
  incidents text,
  guidance text,
  next_conduct text,
  notes text,
  status text not null default 'draft' check (status in ('draft','finalized')),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  content_hash text,
  amends_id uuid references public.clinical_evolutions(id) on delete restrict,   -- adendo/retificação
  amendment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_evolutions_patient on public.clinical_evolutions(patient_id, occurred_at desc);
create index idx_evolutions_appt on public.clinical_evolutions(appointment_id);

create or replace function private.protect_finalized_record() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'finalized' then
      raise exception 'Registro clínico finalizado não pode ser excluído. Crie um adendo/retificação.' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status = 'finalized' then
    raise exception 'Registro clínico finalizado não pode ser alterado. Crie um adendo/retificação.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_evolutions_protect before update or delete on public.clinical_evolutions
  for each row execute function private.protect_finalized_record();

create or replace function public.finalize_evolution(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e clinical_evolutions%rowtype;
begin
  select * into e from clinical_evolutions where id = p_id for update;
  if not found then raise exception 'Evolução não encontrada.'; end if;
  perform private.require_permission(e.organization_id, 'medical_records.create');
  if e.status = 'finalized' then raise exception 'Esta evolução já foi finalizada.'; end if;
  if e.author_id is not null and e.author_id <> auth.uid() and not public.has_permission(e.organization_id, 'medical_records.edit') then
    raise exception 'Somente o autor pode finalizar esta evolução.' using errcode = '42501';
  end if;
  update clinical_evolutions set status = 'finalized', finalized_at = now(), finalized_by = auth.uid(),
    content_hash = encode(extensions.digest(
      concat_ws('|', complaints, patient_state, exercises::text, pain_before, pain_after, treatment_response, incidents,
                guidance, next_conduct, notes), 'sha256'), 'hex')
   where id = p_id;
  insert into audit_logs (organization_id, unit_id, user_id, action, entity, entity_id)
  values (e.organization_id, e.unit_id, auth.uid(), 'finalize', 'clinical_evolutions', p_id::text);
end $$;

-- Adendo: novo registro finalizado vinculado ao original (o original permanece intacto)
create or replace function public.add_evolution_addendum(p_original_id uuid, p_text text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e clinical_evolutions%rowtype; v_id uuid;
begin
  select * into e from clinical_evolutions where id = p_original_id;
  if not found then raise exception 'Evolução não encontrada.'; end if;
  perform private.require_permission(e.organization_id, 'medical_records.create');
  if e.status <> 'finalized' then raise exception 'Evoluções em rascunho podem ser editadas diretamente.'; end if;
  if coalesce(trim(p_text), '') = '' or coalesce(trim(p_reason), '') = '' then
    raise exception 'Informe o texto e o motivo da retificação.';
  end if;
  insert into clinical_evolutions (organization_id, unit_id, patient_id, appointment_id, staff_id, author_id, occurred_at,
                                   notes, status, finalized_at, finalized_by, amends_id, amendment_reason, content_hash)
  values (e.organization_id, e.unit_id, e.patient_id, e.appointment_id,
          (select id from staff where user_id = auth.uid() and organization_id = e.organization_id limit 1),
          auth.uid(), now(), p_text, 'finalized', now(), auth.uid(), e.id, p_reason,
          encode(extensions.digest(p_text || '|' || p_reason, 'sha256'), 'hex'))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Anamnese digital configurável
-- ---------------------------------------------------------------------
create table public.anamnesis_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.anamnesis_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.anamnesis_templates(id) on delete cascade,
  section text,
  label text not null,
  help_text text,
  type text not null check (type in ('text','textarea','yes_no','number','date','select','multi_select','scale','signature')),
  options jsonb not null default '[]'::jsonb,
  scale_min int,
  scale_max int,
  required boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true
);
create index idx_anam_q_template on public.anamnesis_questions(template_id, sort_order);

create table public.anamnesis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  template_id uuid references public.anamnesis_templates(id) on delete set null,
  questions_snapshot jsonb not null,           -- perguntas no momento do envio (versão)
  answers jsonb not null default '{}'::jsonb,  -- { question_id: valor }
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  filled_by text check (filled_by in ('patient','staff')),
  public_token uuid unique default gen_random_uuid(),
  token_expires_at timestamptz default now() + interval '14 days',
  signature_name text,
  completed_at timestamptz,
  completed_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_anamnesis_patient on public.anamnesis(patient_id, created_at desc);

create or replace function private.protect_completed_anamnesis() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.status = 'completed' then
    raise exception 'Anamnese preenchida não pode ser excluída.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' and new.answers is distinct from old.answers then
    raise exception 'Anamnese preenchida não pode ser alterada. Envie uma nova anamnese.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_anamnesis_protect before update or delete on public.anamnesis
  for each row execute function private.protect_completed_anamnesis();

-- Cria anamnese para o aluno com snapshot das perguntas do modelo
create or replace function public.create_anamnesis(p_patient_id uuid, p_template_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pt patients%rowtype; v_id uuid; v_snapshot jsonb;
begin
  select * into pt from patients where id = p_patient_id;
  if not found then raise exception 'Aluno não encontrado.'; end if;
  perform private.require_permission(pt.organization_id, 'assessments.create');
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'section', q.section, 'label', q.label, 'help_text', q.help_text,
          'type', q.type, 'options', q.options, 'scale_min', q.scale_min, 'scale_max', q.scale_max, 'required', q.required)
          order by q.sort_order), '[]'::jsonb)
    into v_snapshot
    from anamnesis_questions q
   where q.template_id = p_template_id and q.organization_id = pt.organization_id and q.is_active;
  if jsonb_array_length(v_snapshot) = 0 then raise exception 'O modelo de anamnese não possui perguntas.'; end if;
  insert into anamnesis (organization_id, unit_id, patient_id, template_id, questions_snapshot)
  values (pt.organization_id, pt.unit_id, pt.id, p_template_id, v_snapshot) returning id into v_id;
  return v_id;
end $$;

-- Valida respostas obrigatórias
create or replace function private.validate_anamnesis_answers(p_snapshot jsonb, p_answers jsonb) returns text
language plpgsql immutable as $$
declare q jsonb; v_missing text[] := '{}';
begin
  for q in select * from jsonb_array_elements(p_snapshot) loop
    if (q ->> 'required')::boolean and (
         not (p_answers ? (q ->> 'id')) or p_answers -> (q ->> 'id') in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)) then
      v_missing := v_missing || (q ->> 'label');
    end if;
  end loop;
  if array_length(v_missing, 1) > 0 then
    return 'Responda as perguntas obrigatórias: ' || array_to_string(v_missing[1:5], '; ');
  end if;
  return null;
end $$;

-- Preenchimento pela equipe
create or replace function public.submit_anamnesis(p_id uuid, p_answers jsonb, p_signature_name text default null) returns void
language plpgsql security definer set search_path = public as $$
declare an anamnesis%rowtype; v_err text;
begin
  select * into an from anamnesis where id = p_id for update;
  if not found then raise exception 'Anamnese não encontrada.'; end if;
  if not (public.has_permission(an.organization_id, 'assessments.edit')
          or exists (select 1 from patients where id = an.patient_id and user_id = auth.uid())) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if an.status <> 'pending' then raise exception 'Esta anamnese já foi preenchida.'; end if;
  v_err := private.validate_anamnesis_answers(an.questions_snapshot, p_answers);
  if v_err is not null then raise exception '%', v_err; end if;
  update anamnesis set answers = p_answers, status = 'completed', completed_at = now(), completed_ip = private.request_ip(),
         signature_name = p_signature_name,
         filled_by = case when exists (select 1 from patients where id = an.patient_id and user_id = auth.uid()) then 'patient' else 'staff' end,
         public_token = null
   where id = p_id;
end $$;

-- Acesso por link (paciente sem login): retorna somente as perguntas
create or replace function public.get_anamnesis_by_token(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare an anamnesis%rowtype;
begin
  select * into an from anamnesis where public_token = p_token and status = 'pending' and token_expires_at > now();
  if not found then raise exception 'Link inválido ou expirado. Solicite um novo link à clínica.'; end if;
  return jsonb_build_object(
    'id', an.id,
    'organization', (select name from organizations where id = an.organization_id),
    'patient_first_name', (select split_part(full_name, ' ', 1) from patients where id = an.patient_id),
    'questions', an.questions_snapshot);
end $$;

create or replace function public.submit_anamnesis_by_token(p_token uuid, p_answers jsonb, p_signature_name text) returns void
language plpgsql security definer set search_path = public as $$
declare an anamnesis%rowtype; v_err text;
begin
  select * into an from anamnesis where public_token = p_token and status = 'pending' and token_expires_at > now() for update;
  if not found then raise exception 'Link inválido ou expirado. Solicite um novo link à clínica.'; end if;
  if coalesce(trim(p_signature_name), '') = '' then raise exception 'Informe seu nome completo como assinatura.'; end if;
  if pg_column_size(p_answers) > 200000 then raise exception 'Respostas muito longas.'; end if;
  v_err := private.validate_anamnesis_answers(an.questions_snapshot, p_answers);
  if v_err is not null then raise exception '%', v_err; end if;
  update anamnesis set answers = p_answers, status = 'completed', completed_at = now(), filled_by = 'patient',
         completed_ip = private.request_ip(), signature_name = left(p_signature_name, 150), public_token = null
   where id = an.id;
  perform private.notify_permission(an.organization_id, 'assessments.view', 'anamnesis_completed', 'Anamnese preenchida',
    (select full_name from patients where id = an.patient_id) || ' preencheu a anamnese.',
    '/app/alunos/' || an.patient_id || '?aba=anamnese', 'anamnesis', an.id);
end $$;

-- ---------------------------------------------------------------------
-- Avaliações físicas, funcionais e posturais
-- ---------------------------------------------------------------------
-- Campos configuráveis (circunferências, ADM, testes...). data das avaliações usa estas chaves.
create table public.assessment_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  section text not null,           -- circumferences | rom | flexibility | strength | mobility | balance | coordination | endurance | functional_tests | other
  key text not null check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  unit text,                        -- cm, kg, °, s, reps, pontos
  input_type text not null default 'number' check (input_type in ('number','text','select','scale')),
  options jsonb not null default '[]'::jsonb,
  higher_is_better boolean,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (organization_id, key)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  type text not null default 'physical' check (type in ('physical','postural','functional','reassessment')),
  assessed_on date not null default current_date,
  height_cm numeric(5,1) check (height_cm is null or height_cm between 40 and 250),
  weight_kg numeric(5,1) check (weight_kg is null or weight_kg between 2 and 400),
  bmi numeric(5,2) generated always as (
    case when height_cm > 0 and weight_kg > 0 then round(weight_kg / ((height_cm / 100.0) ^ 2), 2) end) stored,
  pain_scale smallint check (pain_scale between 0 and 10),
  borg_scale smallint check (borg_scale between 6 and 20),
  data jsonb not null default '{}'::jsonb,      -- { field_key: valor }
  postural_findings text,
  notes text,
  conclusion text,
  next_assessment_on date,
  status text not null default 'draft' check (status in ('draft','finalized')),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_assessments_patient on public.assessments(patient_id, assessed_on desc);
create trigger trg_assessments_protect before update or delete on public.assessments
  for each row execute function private.protect_finalized_record();

create or replace function public.finalize_assessment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a assessments%rowtype;
begin
  select * into a from assessments where id = p_id for update;
  if not found then raise exception 'Avaliação não encontrada.'; end if;
  perform private.require_permission(a.organization_id, 'assessments.edit');
  if a.status = 'finalized' then raise exception 'Avaliação já finalizada.'; end if;
  update assessments set status = 'finalized', finalized_at = now(), finalized_by = auth.uid() where id = p_id;
end $$;

create table public.postural_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  view text not null check (view in ('anterior','posterior','right_lateral','left_lateral','other')),
  storage_path text not null,      -- bucket privado "clinical"
  annotations jsonb not null default '{"lines":[],"angles":[],"marks":[],"notes":[]}'::jsonb,
  taken_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_postural_patient on public.postural_photos(patient_id, view, taken_at desc);

-- ---------------------------------------------------------------------
-- Anexos / exames / arquivos do aluno
-- ---------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid references public.patients(id) on delete restrict,
  category text not null default 'other' check (category in
    ('exam','medical_report','certificate','prescription','document','contract','consent','image_authorization','receipt','other')),
  is_clinical boolean not null default true,     -- clínicos exigem permissão de prontuário
  title text not null,
  description text,
  bucket text not null default 'clinical',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);
create index idx_attachments_patient on public.attachments(patient_id, created_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Biblioteca de exercícios
-- ---------------------------------------------------------------------
create table public.exercise_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text,
  name text not null,
  sort_order int not null default 0,
  unique (organization_id, name)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.exercise_categories(id) on delete set null,
  name text not null,
  description text,
  objective text,
  muscles text[] not null default '{}',
  level text not null default 'beginner' check (level in ('beginner','intermediate','advanced')),
  indications text,
  contraindications text,
  springs_config text,
  start_position text,
  execution text,
  repetitions text,
  notes text,
  image_path text,
  video_url text check (video_url is null or video_url ~* '^https://'),
  is_custom boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_exercises_org_cat on public.exercises(organization_id, category_id) where deleted_at is null;
create index idx_exercises_search on public.exercises using gin (to_tsvector('simple', public.f_unaccent(name)));

-- Programas de exercícios do aluno e modelos reutilizáveis (is_template = true, patient_id nulo)
create table public.patient_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null,
  template_id uuid references public.patient_programs(id) on delete set null,
  is_template boolean not null default false,
  name text not null,
  goal text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check ((is_template and patient_id is null) or (not is_template and patient_id is not null))
);
create index idx_programs_patient on public.patient_programs(patient_id, status);

create table public.patient_program_exercises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.patient_programs(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  sort_order int not null default 0,
  sets int check (sets is null or sets between 1 and 50),
  repetitions text,
  duration_seconds int check (duration_seconds is null or duration_seconds between 1 and 7200),
  load text,          -- carga / molas
  springs text,
  notes text,
  progression text
);
create index idx_ppe_program on public.patient_program_exercises(program_id, sort_order);

-- Copia um modelo para o aluno
create or replace function public.apply_program_template(p_template_id uuid, p_patient_id uuid, p_start_date date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare t patient_programs%rowtype; v_id uuid;
begin
  select * into t from patient_programs where id = p_template_id and is_template;
  if not found then raise exception 'Modelo não encontrado.'; end if;
  perform private.require_permission(t.organization_id, 'exercises.create');
  if not exists (select 1 from patients where id = p_patient_id and organization_id = t.organization_id) then
    raise exception 'Aluno inválido.';
  end if;
  insert into patient_programs (organization_id, patient_id, staff_id, template_id, name, goal, start_date, notes)
  values (t.organization_id, p_patient_id, (select id from staff where user_id = auth.uid() and organization_id = t.organization_id limit 1),
          t.id, t.name, t.goal, p_start_date, t.notes)
  returning id into v_id;
  insert into patient_program_exercises (organization_id, program_id, exercise_id, sort_order, sets, repetitions,
                                         duration_seconds, load, springs, notes, progression)
  select organization_id, v_id, exercise_id, sort_order, sets, repetitions, duration_seconds, load, springs, notes, progression
    from patient_program_exercises where program_id = t.id;
  return v_id;
end $$;

-- Alunos com reavaliação vencida (regra: intervalo configurável, padrão 90 dias)
create or replace function public.patients_due_reassessment(p_org uuid, p_limit int default 50)
returns table (patient_id uuid, full_name text, last_assessment date, days_since int)
language plpgsql stable security definer set search_path = public as $$
declare v_days int := coalesce((private.setting(p_org, 'reassessment_interval_days', '90'::jsonb))::text::int, 90);
begin
  if not public.has_permission(p_org, 'assessments.view') then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, max(a.assessed_on), (current_date - max(a.assessed_on))::int
    from patients p left join assessments a on a.patient_id = p.id
   where p.organization_id = p_org and p.status = 'active' and p.deleted_at is null
   group by p.id, p.full_name
  having max(a.assessed_on) is null or max(a.assessed_on) < current_date - v_days
   order by max(a.assessed_on) nulls first
   limit p_limit;
end $$;

-- Gatilhos padrão
do $$
declare t text;
begin
  foreach t in array array['medical_records','clinical_evolutions','anamnesis_templates','anamnesis','assessments',
                           'exercises','patient_programs'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function private.set_updated_at()', t);
  end loop;
  foreach t in array array['medical_records','clinical_evolutions','anamnesis_templates','anamnesis','assessments',
                           'exercises','patient_programs','evolution_templates'] loop
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
  end loop;
  foreach t in array array['medical_records','clinical_evolutions','anamnesis','assessments','postural_photos','attachments',
                           'exercises','patient_programs','anamnesis_templates','anamnesis_questions','assessment_fields'] loop
    perform private.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;

-- Evolução: autor padrão = usuário logado
create or replace function private.evolution_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author_id := coalesce(new.author_id, auth.uid());
  if new.staff_id is null then
    select id into new.staff_id from staff where user_id = auth.uid() and organization_id = new.organization_id limit 1;
  end if;
  return new;
end $$;
create trigger trg_evolutions_defaults before insert on public.clinical_evolutions
  for each row execute function private.evolution_defaults();
