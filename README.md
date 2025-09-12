# mm-bridge
Mattermost Bot WSS ->  n8n Webhook

# mm-bridge (Mattermost → n8n)

Bridge por WebSocket que escucha eventos `posted` en Mattermost y los reenvía a n8n con metadatos y firma HMAC.

## Setup rápido
```bash
git clone <este-repo>
cd mm-bridge
./bin/configure.sh    # menú interactivo; genera .env
