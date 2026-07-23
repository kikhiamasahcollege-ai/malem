// Malem identity and state API for Cloudflare Pages Functions + D1.
// The local Node server exposes the same contract.

import {
  TRIP_ROLES,
  applyTripOperations,
  canEditTrip,
  canManageTrip,
  canVoteOnTrip,
  normalizeTripDocument,
} from '../../lib/trip-contract.mjs';
import { discoverPlaces } from '../../lib/place-service.mjs';

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

const enforceRateLimit = (request, scope = 'auth', limit = 12) => {
  const key = `${scope}:${request.headers.get('cf-connecting-ip') || 'unknown'}`;
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw Object.assign(new Error(`Too many ${scope.replace('-', ' ')} requests. Wait a minute and try again.`), { status: 429 });
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

const tripMembership = (env, tripId, userId) => env.DB.prepare(
  'SELECT role, joined_at, updated_at FROM trip_members WHERE trip_id = ? AND user_id = ?',
).bind(tripId, userId).first();

const ensureTripMigration = async (env, user) => {
  const migrated = await env.DB.prepare('SELECT version FROM user_migrations WHERE user_id = ?')
    .bind(user.id).first();
  if (Number(migrated?.version || 0) >= 2) return false;
  const stateRow = await env.DB.prepare('SELECT state_json FROM user_state WHERE user_id = ?')
    .bind(user.id).first();
  let state = {};
  try { state = JSON.parse(stateRow?.state_json || '{}'); } catch {}
  const legacyTrips = Array.isArray(state.trips) ? state.trips : [];
  const activeTripId = state.activeTrip || legacyTrips.at(-1)?.id || '';
  const statements = [];
  for (const legacyTrip of legacyTrips) {
    let tripId = String(legacyTrip?.id || crypto.randomUUID());
    const collision = await env.DB.prepare('SELECT owner_user_id FROM trips WHERE id = ?').bind(tripId).first();
    if (collision && collision.owner_user_id !== user.id) tripId = `${tripId}-${crypto.randomUUID().slice(0, 8)}`;
    const isActive = String(legacyTrip?.id || '') === String(activeTripId);
    const document = normalizeTripDocument({ ...legacyTrip, id: tripId }, {
      actor: user.id,
      group: isActive ? state.group : [],
      journal: isActive ? state.journal : [],
      cryptoApi: crypto,
    });
    const now = Date.now();
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO trips
          (id, owner_user_id, title, destination, start_date, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '', 'active', ?, ?)`,
      ).bind(
        tripId, user.id, document.summary || document.destination, document.destination,
        document.arrivalDate || '', Number(document.createdAt) || now, now,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO trip_documents
          (trip_id, document_json, schema_version, revision, last_editor_user_id, updated_at)
         VALUES (?, ?, 2, 1, ?, ?)`,
      ).bind(tripId, JSON.stringify(document), user.id, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO trip_members
          (trip_id, user_id, role, invited_by, joined_at, updated_at)
         VALUES (?, ?, 'owner', NULL, ?, ?)`,
      ).bind(tripId, user.id, now, now),
    );
  }
  statements.push(env.DB.prepare(
    `INSERT INTO user_migrations (user_id, version, migrated_at) VALUES (?, 2, ?)
     ON CONFLICT(user_id) DO UPDATE SET version = 2, migrated_at = excluded.migrated_at`,
  ).bind(user.id, Date.now()));
  await env.DB.batch(statements);
  return true;
};

const requireAuth = async (env, request) => {
  const auth = await authenticate(env, request);
  if (!auth) throw Object.assign(new Error('Not signed in.'), { status: 401 });
  await ensureTripMigration(env, auth.user);
  return auth;
};

const requireTrip = async (env, tripId, userId, predicate = () => true, message = 'You do not have access to this trip.') => {
  const membership = await tripMembership(env, tripId, userId);
  if (!membership || !predicate(membership.role)) {
    throw Object.assign(new Error(message), { status: membership ? 403 : 404 });
  }
  return membership;
};

const parseDocument = (value) => {
  try { return JSON.parse(value || '{}'); } catch { return null; }
};

const publicMemberRows = (rows) => (rows || []).map((member) => ({
  userId: member.user_id,
  name: member.name || 'Traveler',
  role: member.role,
  joinedAt: member.joined_at,
  updatedAt: member.updated_at,
}));

const loadTripPayload = async (env, tripId, userId, { includeCollaboration = true } = {}) => {
  const row = await env.DB.prepare(
    `SELECT t.*, d.document_json, d.schema_version, d.revision, d.updated_at AS document_updated_at,
            m.role
       FROM trips t
       JOIN trip_documents d ON d.trip_id = t.id
       JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ?
      WHERE t.id = ?`,
  ).bind(userId, tripId).first();
  if (!row) return null;
  const payload = {
    metadata: {
      id: row.id,
      ownerUserId: row.owner_user_id,
      title: row.title,
      destination: row.destination,
      startDate: row.start_date || '',
      endDate: row.end_date || '',
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    trip: parseDocument(row.document_json),
    revision: row.revision,
    role: row.role,
    currentUserId: userId,
    updatedAt: row.document_updated_at,
  };
  if (!includeCollaboration) return payload;
  const [members, vibes, itinerary] = await Promise.all([
    env.DB.prepare(
      `SELECT m.user_id, m.role, m.joined_at, m.updated_at, u.name
         FROM trip_members m JOIN users u ON u.id = m.user_id
        WHERE m.trip_id = ? ORDER BY m.joined_at ASC`,
    ).bind(tripId).all(),
    env.DB.prepare(
      `SELECT trip_id, user_id, primary_vibe, secondary_vibe, updated_at
         FROM trip_vibe_votes WHERE trip_id = ?`,
    ).bind(tripId).all(),
    env.DB.prepare(
      `SELECT trip_id, item_id, user_id, value, note, updated_at
         FROM itinerary_item_votes WHERE trip_id = ?`,
    ).bind(tripId).all(),
  ]);
  payload.members = publicMemberRows(members.results);
  payload.votes = {
    vibes: (vibes.results || []).map((vote) => ({
      tripId: vote.trip_id, userId: vote.user_id, primaryVibe: vote.primary_vibe,
      secondaryVibe: vote.secondary_vibe || '', updatedAt: vote.updated_at,
    })),
    itinerary: (itinerary.results || []).map((vote) => ({
      tripId: vote.trip_id, itemId: vote.item_id, userId: vote.user_id,
      value: vote.value, note: vote.note || '', updatedAt: vote.updated_at,
    })),
  };
  return payload;
};

const collaborationContext = async (env, tripId) => {
  const [documentRow, memberCountRow, vibeRows, voteRows] = await Promise.all([
    env.DB.prepare('SELECT document_json, revision FROM trip_documents WHERE trip_id = ?').bind(tripId).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM trip_members WHERE trip_id = ?').bind(tripId).first(),
    env.DB.prepare('SELECT primary_vibe, secondary_vibe FROM trip_vibe_votes WHERE trip_id = ?').bind(tripId).all(),
    env.DB.prepare('SELECT item_id, value, note FROM itinerary_item_votes WHERE trip_id = ?').bind(tripId).all(),
  ]);
  const vibeCounts = {};
  (vibeRows.results || []).forEach((vote) => {
    vibeCounts[vote.primary_vibe] = (vibeCounts[vote.primary_vibe] || 0) + 1;
    if (vote.secondary_vibe) vibeCounts[vote.secondary_vibe] = (vibeCounts[vote.secondary_vibe] || 0) + 0.5;
  });
  const byItem = {};
  (voteRows.results || []).forEach((vote) => {
    const current = byItem[vote.item_id] || { itemId: vote.item_id, score: 0, positive: 0, negative: 0, notes: [] };
    current.score += vote.value;
    if (vote.value > 0) current.positive += 1;
    if (vote.value < 0) current.negative += 1;
    if (vote.note) current.notes.push(vote.note);
    byItem[vote.item_id] = current;
  });
  const rankedVibes = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1]);
  const document = parseDocument(documentRow?.document_json);
  const lockedItemIds = [];
  document?.bundle?.itinerary?.days?.forEach((day) => day.blocks?.forEach((block) => {
    if (block.locked || block.origin === 'manual') lockedItemIds.push(block.id);
  }));
  return {
    revision: Number(documentRow?.revision || 0),
    memberCount: Number(memberCountRow?.count || 0),
    vibeResult: {
      primary: rankedVibes[0]?.[0] || null,
      secondary: rankedVibes[1]?.[0] || null,
      counts: Object.fromEntries(rankedVibes),
    },
    itineraryFeedback: Object.values(byItem),
    lockedItemIds,
    sharedConstraints: Array.isArray(document?.collaboration?.sharedConstraints)
      ? document.collaboration.sharedConstraints : [],
  };
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

const handleTripRoutes = async ({ request, env }, auth, parts) => {
  const method = request.method.toUpperCase();

  if (parts.length === 1 && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT t.id
         FROM trips t JOIN trip_members m ON m.trip_id = t.id
        WHERE m.user_id = ? ORDER BY t.updated_at DESC LIMIT 100`,
    ).bind(auth.user.id).all();
    const trips = await Promise.all((rows.results || []).map((row) =>
      loadTripPayload(env, row.id, auth.user.id, { includeCollaboration: false })));
    return json({ trips: trips.filter(Boolean) });
  }

  if (parts.length === 1 && method === 'POST') {
    const body = await parseBody(request, MAX_STATE_BYTES);
    const document = normalizeTripDocument(body.trip, { actor: auth.user.id, cryptoApi: crypto });
    const exists = await env.DB.prepare('SELECT id FROM trips WHERE id = ?').bind(document.id).first();
    if (exists) return json({ error: 'A trip with this ID already exists.' }, 409);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO trips
          (id, owner_user_id, title, destination, start_date, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '', 'active', ?, ?)`,
      ).bind(
        document.id, auth.user.id, document.summary || document.destination,
        document.destination, document.arrivalDate || '', Number(document.createdAt) || now, now,
      ),
      env.DB.prepare(
        `INSERT INTO trip_documents
          (trip_id, document_json, schema_version, revision, last_editor_user_id, updated_at)
         VALUES (?, ?, 2, 1, ?, ?)`,
      ).bind(document.id, JSON.stringify(document), auth.user.id, now),
      env.DB.prepare(
        `INSERT INTO trip_members
          (trip_id, user_id, role, invited_by, joined_at, updated_at)
         VALUES (?, ?, 'owner', NULL, ?, ?)`,
      ).bind(document.id, auth.user.id, now, now),
    ]);
    return json(await loadTripPayload(env, document.id, auth.user.id), 201);
  }

  const tripId = parts[1];
  if (!tripId) return null;

  if (parts.length === 2 && method === 'GET') {
    await requireTrip(env, tripId, auth.user.id);
    return json(await loadTripPayload(env, tripId, auth.user.id));
  }

  if (parts.length === 2 && method === 'DELETE') {
    await requireTrip(env, tripId, auth.user.id, canManageTrip, 'Only the trip owner can delete this trip.');
    await env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(tripId).run();
    return json({ ok: true });
  }

  if (parts[2] === 'document' && parts.length === 3 && method === 'PATCH') {
    await requireTrip(env, tripId, auth.user.id, canEditTrip, 'This trip is read-only for your role.');
    const body = await parseBody(request, MAX_STATE_BYTES);
    const clientMutationId = String(body.clientMutationId || '').slice(0, 160);
    if (!clientMutationId) return json({ error: 'clientMutationId is required.' }, 400);
    const prior = await env.DB.prepare(
      'SELECT id, result_revision FROM trip_mutations WHERE trip_id = ? AND client_mutation_id = ?',
    ).bind(tripId, clientMutationId).first();
    if (prior) return json({ ...(await loadTripPayload(env, tripId, auth.user.id)), mutation: prior, idempotent: true });
    const record = await env.DB.prepare(
      'SELECT document_json, revision FROM trip_documents WHERE trip_id = ?',
    ).bind(tripId).first();
    if (!record) return json({ error: 'Trip document not found.' }, 404);
    if (Number(body.baseRevision) !== Number(record.revision)) {
      return json({ error: 'This trip changed in another session.', current: await loadTripPayload(env, tripId, auth.user.id) }, 409);
    }
    const before = parseDocument(record.document_json);
    const after = applyTripOperations(before, body.operations, { actor: auth.user.id, cryptoApi: crypto });
    const now = Date.now();
    const mutationId = crypto.randomUUID();
    const nextRevision = Number(record.revision) + 1;
    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE trip_documents
            SET document_json = ?, revision = ?, last_editor_user_id = ?, updated_at = ?
          WHERE trip_id = ? AND revision = ?`,
      ).bind(JSON.stringify(after), nextRevision, auth.user.id, now, tripId, record.revision),
      env.DB.prepare(
        `UPDATE trips SET title = ?, destination = ?, updated_at = ?
          WHERE id = ? AND EXISTS (
            SELECT 1 FROM trip_documents WHERE trip_id = ? AND revision = ?
          )`,
      ).bind(after.summary || after.destination, after.destination, now, tripId, tripId, nextRevision),
      env.DB.prepare(
        `INSERT INTO trip_mutations
          (id, trip_id, actor_user_id, client_mutation_id, base_revision, result_revision,
           operation_json, before_json, after_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?
          WHERE EXISTS (SELECT 1 FROM trip_documents WHERE trip_id = ? AND revision = ?)`,
      ).bind(
        mutationId, tripId, auth.user.id, clientMutationId, record.revision, nextRevision,
        JSON.stringify(body.operations), JSON.stringify(before), now, tripId, nextRevision,
      ),
    ]);
    if (!Number(results[0]?.meta?.changes || 0)) {
      return json({ error: 'This trip changed in another session.', current: await loadTripPayload(env, tripId, auth.user.id) }, 409);
    }
    return json({
      ...(await loadTripPayload(env, tripId, auth.user.id)),
      mutation: {
        id: mutationId, tripId, actorUserId: auth.user.id, clientMutationId,
        baseRevision: record.revision, resultRevision: nextRevision, operations: body.operations, createdAt: now,
      },
    });
  }

  if (parts[2] === 'history' && parts.length === 3 && method === 'GET') {
    await requireTrip(env, tripId, auth.user.id);
    const rows = await env.DB.prepare(
      `SELECT id, actor_user_id, client_mutation_id, base_revision, result_revision,
              operation_json, created_at
         FROM trip_mutations WHERE trip_id = ? ORDER BY created_at DESC LIMIT 50`,
    ).bind(tripId).all();
    return json({ history: (rows.results || []).map((row) => ({
      id: row.id, actorUserId: row.actor_user_id, clientMutationId: row.client_mutation_id,
      baseRevision: row.base_revision, resultRevision: row.result_revision,
      operations: parseDocument(row.operation_json) || [], createdAt: row.created_at,
    })) });
  }

  if (parts[2] === 'undo' && parts.length === 3 && method === 'POST') {
    await requireTrip(env, tripId, auth.user.id, canEditTrip, 'This trip is read-only for your role.');
    const body = await parseBody(request, MAX_AUTH_BYTES);
    const original = await env.DB.prepare(
      `SELECT id, result_revision, before_json FROM trip_mutations
        WHERE trip_id = ? AND id = ?`,
    ).bind(tripId, body.mutationId).first();
    if (!original || !original.before_json) return json({ error: 'The change to undo was not found.' }, 404);
    const record = await env.DB.prepare('SELECT document_json, revision FROM trip_documents WHERE trip_id = ?')
      .bind(tripId).first();
    if (Number(record?.revision) !== Number(original.result_revision) || Number(body.baseRevision) !== Number(record?.revision)) {
      return json({ error: 'Undo is available only before another change is saved.', current: await loadTripPayload(env, tripId, auth.user.id) }, 409);
    }
    const restored = normalizeTripDocument(parseDocument(original.before_json), { actor: auth.user.id, cryptoApi: crypto });
    const now = Date.now();
    const clientMutationId = String(body.clientMutationId || `undo-${original.id}`).slice(0, 160);
    const mutationId = crypto.randomUUID();
    const nextRevision = Number(record.revision) + 1;
    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE trip_documents SET document_json = ?, revision = ?, last_editor_user_id = ?, updated_at = ?
          WHERE trip_id = ? AND revision = ?`,
      ).bind(JSON.stringify(restored), nextRevision, auth.user.id, now, tripId, record.revision),
      env.DB.prepare(
        `INSERT INTO trip_mutations
          (id, trip_id, actor_user_id, client_mutation_id, base_revision, result_revision,
           operation_json, before_json, after_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?
          WHERE EXISTS (SELECT 1 FROM trip_documents WHERE trip_id = ? AND revision = ?)`,
      ).bind(
        mutationId, tripId, auth.user.id, clientMutationId, record.revision, nextRevision,
        JSON.stringify([{ type: 'undo', mutationId: original.id }]), record.document_json,
        now, tripId, nextRevision,
      ),
    ]);
    if (!Number(results[0]?.meta?.changes || 0)) {
      return json({ error: 'This trip changed before undo could be saved.', current: await loadTripPayload(env, tripId, auth.user.id) }, 409);
    }
    return json({ ...(await loadTripPayload(env, tripId, auth.user.id)), mutation: { id: mutationId, resultRevision: nextRevision } });
  }

  if (parts[2] === 'members' && parts.length === 3 && method === 'GET') {
    await requireTrip(env, tripId, auth.user.id);
    const rows = await env.DB.prepare(
      `SELECT m.user_id, m.role, m.joined_at, m.updated_at, u.name
         FROM trip_members m JOIN users u ON u.id = m.user_id
        WHERE m.trip_id = ? ORDER BY m.joined_at ASC`,
    ).bind(tripId).all();
    return json({ members: publicMemberRows(rows.results) });
  }

  if (parts[2] === 'members' && parts[3] && parts.length === 4 && method === 'PATCH') {
    await requireTrip(env, tripId, auth.user.id, canManageTrip, 'Only the trip owner can change roles.');
    const body = await parseBody(request, MAX_AUTH_BYTES);
    if (![TRIP_ROLES.collaborator, TRIP_ROLES.viewer].includes(body.role)) return json({ error: 'Choose collaborator or viewer.' }, 400);
    const target = await tripMembership(env, tripId, parts[3]);
    if (!target) return json({ error: 'Trip member not found.' }, 404);
    if (target.role === TRIP_ROLES.owner) return json({ error: 'The owner role cannot be changed.' }, 400);
    await env.DB.prepare('UPDATE trip_members SET role = ?, updated_at = ? WHERE trip_id = ? AND user_id = ?')
      .bind(body.role, Date.now(), tripId, parts[3]).run();
    return handleTripRoutes({ request: new Request(request.url, { method: 'GET', headers: request.headers }), env }, auth, ['trips', tripId, 'members']);
  }

  if (parts[2] === 'members' && parts[3] && parts.length === 4 && method === 'DELETE') {
    const membership = await requireTrip(env, tripId, auth.user.id);
    const target = await tripMembership(env, tripId, parts[3]);
    if (!target) return json({ error: 'Trip member not found.' }, 404);
    if (target.role === TRIP_ROLES.owner) return json({ error: 'The owner cannot be removed from the trip.' }, 400);
    if (parts[3] !== auth.user.id && !canManageTrip(membership.role)) return json({ error: 'Only the owner can remove another traveler.' }, 403);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?').bind(tripId, parts[3]),
      env.DB.prepare('DELETE FROM trip_vibe_votes WHERE trip_id = ? AND user_id = ?').bind(tripId, parts[3]),
      env.DB.prepare('DELETE FROM itinerary_item_votes WHERE trip_id = ? AND user_id = ?').bind(tripId, parts[3]),
    ]);
    return json({ ok: true });
  }

  if (parts[2] === 'invites' && parts.length === 3 && method === 'GET') {
    await requireTrip(env, tripId, auth.user.id, canManageTrip, 'Only the trip owner can view invitations.');
    const rows = await env.DB.prepare(
      `SELECT id, trip_id, role, invited_by, expires_at, max_uses, use_count,
              revoked_at, created_at, last_used_at
         FROM trip_invites WHERE trip_id = ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(tripId).all();
    return json({ invites: rows.results || [] });
  }

  if (parts[2] === 'invites' && parts.length === 3 && method === 'POST') {
    await requireTrip(env, tripId, auth.user.id, canManageTrip, 'Only the trip owner can create invitations.');
    enforceRateLimit(request, 'invite creation', 8);
    const body = await parseBody(request, MAX_AUTH_BYTES);
    const role = body.role === TRIP_ROLES.collaborator ? TRIP_ROLES.collaborator : TRIP_ROLES.viewer;
    const expiresInDays = Math.min(30, Math.max(1, Number(body.expiresInDays) || 7));
    const maxUses = Math.min(50, Math.max(1, Number(body.maxUses) || 1));
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
    const tokenHash = await hashToken(token);
    const now = Date.now();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO trip_invites
        (id, token_hash, trip_id, role, invited_by, expires_at, max_uses, use_count, revoked_at, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL)`,
    ).bind(id, tokenHash, tripId, role, auth.user.id, now + expiresInDays * 86_400_000, maxUses, now).run();
    const origin = String(env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '');
    return json({
      invite: { id, tripId, role, invitedBy: auth.user.id, expiresAt: now + expiresInDays * 86_400_000, maxUses, useCount: 0, createdAt: now },
      token,
      url: `${origin}/#/invite/${encodeURIComponent(token)}`,
    }, 201);
  }

  if (parts[2] === 'invites' && parts[3] && parts.length === 4 && method === 'DELETE') {
    await requireTrip(env, tripId, auth.user.id, canManageTrip, 'Only the trip owner can revoke invitations.');
    const result = await env.DB.prepare('UPDATE trip_invites SET revoked_at = ? WHERE trip_id = ? AND id = ?')
      .bind(Date.now(), tripId, parts[3]).run();
    return Number(result.meta?.changes || 0) ? json({ ok: true }) : json({ error: 'Invitation not found.' }, 404);
  }

  if (parts[2] === 'vibes' && parts[3] === 'vote' && method === 'POST') {
    await requireTrip(env, tripId, auth.user.id, canVoteOnTrip, 'Passenger princess members cannot vote.');
    const body = await parseBody(request, MAX_AUTH_BYTES);
    const primaryVibe = String(body.primaryVibe || '').trim().slice(0, 80);
    const secondaryVibe = String(body.secondaryVibe || '').trim().slice(0, 80);
    if (!primaryVibe) return json({ error: 'Choose a primary vibe.' }, 400);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO trip_vibe_votes (trip_id, user_id, primary_vibe, secondary_vibe, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(trip_id, user_id) DO UPDATE SET
         primary_vibe = excluded.primary_vibe,
         secondary_vibe = excluded.secondary_vibe,
         updated_at = excluded.updated_at`,
    ).bind(tripId, auth.user.id, primaryVibe, secondaryVibe && secondaryVibe !== primaryVibe ? secondaryVibe : '', now).run();
    const rows = await env.DB.prepare('SELECT * FROM trip_vibe_votes WHERE trip_id = ?').bind(tripId).all();
    return json({ votes: rows.results || [], context: await collaborationContext(env, tripId) });
  }

  if (parts[2] === 'itinerary' && parts[3] && parts[4] === 'vote' && method === 'POST') {
    await requireTrip(env, tripId, auth.user.id, canVoteOnTrip, 'Passenger princess members cannot vote.');
    const payload = await loadTripPayload(env, tripId, auth.user.id, { includeCollaboration: false });
    const exists = payload?.trip?.bundle?.itinerary?.days?.some((day) => day.blocks?.some((block) => block.id === parts[3]));
    if (!exists) return json({ error: 'Itinerary item not found.' }, 404);
    const body = await parseBody(request, MAX_AUTH_BYTES);
    const value = Number(body.value);
    if (![-1, 0, 1].includes(value)) return json({ error: 'Vote must be -1, 0, or 1.' }, 400);
    const note = String(body.note || '').trim().slice(0, 500);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO itinerary_item_votes (trip_id, item_id, user_id, value, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(trip_id, item_id, user_id) DO UPDATE SET
         value = excluded.value, note = excluded.note, updated_at = excluded.updated_at`,
    ).bind(tripId, parts[3], auth.user.id, value, note, now).run();
    const rows = await env.DB.prepare(
      'SELECT * FROM itinerary_item_votes WHERE trip_id = ? AND item_id = ?',
    ).bind(tripId, parts[3]).all();
    return json({ votes: rows.results || [], context: await collaborationContext(env, tripId) });
  }

  if (parts[2] === 'collaboration-context' && parts.length === 3 && method === 'GET') {
    await requireTrip(env, tripId, auth.user.id);
    return json({ context: await collaborationContext(env, tripId) });
  }

  if (parts[2] === 'discover' && parts.length === 3 && method === 'POST') {
    await requireTrip(env, tripId, auth.user.id, canEditTrip, 'This trip is read-only for your role.');
    enforceRateLimit(request, 'place discovery', 6);
    const body = await parseBody(request, MAX_AUTH_BYTES);
    const trip = await env.DB.prepare('SELECT destination FROM trips WHERE id = ?').bind(tripId).first();
    const stateRow = await env.DB.prepare('SELECT state_json FROM user_state WHERE user_id = ?').bind(auth.user.id).first();
    let profile = {};
    try { profile = JSON.parse(stateRow?.state_json || '{}').profile || {}; } catch {}
    const context = body.context || {};
    const rounded = {
      ...context,
      ...(Number.isFinite(Number(context.latitude)) ? { latitude: Math.round(Number(context.latitude) * 100) / 100 } : {}),
      ...(Number.isFinite(Number(context.longitude)) ? { longitude: Math.round(Number(context.longitude) * 100) / 100 } : {}),
    };
    const profileKey = {
      dietary: profile.dietary || {}, accessibility: profile.accessibility || {}, family: profile.family || {},
    };
    const cacheKey = `discover:${await hashToken(JSON.stringify({ destination: trip.destination, context: rounded, profile: profileKey }))}`;
    const cached = await env.DB.prepare('SELECT * FROM place_cache WHERE cache_key = ?').bind(cacheKey).first();
    const now = Date.now();
    if (cached && cached.expires_at > now) {
      return json({ ...parseDocument(cached.result_json), cache: 'hit' });
    }
    let result;
    try {
      result = await discoverPlaces({
        destination: trip.destination,
        context,
        profile,
        googleApiKey: env.GOOGLE_MAPS_API_KEY || '',
        openRouterApiKey: env.OPENROUTER_API_KEY || '',
        openRouterBaseUrl: env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1',
      });
    } catch (error) {
      if (cached && cached.stale_until > now) {
        const stale = parseDocument(cached.result_json) || {};
        if (stale.session) stale.session.stale = true;
        return json({ ...stale, degraded: true, cache: 'stale', errors: [String(error.message || error).slice(0, 240)] });
      }
      throw error;
    }
    if (result.degraded && cached && cached.stale_until > now) {
      const stale = parseDocument(cached.result_json) || {};
      if (stale.session) stale.session.stale = true;
      return json({ ...stale, degraded: true, cache: 'stale', errors: result.errors });
    }
    await env.DB.prepare(
      `INSERT INTO place_cache (cache_key, provider, result_json, fetched_at, expires_at, stale_until)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         provider = excluded.provider, result_json = excluded.result_json,
         fetched_at = excluded.fetched_at, expires_at = excluded.expires_at,
         stale_until = excluded.stale_until`,
    ).bind(
      cacheKey, result.provider || 'degraded', JSON.stringify(result), now,
      now + (result.degraded ? 30 * 60_000 : 6 * 60 * 60_000),
      now + 7 * 24 * 60 * 60_000,
    ).run();
    return json({ ...result, cache: 'miss' });
  }

  return null;
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const segment = segmentFor(params).replace(/\/$/, '');
  const parts = segment.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
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
      // V2 journals live inside shared trip documents. Keep the legacy public
      // projection during migration, but merge and de-duplicate both sources.
      const tripRows = await env.DB.prepare(
        `SELECT u.name AS author, t.destination, d.document_json, d.updated_at
           FROM trip_documents d
           JOIN trips t ON t.id = d.trip_id
           JOIN users u ON u.id = t.owner_user_id
          ORDER BY d.updated_at DESC LIMIT 100`,
      ).all();
      const seen = new Set(entries.map((entry) => String(entry.id || '')));
      (tripRows.results || []).forEach((row) => {
        let document;
        try { document = JSON.parse(row.document_json || '{}'); } catch { return; }
        (document.journal || []).forEach((entry) => {
          const id = String(entry?.id || '');
          if (!entry?.publicEntry || seen.has(id) || entries.length >= 100) return;
          seen.add(id);
          entries.push({
            id,
            title: String(entry.title || 'Untitled entry').slice(0, 160),
            did: String(entry.did || '').slice(0, 2_000),
            change: String(entry.change || '').slice(0, 2_000),
            accessAccuracy: String(entry.accessAccuracy || '').slice(0, 40),
            dietAccuracy: String(entry.dietAccuracy || '').slice(0, 40),
            author: row.author,
            destination: String(entry.destination || row.destination || 'unknown').slice(0, 120),
            date: String(entry.date || '').slice(0, 40),
            tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 12).map((tag) => String(tag).slice(0, 40)) : [],
            updatedAt: Number(Date.parse(entry.updatedAt || '') || row.updated_at || 0),
          });
        });
      });
      entries.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
      const response = json({ entries }, 200, {
        'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
      });
      context.waitUntil(caches.default.put(cacheKey, response.clone()));
      return response;
    }

    if (parts[0] === 'invites' && parts[1] && !parts[2] && method === 'GET') {
      const tokenHash = await hashToken(parts[1]);
      const invite = await env.DB.prepare(
        `SELECT i.trip_id, i.role, i.expires_at, i.max_uses, i.use_count, i.revoked_at,
                t.title, t.destination, u.name AS inviter_name
           FROM trip_invites i
           JOIN trips t ON t.id = i.trip_id
           JOIN users u ON u.id = i.invited_by
          WHERE i.token_hash = ?`,
      ).bind(tokenHash).first();
      if (!invite || invite.revoked_at || invite.expires_at <= Date.now() || invite.use_count >= invite.max_uses) {
        return json({ error: 'This invitation is invalid, expired, or no longer available.' }, 410);
      }
      return json({
        invite: {
          tripId: invite.trip_id,
          tripTitle: invite.title,
          destination: invite.destination,
          inviterName: invite.inviter_name || 'A traveler',
          role: invite.role,
          expiresAt: invite.expires_at,
        },
      });
    }

    if ((segment === 'signup' || segment === 'login') && method === 'POST') enforceRateLimit(request, 'sign-in', 12);

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

    if (parts[0] === 'trips') {
      const auth = await requireAuth(env, request);
      const response = await handleTripRoutes({ request, env }, auth, parts);
      if (response) return response;
    }

    if (parts[0] === 'invites' && parts[1] && parts[2] === 'accept' && parts.length === 3 && method === 'POST') {
      enforceRateLimit(request, 'invite acceptance', 12);
      const auth = await requireAuth(env, request);
      const tokenHash = await hashToken(parts[1]);
      const invite = await env.DB.prepare('SELECT * FROM trip_invites WHERE token_hash = ?').bind(tokenHash).first();
      if (!invite || invite.revoked_at || invite.expires_at <= Date.now() || invite.use_count >= invite.max_uses) {
        return json({ error: 'This invitation is invalid, expired, or no longer available.' }, 410);
      }
      const existing = await tripMembership(env, invite.trip_id, auth.user.id);
      if (!existing) {
        const now = Date.now();
        const results = await env.DB.batch([
          env.DB.prepare(
            `INSERT OR IGNORE INTO trip_members
              (trip_id, user_id, role, invited_by, joined_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?
              WHERE EXISTS (
                SELECT 1 FROM trip_invites
                 WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? AND use_count < max_uses
              )`,
          ).bind(invite.trip_id, auth.user.id, invite.role, invite.invited_by, now, now, tokenHash, now),
          env.DB.prepare(
            `UPDATE trip_invites SET use_count = use_count + 1, last_used_at = ?
              WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? AND use_count < max_uses`,
          ).bind(now, tokenHash, now),
        ]);
        if (!Number(results[0]?.meta?.changes || 0)) {
          return json({ error: 'This invitation was used before it could be accepted.' }, 409);
        }
      }
      return json(await loadTripPayload(env, invite.trip_id, auth.user.id));
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
