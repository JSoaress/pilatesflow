# PilatesFlow

Sistema de gestão para clínicas e studios de Pilates: agenda, prontuário
eletrônico, avaliações físicas, planos e assinaturas, financeiro completo,
CRM, comunicação (WhatsApp/e-mail/SMS), estoque, equipamentos, relatórios,
LGPD, site público e Portal do Aluno — tudo multi-organização e
multi-unidade.

| | |
|---|---|
| **Stack** | Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind · Supabase (Postgres 17 + Auth + Storage) |
| **Banco** | 85 tabelas, ~100 funções RPC, RLS em todas as tabelas, 19 migrations |
| **Autorização** | RBAC por organização (24 módulos × ações) aplicada no banco via RLS |
| **Idioma** | pt-BR em todo o produto (rotas, dados e interface) |

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/arquitetura.md](docs/arquitetura.md) | Camadas, autenticação, RBAC/RLS, Server Actions, CRUD declarativo, Storage, PWA |
| [docs/modulos.md](docs/modulos.md) | O que cada módulo faz e o mapa de rotas |
| [docs/banco-de-dados.md](docs/banco-de-dados.md) | Migrations, tabelas por domínio, RPCs, modelo de segurança |
| [docs/ambiente.md](docs/ambiente.md) | Todas as variáveis de ambiente e integrações |
| [docs/docker.md](docs/docker.md) | Como a stack Docker funciona, produção e troubleshooting |
| [docs/operacao.md](docs/operacao.md) | Rotinas (cron), webhooks, backup, LGPD, observabilidade |

## Começando

Há dois caminhos. Os dois chegam no mesmo lugar — escolha um.

### A) Docker (não precisa instalar nada além do Docker)

Sobe a aplicação **e** o Supabase (Postgres, Auth, Storage, PostgREST) atrás
de um único endereço.

```bash
cp .env.docker.example .env.docker
make up                 # build + migrations + aplicação
make seed               # clínica e usuários de demonstração (opcional)
```

Pronto: <http://localhost:3000>. Sem `make`, veja os comandos equivalentes em
[docs/docker.md](docs/docker.md).

### B) Supabase CLI + Node local (melhor para desenvolver no dia a dia)

```bash
npm install
npx supabase start                      # sobe o Supabase local e aplica as migrations
cp .env.example .env.local              # cole API URL, anon key e service_role key
npm run seed                            # dados de demonstração (opcional)
npm run dev                             # http://localhost:3000
```

### Acessos de demonstração

Criados por `make seed` / `npm run seed`, senha em `DEMO_PASSWORD`
(padrão `Demo@12345`):

| Perfil | E-mail |
|---|---|
| Proprietário | `dono@demo.pilatesflow.app` |
| Fisioterapeuta | `mariana@demo.pilatesflow.app` |
| Instrutor | `carlos@demo.pilatesflow.app` |
| Recepção | `recepcao@demo.pilatesflow.app` |
| Aluno (portal) | `aluno@demo.pilatesflow.app` |

Entre por `/entrar` — a rota decide entre área administrativa, portal do
aluno ou onboarding conforme os vínculos do usuário.

## Áreas da aplicação

| Rota | Área |
|---|---|
| `/` | Site público da clínica (conteúdo vindo do banco, ISR de 5 min) |
| `/agendar` | Agendamento de aula experimental sem login |
| `/anamnese/[token]` | Anamnese preenchida pelo aluno por link |
| `/login`, `/cadastro`, `/convite` | Autenticação |
| `/onboarding` | Criação da clínica (primeiro acesso) |
| `/app/*` | Área administrativa (17 módulos) |
| `/portal/*` | Portal do Aluno |
| `/api/*` | Health, cron, webhooks, PDFs, exportações, LGPD |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `start` | Build e execução em produção |
| `npm run lint` / `typecheck` | ESLint e TypeScript sem emitir |
| `npm test` | Vitest |
| `npm run seed` | Usuários + clínica de demonstração (precisa da service role key) |
| `npm run db:test` | Recria um banco de teste e aplica migrations + testes SQL |
| `npm run icons` | Regera os ícones do PWA a partir de `public/icons/icon.svg` |
| `make help` | Lista os atalhos da stack Docker |

## Estrutura

```
src/
├─ app/                     rotas (App Router)
│  ├─ (site)/               site público          ├─ app/        área administrativa
│  ├─ (auth)/               login e cadastro      ├─ portal/     portal do aluno
│  ├─ anamnese/[token]/     anamnese por link     └─ api/        rotas HTTP
├─ components/
│  ├─ app/                  telas administrativas (agenda, clinical, finance, crm…)
│  ├─ portal/ site/         portal e site público
│  ├─ resource/             CRUD genérico (tabela + formulário declarativos)
│  ├─ layout/ charts/ ui/   navegação, gráficos e design system
├─ lib/
│  ├─ actions/              Server Actions por domínio
│  ├─ auth/                 contexto da sessão, organização e permissões
│  ├─ supabase/             clientes (browser, server, admin, middleware)
│  ├─ resources/            definições declarativas dos cadastros
│  ├─ integrations/         mensageria, pagamentos, fila de envio
│  ├─ pdf/ validation/      geração de PDF e schemas zod
│  └─ env.ts labels.ts …    utilidades
└─ middleware.ts            renovação de sessão e proteção de rotas

supabase/migrations/        19 migrations versionadas (schema + RLS + seed demo)
supabase/tests/             stub do ambiente Supabase + testes SQL de fluxo
docker/                     gateway, init do banco, migrations, cron, chaves
scripts/                    seed, ícones, banco de teste
```

## Convenções

- **Português no domínio**: rotas e textos em pt-BR; identificadores de código
  e colunas em inglês.
- **O banco é a fonte da verdade**: regras de negócio ficam em funções
  PL/pgSQL e RLS, não só na aplicação. Nenhuma consulta confia no cliente.
- **Service role nunca no cliente**: `createAdminClient()` só em rotinas,
  webhooks e convites, sempre depois de checar permissão.
- **Erros amigáveis**: `runAction` converte exceções em mensagens para o
  usuário e manda o detalhe técnico para o log (`lib/observability.ts`).
- **Registros clínicos e financeiros não são apagados**: triggers bloqueiam
  `delete`/`update` após finalização; o histórico fica versionado.
