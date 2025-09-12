#!/usr/bin/env bash
set -euo pipefail

echo "== mm-bridge :: setup =="
read -rp "MM_WS_URL [wss://zmm.demo.cloudron.io/api/v4/websocket]: " MM_WS_URL
MM_WS_URL=${MM_WS_URL:-wss://zmm.demo.cloudron.io/api/v4/websocket}

read -rp "N8N_WEBHOOK [https://eladiox.app.n8n.cloud/webhook/mm-in]: " N8N_WEBHOOK
N8N_WEBHOOK=${N8N_WEBHOOK:-https://eladiox.app.n8n.cloud/webhook/mm-in}

read -rp "MM_BOT_TOKEN (obligatorio): " MM_BOT_TOKEN
if [[ -z "$MM_BOT_TOKEN" ]]; then echo "MM_BOT_TOKEN es requerido"; exit 1; fi

read -rp "N8N_API_KEY (se recomienda poner una): " N8N_API_KEY
if [[ -z "$N8N_API_KEY" ]]; then
  N8N_API_KEY=$(openssl rand -hex 32 2>/dev/null || echo "cambia_por_una_clave_secreta")
fi

read -rp "N8N_SHARED_SECRET (se recomienda poner uno): " N8N_SHARED_SECRET
if [[ -z "$N8N_SHARED_SECRET" ]]; then
  N8N_SHARED_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "cambia_esto_por_un_secreto")
fi

read -rp "INSTANCE [mm-bridge-prod]: " INSTANCE
INSTANCE=${INSTANCE:-mm-bridge-prod}

read -rp "RECONNECT_MS [3000]: " RECONNECT_MS
RECONNECT_MS=${RECONNECT_MS:-3000}

cat > .env <<EOF
MM_WS_URL=${MM_WS_URL}
N8N_WEBHOOK=${N8N_WEBHOOK}
MM_BOT_TOKEN=${MM_BOT_TOKEN}
N8N_API_KEY=${N8N_API_KEY}
N8N_SHARED_SECRET=${N8N_SHARED_SECRET}
INSTANCE=${INSTANCE}
RECONNECT_MS=${RECONNECT_MS}
DEDUP_TTL_MS=600000
EOF

echo "✔ .env generado."
echo
echo "¿Deseas construir y arrancar con Docker ahora? (y/N)"
read -r ANS
if [[ "${ANS,,}" == "y" ]]; then
  docker compose up -d --build
  docker compose logs -f bridge
else
  echo "Puedes arrancar luego con:  docker compose up -d --build"
fi
