import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import {
  TRIP_ROLES,
  applyTripOperations,
  canEditTrip,
  canManageTrip,
  canVoteOnTrip,
  normalizeTripDocument,
} from './trip-contract.mjs';
import {
  PLAN_DOCUMENT_VERSION,
  PLAN_ROLES,
  applyPlanOperations,
  canEditPlan,
  canManagePlan,
  canonicalPlanRole,
  normalizePlanDocument,
  toTripDocument,
} from './plan-contract.mjs';
import { discoverPlaces } from './place-service.mjs';

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
  version: 3,
  users: {},
  sessions: {},
  states: {},
  trips: {},
  tripDocuments: {},
  tripMembers: {},
  tripInvites: {},
  tripMutations: {},
  vibeVotes: {},
  itemVotes: {},
  userMigrations: {},
  planTasks: {},
  planTaskAssignees: {},
  planGuests: {},
  planRsvpInvites: {},
  planPolls: {},
  planPollOptions: {},
  planPollVotes: {},
  assets: {},
  wardrobeItems: {},
  outfits: {},
  packingTemplates: {},
  planPackingSections: {},
  planPackingItems: {},
  bookings: {},
  budgets: {},
  expenses: {},
  settlements: {},
  userConnections: {},
  calendarPreferences: {},
  notificationRules: {},
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

export const createLocalAuthService = async ({ dataFile, discoverProvider = discoverPlaces }) => {
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

  const enforceRateLimit = (request, scope = 'auth', limit = 12) => {
    const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'local';
    const key = `${scope}:${address}`;
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

  const tripMembership = (tripId, userId) => database.tripMembers[tripId]?.[userId] || null;

  const publicMember = (member) => {
    const account = Object.values(database.users).find((candidate) => candidate.id === member.userId);
    return {
      userId: member.userId,
      name: account?.name || 'Traveler',
      role: member.role,
      joinedAt: member.joinedAt,
      updatedAt: member.updatedAt,
    };
  };

  const tripPayload = (tripId, userId) => {
    const metadata = database.trips[tripId];
    const record = database.tripDocuments[tripId];
    const membership = tripMembership(tripId, userId);
    if (!metadata || !record || !membership) return null;
    return {
      metadata: { ...metadata },
      trip: record.document?.documentVersion === PLAN_DOCUMENT_VERSION
        ? toTripDocument(record.document, { actor: userId, cryptoApi })
        : JSON.parse(JSON.stringify(record.document)),
      ...(record.document?.documentVersion === PLAN_DOCUMENT_VERSION
        ? { plan: JSON.parse(JSON.stringify(record.document)) }
        : {}),
      revision: record.revision,
      role: membership.role,
      currentUserId: userId,
      members: Object.values(database.tripMembers[tripId] || {}).map(publicMember),
      votes: {
        vibes: Object.values(database.vibeVotes[tripId] || {}),
        itinerary: Object.values(database.itemVotes[tripId] || {}).flatMap((byUser) => Object.values(byUser || {})),
      },
      updatedAt: record.updatedAt,
    };
  };

  const ensurePlanDocument = async (planId, actor) => {
    const metadata = database.trips[planId];
    const record = database.tripDocuments[planId];
    if (!metadata || !record) return null;
    if (record.document?.documentVersion === PLAN_DOCUMENT_VERSION) return record.document;
    const plan = normalizePlanDocument(record.document, { actor, cryptoApi });
    const now = Date.now();
    record.document = plan;
    record.schemaVersion = PLAN_DOCUMENT_VERSION;
    record.updatedAt = now;
    metadata.title = plan.title;
    metadata.destination = plan.destination;
    metadata.startDate = plan.startAt;
    metadata.endDate = plan.endAt;
    metadata.planType = plan.type;
    metadata.aiMode = plan.aiMode;
    metadata.timezone = plan.timezone;
    metadata.currency = plan.currency;
    metadata.updatedAt = now;
    await persist();
    return plan;
  };

  const planPayload = async (planId, userId) => {
    const metadata = database.trips[planId];
    const record = database.tripDocuments[planId];
    const membership = tripMembership(planId, userId);
    if (!metadata || !record || !membership) return null;
    const plan = await ensurePlanDocument(planId, userId);
    return {
      metadata: {
        ...metadata,
        planType: plan.type,
        aiMode: plan.aiMode,
        timezone: plan.timezone,
        currency: plan.currency,
      },
      plan: JSON.parse(JSON.stringify(plan)),
      revision: record.revision,
      role: canonicalPlanRole(membership.role),
      currentUserId: userId,
      members: Object.values(database.tripMembers[planId] || {}).map((member) => ({
        ...publicMember(member),
        role: canonicalPlanRole(member.role),
      })),
      updatedAt: record.updatedAt,
    };
  };

  const ensureTripMigration = async (user) => {
    if (Number(database.userMigrations[user.id] || 0) >= 2) return false;
    const state = database.states[user.id]?.state || {};
    const legacyTrips = Array.isArray(state.trips) ? state.trips : [];
    const activeTripId = state.activeTrip || legacyTrips.at(-1)?.id || '';
    legacyTrips.forEach((legacyTrip) => {
      let tripId = String(legacyTrip?.id || cryptoApi.randomUUID());
      if (database.trips[tripId] && database.trips[tripId].ownerUserId !== user.id) {
        tripId = `${tripId}-${cryptoApi.randomUUID().slice(0, 8)}`;
      }
      const isActive = String(legacyTrip?.id || '') === String(activeTripId);
      const document = normalizeTripDocument({ ...legacyTrip, id: tripId }, {
        actor: user.id,
        group: isActive ? state.group : [],
        journal: isActive ? state.journal : [],
        cryptoApi,
      });
      const now = Date.now();
      database.trips[tripId] = {
        id: tripId,
        ownerUserId: user.id,
        title: document.summary || document.destination,
        destination: document.destination,
        startDate: document.arrivalDate || '',
        endDate: '',
        status: 'active',
        createdAt: Number(document.createdAt) || now,
        updatedAt: Number(document.updatedAt) || now,
      };
      database.tripDocuments[tripId] = {
        document,
        schemaVersion: 2,
        revision: 1,
        lastEditorUserId: user.id,
        updatedAt: now,
      };
      database.tripMembers[tripId] = {
        [user.id]: {
          tripId,
          userId: user.id,
          role: TRIP_ROLES.owner,
          invitedBy: null,
          joinedAt: now,
          updatedAt: now,
        },
      };
    });
    database.userMigrations[user.id] = 2;
    await persist();
    return true;
  };

  const requireAuth = async (request) => {
    const auth = await authenticate(request);
    if (!auth) throw Object.assign(new Error('Not signed in.'), { status: 401 });
    await ensureTripMigration(auth.user);
    return auth;
  };

  const requireTrip = (tripId, userId, predicate = () => true, message = 'You do not have access to this trip.') => {
    const membership = tripMembership(tripId, userId);
    if (!database.trips[tripId] || !database.tripDocuments[tripId] || !membership || !predicate(membership.role)) {
      throw Object.assign(new Error(message), { status: membership ? 403 : 404 });
    }
    return membership;
  };

  const collaborationContext = (tripId) => {
    const vibeVotes = Object.values(database.vibeVotes[tripId] || {});
    const vibeCounts = {};
    vibeVotes.forEach((vote) => {
      vibeCounts[vote.primaryVibe] = (vibeCounts[vote.primaryVibe] || 0) + 1;
      if (vote.secondaryVibe) vibeCounts[vote.secondaryVibe] = (vibeCounts[vote.secondaryVibe] || 0) + 0.5;
    });
    const itemVotes = Object.values(database.itemVotes[tripId] || {}).flatMap((byUser) => Object.values(byUser || {}));
    const byItem = {};
    itemVotes.forEach((vote) => {
      const current = byItem[vote.itemId] || { itemId: vote.itemId, score: 0, positive: 0, negative: 0, notes: [] };
      current.score += vote.value;
      if (vote.value > 0) current.positive += 1;
      if (vote.value < 0) current.negative += 1;
      if (vote.note) current.notes.push(vote.note);
      byItem[vote.itemId] = current;
    });
    const rankedVibes = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1]);
    const document = database.tripDocuments[tripId]?.document;
    const lockedItemIds = [];
    document?.bundle?.itinerary?.days?.forEach((day) => day.blocks?.forEach((block) => {
      if (block.locked || block.origin === 'manual') lockedItemIds.push(block.id);
    }));
    return {
      revision: database.tripDocuments[tripId]?.revision || 0,
      memberCount: Object.keys(database.tripMembers[tripId] || {}).length,
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

  const communityEntries = () => {
    const entries = [];
    const seen = new Set();
    const addEntry = (entry, { author, destination, updatedAt }) => {
      if (!entry?.publicEntry || seen.has(String(entry.id || ''))) return;
      seen.add(String(entry.id || ''));
      entries.push({
        id: String(entry.id || ''),
        title: String(entry.title || 'Untitled entry').slice(0, 160),
        did: String(entry.did || '').slice(0, 2_000),
        change: String(entry.change || '').slice(0, 2_000),
        accessAccuracy: String(entry.accessAccuracy || '').slice(0, 40),
        dietAccuracy: String(entry.dietAccuracy || '').slice(0, 40),
        author,
        destination: String(entry.destination || destination || 'unknown').slice(0, 120),
        date: String(entry.date || '').slice(0, 40),
        tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 12).map((tag) => String(tag).slice(0, 40)) : [],
        updatedAt: Number(entry.updatedAt ? Date.parse(entry.updatedAt) : updatedAt || 0),
      });
    };
    Object.entries(database.tripDocuments).forEach(([tripId, record]) => {
      const trip = database.trips[tripId];
      const owner = trip && database.users[trip.ownerUserId];
      (record.document?.journal || []).forEach((entry) => addEntry(entry, {
        author: owner?.name || 'A traveler', destination: trip?.destination,
        updatedAt: record.updatedAt,
      }));
    });
    Object.values(database.users).forEach((user) => {
      const state = database.states[user.id]?.state;
      const activeTrip = (state?.trips || []).find((trip) => trip.id === state?.activeTrip)
        || (state?.trips || []).at(-1);
      (state?.journal || []).forEach((entry) => addEntry(entry, {
        author: user.name, destination: activeTrip?.destination,
        updatedAt: database.states[user.id]?.updatedAt,
      }));
    });
    return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  };

  const handle = async (request) => {
    const url = new URL(request.url);
    const segment = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
    const parts = segment.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
    const method = request.method.toUpperCase();

    try {
      if (segment === 'health' && method === 'GET') return json({ ok: true, auth: true });
      if (segment === 'community' && method === 'GET') return json({ entries: communityEntries() });

      if (parts[0] === 'invites' && parts[1] && !parts[2] && method === 'GET') {
        const tokenHash = await hashToken(parts[1]);
        const invite = database.tripInvites[tokenHash];
        const trip = invite && database.trips[invite.tripId];
        const inviter = invite && Object.values(database.users).find((candidate) => candidate.id === invite.invitedBy);
        if (!invite || !trip || invite.revokedAt || invite.expiresAt <= Date.now() || invite.useCount >= invite.maxUses) {
          return json({ error: 'This invitation is invalid, expired, or no longer available.' }, 410);
        }
        return json({
          invite: {
            tripId: trip.id,
            tripTitle: trip.title,
            destination: trip.destination,
            inviterName: inviter?.name || 'A traveler',
            role: invite.role,
            expiresAt: invite.expiresAt,
          },
        });
      }

      if ((segment === 'signup' || segment === 'login') && method === 'POST') enforceRateLimit(request, 'sign-in', 12);

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
        Object.keys(database.trips).forEach((tripId) => {
          if (database.trips[tripId].ownerUserId === auth.user.id) {
            delete database.trips[tripId];
            delete database.tripDocuments[tripId];
            delete database.tripMembers[tripId];
            delete database.tripMutations[tripId];
            delete database.vibeVotes[tripId];
            delete database.itemVotes[tripId];
            Object.entries(database.tripInvites).forEach(([key, invite]) => {
              if (invite.tripId === tripId) delete database.tripInvites[key];
            });
          } else if (database.tripMembers[tripId]) {
            delete database.tripMembers[tripId][auth.user.id];
            if (database.vibeVotes[tripId]) delete database.vibeVotes[tripId][auth.user.id];
            Object.values(database.itemVotes[tripId] || {}).forEach((votes) => { delete votes[auth.user.id]; });
          }
        });
        delete database.userMigrations[auth.user.id];
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

      if (segment === 'plans' && method === 'GET') {
        const auth = await requireAuth(request);
        const plans = await Promise.all(Object.keys(database.tripMembers)
          .filter((planId) => tripMembership(planId, auth.user.id))
          .map((planId) => planPayload(planId, auth.user.id)));
        return json({
          plans: plans.filter(Boolean).sort((left, right) => right.updatedAt - left.updatedAt),
        });
      }

      if (segment === 'plans' && method === 'POST') {
        const auth = await requireAuth(request);
        const body = await parseBody(request, MAX_STATE_BYTES);
        const plan = normalizePlanDocument(body.plan || body.trip || body, {
          actor: auth.user.id,
          cryptoApi,
        });
        if (database.trips[plan.id]) return json({ error: 'A plan with this ID already exists.' }, 409);
        const now = Date.now();
        database.trips[plan.id] = {
          id: plan.id,
          ownerUserId: auth.user.id,
          title: plan.title,
          destination: plan.destination,
          startDate: plan.startAt,
          endDate: plan.endAt,
          status: 'active',
          planType: plan.type,
          aiMode: plan.aiMode,
          timezone: plan.timezone,
          currency: plan.currency,
          createdAt: Number(plan.createdAt) || now,
          updatedAt: now,
        };
        database.tripDocuments[plan.id] = {
          document: plan,
          schemaVersion: PLAN_DOCUMENT_VERSION,
          revision: 1,
          lastEditorUserId: auth.user.id,
          updatedAt: now,
        };
        database.tripMembers[plan.id] = {
          [auth.user.id]: {
            tripId: plan.id,
            userId: auth.user.id,
            role: PLAN_ROLES.owner,
            invitedBy: null,
            joinedAt: now,
            updatedAt: now,
          },
        };
        await persist();
        return json(await planPayload(plan.id, auth.user.id), 201);
      }

      if (parts[0] === 'plans' && parts[1]) {
        const planId = parts[1];
        const auth = await requireAuth(request);

        if (parts.length === 2 && method === 'GET') {
          requireTrip(planId, auth.user.id);
          return json(await planPayload(planId, auth.user.id));
        }

        if (parts.length === 2 && method === 'DELETE') {
          requireTrip(planId, auth.user.id, canManagePlan, 'Only the plan owner can delete this plan.');
          delete database.trips[planId];
          delete database.tripDocuments[planId];
          delete database.tripMembers[planId];
          delete database.tripMutations[planId];
          delete database.vibeVotes[planId];
          delete database.itemVotes[planId];
          [
            'planTasks', 'planTaskAssignees', 'planGuests', 'planRsvpInvites',
            'planPolls', 'planPollOptions', 'planPollVotes', 'planPackingSections',
            'planPackingItems', 'bookings', 'budgets', 'expenses', 'settlements',
            'notificationRules',
          ].forEach((collection) => { delete database[collection][planId]; });
          Object.entries(database.tripInvites).forEach(([key, invite]) => {
            if (invite.tripId === planId) delete database.tripInvites[key];
          });
          await persist();
          return json({ ok: true });
        }

        if (parts[2] === 'document' && parts.length === 3 && method === 'PATCH') {
          const body = await parseBody(request, MAX_STATE_BYTES);
          const membership = requireTrip(planId, auth.user.id);
          const participantCollections = new Set([
            'tasks', 'packingItems', 'expenses', 'settlements', 'datePolls', 'activity',
          ]);
          const participantOperations = canonicalPlanRole(membership.role) === PLAN_ROLES.participant
            && Array.isArray(body.operations)
            && body.operations.every((operation) =>
              (operation?.type === 'workspace.collection.replace'
                && participantCollections.has(operation.collection))
              || operation?.type === 'workspace.activity.add');
          if (!canEditPlan(membership.role) && !participantOperations) {
            return json({ error: 'This plan is read-only for your role.' }, 403);
          }
          await ensurePlanDocument(planId, auth.user.id);
          const clientMutationId = String(body.clientMutationId || '').slice(0, 160);
          if (!clientMutationId) return json({ error: 'clientMutationId is required.' }, 400);
          database.tripMutations[planId] ||= {};
          const existing = database.tripMutations[planId][clientMutationId];
          if (existing) return json({ ...(await planPayload(planId, auth.user.id)), mutation: existing, idempotent: true });
          const record = database.tripDocuments[planId];
          if (Number(body.baseRevision) !== record.revision) {
            return json({ error: 'This plan changed in another session.', current: await planPayload(planId, auth.user.id) }, 409);
          }
          const before = JSON.parse(JSON.stringify(record.document));
          const after = applyPlanOperations(before, body.operations, { actor: auth.user.id, cryptoApi });
          const now = Date.now();
          const mutation = {
            id: cryptoApi.randomUUID(),
            tripId: planId,
            actorUserId: auth.user.id,
            clientMutationId,
            baseRevision: record.revision,
            resultRevision: record.revision + 1,
            operations: body.operations,
            before,
            after,
            createdAt: now,
          };
          record.document = after;
          record.schemaVersion = PLAN_DOCUMENT_VERSION;
          record.revision += 1;
          record.lastEditorUserId = auth.user.id;
          record.updatedAt = now;
          database.trips[planId] = {
            ...database.trips[planId],
            title: after.title,
            destination: after.destination,
            startDate: after.startAt,
            endDate: after.endAt,
            planType: after.type,
            aiMode: after.aiMode,
            timezone: after.timezone,
            currency: after.currency,
            updatedAt: now,
          };
          database.tripMutations[planId][clientMutationId] = mutation;
          const mutationKeys = Object.keys(database.tripMutations[planId]);
          if (mutationKeys.length > 100) {
            mutationKeys.sort((left, right) =>
              database.tripMutations[planId][left].createdAt - database.tripMutations[planId][right].createdAt)
              .slice(0, mutationKeys.length - 100)
              .forEach((key) => delete database.tripMutations[planId][key]);
          }
          await persist();
          return json({
            ...(await planPayload(planId, auth.user.id)),
            mutation: { ...mutation, before: undefined, after: undefined },
          });
        }

        if (parts[2] === 'history' && parts.length === 3 && method === 'GET') {
          requireTrip(planId, auth.user.id);
          const history = Object.values(database.tripMutations[planId] || {})
            .sort((left, right) => right.createdAt - left.createdAt)
            .slice(0, 50)
            .map(({ before, after, ...mutation }) => mutation);
          return json({ history });
        }

        if (parts[2] === 'undo' && parts.length === 3 && method === 'POST') {
          requireTrip(planId, auth.user.id, canEditPlan, 'This plan is read-only for your role.');
          const body = await parseBody(request, MAX_AUTH_BYTES);
          const original = Object.values(database.tripMutations[planId] || {})
            .find((mutation) => mutation.id === body.mutationId);
          if (!original) return json({ error: 'The change to undo was not found.' }, 404);
          const record = database.tripDocuments[planId];
          if (record.revision !== original.resultRevision || Number(body.baseRevision) !== record.revision) {
            return json({
              error: 'Undo is available only before another change is saved.',
              current: await planPayload(planId, auth.user.id),
            }, 409);
          }
          const now = Date.now();
          const clientMutationId = String(body.clientMutationId || `undo-${original.id}`).slice(0, 160);
          const mutation = {
            id: cryptoApi.randomUUID(),
            tripId: planId,
            actorUserId: auth.user.id,
            clientMutationId,
            baseRevision: record.revision,
            resultRevision: record.revision + 1,
            operations: [{ type: 'undo', mutationId: original.id }],
            before: record.document,
            after: original.before,
            createdAt: now,
          };
          record.document = normalizePlanDocument(original.before, { actor: auth.user.id, cryptoApi });
          record.revision += 1;
          record.lastEditorUserId = auth.user.id;
          record.updatedAt = now;
          database.tripMutations[planId][clientMutationId] = mutation;
          await persist();
          return json({
            ...(await planPayload(planId, auth.user.id)),
            mutation: { ...mutation, before: undefined, after: undefined },
          });
        }

        if (parts[2] === 'members' && parts.length === 3 && method === 'GET') {
          requireTrip(planId, auth.user.id);
          return json({
            members: Object.values(database.tripMembers[planId] || {}).map((member) => ({
              ...publicMember(member),
              role: canonicalPlanRole(member.role),
            })),
          });
        }

        if (parts[2] === 'invites' && parts.length === 3 && method === 'GET') {
          requireTrip(planId, auth.user.id, canManagePlan, 'Only the plan owner can view invitations.');
          const invites = Object.values(database.tripInvites)
            .filter((invite) => invite.tripId === planId)
            .map(({ tokenHash, ...invite }) => ({ ...invite, role: canonicalPlanRole(invite.role) }))
            .sort((left, right) => right.createdAt - left.createdAt);
          return json({ invites });
        }

        if (parts[2] === 'invites' && parts.length === 3 && method === 'POST') {
          enforceRateLimit(request, 'invite creation', 8);
          requireTrip(planId, auth.user.id, canManagePlan, 'Only the plan owner can create invitations.');
          const body = await parseBody(request, MAX_AUTH_BYTES);
          const role = [PLAN_ROLES.planner, PLAN_ROLES.participant, PLAN_ROLES.viewer].includes(body.role)
            ? body.role : PLAN_ROLES.viewer;
          const expiresInDays = Math.min(30, Math.max(1, Number(body.expiresInDays) || 7));
          const maxUses = Math.min(50, Math.max(1, Number(body.maxUses) || 1));
          const token = `${cryptoApi.randomUUID()}${cryptoApi.randomUUID()}`.replaceAll('-', '');
          const tokenHash = await hashToken(token);
          const now = Date.now();
          const invite = {
            id: cryptoApi.randomUUID(),
            tokenHash,
            tripId: planId,
            role,
            invitedBy: auth.user.id,
            expiresAt: now + expiresInDays * 86_400_000,
            maxUses,
            useCount: 0,
            revokedAt: null,
            createdAt: now,
            lastUsedAt: null,
          };
          database.tripInvites[tokenHash] = invite;
          await persist();
          return json({
            invite: { ...invite, tokenHash: undefined },
            token,
            url: `${url.origin}/#/invite/${encodeURIComponent(token)}`,
          }, 201);
        }

        if (parts[2] === 'invites' && parts[3] && parts.length === 4 && method === 'DELETE') {
          requireTrip(planId, auth.user.id, canManagePlan, 'Only the plan owner can revoke invitations.');
          const invite = Object.values(database.tripInvites)
            .find((candidate) => candidate.tripId === planId && candidate.id === parts[3]);
          if (!invite) return json({ error: 'Invitation not found.' }, 404);
          invite.revokedAt = Date.now();
          await persist();
          return json({ ok: true });
        }
      }

      if (segment === 'trips' && method === 'GET') {
        const auth = await requireAuth(request);
        const trips = Object.keys(database.tripMembers)
          .filter((tripId) => tripMembership(tripId, auth.user.id))
          .map((tripId) => tripPayload(tripId, auth.user.id))
          .filter(Boolean)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        return json({ trips });
      }

      if (segment === 'trips' && method === 'POST') {
        const auth = await requireAuth(request);
        const body = await parseBody(request, MAX_STATE_BYTES);
        const document = normalizeTripDocument(body.trip, { actor: auth.user.id, cryptoApi });
        if (database.trips[document.id]) return json({ error: 'A trip with this ID already exists.' }, 409);
        const now = Date.now();
        database.trips[document.id] = {
          id: document.id,
          ownerUserId: auth.user.id,
          title: document.summary || document.destination,
          destination: document.destination,
          startDate: document.arrivalDate || '',
          endDate: '',
          status: 'active',
          createdAt: Number(document.createdAt) || now,
          updatedAt: now,
        };
        database.tripDocuments[document.id] = {
          document,
          schemaVersion: 2,
          revision: 1,
          lastEditorUserId: auth.user.id,
          updatedAt: now,
        };
        database.tripMembers[document.id] = {
          [auth.user.id]: {
            tripId: document.id,
            userId: auth.user.id,
            role: TRIP_ROLES.owner,
            invitedBy: null,
            joinedAt: now,
            updatedAt: now,
          },
        };
        await persist();
        return json(tripPayload(document.id, auth.user.id), 201);
      }

      if (parts[0] === 'trips' && parts[1]) {
        const tripId = parts[1];
        const auth = await requireAuth(request);

        if (parts.length === 2 && method === 'GET') {
          requireTrip(tripId, auth.user.id);
          return json(tripPayload(tripId, auth.user.id));
        }

        if (parts.length === 2 && method === 'DELETE') {
          requireTrip(tripId, auth.user.id, canManageTrip, 'Only the trip owner can delete this trip.');
          delete database.trips[tripId];
          delete database.tripDocuments[tripId];
          delete database.tripMembers[tripId];
          delete database.tripMutations[tripId];
          delete database.vibeVotes[tripId];
          delete database.itemVotes[tripId];
          Object.entries(database.tripInvites).forEach(([key, invite]) => {
            if (invite.tripId === tripId) delete database.tripInvites[key];
          });
          await persist();
          return json({ ok: true });
        }

        if (parts[2] === 'document' && parts.length === 3 && method === 'PATCH') {
          requireTrip(tripId, auth.user.id, canEditTrip, 'This trip is read-only for your role.');
          const body = await parseBody(request, MAX_STATE_BYTES);
          const clientMutationId = String(body.clientMutationId || '').slice(0, 160);
          if (!clientMutationId) return json({ error: 'clientMutationId is required.' }, 400);
          database.tripMutations[tripId] ||= {};
          const existing = database.tripMutations[tripId][clientMutationId];
          if (existing) return json({ ...tripPayload(tripId, auth.user.id), mutation: existing, idempotent: true });
          const record = database.tripDocuments[tripId];
          if (Number(body.baseRevision) !== record.revision) {
            return json({ error: 'This trip changed in another session.', current: tripPayload(tripId, auth.user.id) }, 409);
          }
          const before = JSON.parse(JSON.stringify(record.document));
          const after = before?.documentVersion === PLAN_DOCUMENT_VERSION
            ? applyPlanOperations(before, body.operations, { actor: auth.user.id, cryptoApi })
            : applyTripOperations(before, body.operations, { actor: auth.user.id, cryptoApi });
          const now = Date.now();
          const mutation = {
            id: cryptoApi.randomUUID(),
            tripId,
            actorUserId: auth.user.id,
            clientMutationId,
            baseRevision: record.revision,
            resultRevision: record.revision + 1,
            operations: body.operations,
            before,
            after,
            createdAt: now,
          };
          record.document = after;
          record.revision += 1;
          record.lastEditorUserId = auth.user.id;
          record.updatedAt = now;
          database.trips[tripId] = {
            ...database.trips[tripId],
            title: after.title || after.summary || after.destination,
            destination: after.destination,
            ...(after.documentVersion === PLAN_DOCUMENT_VERSION ? {
              startDate: after.startAt,
              endDate: after.endAt,
              planType: after.type,
              aiMode: after.aiMode,
              timezone: after.timezone,
              currency: after.currency,
            } : {}),
            updatedAt: now,
          };
          database.tripMutations[tripId][clientMutationId] = mutation;
          const mutationKeys = Object.keys(database.tripMutations[tripId]);
          if (mutationKeys.length > 100) {
            mutationKeys.sort((a, b) => database.tripMutations[tripId][a].createdAt - database.tripMutations[tripId][b].createdAt)
              .slice(0, mutationKeys.length - 100)
              .forEach((key) => delete database.tripMutations[tripId][key]);
          }
          await persist();
          return json({ ...tripPayload(tripId, auth.user.id), mutation: { ...mutation, before: undefined, after: undefined } });
        }

        if (parts[2] === 'history' && parts.length === 3 && method === 'GET') {
          requireTrip(tripId, auth.user.id);
          const history = Object.values(database.tripMutations[tripId] || {})
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 50)
            .map(({ before, after, ...mutation }) => mutation);
          return json({ history });
        }

        if (parts[2] === 'undo' && parts.length === 3 && method === 'POST') {
          requireTrip(tripId, auth.user.id, canEditTrip, 'This trip is read-only for your role.');
          const body = await parseBody(request, MAX_AUTH_BYTES);
          const original = Object.values(database.tripMutations[tripId] || {}).find((mutation) => mutation.id === body.mutationId);
          if (!original) return json({ error: 'The change to undo was not found.' }, 404);
          const record = database.tripDocuments[tripId];
          if (record.revision !== original.resultRevision || Number(body.baseRevision) !== record.revision) {
            return json({ error: 'Undo is available only before another change is saved.', current: tripPayload(tripId, auth.user.id) }, 409);
          }
          const now = Date.now();
          const clientMutationId = String(body.clientMutationId || `undo-${original.id}`).slice(0, 160);
          const mutation = {
            id: cryptoApi.randomUUID(), tripId, actorUserId: auth.user.id, clientMutationId,
            baseRevision: record.revision, resultRevision: record.revision + 1,
            operations: [{ type: 'undo', mutationId: original.id }],
            before: record.document, after: original.before, createdAt: now,
          };
          record.document = JSON.parse(JSON.stringify(original.before));
          record.revision += 1;
          record.lastEditorUserId = auth.user.id;
          record.updatedAt = now;
          database.tripMutations[tripId][clientMutationId] = mutation;
          await persist();
          return json({ ...tripPayload(tripId, auth.user.id), mutation: { ...mutation, before: undefined, after: undefined } });
        }

        if (parts[2] === 'members' && parts.length === 3 && method === 'GET') {
          requireTrip(tripId, auth.user.id);
          return json({ members: Object.values(database.tripMembers[tripId] || {}).map(publicMember) });
        }

        if (parts[2] === 'members' && parts[3] && parts.length === 4 && method === 'PATCH') {
          requireTrip(tripId, auth.user.id, canManageTrip, 'Only the trip owner can change roles.');
          const body = await parseBody(request, MAX_AUTH_BYTES);
          if (![TRIP_ROLES.collaborator, TRIP_ROLES.viewer].includes(body.role)) return json({ error: 'Choose collaborator or viewer.' }, 400);
          const member = tripMembership(tripId, parts[3]);
          if (!member) return json({ error: 'Trip member not found.' }, 404);
          if (member.role === TRIP_ROLES.owner) return json({ error: 'The owner role cannot be changed.' }, 400);
          member.role = body.role;
          member.updatedAt = Date.now();
          await persist();
          return json({ members: Object.values(database.tripMembers[tripId]).map(publicMember) });
        }

        if (parts[2] === 'members' && parts[3] && parts.length === 4 && method === 'DELETE') {
          const membership = requireTrip(tripId, auth.user.id);
          const target = tripMembership(tripId, parts[3]);
          if (!target) return json({ error: 'Trip member not found.' }, 404);
          if (target.role === TRIP_ROLES.owner) return json({ error: 'The owner cannot be removed from the trip.' }, 400);
          if (parts[3] !== auth.user.id && !canManageTrip(membership.role)) return json({ error: 'Only the owner can remove another traveler.' }, 403);
          delete database.tripMembers[tripId][parts[3]];
          if (database.vibeVotes[tripId]) delete database.vibeVotes[tripId][parts[3]];
          Object.values(database.itemVotes[tripId] || {}).forEach((votes) => { delete votes[parts[3]]; });
          await persist();
          return json({ ok: true });
        }

        if (parts[2] === 'invites' && parts.length === 3 && method === 'GET') {
          requireTrip(tripId, auth.user.id, canManageTrip, 'Only the trip owner can view invitations.');
          const invites = Object.values(database.tripInvites)
            .filter((invite) => invite.tripId === tripId)
            .map(({ tokenHash, ...invite }) => invite)
            .sort((a, b) => b.createdAt - a.createdAt);
          return json({ invites });
        }

        if (parts[2] === 'invites' && parts.length === 3 && method === 'POST') {
          enforceRateLimit(request, 'invite creation', 8);
          requireTrip(tripId, auth.user.id, canManageTrip, 'Only the trip owner can create invitations.');
          const body = await parseBody(request, MAX_AUTH_BYTES);
          const role = body.role === TRIP_ROLES.collaborator ? TRIP_ROLES.collaborator : TRIP_ROLES.viewer;
          const expiresInDays = Math.min(30, Math.max(1, Number(body.expiresInDays) || 7));
          const maxUses = Math.min(50, Math.max(1, Number(body.maxUses) || 1));
          const token = `${cryptoApi.randomUUID()}${cryptoApi.randomUUID()}`.replaceAll('-', '');
          const tokenHash = await hashToken(token);
          const now = Date.now();
          const invite = {
            id: cryptoApi.randomUUID(), tokenHash, tripId, role, invitedBy: auth.user.id,
            expiresAt: now + expiresInDays * 86_400_000, maxUses, useCount: 0,
            revokedAt: null, createdAt: now, lastUsedAt: null,
          };
          database.tripInvites[tokenHash] = invite;
          await persist();
          return json({
            invite: { ...invite, tokenHash: undefined },
            token,
            url: `${url.origin}/#/invite/${encodeURIComponent(token)}`,
          }, 201);
        }

        if (parts[2] === 'invites' && parts[3] && parts.length === 4 && method === 'DELETE') {
          requireTrip(tripId, auth.user.id, canManageTrip, 'Only the trip owner can revoke invitations.');
          const invite = Object.values(database.tripInvites).find((candidate) => candidate.tripId === tripId && candidate.id === parts[3]);
          if (!invite) return json({ error: 'Invitation not found.' }, 404);
          invite.revokedAt = Date.now();
          await persist();
          return json({ ok: true });
        }

        if (parts[2] === 'vibes' && parts[3] === 'vote' && method === 'POST') {
          requireTrip(tripId, auth.user.id, canVoteOnTrip, 'Passenger princess members cannot vote.');
          const body = await parseBody(request, MAX_AUTH_BYTES);
          const primaryVibe = String(body.primaryVibe || '').trim().slice(0, 80);
          const secondaryVibe = String(body.secondaryVibe || '').trim().slice(0, 80);
          if (!primaryVibe) return json({ error: 'Choose a primary vibe.' }, 400);
          database.vibeVotes[tripId] ||= {};
          database.vibeVotes[tripId][auth.user.id] = {
            tripId, userId: auth.user.id, primaryVibe,
            secondaryVibe: secondaryVibe && secondaryVibe !== primaryVibe ? secondaryVibe : '',
            updatedAt: Date.now(),
          };
          await persist();
          return json({ votes: Object.values(database.vibeVotes[tripId]), context: collaborationContext(tripId) });
        }

        if (parts[2] === 'itinerary' && parts[3] && parts[4] === 'vote' && method === 'POST') {
          requireTrip(tripId, auth.user.id, canVoteOnTrip, 'Passenger princess members cannot vote.');
          const itemId = parts[3];
          const exists = database.tripDocuments[tripId].document.bundle.itinerary.days
            .some((day) => day.blocks.some((block) => block.id === itemId));
          if (!exists) return json({ error: 'Itinerary item not found.' }, 404);
          const body = await parseBody(request, MAX_AUTH_BYTES);
          const value = Number(body.value);
          if (![-1, 0, 1].includes(value)) return json({ error: 'Vote must be -1, 0, or 1.' }, 400);
          database.itemVotes[tripId] ||= {};
          database.itemVotes[tripId][itemId] ||= {};
          database.itemVotes[tripId][itemId][auth.user.id] = {
            tripId, itemId, userId: auth.user.id, value,
            note: String(body.note || '').trim().slice(0, 500), updatedAt: Date.now(),
          };
          await persist();
          return json({ votes: Object.values(database.itemVotes[tripId][itemId]), context: collaborationContext(tripId) });
        }

        if (parts[2] === 'collaboration-context' && parts.length === 3 && method === 'GET') {
          requireTrip(tripId, auth.user.id);
          return json({ context: collaborationContext(tripId) });
        }

        if (parts[2] === 'discover' && parts.length === 3 && method === 'POST') {
          enforceRateLimit(request, 'place discovery', 6);
          requireTrip(tripId, auth.user.id, canEditTrip, 'This trip is read-only for your role.');
          const body = await parseBody(request, MAX_AUTH_BYTES);
          const result = await discoverProvider({
            destination: database.trips[tripId].destination,
            context: body.context || {},
            profile: database.states[auth.user.id]?.state?.profile || {},
          });
          return json(result);
        }
      }

      if (parts[0] === 'invites' && parts[1] && parts[2] === 'accept' && parts.length === 3 && method === 'POST') {
        enforceRateLimit(request, 'invite acceptance', 12);
        const auth = await requireAuth(request);
        const tokenHash = await hashToken(parts[1]);
        const invite = database.tripInvites[tokenHash];
        if (!invite || invite.revokedAt || invite.expiresAt <= Date.now() || invite.useCount >= invite.maxUses) {
          return json({ error: 'This invitation is invalid, expired, or no longer available.' }, 410);
        }
        const existing = tripMembership(invite.tripId, auth.user.id);
        if (!existing) {
          const now = Date.now();
          database.tripMembers[invite.tripId] ||= {};
          database.tripMembers[invite.tripId][auth.user.id] = {
            tripId: invite.tripId, userId: auth.user.id, role: invite.role,
            invitedBy: invite.invitedBy, joinedAt: now, updatedAt: now,
          };
          invite.useCount += 1;
          invite.lastUsedAt = now;
          await persist();
        }
        return json(tripPayload(invite.tripId, auth.user.id));
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
