# Deploy na Railway — container único (plano Free)

> **Status:** experimental. Este arquivo descreve o deploy de `auth` (GoTrue) +
> `rest` (PostgREST) + `storage` (Storage API) + `nginx` + o app Next.js
> **num container só**, para caber no limite de 3 serviços/projeto do plano
> Free da Railway (Postgres + este container = 2 de 3).
>
> Não há daemon Docker disponível no ambiente onde este Dockerfile foi escrito,
> então ele não pôde ser testado por build real antes do primeiro deploy.
> É esperado precisar de 1-2 rodadas de ajuste olhando os logs reais da Railway.
> Se preferir não lidar com esse risco agora, a alternativa é o plano Hobby
> (US$5/mês), que remove o limite de serviços e permite manter `auth`, `rest`
> e `storage` como serviços separados (mais simples e mais perto do
> `docker-compose.yml` local).

## 0. Arquivos novos deste modo de deploy

- `Dockerfile.railway` — imagem única (auth + rest + storage + nginx + app).
- `docker/entrypoint-railway.sh` — processo que sobe os 5 processos e aplica
  as migrations, na ordem certa.
- `docker/nginx/railway.conf.template` — nginx apontando para `127.0.0.1:<porta>`
  em vez dos nomes de serviço do Compose.

Nenhum arquivo usado pelo `docker-compose.yml` local foi alterado — o ambiente
de desenvolvimento local continua igual.

## 1. Banco de dados

1. No projeto da Railway: **New → Database → PostgreSQL** (a instância nativa
   deles, não a imagem `supabase/postgres`).
2. Abra o serviço do Postgres → aba **Variables** e confirme o nome do banco
   (normalmente `railway`, não `postgres`) e veja as variáveis que ele expõe:
   `POSTGRES_PASSWORD`, `PGHOST`/`RAILWAY_PRIVATE_DOMAIN`, `PGPORT` (5432),
   `PGDATABASE`.

## 2. Gerar as chaves (se ainda não tiver)

No seu computador, dentro do projeto:

```bash
node docker/generate-keys.mjs
```

Guarde os três valores (`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) — vão
entrar nas variáveis do serviço abaixo.

## 3. Criar o serviço do container único

1. **New → Empty Service** (ou **GitHub Repo**, se for buildar a partir do
   seu repositório).
2. Em **Settings → Build**, defina o Dockerfile usado para **`Dockerfile.railway`**
   (por padrão a Railway usa `Dockerfile` na raiz — troque explicitamente).
3. Em **Settings → Networking → Public Networking**, clique **Generate Domain**.
   Anote o domínio gerado (ex.: `pilatesflow.up.railway.app`) — ele entra em
   várias variáveis abaixo como `https://pilatesflow.up.railway.app`.
4. Crie um **Volume** (`Cmd+K` → *Create Volume*, ou clique com o botão direito
   no canvas do projeto) e anexe ao serviço do container único, com
   **Mount Path = `/var/lib/storage`** (é onde o Storage API guarda os arquivos).

### Variáveis de ambiente do serviço (Variables)

Use referência de outro serviço na Railway com `${{NomeDoServiço.VARIAVEL}}`
(o nome exato do serviço do Postgres aparece no próprio painel). Troque
`SEU-DOMINIO` pelo domínio gerado no passo 3, e `<gerado>` pelos valores do
passo 2.

```dotenv
# --- Conexão com o Postgres da Railway (referenciando o serviço do banco) ---
PGHOST=${{Postgres.RAILWAY_PRIVATE_DOMAIN}}
PGPORT=5432
PGDATABASE=railway
POSTGRES_PASSWORD=${{Postgres.POSTGRES_PASSWORD}}

# --- Chaves compartilhadas ---
JWT_SECRET=<gerado no passo 2>
JWT_EXPIRY=3600
ANON_KEY=<gerado no passo 2>
SERVICE_ROLE_KEY=<gerado no passo 2>

# --- Porta pública (a Railway injeta PORT automaticamente; 8080 é só o default) ---
PORT=8080

# --- GoTrue (auth) ---
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${{Postgres.POSTGRES_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/railway
API_EXTERNAL_URL=https://SEU-DOMINIO
GOTRUE_SITE_URL=https://SEU-DOMINIO
GOTRUE_URI_ALLOW_LIST=https://SEU-DOMINIO/**
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_SECRET=<mesmo JWT_SECRET acima>
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_EXTERNAL_PHONE_ENABLED=false
GOTRUE_MAILER_AUTOCONFIRM=false
GOTRUE_SMTP_ADMIN_EMAIL=bemmequerofisio@gmail.com
GOTRUE_SMTP_HOST=smtp.gmail.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=bemmequerofisio@gmail.com
GOTRUE_SMTP_PASS=polk ptng ehtx nhan
GOTRUE_SMTP_SENDER_NAME=PilatesFlow
GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

# --- PostgREST (rest) ---
PGRST_DB_URI=postgres://authenticator:${{Postgres.POSTGRES_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/railway
PGRST_DB_SCHEMAS=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=<mesmo JWT_SECRET acima>
PGRST_DB_USE_LEGACY_GUCS=false
PGRST_APP_SETTINGS_JWT_SECRET=<mesmo JWT_SECRET acima>
PGRST_APP_SETTINGS_JWT_EXP=3600

# --- Storage API ---
ANON_KEY=<mesmo ANON_KEY acima>
SERVICE_KEY=<mesmo SERVICE_ROLE_KEY acima>
POSTGREST_URL=http://127.0.0.1:3000
FILE_SIZE_LIMIT=52428800
STORAGE_BACKEND=file
FILE_STORAGE_BACKEND_PATH=/var/lib/storage
TENANT_ID=pilatesflow
REGION=local
GLOBAL_S3_BUCKET=pilatesflow
ENABLE_IMAGE_TRANSFORMATION=false

# --- App Next.js (equivalente ao x-app-env do docker-compose.yml) ---
NEXT_PUBLIC_SUPABASE_URL=https://SEU-DOMINIO
NEXT_PUBLIC_SUPABASE_ANON_KEY=<mesmo ANON_KEY acima>
NEXT_PUBLIC_SITE_URL=https://SEU-DOMINIO
NEXT_PUBLIC_DEFAULT_ORG_SLUG=studio-movimento
NEXT_PUBLIC_APP_NAME=PilatesFlow
NEXT_PUBLIC_SUPPORT_WHATSAPP=
NEXT_PUBLIC_SUPPORT_EMAIL=
SUPABASE_SERVICE_ROLE_KEY=<mesmo SERVICE_ROLE_KEY acima>
ALLOW_PUBLIC_SIGNUP=true
CRON_SECRET=<defina um valor aleatório>
TZ=America/Sao_Paulo
EMAIL_PROVIDER=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=bemmequerofisio@gmail.com
SMTP_PASS=polk ptng ehtx nhan
EMAIL_FROM=<remetente que você validou>
```

Se usar WhatsApp, Asaas, Mercado Pago, Stripe, Google OAuth, NFS-e ou Sentry,
adicione as variáveis correspondentes do seu `.env.docker` (mesmos nomes:
`WHATSAPP_*`, `ASAAS_*`, `MERCADOPAGO_*`, `STRIPE_*`, `GOOGLE_CLIENT_*`,
`NFSE_*`, `SENTRY_DSN`).

> **Build args:** as variáveis `NEXT_PUBLIC_*` também precisam estar
> disponíveis durante o *build* (ficam embutidas no bundle do navegador). A
> Railway encaminha automaticamente uma variável do serviço para um `ARG` do
> Dockerfile com o mesmo nome — não precisa duplicar nada, só confirmar que
> elas estão na lista de variáveis do serviço antes do primeiro deploy.

## 4. Deploy

1. Faça o deploy do serviço (push no repositório conectado, ou
   `railway up` se for deploy manual).
2. Acompanhe os logs. A ordem esperada:
   - `1/5 Preparando roles/schemas no Postgres` (roles, schemas, funções `auth.*`)
   - `2/5 Localizando binários/apps vendorizados` (confirma os 3 caminhos encontrados)
   - `3/5 Subindo auth, rest e storage`
   - `4/5 Rodando migrations do projeto` (aplica `supabase/migrations/*.sql`)
   - `5/5 Subindo nginx e o app Next.js`
3. Teste:
   - `https://SEU-DOMINIO/auth/v1/health` → deve responder
   - `https://SEU-DOMINIO/rest/v1/` → deve responder (JSON do PostgREST)
   - `https://SEU-DOMINIO/` → a aplicação

## 5. Se der erro

- **"binário do GoTrue/PostgREST não encontrado"**: o `find` não achou o
  executável dentro da imagem vendorizada. O log imprime o conteúdo do
  diretório (`find /vendor/... -maxdepth 3`) — me envie esse trecho do log
  para eu ajustar o critério de busca no `entrypoint-railway.sh`.
- **`migrate.sh` falhando com "relation auth.users does not exist"**: o
  GoTrue ainda não terminou de criar as tabelas dele quando a migration
  rodou. O entrypoint já espera `/auth/v1/health` e `/storage/v1/status`
  responderem antes de migrar, mas se o Postgres da Railway for mais lento,
  pode precisar aumentar o tempo de espera (`for _ in $(seq 1 60)` → mais
  tentativas) no `entrypoint-railway.sh`.
- **nginx não sobe / porta errada**: confirme que a Railway está indicando a
  mesma porta que `PORT` (o healthcheck e o domínio público usam a mesma
  variável).
- Qualquer processo cair faz o container inteiro sair (propositalmente) —
  isso força a Railway a reiniciar tudo do zero, o que é mais seguro do que
  deixar um dos 5 processos travado silenciosamente no ar.
