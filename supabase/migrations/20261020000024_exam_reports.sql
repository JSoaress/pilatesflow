-- =====================================================================
-- Laudos e exames do paciente
-- Reaproveita public.attachments (armazenamento privado, RLS, auditoria,
-- link temporário) e acrescenta os dados do laudo: área/especialidade
-- (mesmas áreas das fichas de avaliação), tipo de exame, data, quem emitiu,
-- conclusão/achados e o vínculo opcional com uma avaliação.
-- =====================================================================

alter table public.attachments
  add column if not exists exam_area text,
  add column if not exists exam_kind text,
  add column if not exists exam_date date,
  add column if not exists issuer text,
  add column if not exists findings text,
  add column if not exists assessment_id uuid references public.assessments(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.attachments drop constraint if exists attachments_exam_area_check;
alter table public.attachments add constraint attachments_exam_area_check check (exam_area is null or exam_area in
  ('pilates','musculoesqueletica','postural','fibromialgia','gerontologia','obstetricia','neurologia','cardiorrespiratoria','geral','outro'));

alter table public.attachments drop constraint if exists attachments_exam_kind_check;
alter table public.attachments add constraint attachments_exam_kind_check check (exam_kind is null or exam_kind in
  ('raio_x','ressonancia','tomografia','ultrassom','densitometria','eletroneuromiografia','laboratorial','ecocardiograma',
   'eletrocardiograma','ergometrico','espirometria','baropodometria','polissonografia','relatorio_medico','encaminhamento','outro'));

alter table public.attachments drop constraint if exists attachments_text_len_check;
alter table public.attachments add constraint attachments_text_len_check check (
  coalesce(length(issuer), 0) <= 200 and coalesce(length(findings), 0) <= 8000);

create index if not exists idx_attachments_reports on public.attachments(patient_id, exam_area, exam_date desc)
  where deleted_at is null and category in ('exam','medical_report');
create index if not exists idx_attachments_assessment on public.attachments(assessment_id) where assessment_id is not null;

-- O arquivo em si nunca muda depois de enviado: só os dados descritivos.
create or replace function private.protect_attachment_file()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.patient_id is distinct from old.patient_id
     or new.bucket is distinct from old.bucket
     or new.storage_path is distinct from old.storage_path
     or new.is_clinical is distinct from old.is_clinical then
    raise exception 'O arquivo de um anexo não pode ser trocado. Envie um novo arquivo.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_protect_attachment_file on public.attachments;
create trigger trg_protect_attachment_file before update on public.attachments
  for each row execute function private.protect_attachment_file();

-- A avaliação vinculada precisa ser do mesmo paciente.
create or replace function private.check_attachment_assessment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assessment_id is not null and not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.patient_id = new.patient_id and a.organization_id = new.organization_id) then
    raise exception 'A avaliação vinculada não pertence a este paciente.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_check_attachment_assessment on public.attachments;
create trigger trg_check_attachment_assessment before insert or update of assessment_id on public.attachments
  for each row execute function private.check_attachment_assessment();

-- Profissionais clínicos podem corrigir os dados de um laudo (tipo, data, conclusão)
-- sem precisar da permissão de excluir documentos.
drop policy if exists attachments_update_clinical on public.attachments;
create policy attachments_update_clinical on public.attachments for update to authenticated
  using (is_clinical and (public.has_permission(organization_id, 'medical_records.edit') or public.has_permission(organization_id, 'assessments.edit')))
  with check (is_clinical and (public.has_permission(organization_id, 'medical_records.edit') or public.has_permission(organization_id, 'assessments.edit')));

-- Classifica os exames já existentes como "geral".
update public.attachments set exam_area = 'geral', exam_date = coalesce(exam_date, created_at::date)
where category in ('exam','medical_report') and exam_area is null;
