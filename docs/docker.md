# Docker

A stack sobe a aplicação **e** o Supabase (Postgres, Auth, PostgREST,
Storage) sem depender do Supabase Cloud nem do Supabase CLI.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `Dockerfile` | Imagem de produção, multi-stage, saída `standalone`, usuário não-root, healthcheck |
| `Dockerfile.dev` | Imagem de desenvolvimento com hot reload |
| `docker-compose.yml` | Stack completa + perfis `seed`, `cron`, `studio` |
| `docker-compose.dev.yml` | Sobreposição que troca a aplicação para `next dev` |
| `.env.docker.example` | Modelo das variáveis (copiar para `.env.docker`) |
| `docker/nginx/default.conf.template` | Gateway: uma porta para app + APIs do Supabase |
| `docker/db/init/01-roles-and-jwt.sh` | Senhas dos roles internos e `JWT_SECRET` no banco (serviço `db-init`) |
| `docker/migrate.sh` | Aplica as migrations em ordem, uma vez cada |
| `docker/cron/entrypoint.sh` | Agendador das rotinas (substitui o Vercel Cron) |
| `docker/generate-keys.mjs` | Gera `JWT_SECRET`, `ANON_KEY` e `SERVICE_ROLE_KEY` |
| `Makefile` | Atalhos (`make up`, `make dev`, `make seed`, `make logs`…) |

## Subir

```bash
cp .env.docker.example .env.docker
make up            # build da imagem, migrations e aplicação
make seed          # opcional: clínica e usuários de demonstração
```

Sem `make`, o `--env-file` é obrigatório (é dele que o Compose lê as
variáveis `${...}`):

```bash
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker --profile seed run --rm seed
```

| Endereço | O que é |
|---|---|
| <http://localhost:3000> | Aplicação + APIs do Supabase |
| `localhost:54322` | Postgres (`psql -h localhost -p 54322 -U postgres`) |
| <http://localhost:54323> | Supabase Studio (`make studio`) |

## Serviços

| Serviço | Imagem | Papel |
|---|---|---|
| `db` | `supabase/postgres:17.6.1.136` | Postgres com as extensões e roles do Supabase |
| `db-init` | `supabase/postgres` | Garante o contrato Supabase (roles, grants, schemas `auth`/`extensions`, funções `auth.uid()`/`role()`/`jwt()`), aplica as senhas, testa os logins e sai |
| `auth` | `supabase/gotrue:v2.197.0` | Autenticação; cria e mantém o schema `auth` |
| `rest` | `postgrest/postgrest:v14.18` | API de dados sobre `public`, respeitando RLS |
| `storage` | `supabase/storage-api:v1.81.0` | Arquivos; cria e mantém o schema `storage` |
| `migrate` | `supabase/postgres` | Aplica `supabase/migrations/*.sql` e sai |
| `gateway` | `nginx:1.27-alpine` | Porta pública única |
| `app` | build local | Next.js (produção ou dev) |
| `seed` | build local (`--profile seed`) | `npm run seed` |
| `cron` | `alpine:3.20` (`--profile cron`) | Agenda `/api/cron/messages` e `/api/cron/daily` |
| `meta` + `studio` | `postgres-meta` + `studio` (`--profile studio`) | Painel do Supabase |

### Por que uma porta só

`NEXT_PUBLIC_SUPABASE_URL` é embutida no bundle do navegador **e** usada no
servidor para montar URLs assinadas de arquivos — ou seja, precisa ser um
endereço válido nos dois lugares. Se o servidor usasse um host interno
(`http://gateway:3000`), as imagens e os PDFs assinados apontariam para um
endereço que o navegador não resolve.

A solução: o nginx atende tudo em `http://localhost:3000` e distribui.

```
http://localhost:3000
   ├── /auth/v1/*     → auth:9999      (prefixo removido)
   ├── /rest/v1/*     → rest:3000      (tabelas e RPCs)
   ├── /storage/v1/*  → storage:5000   (arquivos)
   ├── /realtime/v1/* → 404 (não usado por este projeto)
   └── /*             → aplicação Next.js (porta interna 3001)
```

O contêiner da aplicação usa `network_mode: "service:gateway"`, isto é,
compartilha a pilha de rede do gateway. Assim `http://localhost:3000`
significa o mesmo lugar dentro e fora do Docker. Duas consequências:

- a aplicação **não** declara `ports` (quem publica é o `gateway`);
- se o gateway for recriado, recrie a aplicação também
  (`docker compose --env-file .env.docker up -d --force-recreate gateway app`).

### Ordem de inicialização

```
db (healthy)
 └─▶ db-init (concluído)      senhas dos roles internos + JWT_SECRET
      ├─▶ auth (healthy)      cria o schema auth, incluindo auth.users
      ├─▶ rest
      └─▶ storage (healthy)   cria o schema storage (objects, buckets)
               └─▶ migrate    migrations do PilatesFlow
                        └─▶ app
```

GoTrue, PostgREST e Storage entram no banco com os roles
`supabase_auth_admin`, `authenticator` e `supabase_storage_admin`. O
`db-init` roda antes deles e garante o que eles pressupõem:

- os roles `anon`, `authenticated`, `service_role` (alvo dos grants das
  migrations) e os três de serviço, com senha;
- `grant anon, authenticated, service_role to authenticator`, que é como o
  PostgREST troca de papel conforme o JWT;
- `create` no banco para os admins de auth e storage, que criam os próprios
  schemas;
- o schema `extensions` (as migrations fazem `create extension … with schema
  extensions`);
- o schema `auth` e as funções `auth.uid()`, `auth.role()` e `auth.jwt()` —
  elas são da plataforma Supabase, **não** do GoTrue, e toda a RLS do projeto
  depende delas.

Cada objeto é criado só se faltar, então em um cluster que já tem a camada
Supabase nada é recriado — e a stack funciona mesmo que a imagem do Postgres
suba como um cluster comum.

As migrations referenciam `auth.users`, `storage.objects` e
`storage.buckets`, por isso só rodam depois que GoTrue e Storage aplicaram
os schemas deles. `migrate` registra o que já rodou em
`supabase_migrations.schema_migrations` — a mesma tabela do Supabase CLI —
então reexecutar é seguro e os dois caminhos ficam compatíveis.

## Desenvolvimento

```bash
make dev           # next dev com o código da sua máquina (hot reload)
```

O código vem de um bind mount; `node_modules` e `.next` ficam em volumes
(evita conflito entre os binários nativos do host e do Alpine). Para
instalar uma dependência nova:

```bash
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.dev.yml \
  exec app npm install <pacote>
```

No modo dev as `NEXT_PUBLIC_*` valem em tempo de execução (não há bundle
pré-compilado), então basta reiniciar a aplicação.

## Chaves

`ANON_KEY` e `SERVICE_ROLE_KEY` são JWTs assinados com `JWT_SECRET`. As do
`.env.docker.example` são de desenvolvimento. Para gerar novas:

```bash
node docker/generate-keys.mjs                 # segredo aleatório
node docker/generate-keys.mjs "meu-segredo"   # mínimo 32 caracteres
```

Cole as três linhas no `.env.docker`. Trocar o `JWT_SECRET` exige regerar as
duas chaves e reconstruir a imagem (`make build && make up`), já que a
`ANON_KEY` entra no bundle do navegador. O banco não precisa ser recriado: o
`db-init` reaplica o segredo a cada subida.

## Produção

O `docker-compose.yml` é pensado para rodar a stack inteira em uma máquina.
Três ajustes mínimos:

1. **Chaves e senhas próprias** (`make keys`, `POSTGRES_PASSWORD`,
   `CRON_SECRET`) — ver o checklist em [ambiente.md](ambiente.md).
2. **HTTPS**: coloque um proxy com TLS na frente (Caddy, Traefik, nginx) e
   aponte `PUBLIC_URL` para `https://seu-dominio`. A aplicação já envia HSTS
   e as demais cabeceiras de segurança (`next.config.mjs`).
3. **Rotinas**: `make cron` (ou agende `/api/cron/*` no cron do sistema).

Mudou o `PUBLIC_URL`? A imagem precisa ser reconstruída
(`make build && make up`): a URL do Supabase entra no bundle no momento do
build.

### Supabase gerenciado em vez do self-hosted

Se o banco for o Supabase Cloud, nada disso é necessário — basta a imagem da
aplicação:

```bash
docker build -t pilatesflow \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  --build-arg NEXT_PUBLIC_SITE_URL=https://seu-dominio .

docker run -d -p 3000:3001 --env-file .env.producao pilatesflow
```

A imagem escuta na porta **3001**. Segredos (`SUPABASE_SERVICE_ROLE_KEY`,
`CRON_SECRET`, tokens) entram em tempo de execução e nunca ficam na imagem.

## Troubleshooting

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `variable is not set` no `up` | Faltou `--env-file .env.docker` | Use o `Makefile` ou passe a flag |
| Build para em `Failed to compile` com erro de ESLint | `next build` trata erro de lint como erro de build | Corrija o apontamento — `npm run lint` localmente mostra o mesmo. Link `<a href="/api/...">` de download pode precisar de `{/* eslint-disable-next-line @next/next/no-html-link-for-pages */}`: a regra confunde rota de API com página |
| `Retrying 1/3...` no build e home com "Site em configuração" | As páginas do site são pré-renderizadas durante o build, quando ainda não há banco | Esperado. Elas revalidam sozinhas em 5 min (`revalidate = 300`); depois disso um reload já traz o conteúdo |
| `db` sai em 1–2 s com `dependency db failed to start` | Falha na inicialização do Postgres, antes do initdb | `docker compose --env-file .env.docker logs db` mostra a linha exata. Causas comuns: `command`/`config_file` sem o volume `db-config`, ou mount sobre `/docker-entrypoint-initdb.d` (apaga os scripts da imagem). Depois de corrigir, recomece do zero: `make clean && make up` |
| `auth` ou `storage` em loop com `password authentication failed` | O `db-init` não rodou, ou rodou antes de a imagem terminar de criar os roles | `docker compose --env-file .env.docker up db-init` — ele espera os roles, reaplica as senhas, testa o login de cada um e aborta dizendo qual falhou. Depois, `make up` |
| `db-init` avisa `roles inexistentes nesta imagem` | A versão da imagem do Postgres não cria aquele role | Se for um dos três verificados (`supabase_auth_admin`, `authenticator`, `supabase_storage_admin`), o `db-init` aborta de propósito: sem ele o serviço correspondente não conecta. Os demais (`pgbouncer`, `dashboard_user`) são opcionais |
| `auth` reinicia com `Failed to load configuration: ... converting '' to type int` | Variável numérica chegou vazia ao GoTrue (ex.: `SMTP_PORT=`) | Deixe um inteiro válido ou não passe a variável; o compose já usa `587` como padrão |
| `migrate` falha em `relation "auth.users" does not exist` | Migrations rodaram antes do GoTrue | `docker compose --env-file .env.docker up -d auth storage` e depois `make migrate` |
| Login funciona, mas as telas dão erro de permissão | Seed não rodou, ou o usuário não é membro de nenhuma organização | `make seed`, ou crie a clínica em `/onboarding` |
| Imagens do site não carregam | `PUBLIC_URL` diferente da URL embutida no build | `make build && make up` |
| `502` nas rotas `/rest/v1/*` | `rest` reiniciou e o nginx guardou o IP antigo | `docker compose --env-file .env.docker restart gateway` |
| A aplicação não responde depois de recriar o `gateway` | A rede é compartilhada | `up -d --force-recreate gateway app` |
| Porta 3000 ocupada | Outro processo (ou `npm run dev` local) | Ajuste `PUBLIC_PORT` **e** `PUBLIC_URL` e reconstrua |
| `/api/health` responde `degraded` | Banco inacessível ou migrations pendentes | `make logs` e `make migrate` |
| `make clean` apagou tudo | É o esperado: remove volumes | `make up && make seed` |

Logs: `make logs` (tudo), `make logs-app` (aplicação),
`docker compose --env-file .env.docker logs auth storage migrate` (Supabase).
