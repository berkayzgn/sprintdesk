// ============================================================
// send-push — Telefona anlık bildirim (APNs + FCM, aracı servis yok)
// ============================================================
// Postgres trigger'ı (pg_net) çağırır: bkz. migration 20261110130000_push_notifications.sql
//   • APNs: .p8 anahtarıyla ES256 JWT, doğrudan HTTP/2 (api.push.apple.com)
//   • FCM: servis hesabı JWT'si → OAuth token → HTTP v1 API
//   • Ölü token'lar (uygulama silinmiş vb.) push_tokens'tan silinir
// Her istek x-push-secret başlığında PUSH_WEBHOOK_SECRET taşımalı.
//
// Gövde:
//   { user_id, title, body?, badge?, thread_id?, data? }          → kullanıcının tüm cihazları
//   { token, platform: 'ios'|'android', env?, title, body?, ... } → tek cihaza deneme (DB'ye dokunmaz)
// ============================================================

type Platform = 'ios' | 'android';
type ApnsEnv = 'sandbox' | 'production';
type Target = { token: string; platform: Platform; apns_env: ApnsEnv | null };
type Message = { title: string; body: string; badge: number | null; threadId: string | null; data: Record<string, string> };
type Result = { ok: boolean; dead?: boolean; envFix?: ApnsEnv; error?: string };

const env = (name: string) => Deno.env.get(name)?.trim() || '';
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

// ---------- Yardımcılar ----------

const enc = new TextEncoder();

function b64url(input: Uint8Array | string) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PEM (ya da başlıksız base64) → DER. Env'de satır sonları "\n" olarak gelebilir. */
function pemToDer(pem: string) {
  const b64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END)[^-]*-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function signJwt(header: object, claims: object, key: CryptoKey, alg: AlgorithmIdentifier | EcdsaParams) {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = new Uint8Array(await crypto.subtle.sign(alg, key, enc.encode(input)));
  return `${input}.${b64url(sig)}`;
}

/** Zamanlamaya dayalı tahmini önlemek için sabit süreli karşılaştırma */
function safeEqual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- APNs ----------

// Apple token'ı en fazla 1 saat geçerli sayar ama 20 dakikadan sık yenilenmesini
// sevmez (TooManyProviderTokenUpdates): 50 dakika önbellekte tutulur.
let apnsJwt: { token: string; at: number } | null = null;
let apnsKey: CryptoKey | null = null;

async function apnsAuth() {
  if (apnsJwt && Date.now() - apnsJwt.at < 50 * 60 * 1000) return apnsJwt.token;
  const keyId = env('APNS_KEY_ID'), teamId = env('APNS_TEAM_ID'), pem = env('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !pem) throw new Error('APNs ayarları eksik (APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY)');
  apnsKey ??= await crypto.subtle.importKey('pkcs8', pemToDer(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto ECDSA imzası zaten JWS'in istediği r||s (64 bayt) biçiminde
  const token = await signJwt(
    { alg: 'ES256', kid: keyId },
    { iss: teamId, iat: Math.floor(Date.now() / 1000) },
    apnsKey,
    { name: 'ECDSA', hash: 'SHA-256' },
  );
  apnsJwt = { token, at: Date.now() };
  return token;
}

const APNS_HOST: Record<ApnsEnv, string> = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
};

async function apnsPost(token: string, apnsEnv: ApnsEnv, m: Message) {
  const topic = env('APNS_BUNDLE_ID');
  if (!topic) throw new Error('APNS_BUNDLE_ID eksik');
  const payload = {
    aps: {
      alert: { title: m.title, body: m.body },
      sound: 'default',
      ...(m.badge != null ? { badge: m.badge } : {}),
      ...(m.threadId ? { 'thread-id': m.threadId } : {}),
    },
    // expo-notifications iOS'ta content.data'yı "body" anahtarından okur
    body: m.data,
  };
  // Deno fetch, TLS üzerinde HTTP/2'yi (ALPN) kendisi seçer; APNs yalnızca HTTP/2 kabul eder
  const res = await fetch(`${APNS_HOST[apnsEnv]}/3/device/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsAuth()}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) { await res.body?.cancel(); return { status: res.status, reason: '' }; }
  const reason = String(((await res.json().catch(() => ({}))) as { reason?: string }).reason || '');
  if (reason === 'ExpiredProviderToken') apnsJwt = null; // bir sonraki istekte yenilensin
  return { status: res.status, reason };
}

async function sendApns(t: Target, m: Message): Promise<Result> {
  const stored: ApnsEnv = t.apns_env === 'sandbox' ? 'sandbox' : 'production';
  const r = await apnsPost(t.token, stored, m);
  if (r.status === 200) return { ok: true };
  if (r.status === 410 || r.reason === 'Unregistered') return { ok: false, dead: true, error: r.reason || '410' };
  if (r.reason === 'BadDeviceToken') {
    // Çoğu zaman ortam yanlış kayıtlıdır (development imzalı build → sandbox).
    // Diğer ortamı bir kez dene: tutarsa kaydı düzelt, tutmazsa token gerçekten ölü.
    const other: ApnsEnv = stored === 'sandbox' ? 'production' : 'sandbox';
    const r2 = await apnsPost(t.token, other, m);
    if (r2.status === 200) return { ok: true, envFix: other };
    if (r2.status === 410 || r2.reason === 'Unregistered' || r2.reason === 'BadDeviceToken') return { ok: false, dead: true, error: r2.reason || String(r2.status) };
    return { ok: false, error: `${r2.status} ${r2.reason}` };
  }
  return { ok: false, error: `${r.status} ${r.reason}` };
}

// ---------- FCM ----------

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
let fcmAccount: ServiceAccount | null = null;
let fcmToken: { token: string; exp: number } | null = null;

function serviceAccount() {
  if (fcmAccount) return fcmAccount;
  let raw = env('FCM_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT eksik');
  // JSON doğrudan ya da base64 olarak verilebilir (tek satırlık env dosyaları için)
  if (!raw.startsWith('{')) raw = atob(raw);
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('FCM_SERVICE_ACCOUNT geçersiz');
  fcmAccount = sa;
  return sa;
}

async function fcmAuth() {
  if (fcmToken && Date.now() < fcmToken.exp) return fcmToken.token;
  const sa = serviceAccount();
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 },
    key,
    { name: 'RSASSA-PKCS1-v1_5' },
  );
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`FCM OAuth hatası: ${res.status} ${body.error || ''}`);
  fcmToken = { token: body.access_token, exp: Date.now() + ((body.expires_in || 3600) - 120) * 1000 };
  return fcmToken.token;
}

type FcmError = {
  error?: {
    code?: number; status?: string; message?: string;
    details?: { '@type'?: string; errorCode?: string; fieldViolations?: { field?: string }[] }[];
  };
};

async function sendFcm(t: Target, m: Message): Promise<Result> {
  const sa = serviceAccount();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await fcmAuth()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: t.token,
        notification: { title: m.title, body: m.body },
        data: m.data,
        android: {
          priority: 'HIGH',
          notification: {
            // Uygulamanın oluşturduğu kanal (src/lib/push.ts → 'default')
            channel_id: 'default',
            sound: 'default',
            ...(m.threadId ? { tag: m.threadId } : {}),
            ...(m.badge != null ? { notification_count: m.badge } : {}),
          },
        },
      },
    }),
  });
  if (res.ok) { await res.body?.cancel(); return { ok: true }; }
  if (res.status === 401) fcmToken = null;
  const { error } = (await res.json().catch(() => ({}))) as FcmError;
  const codes = (error?.details || []).map(d => d.errorCode).filter(Boolean);
  const tokenField = (error?.details || []).some(d => (d.fieldViolations || []).some(v => v.field === 'message.token'));
  // UNREGISTERED: uygulama silinmiş / token yenilenmiş. INVALID_ARGUMENT yalnızca token'la ilgiliyse ölü sayılır
  // (yük hatası da INVALID_ARGUMENT döner; o durumda geçerli token'ı silmeyelim).
  const dead = codes.includes('UNREGISTERED') || error?.status === 'NOT_FOUND'
    || (error?.status === 'INVALID_ARGUMENT' && (tokenField || /registration token/i.test(error?.message || '')));
  return { ok: false, dead, error: `${res.status} ${error?.status || ''} ${codes.join(',')}`.trim() };
}

// ---------- Veritabanı (service_role, PostgREST) ----------

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`DB ${res.status}: ${await res.text()}`);
  return res;
}

async function tokensOf(userId: string): Promise<Target[]> {
  const res = await db(`push_tokens?select=token,platform,apns_env&user_id=eq.${encodeURIComponent(userId)}`);
  return await res.json();
}

const inList = (tokens: string[]) => `(${tokens.map(t => `"${t.replace(/["\\]/g, '')}"`).join(',')})`;

// ---------- Sunucu ----------

/** FCM data yalnızca string kabul eder; null'lar atlanır */
function toData(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v == null) continue;
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  return out;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, { error: 'POST bekleniyor' });
  const secret = env('PUSH_WEBHOOK_SECRET');
  if (!secret) return json(500, { error: 'PUSH_WEBHOOK_SECRET tanımlı değil' });
  if (!safeEqual(req.headers.get('x-push-secret') || '', secret)) return json(401, { error: 'Yetkisiz' });

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json(400, { error: 'Geçersiz JSON' }); }

  const title = String(input.title || '').slice(0, 200);
  if (!title) return json(400, { error: 'title gerekli' });
  const badge = Number.isInteger(input.badge) && (input.badge as number) >= 0 ? (input.badge as number) : null;
  const m: Message = {
    title,
    body: String(input.body || '').slice(0, 1000),
    badge,
    threadId: typeof input.thread_id === 'string' ? input.thread_id.slice(0, 64) : null,
    data: toData(input.data),
  };

  // Hedefler: deneme modu (tek token) ya da kullanıcının kayıtlı cihazları
  const direct = typeof input.token === 'string' && input.token;
  let targets: Target[];
  if (direct) {
    const platform: Platform = input.platform === 'android' ? 'android' : 'ios';
    const apnsEnv: ApnsEnv | null = platform === 'ios' ? (input.env === 'sandbox' ? 'sandbox' : 'production') : null;
    targets = [{ token: input.token as string, platform, apns_env: apnsEnv }];
  } else if (typeof input.user_id === 'string' && input.user_id) {
    if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok' });
    try { targets = await tokensOf(input.user_id); } catch (e) { return json(502, { error: String(e) }); }
  } else {
    return json(400, { error: 'user_id ya da token gerekli' });
  }
  if (!targets.length) return json(200, { sent: 0, removed: 0, failed: 0 });

  const results = await Promise.all(targets.map(async t => {
    try {
      return { t, r: t.platform === 'ios' ? await sendApns(t, m) : await sendFcm(t, m) };
    } catch (e) {
      return { t, r: { ok: false, error: e instanceof Error ? e.message : String(e) } as Result };
    }
  }));

  // Bakım: ölü token'ları sil, yanlış kayıtlı APNs ortamını düzelt (deneme modunda DB'ye dokunma)
  const dead = results.filter(x => x.r.dead).map(x => x.t.token);
  if (!direct) {
    try {
      if (dead.length) await db(`push_tokens?token=in.${encodeURIComponent(inList(dead))}`, { method: 'DELETE' });
      for (const { t, r } of results) {
        if (r.envFix) {
          await db(`push_tokens?token=eq.${encodeURIComponent(t.token)}`, { method: 'PATCH', body: JSON.stringify({ apns_env: r.envFix }) });
        }
      }
    } catch (e) {
      console.error('[send-push] token bakımı başarısız', e);
    }
  }

  const failed = results.filter(x => !x.r.ok);
  for (const { t, r } of failed) console.warn('[send-push]', t.platform, t.token.slice(0, 8), r.error);
  return json(200, {
    sent: results.length - failed.length,
    removed: direct ? 0 : dead.length,
    failed: failed.length,
    ...(direct ? { result: results[0].r } : {}),
  });
});
