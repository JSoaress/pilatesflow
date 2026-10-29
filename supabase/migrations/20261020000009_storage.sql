-- =====================================================================
-- PilatesFlow — 0009 Storage
-- Todos os caminhos começam com o id da organização: {organization_id}/...
--   clinical  (privado) fotos posturais, exames, laudos       → permissões clínicas
--   documents (privado) contratos, recibos, comprovantes       → documentos/financeiro
--   avatars   (privado) fotos de alunos e equipe               → alunos/equipe
--   site      (público) imagens do site, logo                  → site/configurações
-- Downloads de arquivos privados: somente via URL assinada temporária gerada no servidor.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('clinical',  'clinical',  false, 20971520, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('documents', 'documents', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('avatars',   'avatars',   false, 5242880,  array['image/jpeg','image/png','image/webp']),
  ('site',      'site',      true,  10485760, array['image/jpeg','image/png','image/webp','image/svg+xml','image/x-icon'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_org(p_name text) returns uuid
language plpgsql immutable as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;

-- clinical
create policy "clinical_select" on storage.objects for select to authenticated using (
  bucket_id = 'clinical' and (public.has_permission(private.storage_org(name), 'medical_records.view')
                              or public.has_permission(private.storage_org(name), 'assessments.view')));
create policy "clinical_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'clinical' and (public.has_permission(private.storage_org(name), 'medical_records.create')
                              or public.has_permission(private.storage_org(name), 'assessments.create')));
-- arquivos clínicos não são apagados nem sobrescritos pela aplicação (sem policies de update/delete)

-- documents
create policy "documents_select" on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (public.has_permission(private.storage_org(name), 'documents.view')
                               or public.has_permission(private.storage_org(name), 'finance.view')
                               or public.has_permission(private.storage_org(name), 'contracts.view')));
create policy "documents_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and (public.has_permission(private.storage_org(name), 'documents.create')
                               or public.has_permission(private.storage_org(name), 'finance.create')
                               or public.has_permission(private.storage_org(name), 'contracts.create')
                               or public.has_permission(private.storage_org(name), 'equipment.edit')));

-- avatars
create policy "avatars_select" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and public.is_org_member(private.storage_org(name)));
create policy "avatars_write" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (public.has_permission(private.storage_org(name), 'patients.edit')
                             or public.has_permission(private.storage_org(name), 'staff.edit')
                             or public.has_permission(private.storage_org(name), 'patients.create')));
create policy "avatars_update" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and (public.has_permission(private.storage_org(name), 'patients.edit')
                             or public.has_permission(private.storage_org(name), 'staff.edit')));
create policy "avatars_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and (public.has_permission(private.storage_org(name), 'patients.edit')
                             or public.has_permission(private.storage_org(name), 'staff.edit')));

-- site (leitura pública via CDN do bucket público; escrita restrita)
create policy "site_write" on storage.objects for insert to authenticated with check (
  bucket_id = 'site' and (public.has_permission(private.storage_org(name), 'website.edit')
                          or public.has_permission(private.storage_org(name), 'settings.edit')));
create policy "site_update" on storage.objects for update to authenticated using (
  bucket_id = 'site' and (public.has_permission(private.storage_org(name), 'website.edit')
                          or public.has_permission(private.storage_org(name), 'settings.edit')));
create policy "site_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'site' and (public.has_permission(private.storage_org(name), 'website.edit')
                          or public.has_permission(private.storage_org(name), 'settings.edit')));
create policy "site_read" on storage.objects for select to anon, authenticated using (bucket_id = 'site');
