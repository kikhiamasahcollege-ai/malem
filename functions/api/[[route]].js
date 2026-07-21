// Malem identity and state API for Cloudflare Pages Functions + D1.
// The local Node server exposes the same contract.

const SESSION_DAYS = 30;
const MAX_AUTH_BYTES = 16 * 1024;
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const rateWindows = new Map();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });

const bytesToHex = (value) =>
  [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex) => {
  if (typeof hex !== 'string' || !/^(?:[a-f0-9]{2})+$/i.test(hex)) return new Uint8Array();
  return new Uint8Array(hex.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
};

const derive = async (password, salt) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return bytesToHex(await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: 100_000,
    hash: 'SHA-256',
  }, key, 256));
};

const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derive(password, salt), salt: bytesToHex(salt) };
};

const constantTimeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const verifyPassword = async (password, saltHex, expected) => {
  const salt = hexToBytes(saltHex);
  if (!salt.length || !expected) return false;
  return constantTimeEqual(await derive(password, salt), expected);
};

const hashToken = async (token) =>
  bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const validEmail = (value) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const publicUser = (user) => ({
  email: user.email,
  name: user.name,
  provider: user.provider,
});

const readCookie = (request, name) => {
  const source = request.headers.get('cookie') || '';
  const match = source.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
};

const sessionCookie = (token, maxAge) =>
  `malem_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const parseBody = async (request, limit) => {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  const text = await request.text();
  if (encoder.encode(text).byteLength > limit) {
    throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
};

const validateCredentials = ({ name, email, password }, includeName) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || normalizedEmail.split('@')[0] || '').trim();
  if (!validEmail(normalizedEmail)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw Object.assign(new Error('Password must be between 8 and 128 characters.'), { status: 400 });
  }
  if (includeName && (!normalizedName || normalizedName.length > 80)) {
    throw Object.assign(new Error('Name must be between 1 and 80 characters.'), { status: 400 });
  }
  return { email: normalizedEmail, name: normalizedName, password };
};

const validateState = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('State must be an object.'), { status: 400 });
  }
  const allowed = new Set(['version', 'profile', 'trips', 'activeTrip', 'group', 'journal']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw Object.assign(new Error('State contains unsupported fields.'), { status: 400 });
  }
  if (value.version !== 1) throw Object.assign(new Error('Unsupported state version.'), { status: 400 });
  if (!Array.isArray(value.trips) || value.trips.length > 100) {
    throw Object.assign(new Error('State must contain no more than 100 trips.'), { status: 400 });
  }
  if (!Array.isArray(value.group) || value.group.length > 50) {
    throw Object.assign(new Error('State must contain no more than 50 group members.'), { status: 400 });
  }
  if (!Array.isArray(value.journal) || value.journal.length > 500) {
    throw Object.assign(new Error('State must contain no more than 500 journal entries.'), { status: 400 });
  }
  return JSON.parse(JSON.stringify(value));
};

const enforceRateLimit = (request) => {
  const key = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > 12) {
    throw Object.assign(new Error('Too many sign-in attempts. Wait a minute and try again.'), { status: 429 });
  }
};

const createSession = async (env, userId) => {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
  ).bind(await hashToken(token), userId, Date.now() + SESSION_DAYS * 86_400_000).run();
  return token;
};

const authenticate = async (env, request) => {
  const token = readCookie(request, 'malem_session');
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.provider, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
  ).bind(tokenHash).first();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return { user: row, tokenHash };
};

const emptyState = () => ({
  version: 1,
  profile: null,
  trips: [],
  activeTrip: null,
  group: [],
  journal: [],
});

const publicProjection = (state) => {
  const activeTrip = (state.trips || []).find((trip) => trip.id === state.activeTrip)
    || (state.trips || []).at(-1);
  return (state.journal || []).filter((entry) => entry?.publicEntry).slice(0, 100).map((entry) => ({
    id: String(entry.id || ''),
    title: String(entry.title || 'Untitled entry').slice(0, 160),
    did: String(entry.did || '').slice(0, 2_000),
    change: String(entry.change || '').slice(0, 2_000),
    accessAccuracy: String(entry.accessAccuracy || '').slice(0, 40),
    dietAccuracy: String(entry.dietAccuracy || '').slice(0, 40),
    destination: String(entry.destination || activeTrip?.destination || 'unknown').slice(0, 120),
    date: String(entry.date || '').slice(0, 40),
    tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 12).map((tag) => String(tag).slice(0, 40)) : [],
  }));
};

const segmentFor = (params) =>
  Array.isArray(params.route) ? params.route.join('/') : String(params.route || '');

export async function onRequest(context) {
  const { request, env, params } = context;
  const segment = segmentFor(params).replace(/\/$/, '');
  const method = request.method.toUpperCase();

  try {
    if (!env.DB) return json({ error: 'Account storage is not configured.' }, 503);

    if (segment === 'health' && method === 'GET') return json({ ok: true, auth: true });

    if (segment === 'community' && method === 'GET') {
      const cacheKey = new Request(new URL('/api/community', request.url), { method: 'GET' });
      const cached = await caches.default.match(cacheKey);
      if (cached) return cached;
      const rows = await env.DB.prepare(
        `SELECT u.name AS author, s.public_json, s.updated_at
           FROM user_state s JOIN users u ON u.id = s.user_id
          ORDER BY s.updated_at DESC LIMIT 100`,
      ).all();
      const entries = [];
      (rows.results || []).forEach((row) => {
        let projected;
        try { projected = JSON.parse(row.public_json || '[]'); } catch { return; }
        projected.forEach((entry) => {
          if (entries.length >= 100) return;
          entries.push({
            ...entry,
            author: row.author,
            updatedAt: row.updated_at,
          });
        });
      });
      const response = json({ entries }, 200, {
        'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
      });
      context.waitUntil(caches.default.put(cacheKey, response.clone()));
      return response;
    }

    if ((segment === 'signup' || segment === 'login') && method === 'POST') enforceRateLimit(request);

    if (segment === 'signup' && method === 'POST') {
      const credentials = validateCredentials(await parseBody(request, MAX_AUTH_BYTES), true);
      const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
        .bind(credentials.email).first();
      if (exists) return json({ error: 'An account with that email already exists.' }, 409);

      const password = await hashPassword(credentials.password);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO users (id, email, name, provider, pw_hash, pw_salt, created_at)
         VALUES (?, ?, ?, 'password', ?, ?, ?)`,
      ).bind(id, credentials.email, credentials.name, password.hash, password.salt, Date.now()).run();
      await env.DB.prepare(
        `INSERT INTO user_state (user_id, state_json, public_json, updated_at)
         VALUES (?, ?, '[]', ?)`,
      ).bind(id, JSON.stringify(emptyState()), Date.now()).run();
      const token = await createSession(env, id);
      return json({
        email: credentials.email,
        name: credentials.name,
        provider: 'password',
      }, 201, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86_400) });
    }

    if (segment === 'login' && method === 'POST') {
      const credentials = validateCredentials(await parseBody(request, MAX_AUTH_BYTES), false);
      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
        .bind(credentials.email).first();
      if (!user || !(await verifyPassword(credentials.password, user.pw_salt, user.pw_hash))) {
        return json({ error: 'That email and password combination does not match an account.' }, 401);
      }
      const token = await createSession(env, user.id);
      return json(publicUser(user), 200, {
        'set-cookie': sessionCookie(token, SESSION_DAYS * 86_400),
      });
    }

    if (segment === 'logout' && method === 'POST') {
      const auth = await authenticate(env, request);
      if (auth) {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(auth.tokenHash).run();
      }
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
    }

    if (segment === 'account' && method === 'DELETE') {
      const auth = await authenticate(env, request);
      if (!auth) return json({ error: 'Not signed in.' }, 401);
      await env.DB.prepare('DELETE FROM user_state WHERE user_id = ?').bind(auth.user.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(auth.user.id).run();
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(auth.user.id).run();
      context.waitUntil(caches.default.delete(new Request(new URL('/api/community', request.url), { method: 'GET' })));
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
    }

    if (segment === 'me' && method === 'GET') {
      const auth = await authenticate(env, request);
      return auth ? json(publicUser(auth.user)) : json({ error: 'Not signed in.' }, 401);
    }

    if (segment === 'state' && method === 'GET') {
      const auth = await authenticate(env, request);
      if (!auth) return json({ error: 'Not signed in.' }, 401);
      const row = await env.DB.prepare('SELECT state_json FROM user_state WHERE user_id = ?')
        .bind(auth.user.id).first();
      if (!row) return json(emptyState());
      try { return json(JSON.parse(row.state_json)); }
      catch { return json(emptyState()); }
    }

    if (segment === 'state' && method === 'PUT') {
      const auth = await authenticate(env, request);
      if (!auth) return json({ error: 'Not signed in.' }, 401);
      const state = validateState(await parseBody(request, MAX_STATE_BYTES));
      const updatedAt = Date.now();
      await env.DB.prepare(
        `INSERT INTO user_state (user_id, state_json, public_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           state_json = excluded.state_json,
           public_json = excluded.public_json,
           updated_at = excluded.updated_at`,
      ).bind(auth.user.id, JSON.stringify(state), JSON.stringify(publicProjection(state)), updatedAt).run();
      context.waitUntil(caches.default.delete(new Request(new URL('/api/community', request.url), { method: 'GET' })));
      return json({ ok: true, updatedAt });
    }

    return json({ error: `Not found: /api/${segment}` }, 404);
  } catch (error) {
    const status = Number(error.status) || 500;
    return json({
      error: status >= 500 ? 'The account service could not complete the request.' : error.message,
    }, status);
  }
}
