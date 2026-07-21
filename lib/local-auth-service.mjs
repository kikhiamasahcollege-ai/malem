import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';

const cryptoApi = globalThis.crypto || webcrypto;
const encoder = new TextEncoder();
const SESSION_DAYS = 30;
const MAX_AUTH_BYTES = 16 * 1024;
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const PBKDF2_ITERATIONS = 100_000;

const bytesToHex = (value) =>
  [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex) => {
  if (typeof hex !== 'string' || !/^(?:[a-f0-9]{2})+$/i.test(hex)) return new Uint8Array();
  return new Uint8Array(hex.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
};

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const validEmail = (value) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const constantTimeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const derive = async (password, salt) => {
  const key = await cryptoApi.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return bytesToHex(await cryptoApi.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: PBKDF2_ITERATIONS,
    hash: 'SHA-256',
  }, key, 256));
};

const hashPassword = async (password) => {
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  return { hash: await derive(password, salt), salt: bytesToHex(salt) };
};

const verifyPassword = async (password, salt, expected) => {
  const saltBytes = hexToBytes(salt);
  if (!saltBytes.length || !expected) return false;
  return constantTimeEqual(await derive(password, saltBytes), expected);
};

const hashToken = async (token) =>
  bytesToHex(await cryptoApi.subtle.digest('SHA-256', encoder.encode(token)));

const emptyDatabase = () => ({
  version: 1,
  users: {},
  sessions: {},
  states: {},
});

const publicUser = (user) => ({
  email: user.email,
  name: user.name,
  provider: 'password',
});

const readCookie = (request, name) => {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
};

const sessionCookie = (request, token, maxAge) => {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `malem_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
};

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
  if (value.version !== 1) {
    throw Object.assign(new Error('Unsupported state version.'), { status: 400 });
  }
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

export const createLocalAuthService = async ({ dataFile }) => {
  const file = resolve(dataFile);
  let database = emptyDatabase();
  let writeQueue = Promise.resolve();
  const rateWindows = new Map();

  try {
    database = { ...emptyDatabase(), ...JSON.parse(await readFile(file, 'utf8')) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const persist = () => {
    const snapshot = JSON.stringify(database, null, 2);
    writeQueue = writeQueue.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await rename(temporary, file);
    });
    return writeQueue;
  };

  const enforceRateLimit = (request) => {
    const key = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'local';
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

  const createSession = async (userId) => {
    const token = `${cryptoApi.randomUUID()}${cryptoApi.randomUUID()}`.replaceAll('-', '');
    database.sessions[await hashToken(token)] = {
      userId,
      expiresAt: Date.now() + SESSION_DAYS * 86_400_000,
    };
    await persist();
    return token;
  };

  const authenticate = async (request) => {
    const token = readCookie(request, 'malem_session');
    if (!token) return null;
    const tokenHash = await hashToken(token);
    const session = database.sessions[tokenHash];
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      delete database.sessions[tokenHash];
      await persist();
      return null;
    }
    const user = Object.values(database.users).find((candidate) => candidate.id === session.userId);
    return user ? { user, tokenHash } : null;
  };

  const communityEntries = () => {
    const entries = [];
    Object.values(database.users).forEach((user) => {
      const state = database.states[user.id]?.state;
      const activeTrip = (state?.trips || []).find((trip) => trip.id === state?.activeTrip)
        || (state?.trips || []).at(-1);
      (state?.journal || []).forEach((entry) => {
        if (!entry?.publicEntry) return;
        entries.push({
          id: String(entry.id || ''),
          title: String(entry.title || 'Untitled entry').slice(0, 160),
          did: String(entry.did || '').slice(0, 2_000),
          change: String(entry.change || '').slice(0, 2_000),
          accessAccuracy: String(entry.accessAccuracy || '').slice(0, 40),
          dietAccuracy: String(entry.dietAccuracy || '').slice(0, 40),
          author: user.name,
          destination: String(entry.destination || activeTrip?.destination || 'unknown').slice(0, 120),
          date: String(entry.date || '').slice(0, 40),
          tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 12).map((tag) => String(tag).slice(0, 40)) : [],
          updatedAt: Number(database.states[user.id]?.updatedAt || 0),
        });
      });
    });
    return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  };

  const handle = async (request) => {
    const url = new URL(request.url);
    const segment = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
    const method = request.method.toUpperCase();

    try {
      if (segment === 'health' && method === 'GET') return json({ ok: true, auth: true });
      if (segment === 'community' && method === 'GET') return json({ entries: communityEntries() });

      if ((segment === 'signup' || segment === 'login') && method === 'POST') enforceRateLimit(request);

      if (segment === 'signup' && method === 'POST') {
        const body = await parseBody(request, MAX_AUTH_BYTES);
        const credentials = validateCredentials(body, true);
        if (database.users[credentials.email]) return json({ error: 'An account with that email already exists.' }, 409);
        const password = await hashPassword(credentials.password);
        const user = {
          id: cryptoApi.randomUUID(),
          email: credentials.email,
          name: credentials.name,
          pwHash: password.hash,
          pwSalt: password.salt,
          createdAt: Date.now(),
        };
        database.users[user.email] = user;
        database.states[user.id] = {
          state: { version: 1, profile: null, trips: [], activeTrip: null, group: [], journal: [] },
          updatedAt: Date.now(),
        };
        await persist();
        const token = await createSession(user.id);
        return json(publicUser(user), 201, {
          'set-cookie': sessionCookie(request, token, SESSION_DAYS * 86_400),
        });
      }

      if (segment === 'login' && method === 'POST') {
        const body = await parseBody(request, MAX_AUTH_BYTES);
        const credentials = validateCredentials(body, false);
        const user = database.users[credentials.email];
        if (!user || !(await verifyPassword(credentials.password, user.pwSalt, user.pwHash))) {
          return json({ error: 'That email and password combination does not match an account.' }, 401);
        }
        const token = await createSession(user.id);
        return json(publicUser(user), 200, {
          'set-cookie': sessionCookie(request, token, SESSION_DAYS * 86_400),
        });
      }

      if (segment === 'logout' && method === 'POST') {
        const auth = await authenticate(request);
        if (auth) {
          delete database.sessions[auth.tokenHash];
          await persist();
        }
        return json({ ok: true }, 200, {
          'set-cookie': sessionCookie(request, '', 0),
        });
      }

      if (segment === 'account' && method === 'DELETE') {
        const auth = await authenticate(request);
        if (!auth) return json({ error: 'Not signed in.' }, 401);
        Object.entries(database.sessions).forEach(([tokenHash, session]) => {
          if (session.userId === auth.user.id) delete database.sessions[tokenHash];
        });
        delete database.states[auth.user.id];
        delete database.users[auth.user.email];
        await persist();
        return json({ ok: true }, 200, {
          'set-cookie': sessionCookie(request, '', 0),
        });
      }

      if (segment === 'me' && method === 'GET') {
        const auth = await authenticate(request);
        return auth ? json(publicUser(auth.user)) : json({ error: 'Not signed in.' }, 401);
      }

      if (segment === 'state' && method === 'GET') {
        const auth = await authenticate(request);
        if (!auth) return json({ error: 'Not signed in.' }, 401);
        return json(database.states[auth.user.id]?.state
          || { version: 1, profile: null, trips: [], activeTrip: null, group: [], journal: [] });
      }

      if (segment === 'state' && method === 'PUT') {
        const auth = await authenticate(request);
        if (!auth) return json({ error: 'Not signed in.' }, 401);
        const state = validateState(await parseBody(request, MAX_STATE_BYTES));
        database.states[auth.user.id] = { state, updatedAt: Date.now() };
        await persist();
        return json({ ok: true, updatedAt: database.states[auth.user.id].updatedAt });
      }

      return json({ error: `Not found: ${url.pathname}` }, 404);
    } catch (error) {
      const status = Number(error.status) || 500;
      return json({
        error: status >= 500 ? 'The account service could not complete the request.' : error.message,
      }, status);
    }
  };

  return {
    handle,
    flush: () => writeQueue,
  };
};
