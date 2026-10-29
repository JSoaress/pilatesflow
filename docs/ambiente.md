# Variáveis de ambiente

Todas são lidas em um único lugar: `src/lib/env.ts`. O que começa com
`NEXT_PUBLIC_` vai para o navegador; o resto só existe no servidor
(`serverEnv()`), e nenhum segredo é exposto ao cliente.

Arquivos: `.env.local` para desenvolvimento local (`.env.example` é o
modelo), `.env.docker` para a stack Docker (`.env.docker.example` é o
modelo). Os dois estão no `.gitignore`.

## Obrigatórias

| Variável | Onde vale | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente e servidor | URL do projeto Supabase. **Precisa ser idêntica nos dois lados** — além das chamadas de API, ela monta as URLs assinadas de arquivos |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente e servidor | Chave pública (RLS continua valendo) |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | Ignora RLS. Só em rotinas, webhooks, convites e seed. Nunca em código de cliente |

## Aplicação

| Variável | Padrão | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | URL pública; usada em sitemap, metadados e links de e-mail |
| `NEXT_PUBLIC_DEFAULT_ORG_SLUG` | `studio-movimento` | Organização que o site público publica |
| `NEXT_PUBLIC_APP_NAME` | `PilatesFlow` | Nome exibido e no manifest do PWA |
| `ALLOW_PUBLIC_SIGNUP` | `true` | Permite auto-cadastro em `/cadastro` |
| `CRON_SECRET` | — | Segredo das rotas `/api/cron/*` (`Authorization: Bearer ...`), comparado em tempo constante |
| `DEMO_PASSWORD` | `Demo@12345` | Senha dos usuários criados pelo seed |
| `SENTRY_DSN` | — | Ativa o ponto de integração do Sentry (requer instalar `@sentry/nextjs`) |

> `NEXT_PUBLIC_*` são **embutidas no bundle durante o build**. Em imagens
> Docker elas precisam ser passadas como `--build-arg`; mudar só em tempo de
> execução não afeta o código que roda no navegador.

## Integrações (opcionais)

Sem credenciais, cada integração aparece como "Não conectado" em
Configurações → Integrações, e mensagens enfileiradas para um canal não
configurado são marcadas como **falha** com o motivo — nunca como enviadas.

### Mensageria

| Canal | Variáveis | Provedor |
|---|---|---|
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | WhatsApp Cloud API (Meta) |
| E-mail | `RESEND_API_KEY`, `EMAIL_FROM` | Resend |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Twilio |

### Pagamentos

| Provedor | Variáveis |
|---|---|
| Asaas | `ASAAS_API_KEY`, `ASAAS_BASE_URL` (padrão sandbox), `ASAAS_WEBHOOK_TOKEN` |
| Mercado Pago | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

Webhooks chegam em `/api/webhooks/[provider]` e são validados pela
assinatura/token antes de confirmar o pagamento via
`gateway_confirm_payment`.

### Outros

| Serviço | Variáveis | Situação |
|---|---|---|
| Google Agenda | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credenciais detectadas; sincronização a implementar |
| NFS-e | `NFSE_PROVIDER`, `NFSE_API_KEY` | Campos de nota existem (`invoices`) |
| Wellhub / TotalPass | — | Previstos no painel, sem integração |

## Só na stack Docker

Usadas pelo `docker-compose.yml`, não pela aplicação (ver
[docker.md](docker.md)):

| Variável | Padrão | Descrição |
|---|---|---|
| `PUBLIC_PORT` / `PUBLIC_URL` | `3000` / `http://localhost:3000` | Porta e URL públicas — mude as duas juntas |
| `POSTGRES_PASSWORD` | — | Senha do Postgres e dos roles internos do Supabase |
| `POSTGRES_PORT` | `54322` | Porta do Postgres publicada no host |
| `JWT_SECRET` | — | Assina `ANON_KEY` e `SERVICE_ROLE_KEY` (mínimo 32 caracteres) |
| `JWT_EXPIRY` | `3600` | Validade do token de sessão, em segundos |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | — | Chaves geradas por `node docker/generate-keys.mjs` |
| `GOTRUE_MAILER_AUTOCONFIRM` | `true` | Confirma e-mail automaticamente (local). Em produção, `false` + SMTP |
| `GOTRUE_DISABLE_SIGNUP` | `false` | Bloqueia cadastro direto no GoTrue |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` | — | Envio dos e-mails de autenticação |
| `CRON_MESSAGES_MINUTES` / `CRON_DAILY_HOUR` | `10` / `3` | Agendamento do serviço `cron` |
| `STUDIO_PORT` | `54323` | Porta do Supabase Studio |
| `TZ` | `America/Sao_Paulo` | Fuso dos contêineres |

## Checklist de produção

- [ ] `JWT_SECRET` e `POSTGRES_PASSWORD` próprios; `ANON_KEY` e
      `SERVICE_ROLE_KEY` regerados a partir do novo segredo
- [ ] `CRON_SECRET` longo e aleatório
- [ ] `PUBLIC_URL`/`NEXT_PUBLIC_SITE_URL` com o domínio real em HTTPS
- [ ] `GOTRUE_MAILER_AUTOCONFIRM=false` e SMTP configurado
- [ ] `ALLOW_PUBLIC_SIGNUP=false` se só a equipe deve criar contas
- [ ] `SUPABASE_SERVICE_ROLE_KEY` apenas no ambiente do servidor
- [ ] Webhooks dos gateways apontando para `https://seu-dominio/api/webhooks/<provider>`
- [ ] Rotinas de `/api/cron/*` agendadas (Vercel Cron, serviço `cron` ou
      cron do sistema)
