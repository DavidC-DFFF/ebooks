import '../sync-core.js';
const core = globalThis.readingSyncCore;
const MAX_BYTES = 512 * 1024;
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function keyHash(token) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(token))); }
export async function passwordHash(password, salt, pepper) {
  // Pepper dans les secrets du Worker. Plafond PBKDF2 de Workers : 100 000.
  const key = await crypto.subtle.importKey('raw', encoder.encode(pepper), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', key, encoder.encode(password));
  const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256'}, material, 256));
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function limitedJson(request, max = MAX_BYTES) {
  if (Number(request.headers.get('Content-Length')) > max) throw new Error('too-large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid');
  let length = 0;
  const chunks = [];
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) { await reader.cancel(); throw new Error('too-large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function rateLimited(request, env, username) {
  const now = Date.now(), expires = now + 600000;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  for (const [key, maximum] of [['ip:' + ip, 30], ['name:' + username, 10]]) {
    const bucket = await keyHash(key);
    const row = await env.DB.prepare(`INSERT INTO auth_limits(bucket,attempts,expires_at) VALUES(?1,1,?2)
      ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<?3 THEN 1 ELSE attempts+1 END,
      expires_at=CASE WHEN expires_at<?3 THEN ?2 ELSE expires_at END RETURNING attempts`).bind(bucket, expires, now).first();
    if (row.attempts > maximum) return true;
  }
  return false;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff'};
    const respond = (data, status = 200) => new Response(JSON.stringify(data), {status, headers});
    if (origin && !allowed.includes(origin)) return respond({error: 'Origine refusée'}, 403);
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'GET, PUT, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      headers['Access-Control-Max-Age'] = '3600';
      return new Response(null, {status: 204, headers});
    }
    const path = new URL(request.url).pathname;
    if (!['/v1/register', '/v1/login', '/v1/logout', '/v1/me', '/v1/state'].includes(path)) return respond({error: 'Introuvable'}, 404);
    if (!env.DB || typeof env.AUTH_PEPPER !== 'string' || env.AUTH_PEPPER.length < 32) return respond({error: 'Le service de connexion est en cours de préparation.'}, 503);
    try {
      if (path === '/v1/register' || path === '/v1/login') {
        if (request.method !== 'POST') return respond({error: 'Méthode refusée'}, 405);
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) return respond({error: 'JSON requis'}, 415);
        let body;
        try { body = await limitedJson(request, 4096); } catch { return respond({error: 'Formulaire invalide'}, 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({error: 'Formulaire invalide'}, 400);
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        if (!username || username.length > 100 || /[\u0000-\u001f\u007f]/.test(username))
          return respond({error: 'Renseigne un identifiant valide.'}, 400);
        if (typeof body.password !== 'string' || body.password.length > 200)
          return respond({error: 'Renseigne un mot de passe valide.'}, 400);
        if (!body.password.length) return respond({error: 'Renseigne un mot de passe.'}, 400);
        if (await rateLimited(request, env, username)) return respond({error: 'Trop de tentatives. Réessaie dans dix minutes.'}, 429);
        let user;
        if (path === '/v1/register') {
          const id = crypto.randomUUID(), salt = randomToken();
          const hash = await passwordHash(body.password, salt, env.AUTH_PEPPER);
          try {
            user = await env.DB.prepare(`INSERT INTO users(id,username,password_salt,password_hash,created_at)
              SELECT ?1,?2,?3,?4,?5 WHERE (SELECT COUNT(*) FROM users)<?6 RETURNING id,username`)
              .bind(id, username, salt, hash, Date.now(), Math.max(1, Math.min(1000, Number(env.MAX_ACCOUNTS) || 100))).first();
          } catch (error) {
            if (/UNIQUE constraint failed/i.test(error.message)) return respond({error: 'Cet identifiant n’est pas disponible.'}, 409);
            throw error;
          }
          if (!user) return respond({error: 'Les inscriptions sont temporairement fermées.'}, 403);
        } else {
          const row = await env.DB.prepare('SELECT id,username,password_salt,password_hash FROM users WHERE username=?1').bind(username).first();
          const actual = await passwordHash(body.password, row?.password_salt || 'nonexistent-account', env.AUTH_PEPPER);
          if (!row || !equal(actual, row.password_hash)) return respond({error: 'Identifiant ou mot de passe incorrect.'}, 401);
          user = {id: row.id, username: row.username};
        }
        await env.DB.prepare('INSERT OR IGNORE INTO user_reading_state(user_id) VALUES(?1)').bind(user.id).run();
        const token = randomToken(), expiresAt = Date.now() + (body.remember === true ? 30 * 86400000 : 12 * 3600000);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM sessions WHERE expires_at<?1').bind(Date.now()),
          env.DB.prepare('DELETE FROM auth_limits WHERE expires_at<?1').bind(Date.now()),
          env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?1,?2,?3)').bind(await keyHash(token), user.id, expiresAt)
        ]);
        return respond({user, token, expiresAt}, path === '/v1/register' ? 201 : 200);
      }
      const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      const tokenHash = token ? await keyHash(token) : '';
      const session = token && await env.DB.prepare(`SELECT users.id,users.username,sessions.expires_at FROM sessions
        JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?1 AND sessions.expires_at>?2`).bind(tokenHash, Date.now()).first();
      if (!session) return respond({error: 'Reconnecte-toi pour synchroniser tes lectures.'}, 401);
      if (path === '/v1/logout') {
        if (request.method !== 'POST') return respond({error: 'Méthode refusée'}, 405);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?1').bind(tokenHash).run();
        return respond({ok: true});
      }
      if (path === '/v1/me') {
        if (request.method !== 'GET') return respond({error: 'Méthode refusée'}, 405);
        return respond({user: {id: session.id, username: session.username}, expiresAt: session.expires_at});
      }
      if (!['GET', 'PUT'].includes(request.method)) return respond({error: 'Méthode refusée'}, 405);
      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT revision, books FROM user_reading_state WHERE user_id=?1').bind(session.id).first();
        return respond({revision: row.revision, books: JSON.parse(row.books)});
      }
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return respond({error: 'JSON requis'}, 415);
      let body;
      try {
        body = await limitedJson(request);
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error('invalid');
        body.books = core.cleanBooks(body.books);
      } catch (error) { return respond({error: 'Données invalides ou trop volumineuses'}, error.message === 'too-large' ? 413 : 400); }
      const updated = await env.DB.prepare('UPDATE user_reading_state SET books=?1, revision=revision+1 WHERE user_id=?2 AND revision=?3 RETURNING revision').bind(JSON.stringify(body.books), session.id, body.revision).first();
      if (updated) return respond({revision: updated.revision});
      const row = await env.DB.prepare('SELECT revision, books FROM user_reading_state WHERE user_id=?1').bind(session.id).first();
      return respond({revision: row.revision, books: JSON.parse(row.books)}, 409);
    } catch {
      return respond({error: 'Le service est momentanément indisponible. Tes lectures restent sur cet appareil.'}, 503);
    }
  }
};
