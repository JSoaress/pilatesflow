#!/bin/bash
# Entrypoint do container único (auth + rest + storage + nginx + app) na Railway.
# Usa bash (não ash/busybox) por causa do `wait -n` no final.
set -eo pipefail

echo "==> 1/5 Preparando roles/schemas no Postgres (idempotente)"
# 01-roles-and-jwt.sh já faz wait_for_db + pick_admin internamente (source de lib.sh).
bash /docker/01-roles-and-jwt.sh

echo "==> 2/5 Localizando binários/apps vendorizados"
# -print -quit (em vez de `| head -1`): o find já para no primeiro achado,
# sem pipe nenhum — com `set -o pipefail`, `find | head -1` mata o script
# com SIGPIPE (exit 141) assim que o head fecha o pipe antes do find terminar.
AUTH_BIN=$(find /vendor/auth -maxdepth 6 -type f \( -name gotrue -o -name auth \) -perm -u+x -print -quit 2>/dev/null)
REST_BIN=$(find /vendor/rest -maxdepth 6 -type f -name postgrest -perm -u+x -print -quit 2>/dev/null)
STORAGE_PKG=$(find /vendor/storage -maxdepth 4 -name package.json -not -path '*/node_modules/*' -print -quit 2>/dev/null)

if [ -z "$AUTH_BIN" ]; then
  echo "ERRO: binário do GoTrue não encontrado em /vendor/auth. Conteúdo:" >&2
  find /vendor/auth -maxdepth 3 >&2
  exit 1
fi
if [ -z "$REST_BIN" ]; then
  echo "ERRO: binário do PostgREST não encontrado em /vendor/rest. Conteúdo:" >&2
  find /vendor/rest -maxdepth 3 >&2
  exit 1
fi
if [ -z "$STORAGE_PKG" ]; then
  echo "ERRO: package.json do Storage API não encontrado em /vendor/storage. Conteúdo:" >&2
  find /vendor/storage -maxdepth 3 >&2
  exit 1
fi
STORAGE_DIR=$(dirname "$STORAGE_PKG")
# O campo "main" do package.json nem sempre é o arquivo real de start (vimos
# um caso com main=index.js que não existe). Testamos candidatos reais no
# disco, na ordem mais provável, em vez de confiar só nos metadados.
STORAGE_MAIN=""
STORAGE_PKG_MAIN=$(node -e "try{console.log(require('$STORAGE_PKG').main||'')}catch(e){}")
STORAGE_PKG_START=$(node -e "try{var p=require('$STORAGE_PKG');var s=(p.scripts&&p.scripts.start)||'';var m=s.match(/([\w.\/-]+\.js)\b/);console.log(m?m[1]:'')}catch(e){}")
for cand in dist/server.js dist/index.js build/server.js build/index.js server.js "$STORAGE_PKG_START" "$STORAGE_PKG_MAIN" index.js; do
  if [ -n "$cand" ] && [ -f "$STORAGE_DIR/$cand" ]; then
    STORAGE_MAIN="$cand"
    break
  fi
done
if [ -z "$STORAGE_MAIN" ]; then
  echo "ERRO: não encontrei um arquivo de entrada real do Storage API em $STORAGE_DIR. Conteúdo:" >&2
  find "$STORAGE_DIR" -maxdepth 2 -not -path '*/node_modules/*' >&2
  exit 1
fi

echo "    auth:    $AUTH_BIN"
echo "    rest:    $REST_BIN"
echo "    storage: $STORAGE_DIR/$STORAGE_MAIN"

echo "==> 3/5 Subindo auth (9999), rest (3000) e storage (5000)"
"$AUTH_BIN" &
AUTH_PID=$!

"$REST_BIN" &
REST_PID=$!

( cd "$STORAGE_DIR" && exec env PORT=5000 node "$STORAGE_MAIN" ) &
STORAGE_PID=$!

echo "==> Aguardando auth e storage responderem (até 2 min)"
ok=0
for _ in $(seq 1 60); do
  if wget -qO- http://127.0.0.1:9999/health >/dev/null 2>&1 \
    && wget -qO- http://127.0.0.1:5000/status >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" != "1" ]; then
  echo "AVISO: auth e/ou storage não responderam em 2 min — tentando migrar mesmo assim." >&2
fi

echo "==> 4/5 Rodando migrations do projeto (supabase/migrations)"
bash /docker/migrate.sh || echo "AVISO: migrate.sh falhou — veja os logs acima. O container continua no ar." >&2

echo "==> 5/5 Subindo nginx (porta pública \${PORT:-8080}) e o app Next.js (3001)"
export PORT="${PORT:-8080}"

echo "==> Diagnóstico: testando 127.0.0.1:${PORT} antes do nginx subir"
wget -S -T 2 -O- "http://127.0.0.1:${PORT}/" 2>&1 | head -20 || true
echo "==> fim do diagnóstico"

envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/http.d/default.conf
nginx -g 'daemon off;' &
NGINX_PID=$!

( cd /app && exec env PORT=3001 HOSTNAME=0.0.0.0 node server.js ) &
APP_PID=$!

echo "==> No ar: auth=$AUTH_PID rest=$REST_PID storage=$STORAGE_PID nginx=$NGINX_PID app=$APP_PID"
echo "    Se qualquer um desses cair, o container inteiro sai (Railway reinicia)."

wait -n
echo "ALERTA: um dos processos encerrou — finalizando o container para forçar reinício." >&2
kill "$AUTH_PID" "$REST_PID" "$STORAGE_PID" "$NGINX_PID" "$APP_PID" 2>/dev/null
exit 1
