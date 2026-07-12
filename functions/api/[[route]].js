// malem — all auth endpoints (Cloudflare Pages Function).
// Routes handled here:
//   POST /api/signup   { name, email, password }
//   POST /api/login    { email, password }
//   POST /api/logout
//   GET  /api/me
//
// Bindings (see wrangler.toml): env.DB (D1).

const SESSION_DAYS = 30;
const enc = new TextEncoder();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

const bytesToHex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const hexToBytes = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map(h => parseInt(h, 16)));

// ---- password hashing (PBKDF2-SHA256 via Web Crypto — no external deps) ----
async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return bytesToHex(bits);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derive(password, salt), salt: bytesToHex(salt) };
}
async function verifyPassword(password, saltHex, expectedHex) {
  if (!saltHex || !expectedHex) return false;
  const got = await derive(password, hexToBytes(saltHex));
  if (got.length !== expectedHex.length) return false;
  let diff = 0;                                  // constant-time-ish compare
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

// ---- session cookies ----
const cookie = (token, maxAgeSec) =>
  `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
function readCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
async function createSession(env, userId) {
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, Date.now() + SESSION_DAYS * 86400_000).run();
  return token;
}
async function userFromSession(env, request) {
  const token = readCookie(request, 'session');
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.provider, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).bind(token).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return row;
}
const publicUser = (u) => ({ email: u.email, name: u.name, provider: u.provider });

export async function onRequest(context) {
  const { request, env, params } = context;
  const seg = Array.isArray(params.route) ? params.route.join('/') : (params.route || '');
  const method = request.method;

  try {
    if (!env.DB) return json({ error: 'D1 database not bound. Set [[d1_databases]] in wrangler.toml.' }, 500);

    if (seg === 'me' && method === 'GET') {
      const u = await userFromSession(env, request);
      return u ? json(publicUser(u)) : json({ error: 'Not signed in.' }, 401);
    }

    if (seg === 'logout' && method === 'POST') {
      const token = readCookie(request, 'session');
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
    }

    if (seg === 'signup' && method === 'POST') {
      const { name, email, password } = await request.json();
      const e = (email || '').trim().toLowerCase();
      if (!e || !password) return json({ error: 'Email and password required.' }, 400);
      if (String(password).length < 4) return json({ error: 'Password must be at least 4 characters.' }, 400);
      const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(e).first();
      if (exists) return json({ error: 'An account with that email already exists.' }, 409);
      const { hash, salt } = await hashPassword(password);
      const id = crypto.randomUUID();
      const nm = (name || e.split('@')[0]).trim();
      await env.DB.prepare(
        'INSERT INTO users (id, email, name, provider, pw_hash, pw_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, e, nm, 'password', hash, salt, Date.now()).run();
      const token = await createSession(env, id);
      return json({ email: e, name: nm, provider: 'password' }, 200, { 'Set-Cookie': cookie(token, SESSION_DAYS * 86400) });
    }

    if (seg === 'login' && method === 'POST') {
      const { email, password } = await request.json();
      const e = (email || '').trim().toLowerCase();
      const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(e).first();
      if (!u || !(await verifyPassword(password, u.pw_salt, u.pw_hash)))
        return json({ error: 'That email and password combination does not match an account.' }, 401);
      const token = await createSession(env, u.id);
      return json(publicUser(u), 200, { 'Set-Cookie': cookie(token, SESSION_DAYS * 86400) });
    }

    return json({ error: 'Not found: /api/' + seg }, 404);
  } catch (err) {
    return json({ error: 'Server error: ' + (err && err.message || 'unknown') }, 500);
  }
}
