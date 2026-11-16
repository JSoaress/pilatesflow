-- Descobre quais partes do banco já foram instaladas e monta o comando de correção.
with m(v, ok) as (values
  ('20261020000001', to_regclass('public.organizations') is not null),
  ('20261020000002', to_regclass('public.schedule_blocks') is not null),
  ('20261020000003', to_regprocedure('private.accept_contract(uuid,jsonb)') is not null or exists (select 1 from pg_proc where proname = 'accept_contract')),
  ('20261020000004', exists (select 1 from pg_proc where proname = 'expire_replacement_credits')),
  ('20261020000005', exists (select 1 from pg_proc where proname = 'patients_due_reassessment')),
  ('20261020000006', to_regclass('public.calendar_connections') is not null),
  ('20261020000007', to_regclass('public.commissions') is not null),
  ('20261020000008', exists (select 1 from pg_proc where proname = 'check_rate_limit')),
  ('20261020000009', exists (select 1 from pg_proc where proname = 'storage_org')),
  ('20261020000010', exists (select 1 from pg_proc where proname = 'grant_manual_credit')),
  ('20261020000011', exists (select 1 from pg_proc where proname = 'receipt_data')),
  ('20261020000012', exists (select 1 from pg_proc where proname = 'search_global')),
  ('20261020000013', exists (select 1 from pg_proc where proname = 'revoke_portal_access')),
  ('20261020000014', exists (select 1 from pg_proc where proname = 'seed_demo_data')),
  ('20261020000015', exists (select 1 from pg_proc where proname = 'run_automations')),
  ('20261020000016', exists (select 1 from pg_constraint where conname = 'fk_attachments_uploaded_profile')),
  ('20261020000017', exists (select 1 from pg_proc where proname = 'portal_leave_waitlist')),
  ('20261020000018', exists (select 1 from pg_proc where proname = 'report_admin')),
  ('20261020000019', exists (select 1 from pg_proc where proname = 'trg_org_body3d_fields')),
  ('20261020000020', exists (select 1 from pg_proc where proname = 'add_handout_templates')),
  ('20261020000021', exists (select 1 from information_schema.columns where table_name = 'patients' and column_name = 'body_goals')),
  ('20261020000022', exists (select 1 from pg_proc where proname = 'app_bootstrap')),
  ('20261020000023', to_regclass('public.evaluation_templates') is not null),
  ('20261020000024', exists (select 1 from information_schema.columns where table_name = 'attachments' and column_name = 'exam_area')),
  ('20261020000025', to_regclass('public.platform_admins') is not null),
  ('20261020000099', true)
)
select
  'npx supabase migration repair --linked --status applied ' || string_agg(v, ' ' order by v) filter (where ok) as comando_1_copiar,
  coalesce(string_agg(v, ', ' order by v) filter (where not ok), 'nenhuma') as faltam_instalar
from m;
