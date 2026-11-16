-- =====================================================================
-- Fichas de avaliação estruturadas
--  • Modelos do sistema ficam no código (versionados); modelos personalizados
--    da clínica ficam em evaluation_templates.
--  • Cada avaliação guarda uma CÓPIA do modelo usado (form_schema), as respostas
--    e os escores calculados — alterar um modelo nunca muda avaliações antigas.
-- =====================================================================
create table public.evaluation_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  specialty text,
  description text,
  schema jsonb not null,                 -- { sections: [...] }
  based_on text,                         -- ex.: 'sys:postural' quando duplicado de um modelo do sistema
  version int not null default 1,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_templates_schema_ok check (coalesce(jsonb_typeof(schema -> 'sections'), '') = 'array')
);
create index idx_eval_templates_org on public.evaluation_templates(organization_id, is_active);
create trigger trg_eval_templates_updated before update on public.evaluation_templates
  for each row execute function private.set_updated_at();
select private.enable_audit('public.evaluation_templates');

alter table public.evaluation_templates enable row level security;
create policy evaluation_templates_select on public.evaluation_templates for select to authenticated
  using (public.has_permission(organization_id, 'assessments.view'));
create policy evaluation_templates_write on public.evaluation_templates for all to authenticated
  using (public.has_permission(organization_id, 'assessments.edit') and public.has_permission(organization_id, 'settings.edit'))
  with check (public.has_permission(organization_id, 'assessments.edit') and public.has_permission(organization_id, 'settings.edit'));
grant select, insert, update, delete on public.evaluation_templates to authenticated;

alter table public.assessments drop constraint if exists assessments_type_check;
alter table public.assessments add constraint assessments_type_check
  check (type in ('physical','postural','functional','reassessment','clinical_form'));
alter table public.assessments
  add column form_key text,                              -- 'sys:postural' ou id do modelo personalizado
  add column form_name text,
  add column form_version int,
  add column form_schema jsonb,                          -- cópia do modelo no momento da avaliação
  add column form_answers jsonb not null default '{}'::jsonb,
  add column form_scores jsonb not null default '{}'::jsonb;
create index idx_assessments_form on public.assessments(patient_id, form_key, assessed_on desc) where form_key is not null;
