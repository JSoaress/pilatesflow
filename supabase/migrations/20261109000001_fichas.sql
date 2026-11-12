-- =====================================================================
-- PilatesFlow — Fichas de avaliação configuráveis
-- Mesmo padrão da anamnese (modelo -> perguntas -> snapshot ao criar),
-- mas sem o fluxo de link público: a ficha é sempre preenchida pela
-- equipe durante o atendimento, com ciclo de vida draft -> finalized
-- (igual a "assessments"). v1 estática: sem escore calculado e sem
-- pergunta condicional — isso fica para uma evolução futura.
-- =====================================================================

create table public.ficha_templates (
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
create trigger trg_ficha_templates_updated before update on public.ficha_templates
  for each row execute function private.set_updated_at();
create trigger trg_ficha_templates_created_by before insert on public.ficha_templates
  for each row execute function private.set_created_by();

create table public.ficha_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.ficha_templates(id) on delete cascade,
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
create index idx_ficha_q_template on public.ficha_questions(template_id, sort_order);
create trigger trg_same_org before insert or update on public.ficha_questions
  for each row execute function private.check_same_org('template_id', 'ficha_templates');

create table public.fichas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  template_id uuid references public.ficha_templates(id) on delete set null,
  questions_snapshot jsonb not null,            -- perguntas no momento da criação (versão)
  answers jsonb not null default '{}'::jsonb,   -- { question_id: valor }
  signature_name text,                          -- assinatura do profissional (nome digitado)
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_fichas_patient on public.fichas(patient_id, created_at desc);
create trigger trg_fichas_updated before update on public.fichas
  for each row execute function private.set_updated_at();
create trigger trg_fichas_created_by before insert on public.fichas
  for each row execute function private.set_created_by();
create trigger trg_fichas_protect before update or delete on public.fichas
  for each row execute function private.protect_finalized_record();
create trigger trg_same_org before insert or update on public.fichas
  for each row execute function private.check_same_org('patient_id', 'patients', 'staff_id', 'staff', 'appointment_id', 'appointments');

select private.enable_audit('public.ficha_templates');
select private.enable_audit('public.ficha_questions');
select private.enable_audit('public.fichas');

-- Cria a ficha para o aluno com snapshot das perguntas ativas do modelo
create or replace function public.create_ficha(p_patient_id uuid, p_template_id uuid, p_staff_id uuid default null, p_appointment_id uuid default null) returns uuid
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
    from ficha_questions q
   where q.template_id = p_template_id and q.organization_id = pt.organization_id and q.is_active;
  if jsonb_array_length(v_snapshot) = 0 then raise exception 'O modelo de ficha não possui perguntas.'; end if;
  insert into fichas (organization_id, unit_id, patient_id, staff_id, appointment_id, template_id, questions_snapshot)
  values (pt.organization_id, pt.unit_id, pt.id, p_staff_id, p_appointment_id, p_template_id, v_snapshot)
  returning id into v_id;
  return v_id;
end $$;

-- Finaliza a ficha (torna imutável); reaproveita o validador de obrigatórias da anamnese,
-- que já é genérico sobre qualquer par snapshot/answers.
create or replace function public.finalize_ficha(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f fichas%rowtype; v_err text;
begin
  select * into f from fichas where id = p_id for update;
  if not found then raise exception 'Ficha não encontrada.'; end if;
  perform private.require_permission(f.organization_id, 'assessments.edit');
  if f.status = 'finalized' then raise exception 'Esta ficha já foi finalizada.'; end if;
  v_err := private.validate_anamnesis_answers(f.questions_snapshot, f.answers);
  if v_err is not null then raise exception '%', v_err; end if;
  update fichas set status = 'finalized', finalized_at = now(), finalized_by = auth.uid() where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- RLS — mesmo padrão de anamnesis_templates/anamnesis_questions (leitura
-- geral, escrita só quem administra avaliações) e de assessments
-- (CRUD liberado por permissão; a imutabilidade pós-finalização é
-- garantida pelo trigger, não pela policy).
-- ---------------------------------------------------------------------
select private.std_policies('ficha_templates', 'assessments', false, null, '{select}');
create policy ficha_templates_write on public.ficha_templates for all to authenticated
  using (public.has_permission(organization_id, 'assessments.edit')) with check (public.has_permission(organization_id, 'assessments.edit'));
select private.std_policies('ficha_questions', 'assessments', false, null, '{select}');
create policy ficha_questions_write on public.ficha_questions for all to authenticated
  using (public.has_permission(organization_id, 'assessments.edit')) with check (public.has_permission(organization_id, 'assessments.edit'));
select private.std_policies('fichas', 'assessments', false, 'public.has_permission(organization_id, ''medical_records.view'')');

grant select, insert, update, delete on public.ficha_templates, public.ficha_questions, public.fichas to authenticated;
grant all on public.ficha_templates, public.ficha_questions, public.fichas to service_role;
grant execute on function public.create_ficha(uuid, uuid, uuid, uuid), public.finalize_ficha(uuid) to authenticated;
