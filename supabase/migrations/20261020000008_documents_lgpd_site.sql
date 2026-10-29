-- =====================================================================
-- PilatesFlow — 0008 Documentos, LGPD, site público, backup e rate limit
-- =====================================================================

-- ---------------------------------------------------------------------
-- Central de documentos
-- ---------------------------------------------------------------------
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('contract','anamnesis','consent_term','image_authorization','privacy_policy',
                                     'assessment','certificate','exam','receipt','other')),
  name text not null,
  body text not null,
  version int not null default 1,
  requires_signature boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid references public.patients(id) on delete restrict,
  type text not null check (type in ('contract','anamnesis','consent_term','image_authorization','privacy_policy',
                                     'assessment','certificate','exam','receipt','other')),
  title text not null,
  template_id uuid references public.document_templates(id) on delete set null,
  template_version int,
  content text,                     -- conteúdo renderizado (imutável após assinatura)
  content_hash text,
  storage_path text,                -- PDF/arquivo no bucket privado "documents"
  status text not null default 'draft' check (status in ('draft','sent','signed','archived')),
  requires_signature boolean not null default false,
  sent_at timestamptz,
  signed_at timestamptz,
  signed_name text,
  signed_ip text,
  signed_user_agent text,
  is_clinical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_documents_patient on public.documents(patient_id, created_at desc) where deleted_at is null;
create index idx_documents_org_type on public.documents(organization_id, type) where deleted_at is null;

create or replace function private.protect_signed_document() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.status = 'signed' then
    raise exception 'Documento assinado não pode ser excluído. Arquive-o.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'signed' and (new.content is distinct from old.content or new.signed_at is distinct from old.signed_at) then
    raise exception 'Documento assinado não pode ser alterado.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_documents_protect before update or delete on public.documents
  for each row execute function private.protect_signed_document();

-- Gera documento a partir de modelo com variáveis do aluno
create or replace function public.generate_document(p_template_id uuid, p_patient_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t document_templates%rowtype; pt patients%rowtype; o organizations%rowtype; u units%rowtype; v_body text; v_id uuid;
begin
  select * into t from document_templates where id = p_template_id;
  if not found then raise exception 'Modelo não encontrado.'; end if;
  perform private.require_permission(t.organization_id, 'documents.create');
  select * into pt from patients where id = p_patient_id and organization_id = t.organization_id;
  if not found then raise exception 'Aluno inválido.'; end if;
  select * into o from organizations where id = t.organization_id;
  select * into u from units where id = pt.unit_id;
  v_body := private.render_template(t.body, jsonb_build_object(
    'nome_aluno', pt.full_name, 'cpf', coalesce(pt.cpf, 'não informado'), 'rg', coalesce(pt.rg, ''),
    'data_nascimento', coalesce(to_char(pt.birth_date, 'DD/MM/YYYY'), ''), 'unidade', coalesce(u.name, ''),
    'empresa', coalesce(o.legal_name, o.name), 'cnpj_empresa', coalesce(u.cnpj, o.cnpj, ''),
    'endereco_unidade', concat_ws(', ', u.address_street, u.address_number, u.address_city),
    'data_hoje', to_char((now() at time zone o.timezone)::date, 'DD/MM/YYYY')));
  insert into documents (organization_id, unit_id, patient_id, type, title, template_id, template_version, content,
                         content_hash, requires_signature)
  values (t.organization_id, pt.unit_id, pt.id, t.type, t.name || ' — ' || pt.full_name, t.id, t.version, v_body,
          encode(extensions.digest(v_body, 'sha256'), 'hex'), t.requires_signature)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- LGPD: documentos legais versionados, consentimentos e solicitações de titulares
-- ---------------------------------------------------------------------
create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('privacy_policy','terms_of_use','health_data_consent','image_use_consent')),
  version int not null,
  title text not null,
  content text not null,
  published_at timestamptz,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (organization_id, kind, version)
);
create unique index uq_legal_current on public.legal_documents(organization_id, kind) where is_current;

create or replace function private.protect_published_legal() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.published_at is not null then
    raise exception 'Versões publicadas não podem ser excluídas (histórico de versões).' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.published_at is not null and (new.content is distinct from old.content or new.version is distinct from old.version) then
    raise exception 'Versão publicada não pode ser alterada. Crie uma nova versão.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_legal_protect before update or delete on public.legal_documents
  for each row execute function private.protect_published_legal();

create or replace function public.publish_legal_document(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d legal_documents%rowtype;
begin
  select * into d from legal_documents where id = p_id;
  if not found then raise exception 'Documento não encontrado.'; end if;
  perform private.require_permission(d.organization_id, 'lgpd.manage');
  update legal_documents set is_current = false where organization_id = d.organization_id and kind = d.kind and is_current;
  update legal_documents set is_current = true, published_at = coalesce(published_at, now()) where id = p_id;
end $$;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  purpose text not null check (purpose in ('privacy_policy','terms_of_use','health_data','image_use','marketing','whatsapp_contact')),
  legal_document_id uuid references public.legal_documents(id) on delete set null,
  granted boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  channel text not null default 'system' check (channel in ('website','portal','system','paper')),
  ip text,
  user_agent text,
  recorded_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (patient_id is not null or lead_id is not null or user_id is not null)
);
create index idx_consents_patient on public.consents(patient_id, purpose, granted_at desc);

create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  requester_name text not null,
  requester_email text,
  requester_document text,
  kind text not null check (kind in ('access','correction','export','anonymization','deletion','portability','revoke_consent','information')),
  description text,
  status text not null default 'open' check (status in ('open','in_progress','completed','rejected')),
  response text,
  retention_justification text,     -- motivo legal para manter dados (ex.: guarda de prontuário)
  due_date date not null default (current_date + 15),
  completed_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index idx_dsr_org_status on public.data_subject_requests(organization_id, status);

-- Exportação dos dados do titular (portabilidade/acesso). Registrada na auditoria.
create or replace function public.export_patient_data(p_patient_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt patients%rowtype; v jsonb; v_clinical boolean;
begin
  select * into pt from patients where id = p_patient_id;
  if not found then raise exception 'Aluno não encontrado.'; end if;
  perform private.require_permission(pt.organization_id, 'lgpd.manage');
  v_clinical := public.has_permission(pt.organization_id, 'medical_records.view');
  v := jsonb_build_object(
    'gerado_em', now(),
    'dados_cadastrais', to_jsonb(pt) - 'checkin_token' - 'checkin_pin',
    'contatos_emergencia', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from emergency_contacts e where e.patient_id = pt.id),
    'assinaturas', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from subscriptions s where s.patient_id = pt.id),
    'financeiro', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from accounts_receivable a where a.patient_id = pt.id),
    'pagamentos', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from payments p where p.patient_id = pt.id),
    'agendamentos', (select coalesce(jsonb_agg(jsonb_build_object('inicio', a.starts_at, 'status', ap.status, 'modalidade', s.name)), '[]')
                       from appointment_participants ap join appointments a on a.id = ap.appointment_id join services s on s.id = a.service_id
                      where ap.patient_id = pt.id),
    'contratos', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from contracts c where c.patient_id = pt.id),
    'consentimentos', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from consents c where c.patient_id = pt.id),
    'mensagens', (select coalesce(jsonb_agg(jsonb_build_object('canal', m.channel, 'data', m.created_at, 'status', m.status)), '[]')
                    from messages m where m.patient_id = pt.id),
    'prontuario', case when v_clinical then (select to_jsonb(mr) from medical_records mr where mr.patient_id = pt.id) end,
    'evolucoes', case when v_clinical then (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from clinical_evolutions e where e.patient_id = pt.id) end,
    'avaliacoes', case when v_clinical then (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from assessments a where a.patient_id = pt.id) end,
    'anamneses', case when v_clinical then (select coalesce(jsonb_agg(to_jsonb(a) - 'public_token'), '[]') from anamnesis a where a.patient_id = pt.id) end
  );
  insert into audit_logs (organization_id, user_id, action, entity, entity_id, context, ip, user_agent)
  values (pt.organization_id, auth.uid(), 'export', 'patients', pt.id::text,
          jsonb_build_object('type', 'lgpd_data_export', 'includes_clinical', v_clinical), private.request_ip(), private.request_user_agent());
  return v;
end $$;

-- Anonimização: remove identificação direta. Bloqueia se houver registros clínicos dentro do
-- prazo de guarda configurado (clinical_retention_years) — obrigação legal/profissional.
create or replace function public.anonymize_patient(p_patient_id uuid, p_request_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare pt patients%rowtype; v_years int; v_last_clinical timestamptz; v_open numeric;
begin
  select * into pt from patients where id = p_patient_id for update;
  if not found then raise exception 'Aluno não encontrado.'; end if;
  perform private.require_permission(pt.organization_id, 'lgpd.manage');
  if pt.anonymized_at is not null then raise exception 'Este cadastro já foi anonimizado.'; end if;
  v_years := coalesce((private.setting(pt.organization_id, 'clinical_retention_years', '20'::jsonb))::text::int, 20);
  select greatest(
      (select max(occurred_at) from clinical_evolutions where patient_id = pt.id),
      (select max(created_at) from medical_records where patient_id = pt.id),
      (select max(assessed_on)::timestamptz from assessments where patient_id = pt.id),
      (select max(completed_at) from anamnesis where patient_id = pt.id))
    into v_last_clinical;
  if v_last_clinical is not null and v_last_clinical > now() - make_interval(years => v_years) then
    raise exception 'Não é possível anonimizar: existem registros clínicos sujeitos a guarda obrigatória até %. Registre a justificativa na solicitação.',
      to_char(v_last_clinical + make_interval(years => v_years), 'DD/MM/YYYY');
  end if;
  select coalesce(sum(amount - discount + surcharge - amount_paid), 0) into v_open
    from accounts_receivable where patient_id = pt.id and status in ('pending','overdue','partial');
  if v_open > 0 then
    raise exception 'Existem débitos em aberto (R$ %). Regularize ou cancele antes de anonimizar.', v_open;
  end if;

  update patients set
    full_name = 'Titular anonimizado ' || left(pt.id::text, 8), social_name = null, birth_date = null, cpf = null, rg = null,
    profession = null, phone = null, whatsapp = null, email = null, address_street = null, address_number = null,
    address_complement = null, address_district = null, address_zip = null, photo_path = null, notes = null,
    referred_by_name = null, checkin_pin = null, user_id = null, status = 'inactive', anonymized_at = now(), deleted_at = coalesce(deleted_at, now())
   where id = pt.id;
  delete from emergency_contacts where patient_id = pt.id;
  update leads set name = 'Anonimizado', phone = null, whatsapp = null, email = null, instagram = null where patient_id = pt.id;
  if p_request_id is not null then
    update data_subject_requests set status = 'completed', completed_at = now(), handled_by = auth.uid() where id = p_request_id;
  end if;
  insert into audit_logs (organization_id, user_id, action, entity, entity_id, context)
  values (pt.organization_id, auth.uid(), 'anonymize', 'patients', pt.id::text, jsonb_build_object('request_id', p_request_id));
end $$;

-- ---------------------------------------------------------------------
-- Backups (somente execuções reais registradas pelos scripts/servidor)
-- ---------------------------------------------------------------------
create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('database','storage','full')),
  source text not null check (source in ('supabase_managed','script','external')),
  status text not null check (status in ('running','success','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  size_bytes bigint,
  location text,
  checksum text,
  error text,
  created_at timestamptz not null default now()
);
create index idx_backup_runs_started on public.backup_runs(started_at desc);

-- ---------------------------------------------------------------------
-- Site público (conteúdo editável pelo painel)
--   Textos gerais ficam em system_settings key = 'website' (JSON)
-- ---------------------------------------------------------------------
create table public.site_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  excerpt text,
  content text not null,             -- markdown simples
  cover_path text,                   -- bucket público "site"
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, slug)
);

create table public.site_testimonials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_name text not null,         -- publicar somente com autorização do autor
  author_role text,
  content text not null,
  rating smallint check (rating between 1 and 5),
  authorized_at timestamptz,         -- data da autorização de uso
  is_published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (not is_published or authorized_at is not null)
);

create table public.site_faqs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  question text not null,
  answer text not null,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.site_gallery (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  image_path text not null,
  caption text,
  section text not null default 'structure' check (section in ('structure','home','about','team')),
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Rate limiting (formulários públicos, login, check-in)
-- ---------------------------------------------------------------------
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

create or replace function private.rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = private, public as $$
declare v_allowed boolean;
begin
  insert into private.rate_limits as rl (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning count <= p_max into v_allowed;
  return v_allowed;
end $$;

-- Usado pelo servidor Next.js (service role) para rate limit de login/rotas
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language sql security definer set search_path = private, public as $$
  select private.rate_limit(left(p_key, 200), p_max, p_window_seconds)
$$;
revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['document_templates','documents','data_subject_requests','site_posts'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function private.set_updated_at()', t);
  end loop;
  foreach t in array array['document_templates','documents','site_posts'] loop
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
  end loop;
  foreach t in array array['document_templates','documents','legal_documents','consents','data_subject_requests',
                           'site_posts','site_testimonials','site_faqs'] loop
    perform private.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;
