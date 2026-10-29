#!/bin/sh
# Agendador simples das rotinas (substitui o Vercel Cron).
#   /api/cron/messages  a cada CRON_MESSAGES_MINUTES minutos
#   /api/cron/daily     uma vez por dia, na hora CRON_DAILY_HOUR (fuso TZ)
set -eu

BASE="${CRON_BASE_URL:-http://gateway:3000}"
MIN="${CRON_MESSAGES_MINUTES:-10}"
HOUR="${CRON_DAILY_HOUR:-3}"
: "${CRON_SECRET:?defina CRON_SECRET}"

call() {
  if wget -q -O /dev/null --header "Authorization: Bearer $CRON_SECRET" "$BASE$1"; then
    echo "$(date '+%F %T') ok   $1"
  else
    echo "$(date '+%F %T') ERRO $1" >&2
  fi
}

echo "cron: messages a cada ${MIN} min; daily às ${HOUR}h (TZ=${TZ:-UTC}); alvo $BASE"
last_daily=""
tick=0
while true; do
  now_hour=$(date +%H | sed 's/^0//'); today=$(date +%F)
  [ "${now_hour:-0}" = "$HOUR" ] && [ "$last_daily" != "$today" ] && { call /api/cron/daily; last_daily=$today; }
  [ $((tick % MIN)) -eq 0 ] && call /api/cron/messages
  tick=$((tick + 1))
  sleep 60
done
