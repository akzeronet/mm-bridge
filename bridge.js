// Node >= 18 ; npm i
import WebSocket from 'ws';
import crypto from 'node:crypto';
import dns from 'node:dns';

dns.setDefaultResultOrder?.('ipv4first'); // prioriza IPv4

// === ENV ===
const MM_WS_URL     = process.env.MM_WS_URL     || 'wss://zmm.demo.cloudron.io/api/v4/websocket';
const MM_BOT_TOKEN  = process.env.MM_BOT_TOKEN  || '';
const N8N_WEBHOOK   = process.env.N8N_WEBHOOK   || '';
const N8N_SHARED_SECRET = process.env.N8N_SHARED_SECRET || ''; // HMAC (opcional pero recomendado)
const INSTANCE      = process.env.INSTANCE      || 'mm-bridge';
const RECONNECT_MS  = Number(process.env.RECONNECT_MS || 3000);
const DEDUP_TTL_MS  = Number(process.env.DEDUP_TTL_MS || 10 * 60 * 1000);

if (!MM_BOT_TOKEN || !N8N_WEBHOOK) {
  console.error('Faltan variables: MM_BOT_TOKEN o N8N_WEBHOOK');
  process.exit(1);
}

// === Utils ===
const log = (...a) => console.log(new Date().toISOString(), `[${INSTANCE}]`, ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MM_BASE_URL = (() => {
  const u = new URL(MM_WS_URL);
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
})();

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}
function hmacHex(secret, str) {
  return crypto.createHmac('sha256', secret).update(str).digest('hex');
}

async function getBotId() {
  const res = await fetch(`${MM_BASE_URL}/api/v4/users/me`, {
    headers: { Authorization: `Bearer ${MM_BOT_TOKEN}` }
  });
  if (!res.ok) throw new Error(`users/me ${res.status}`);
  const j = await res.json();
  return j.id;
}

async function postToN8n(payload) {
  const originHost = new URL(MM_WS_URL).hostname;

  // cuerpo con metadatos
  const bodyObj = {
    source: { host: originHost, base_url: MM_BASE_URL, ws_url: MM_WS_URL, instance: INSTANCE },
    ...payload
  };
  const bodyStr = JSON.stringify(bodyObj);

  // anti-replay: timestamp + nonce + payload hash
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID();
  const payloadHash = sha256Hex(bodyStr);
  const canonical = `${ts}.${nonce}.${payloadHash}`;
  const signature = N8N_SHARED_SECRET ? hmacHex(N8N_SHARED_SECRET, canonical) : '';

  const headers = {
    'content-type': 'application/json',
    'x-bridge-origin': originHost,
    'x-agency-instance': INSTANCE,
    'x-agency-timestamp': ts,
    'x-agency-nonce': nonce,
    'x-agency-payload-sha256': payloadHash,
    'x-agency-canonical': canonical
  };
  if (signature) headers['x-agency-signature'] = signature;

  const res = await fetch(N8N_WEBHOOK, { method: 'POST', headers, body: bodyStr });
  log('POST n8n', res.status);
}

const seen = new Map(); // post.id -> ts
setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of seen) if (now - ts > DEDUP_TTL_MS) seen.delete(k);
}, Math.min(DEDUP_TTL_MS, 60_000));

async function run() {
  const BOT_ID = await getBotId().catch(e => { console.error('users/me', e.message); process.exit(1); });
  log('BOOT', { MM_WS_URL, N8N_WEBHOOK, BOT_ID });

  for (;;) {
    let ws;
    try {
      ws = new WebSocket(MM_WS_URL, { headers: { 'User-Agent': `AgencyBot/${INSTANCE}` } });

      ws.on('open', () => {
        log('WS open → authentication_challenge');
        ws.send(JSON.stringify({ seq: 1, action: 'authentication_challenge', data: { token: MM_BOT_TOKEN } }));

        // Heartbeat (ping cada 20s; si >60s sin pong -> reconectar)
        let lastPong = Date.now();
        ws.on('pong', () => { lastPong = Date.now(); });
        const hb = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastPong > 60_000) { try { ws.terminate(); } catch {} }
          else { try { ws.ping(); } catch {} }
        }, 20_000);
        ws.once('close', () => clearInterval(hb));
      });

      ws.on('message', async (buf) => {
        let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }

        // Auth OK
        if (msg?.status === 'OK' && typeof msg.seq_reply !== 'undefined') {
          log('WS auth OK', 'seq_reply=', msg.seq_reply);
          return;
        }

        if (msg?.event && msg.event !== 'posted') return;

        if (msg?.event === 'posted') {
          let post = {};
          try { post = JSON.parse(msg.data?.post || '{}'); } catch {}

          if ((post.user_id || '') === BOT_ID) return; // ignora al propio bot

          const pid = post.id || crypto.randomUUID();
          if (seen.has(pid)) return;
          seen.set(pid, Date.now());

          const payload = {
            user_id: post.user_id || null,
            channel_id: post.channel_id || null,
            post_id: pid,
            text: post.message || '',
            team_id: msg.broadcast?.team_id || null,
            sender_name: msg.data?.sender_name || null,
            raw: msg
          };

          try { await postToN8n(payload); }
          catch (e) { console.error('POST n8n error', e.message); }
        }
      });

      ws.on('close', (code, reason) => log('WS closed', code, reason?.toString?.() || ''));
      ws.on('error', (err) => log('WS error', err?.message || String(err)));

      await new Promise((resolve) => ws.once('close', resolve));
    } catch (e) {
      log('loop error', e.message);
    }
    log(`Reconnecting in ${RECONNECT_MS}ms…`);
    await sleep(RECONNECT_MS);
  }
}
run().catch((e) => { console.error('fatal', e); process.exit(1); });
