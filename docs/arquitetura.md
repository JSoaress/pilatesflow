# Arquitetura

## Visão geral

```
Navegador ──┬─ Site público (ISR)        ─────────────┐
            ├─ /app  (Server Components)  ─ Server    │   Supabase
            ├─ /portal                      Actions ──┼─▶ Postgres 17
            └─ supabase-js (anon key)  ──────────────▶│   + Auth (GoTrue)
                                                      │   + Storage
     middleware.ts ─ renova a sessão em todo request  └─ RLS em tudo
```

Não existe camada de API própria entre a aplicação e o banco. O Next.js fala
direto com o Supabase e **toda** autorização é decidida no Postgres (RLS +
funções `security definer`). A aplicação valida e dá boas mensagens; o banco
é quem garante.

Três formas de acesso aos dados, por ordem de preferência:

1. **Server Component** lê com o cliente da sessão (`lib/supabase/server.ts`)
   — leitura direta de tabelas/RPCs, já filtrada por RLS.
2. **Server Action** escreve passando por `runAction` (`lib/actions/*`).
3. **Cliente do navegador** (`lib/supabase/client.ts`) somente para
   interações pontuais (buscas incrementais, autocomplete), sempre com a
   chave pública e sujeito a RLS.

O cliente **service role** (`lib/supabase/admin.ts`) ignora RLS e é usado
apenas em rotinas (`/api/cron/*`), webhooks de pagamento, convites e no seed.

## Sessão, organização e permissões

`middleware.ts` roda em todas as rotas (menos estáticos, webhooks e cron):
renova o cookie de sessão, redireciona `/app`, `/portal` e `/onboarding` sem
sessão para `/login`, e marca as áreas autenticadas como `private, no-store`.

`lib/auth/context.ts` monta o `AppContext` — memoizado por request com
`cache()` — resolvendo em paralelo:

| Campo | Origem |
|---|---|
| `user`, `profile` | `auth.getUser()` + tabela `profiles` |
| `orgs`, `org` | RPC `my_organizations()`; a escolhida vem do cookie `pf_org` ou de `profiles.last_organization_id` |
| `permissions` | RPC `my_permissions(p_org)` — um `Set<string>` |
| `units`, `unitId` | unidades ativas; cookie `pf_unit` (`all` = consolidado) |
| `staffId`, `tz` | vínculo na tabela `staff` e timezone da organização |

Usuário sem organização é desviado: se o RPC `portal_me()` responde, vai para
`/portal`; senão, para `/onboarding`. A rota `/entrar` centraliza essa decisão
após o login.

Nas páginas, `requirePermission('finance.view')` redireciona para
`/app/sem-permissao`. Nas Server Actions, `runAction({ permission })` recusa
antes de executar. As duas checagens são conveniência de UX — quem bloqueia
de verdade é a RLS.

### RBAC

24 módulos × ações (`view`, `create`, `edit`, `delete`, `export`, `refund`,
`manage`, `access`, `override`) geram as chaves em `permissions`, no formato
`modulo.acao`. Cada organização recebe 7 perfis de sistema (`owner`,
`manager`, `receptionist`, `physiotherapist`, `instructor`, `finance`,
`patient`) e pode criar perfis próprios na matriz de permissões. Módulos
sensíveis (prontuário, financeiro, comissões, documentos, usuários,
auditoria, LGPD) são marcados como tal, e `delete`/`export` sempre contam
como sensíveis.

`lib/permissions.ts` (menu lateral) e `lib/settings-nav.ts` (configurações)
mapeiam cada item à permissão necessária, só para esconder o que o usuário
não pode usar.

## Server Actions

Todas passam por `runAction` (`lib/actions/safe-action.ts`), que:

1. carrega o `AppContext` (sessão + organização);
2. confere a permissão no servidor;
3. valida a entrada com zod e devolve `fieldErrors` por campo;
4. deixa `redirect()`/`notFound()` do Next propagarem;
5. traduz exceções em mensagem amigável (`lib/errors.ts`) e registra o
   detalhe técnico com `captureException`.

O retorno é sempre `{ ok: true, data }` ou `{ ok: false, error, fieldErrors }`
— nunca `throw` para o cliente. No React, o hook `hooks/use-action.ts`
consome esse contrato (estado de envio, erros por campo, toast).

Arquivos por domínio: `auth`, `clinical`, `communication`, `crm`, `finance`,
`import`, `inventory`, `onboarding`, `patients`, `portal`, `public`,
`resources`, `schedule`, `settings`, `shell`, `staff`, `tasks`.

## CRUD declarativo

Cadastros simples não têm código próprio. `lib/resources/defs.ts` descreve
33 recursos (unidades, salas, modalidades, categorias financeiras, planos,
modelos, FAQ, posts, leads…) em dados: tabela, permissões, campos com tipo e
validação, busca, ordenação, soft delete, filtro por unidade.

A partir disso:

- `lib/resources/schema.ts` deriva o schema zod e as colunas permitidas;
- `lib/resources/server.ts` faz list/create/update/delete genéricos;
- `components/resource/*` renderiza tabela, filtros e formulário.

Para criar um cadastro novo basta acrescentar uma definição — nenhuma tela
nova é necessária.

## Arquivos (Storage)

Quatro buckets, todos com caminho começando pelo id da organização
(`{organization_id}/...`), o que permite isolar por policy:

| Bucket | Visibilidade | Conteúdo | Limite |
|---|---|---|---|
| `clinical` | privado | fotos posturais, exames, laudos | 20 MB |
| `documents` | privado | contratos, recibos, comprovantes | 20 MB |
| `avatars` | privado | fotos de alunos e equipe | 5 MB |
| `site` | público | imagens do site e logo | 10 MB |

`lib/storage.ts` só gera URL assinada (padrão 300 s) se o caminho pertencer à
organização do contexto, e opcionalmente grava `download` na auditoria.
Arquivos clínicos não têm policy de `update` nem `delete` — não são
sobrescritos nem apagados pela aplicação.

## PDFs, exportações e importação

- `lib/pdf/simple.ts` monta contratos, documentos e recibos com `pdf-lib`
  (sem dependência externa), servidos por `/api/contracts/[id]/pdf`,
  `/api/documents/[id]/pdf` e `/api/receipts/[paymentId]`.
- `lib/export.ts` gera XLSX (`exceljs`) ou CSV com `;` e BOM, compatível com
  Excel pt-BR, via `/api/export/[resource]`.
- `lib/actions/import.ts` + `components/app/import-patients.tsx` importam
  alunos de CSV (`papaparse`) com pré-visualização e relatório de erros.

## Site público e PWA

As páginas de `(site)` usam um cliente anônimo sem cookies e apenas as
funções `public_*`, o que permite ISR (`revalidate = 300`). Sem Supabase
configurado, a home mostra "Site em configuração" em vez de quebrar.

PWA: `app/manifest.ts` (atalhos para Agenda, Alunos, Financeiro e Check-in),
`public/sw.js` com página offline e `components/layout/install-button.tsx`.

## Observabilidade

`lib/observability.ts` emite log JSON por linha e redige campos sensíveis
(`password`, `senha`, `token`, `secret`, `cpf`, `authorization`, `cookie`,
`card`). `captureException` já tem o ponto de integração com Sentry: defina
`SENTRY_DSN` e instale `@sentry/nextjs` para ativar.

`/api/health` responde `{ status, db_ms, time }` — `ok` (200) ou `degraded`
(503) conforme o banco responde.
