# Banco de dados

Postgres 17 no Supabase. 85 tabelas em `public`, um schema `private` para
funções internas (não exposto pela API), RLS habilitada em todas as tabelas
e ~100 funções RPC que concentram as regras de negócio.

## Migrations

Ordem importa: o arquivo `_rls` depende das tabelas, `_final_grants` precisa
ser sempre o último.

| Arquivo | Conteúdo |
|---|---|
| `0001_foundation` | Organizações, unidades, perfis, RBAC (papéis, permissões), membros, configurações, auditoria, funções de segurança |
| `0002_people_and_resources` | Equipe (horários, folgas), alunos, contatos de emergência, salas, equipamentos, modalidades, feriados, bloqueios, fornecedores |
| `0003_plans_finance` | Planos, assinaturas, contratos, categorias, formas de pagamento, caixas, a receber, a pagar, pagamentos, movimentos de caixa, notas, cobranças de gateway |
| `0004_schedule` | Agendamentos, participantes, presença, recorrências, lista de espera, créditos de reposição, eventos de agendamento, notificações |
| `0005_clinical` | Prontuário versionado, evoluções, anamneses (modelos e perguntas), avaliações, fotos posturais, anexos, exercícios, programas |
| `0006_crm_communication` | Leads, histórico de estágio, interações, modelos e fila de mensagens, tarefas, integrações, conexões de calendário |
| `0007_operations` | Produtos, movimentações de estoque, manutenção de equipamentos, regras de comissão e comissões |
| `0008_documents_lgpd_site` | Modelos e documentos, documentos legais versionados, consentimentos, solicitações de titulares, execuções de backup, conteúdo do site, rate limit |
| `0009_storage` | Buckets (`clinical`, `documents`, `avatars`, `site`) e policies de arquivos |
| `0010_rls` | Policies de todas as tabelas (a maior parte do modelo de segurança) |
| `0011_public_portal` | Funções `public_*` (site, agendamento, leads, anamnese por token) e `portal_*` (aluno) |
| `0012_analytics` | Dashboards, relatórios, busca global, risco de evasão, fluxo de caixa |
| `0013_bootstrap` | `create_organization`, perfis padrão por organização, modelos iniciais |
| `0014_demo_seed` | `seed_demo_data` — clínica de demonstração completa |
| `0015_gateway_and_workers` | Confirmação de pagamento por gateway, fila de mensagens (`claim_messages`, `finish_message`, `fail_message`), automações |
| `0016_profile_links` | Vínculos de perfil |
| `0017_portal_extras` | Lista de espera e turmas cheias no portal |
| `0018_reports_extra` | Relatórios adicionais |
| `0099_final_grants` | Fecha o acesso anônimo e libera só o necessário |

Aplicar: `npx supabase db push` (CLI), `make migrate` (Docker) ou
`npm run db:test` (banco de teste descartável, com os testes SQL de
`supabase/tests/`).

O controle de versões fica em `supabase_migrations.schema_migrations` — tanto
o CLI quanto `docker/migrate.sh` usam a mesma tabela, então os dois caminhos
são intercambiáveis.

## Tabelas por domínio

**Fundação** — `organizations`, `units`, `profiles`, `permissions`, `roles`,
`role_permissions`, `organization_members`, `member_units`,
`system_settings`, `audit_logs`

**Pessoas e recursos** — `staff`, `staff_units`, `staff_working_hours`,
`staff_time_off`, `patients`, `emergency_contacts`, `rooms`, `equipment`,
`services`, `holidays`, `schedule_blocks`, `suppliers`

**Planos e financeiro** — `plans`, `plan_services`, `subscriptions`,
`contract_templates`, `contracts`, `financial_categories`, `payment_methods`,
`cash_accounts`, `accounts_receivable`, `payments`, `accounts_payable`,
`cash_movements`, `invoices`, `payment_gateway_charges`,
`gateway_webhook_events`, `org_counters` (+ views `v_receivables`,
`v_payables`)

**Agenda** — `appointments`, `appointment_participants`, `attendance`,
`recurrences`, `recurrence_members`, `waitlist`, `replacement_credits`,
`appointment_events`, `notifications`

**Clínico** — `medical_records`, `medical_record_history`,
`clinical_evolutions`, `evolution_templates`, `anamnesis`,
`anamnesis_templates`, `anamnesis_questions`, `assessments`,
`assessment_fields`, `postural_photos`, `attachments`, `exercises`,
`exercise_categories`, `patient_programs`, `patient_program_exercises`

**CRM e comunicação** — `leads`, `lead_stage_history`, `crm_interactions`,
`messages`, `message_templates`, `tasks`, `integrations`,
`calendar_connections`

**Operações** — `inventory_products`, `inventory_movements`,
`equipment_maintenance`, `commission_rules`, `commissions`

**Documentos, LGPD e site** — `document_templates`, `documents`,
`legal_documents`, `consents`, `data_subject_requests`, `backup_runs`,
`site_posts`, `site_testimonials`, `site_faqs`, `site_gallery`

**Privado** — `private.rate_limits`

## Modelo de segurança

**Multi-tenant.** Quase toda tabela tem `organization_id`, e 38 triggers
`trg_same_org` impedem que um registro aponte para outra organização.

**RLS.** As policies usam quatro funções `security definer`:

| Função | Para que serve |
|---|---|
| `is_org_member(org)` | Pertence à organização |
| `is_org_owner(org)` | É proprietário |
| `has_permission(org, 'modulo.acao')` | Tem a permissão (pelo perfil) |
| `has_unit_access(org, unit)` | Enxerga aquela unidade |

**Grants.** `0099_final_grants` revoga tudo de `anon`, libera as funções
`public_*` (site, agendamento, anamnese por token) para `anon`, mantém as de
rotina (`refresh_overdue`, `renew_subscriptions`, `generate_all_recurrences`,
`expire_replacement_credits`, `claim_messages`, `finish_message`,
`fail_message`, `run_automations`, `gateway_confirm_payment`,
`seed_demo_data`) apenas para `service_role`, e altera os privilégios padrão
para que objetos novos não nasçam abertos.

**Imutabilidade.** Triggers bloqueiam alteração/exclusão de prontuários e
evoluções finalizados, avaliações finalizadas, contratos aceitos, documentos
assinados, movimentos de caixa, movimentações de estoque, políticas legais
publicadas e `audit_logs`. Alterações de prontuário viram versão em
`medical_record_history`.

**Auditoria.** `log_audit_event(org, action, entity, entity_id, context)`
grava em `audit_logs`, que não aceita update nem delete. Downloads de
arquivos privados podem ser auditados por `lib/storage.ts`.

**Rate limit.** `check_rate_limit(key, limit, window)` sobre
`private.rate_limits`, usada nas rotas públicas (lead, agendamento
experimental, anamnese por token).

**LGPD.** `export_patient_data` (portabilidade), `anonymize_patient`
(anonimização preservando histórico contábil), `consents` versionados e
`data_subject_requests` para as solicitações de titulares.

## Principais RPCs

**Agenda** — `create_appointment`, `update_appointment`, `cancel_appointment`,
`check_schedule_conflicts`, `add_participant`, `cancel_participation`,
`set_attendance`, `check_in`, `create_fixed_schedule`,
`generate_all_recurrences`, `pause_recurrence`, `resume_recurrence`,
`update_recurrence_member`, `join_waitlist`, `grant_manual_credit`,
`expire_replacement_credits`

**Financeiro** — `create_subscription`, `change_subscription_status`,
`renew_subscriptions`, `register_payment`, `refund_payment`,
`cancel_receivable`, `pay_payable`, `cancel_payable`, `refresh_overdue`,
`cash_flow`, `patient_balance`, `receipt_data`, `calculate_commissions`,
`sell_product`, `gateway_confirm_payment`

**Clínico** — `create_anamnesis`, `submit_anamnesis`,
`submit_anamnesis_by_token`, `get_anamnesis_by_token`, `finalize_assessment`,
`finalize_evolution`, `add_evolution_addendum`, `apply_program_template`,
`patients_due_reassessment`

**CRM e comunicação** — `public_create_lead`, `convert_lead_to_patient`,
`schedule_trial_class`, `register_trial_outcome`, `queue_message`,
`claim_messages`, `finish_message`, `fail_message`, `run_automations`

**Site e portal** — `public_site`, `public_blog_posts`, `public_blog_post`,
`public_booking_options`, `public_available_slots`, `public_book_trial`;
`portal_me`, `portal_appointments`, `portal_available_slots`, `portal_book`,
`portal_confirm`, `portal_financial`, `portal_documents`,
`portal_sign_document`, `portal_accept_contract`, `portal_update_profile`,
`portal_waitlist`, `portal_join_waitlist`, `portal_leave_waitlist`,
`portal_full_classes`, `revoke_portal_access`

**Análises** — `dashboard_summary`, `dashboard_charts`, `dashboard_lists`,
`report_schedule`, `report_finance`, `report_patients_without_plan`,
`report_marketing`, `report_staff`, `report_admin`, `patient_risk`,
`search_global`

**Plataforma** — `create_organization`, `my_organizations`,
`my_permissions`, `has_permission`, `has_unit_access`, `log_audit_event`,
`mark_notifications_read`, `check_rate_limit`, `export_patient_data`,
`anonymize_patient`, `publish_legal_document`, `generate_contract`,
`generate_document`, `seed_demo_data`

## Estados mais usados

| Entidade | Valores |
|---|---|
| Aluno | `lead`, `trial`, `active`, `paused`, `inactive`, `cancelled` |
| Agendamento | `scheduled`, `completed`, `cancelled` |
| Assinatura | `pending`, `active`, `paused`, `cancelled`, `expired` |
| A receber | `pending`, `paid`, `overdue`, `partial`, `cancelled`, `refunded` |
| A pagar | `pending`, `paid`, `overdue`, `cancelled` |
| Contrato | `draft`, `sent`, `accepted`, `cancelled`, `expired` |
| Prontuário / avaliação | `draft`, `finalized` |
| Lista de espera | `waiting`, `notified`, `accepted`, `expired`, `cancelled` |
| Crédito de reposição | `available`, `used`, `expired`, `cancelled` |
| Cobrança de gateway | `created`, `pending`, `paid`, `expired`, `cancelled`, `error` |
| NFS-e | `not_requested`, `pending`, `issued`, `error`, `cancelled` |

## Testes

`supabase/tests/00_supabase_stub.sql` recria em Postgres puro o mínimo do
ambiente Supabase (roles `anon`/`authenticated`/`service_role`, `auth.users`,
`auth.uid()`, `storage.objects`, `test_login()`), e
`10_seed_and_flows.sql` exercita os fluxos principais.
`npm run db:test` recria o banco `pilatesflow_test`, aplica stub +
migrations + testes e para no primeiro erro.
