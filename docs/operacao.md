# Operação

## Rotinas agendadas

Duas rotas, as duas protegidas por `Authorization: Bearer $CRON_SECRET`
(comparação em tempo constante, `lib/cron.ts`).

| Rota | Frequência | O que executa |
|---|---|---|
| `/api/cron/messages` | a cada 5–15 min | Fila de mensagens: reserva (`claim_messages`), envia pelo provedor e registra o resultado |
| `/api/cron/daily` | 1×/dia (madrugada) | `refresh_overdue` (inadimplência), `renew_subscriptions`, `generate_all_recurrences` (horários fixos), `expire_replacement_credits`, `run_automations` (lembretes, aniversários, retenção) e a fila de mensagens |

Como agendar:

- **Docker** — `make cron` (intervalos em `CRON_MESSAGES_MINUTES` e
  `CRON_DAILY_HOUR`).
- **Vercel** — `vercel.json` com `crons` apontando para as duas rotas; o
  header `Authorization: Bearer CRON_SECRET` já é o formato esperado.
- **Servidor** — crontab chamando as rotas com `curl -H`.

A rotina diária tem `maxDuration = 300` (5 min). Em clínicas grandes, prefira
chamá-la por organização passando `p_org` se precisar dividir a carga.

## Fila de mensagens

`queue_message` grava em `messages` com status `queued`. O worker
(`lib/integrations/dispatcher.ts`) reserva um lote, resolve o nome do template
do provedor quando existe e envia por WhatsApp Cloud API, Resend ou Twilio.

Sem credenciais do canal, a mensagem é marcada como **falha** com o motivo
("Integração de WhatsApp não configurada") — nunca como enviada. O histórico
por aluno fica visível na ficha e em `/app/comunicacao`.

Desduplicação por `uq_messages_dedupe` evita enviar o mesmo lembrete duas
vezes se a rotina rodar em paralelo.

## Webhooks de pagamento

`POST /api/webhooks/[provider]` — `asaas`, `mercadopago`, `stripe`,
`whatsapp`. O fluxo:

1. valida assinatura/token do provedor (`ASAAS_WEBHOOK_TOKEN`,
   `MERCADOPAGO_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`,
   `WHATSAPP_APP_SECRET`);
2. registra o evento bruto em `gateway_webhook_events` (idempotência);
3. confirma o pagamento com `gateway_confirm_payment`, que baixa o
   recebível, registra o pagamento e movimenta o caixa.

A rota fica fora do middleware (não depende de cookie). Configure a URL
pública nos painéis dos gateways:
`https://seu-dominio/api/webhooks/asaas`, e assim por diante.

`uq_payments_gateway` garante que o mesmo pagamento do gateway não entre
duas vezes, mesmo com reenvio de webhook.

## Backup e restauração

A tabela `backup_runs` registra as execuções e a tela
Configurações → Backup está prevista (ainda não implementada — ver
[modulos.md](modulos.md#estado-atual)). Enquanto isso:

```bash
# Docker — dump completo
docker compose --env-file .env.docker exec -T db \
  pg_dump -U postgres -Fc postgres > backup-$(date +%F).dump

# restauração
docker compose --env-file .env.docker exec -T db \
  pg_restore -U postgres -d postgres --clean --if-exists < backup-2026-10-21.dump
```

No Supabase Cloud, use os backups do projeto (ou `supabase db dump`). Os
arquivos do Storage são separados do banco: no self-hosted, faça backup do
volume `storage-data`; no Cloud, da bucket correspondente.

> `npm run backup` está declarado no `package.json`, mas `scripts/backup.ts`
> não existe no repositório.

## LGPD

| Recurso | Como funciona |
|---|---|
| Políticas versionadas | `legal_documents` + `publish_legal_document`; `uq_legal_current` garante uma versão vigente por tipo |
| Consentimentos | `consents` guarda versão aceita, data e origem (site, portal, presencial) |
| Portabilidade | `GET /api/lgpd/export/[patientId]` (permissão `lgpd.manage`) usa `export_patient_data` |
| Anonimização | `anonymize_patient` descaracteriza o titular preservando o histórico contábil |
| Solicitações de titulares | `data_subject_requests` com prazo e responsável |
| Auditoria | `audit_logs` imutável; downloads de arquivos privados podem ser auditados |
| Rate limit | `check_rate_limit` nas rotas públicas (lead, aula experimental, anamnese por link) |

Dados clínicos ficam em módulos marcados como sensíveis
(`medical_records`, `assessments`, `documents`, `finance`, `commissions`,
`users`, `audit`, `lgpd`): o acesso depende de permissão explícita no perfil,
e o bucket `clinical` não permite sobrescrever nem apagar arquivos.

## Monitoramento

- **Saúde**: `GET /api/health` → `{ status, db_ms, time }`; 200 `ok` ou 503
  `degraded`. É o healthcheck da imagem Docker e serve para load balancer.
- **Logs**: uma linha JSON por evento, com campos sensíveis redigidos
  (`lib/observability.ts`). Em Docker, `make logs-app`.
- **Erros**: `captureException` registra código, detalhe e hint do Postgres.
  Para enviar ao Sentry, instale `@sentry/nextjs`, defina `SENTRY_DSN` e
  troque o comentário em `lib/observability.ts` por
  `Sentry.captureException`.

## Manutenção do banco

```bash
make migrate                                  # aplica migrations pendentes
make psql                                     # psql no banco
npm run db:test                               # banco descartável + testes SQL
npx supabase db push                          # caminho via CLI
```

Para uma migration nova, crie
`supabase/migrations/<timestamp>_<nome>.sql` seguindo a numeração existente.
Dois cuidados: policies de RLS e grants ficam junto da tabela que criam, e
nada deve conceder privilégio a `anon` — se a função for pública, libere-a
explicitamente no estilo de `0099_final_grants`.

## Upgrade das imagens

As versões em `docker-compose.yml` são fixas de propósito. Para atualizar,
suba uma por vez (`db` por último, e sempre com dump antes) e confira se os
schemas `auth`/`storage` migraram bem:

```bash
docker compose --env-file .env.docker pull auth rest storage
docker compose --env-file .env.docker up -d auth rest storage
docker compose --env-file .env.docker logs -f auth storage
```
