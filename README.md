# mm-bridge
Mattermost Bot WSS ->  n8n Webhook

# mm-bridge (Mattermost → n8n)

Bridge por WebSocket que escucha eventos `posted` en Mattermost y los reenvía a n8n con metadatos y firma HMAC.

## Setup rápido
```bash
git clone https://github.com/akzeronet/mm-bridge.git
cd mm-bridge
chmod +x bin/configure.sh
./bin/configure.sh    # menú interactivo; genera .env
```
Es muy recomendable activar autenticación en el Webhook de n8n y además verificar la firma HMAC que ya te dejo el bridge. Hazlo así (rápido y seguro):

1) Protege el Webhook con “Header Auth”
En tu Webhook node (el de producción, no el de test):
Authentication → Header Auth

Crea unas credenciales con:
```
Header Name: X-API-Key
Header Value: un secreto largo (ej. generado con openssl rand -hex 32)
```

> Esto hace que n8n rechace (403) cualquier request sin ese header correcto.

## Verifica la firma HMAC dentro del workflow (defensa en profundidad)
Justo después del Webhook, añade un Function node que haga:

```
const crypto = require('crypto');
const h = $json.headers || {};
const body = $json.body ?? $json;

// 1) integridad del body
const calcHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
if (calcHash !== h['x-agency-payload-sha256']) {
  return [{ verified:false, reason:'hash mismatch' }];
}

// 2) firma HMAC
const secret = $env.N8N_SHARED_SECRET || 'cambia_esto';
const calcSig = crypto.createHmac('sha256', secret).update(h['x-agency-canonical']).digest('hex');
if (calcSig !== h['x-agency-signature']) {
  return [{ verified:false, reason:'bad signature' }];
}

// 3) anti-replay (±5 min)
const tsOk = Math.abs(Date.now() - Number(h['x-agency-timestamp'])) <= 5*60*1000;
if (!tsOk) return [{ verified:false, reason:'timestamp window' }];

// TODO opcional: guarda h['x-agency-nonce'] 5 min en DB/cache: si se repite → rechazar

return [{ verified:true, data: body }];
```

### Conecta eso a un IF:
Si verified == true → sigue tu flujo normal.
Si no → Respond to Webhook con 401 Unauthorized y termina.
Ventajas: si alguien adivina el endpoint pero no tiene X-API-Key ni el HMAC y timestamp/nonce válidos, se queda fuera.

## 3) Buenas prácticas extra (rápidas)
* Usa solo el Production URL del Webhook; desactiva o ignora el Test URL.
* Limita el Webhook a POST únicamente.
* Rotación periódica de X-API-Key, N8N_SHARED_SECRET y el token del bot de Mattermost.
(Opcional) Rate-limit al inicio del workflow (por user_id/minuto).
(Opcional) Si el bridge sale de IP fija, filtra por IP frente a n8n (proxy/WAF).

## 4) Resumen de variables a tener
### En el bridge:
MM_WS_URL, MM_BOT_TOKEN, N8N_WEBHOOK
N8N_SHARED_SECRET (para HMAC) ✅
N8N_API_KEY (para Header Auth del Webhook) ✅

### En n8n:
* Activa Header Auth en el Webhook con X-API-Key = <N8N_API_KEY>
* Define N8N_SHARED_SECRET (env del sistema o hardcode en el Function si no tienes envs)

> Con eso tu Webhook queda cerrado por dos puertas: Header Auth (bloquea antes de ejecutar) y HMAC + anti-replay (valida a nivel de workflow).
