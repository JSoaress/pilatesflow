#!/bin/sh
# Resolve o provedor de e-mail ativo (EMAIL_PROVIDER) em .env.docker para um único
# bloco SMTP_HOST/PORT/USER/PASS/SMTP_ADMIN_EMAIL — que é o que o GoTrue e o app
# realmente leem. Permite manter credenciais de vários provedores salvas ao mesmo
# tempo em .env.docker e alternar só trocando EMAIL_PROVIDER, sem reescrever
# SMTP_* na mão a cada vez (ex: Gmail no 4G, Brevo na rede da empresa).
#
# Gera .env.docker.resolved (git-ignorado, cai no padrão .env* do .gitignore) a
# partir de .env.docker. Rodado automaticamente pelo Makefile antes de qualquer
# `docker compose`. Não editar o arquivo .resolved à mão — ele é sobrescrito.
set -eu

ENV_FILE="${1:-.env.docker}"
OUT_FILE="${ENV_FILE}.resolved"

if [ ! -f "$ENV_FILE" ]; then
  echo "Arquivo $ENV_FILE não encontrado." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

provider="${EMAIL_PROVIDER:-gmail}"

case "$provider" in
  gmail)
    r_host="smtp.gmail.com"
    r_port=587
    r_user="${GMAIL_SMTP_USER:-}"
    r_pass="${GMAIL_SMTP_PASS:-}"
    r_admin="${GMAIL_SMTP_USER:-}"
    ;;
  brevo)
    r_host="smtp-relay.brevo.com"
    r_port=587
    r_user="${BREVO_SMTP_USER:-}"
    r_pass="${BREVO_SMTP_PASS:-}"
    r_admin="${EMAIL_FROM:-}"
    ;;
  resend)
    r_host="smtp.resend.com"
    r_port=587
    r_user="resend"
    r_pass="${RESEND_API_KEY:-}"
    r_admin="${EMAIL_FROM:-}"
    ;;
  *)
    echo "EMAIL_PROVIDER inválido: '$provider' (use gmail, brevo ou resend)" >&2
    exit 1
    ;;
esac

if [ -z "$r_user" ] || [ -z "$r_pass" ]; then
  echo "Aviso: credenciais do provedor '$provider' estão vazias (verifique as variáveis ${provider}_SMTP_USER/_PASS, ou RESEND_API_KEY, em $ENV_FILE)." >&2
fi

# Copia .env.docker removendo as linhas SMTP_* antigas (se houver) e acrescenta o bloco resolvido.
grep -vE '^(SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|SMTP_ADMIN_EMAIL)=' "$ENV_FILE" > "$OUT_FILE"

{
  echo ""
  echo "# ===== Gerado por docker/resolve-email-provider.sh a partir de EMAIL_PROVIDER=$provider ====="
  echo "# Não editar à mão — edite $ENV_FILE (EMAIL_PROVIDER e as credenciais) e rode make de novo."
  echo "SMTP_HOST=$r_host"
  echo "SMTP_PORT=$r_port"
  echo "SMTP_USER=$r_user"
  echo "SMTP_PASS=$r_pass"
  echo "SMTP_ADMIN_EMAIL=$r_admin"
} >> "$OUT_FILE"

echo "→ provedor de e-mail ativo: $provider ($r_host)"
