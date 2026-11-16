-- Registra no histórico do Supabase as partes do banco que JÁ estão instaladas.
-- Depois disso, "npx supabase db push --linked --include-all" instala só o que falta.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);

with m(v, nome, ok) as (values
  ('20261020000001', 'foundation', to_regclass('public.organizations') is not null),
  ('20261020000002', 'people_and_resources', to_regclass('public.schedule_blocks') is not null),
  ('20261020000003', 'plans_finance', exists (select 1 from pg_proc where proname = 'accept_contract')),
  ('20261020000004', 'schedule', exists (select 1 from pg_proc where proname = 'expire_replacement_credits')),
  ('20261020000005', 'clinical', exists (select 1 from pg_proc where proname = 'patients_due_reassessment')),
  ('20261020000006', 'crm_communication', to_regclass('public.calendar_connections') is not null),
  ('20261020000007', 'operations', to_regclass('public.commissions') is not null),
  ('20261020000008', 'documents_lgpd_site', exists (select 1 from pg_proc where proname = 'check_rate_limit')),
  ('20261020000009', 'storage', exists (select 1 from pg_proc where proname = 'storage_org')),
  ('20261020000010', 'rls', exists (select 1 from pg_proc where proname = 'grant_manual_credit')),
  ('20261020000011', 'public_portal', exists (select 1 from pg_proc where proname = 'receipt_data')),
  ('20261020000012', 'analytics', exists (select 1 from pg_proc where proname = 'search_global')),
  ('20261020000013', 'bootstrap', exists (select 1 from pg_proc where proname = 'revoke_portal_access')),
  ('20261020000014', 'demo_seed', exists (select 1 from pg_proc where proname = 'seed_demo_data')),
  ('20261020000015', 'gateway_and_workers', exists (select 1 from pg_proc where proname = 'run_automations')),
  ('20261020000016', 'profile_links', exists (select 1 from pg_constraint where conname = 'fk_attachments_uploaded_profile')),
  ('20261020000017', 'portal_extras', exists (select 1 from pg_proc where proname = 'portal_leave_waitlist')),
  ('20261020000018', 'reports_extra', exists (select 1 from pg_proc where proname = 'report_admin')),
  ('20261020000019', 'posture_fields', exists (select 1 from pg_proc where proname = 'trg_org_body3d_fields')),
  ('20261020000020', 'handouts', exists (select 1 from pg_proc where proname = 'add_handout_templates')),
  ('20261020000021', 'body_goals', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'patients' and column_name = 'body_goals')),
  ('20261020000022', 'app_bootstrap', exists (select 1 from pg_proc where proname = 'app_bootstrap')),
  ('20261020000023', 'evaluation_forms', to_regclass('public.evaluation_templates') is not null),
  ('20261020000024', 'exam_reports', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'attachments' and column_name = 'exam_area')),
  ('20261020000025', 'license', to_regclass('public.platform_admins') is not null),
  ('20261020000099', 'final_grants', to_regclass('public.organizations') is not null)
), ins as (
  insert into supabase_migrations.schema_migrations (version, name, statements)
  select v, nome, '{}' from m where ok
  on conflict (version) do nothing
  returning version
)
select
  (select count(*) from ins) as registradas_agora,
  (select coalesce(string_agg(nome, ', ' order by v), 'nenhuma') from m where not ok) as faltam_instalar;
