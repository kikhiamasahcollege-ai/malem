import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalAuthService } from '../lib/local-auth-service.mjs';

const setup = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'malem-auth-'));
  const dataFile = join(directory, 'accounts.json');
  return { dataFile, service: await createLocalAuthService({ dataFile }) };
};

const call = (service, path, { method = 'GET', body, cookie = '' } = {}) =>
  service.handle(new Request(`http://malem.test/api/${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));

const cookieFrom = (response) => response.headers.get('set-cookie')?.split(';')[0] || '';

test('signup creates a durable server session without storing plaintext credentials', async () => {
  const { service, dataFile } = await setup();
  const signup = await call(service, 'signup', {
    method: 'POST',
    body: { name: 'Release Tester', email: 'Release@Example.test', password: 'correct-horse-7' },
  });
  assert.equal(signup.status, 201);
  assert.deepEqual(await signup.json(), {
    email: 'release@example.test',
    name: 'Release Tester',
    provider: 'password',
  });
  const cookie = cookieFrom(signup);
  assert.match(cookie, /^malem_session=/);
  assert.doesNotMatch(cookie, /correct-horse-7/);

  const me = await call(service, 'me', { cookie });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, 'release@example.test');

  const database = await readFile(dataFile, 'utf8');
  assert.doesNotMatch(database, /correct-horse-7/);
  assert.doesNotMatch(database, new RegExp(cookie.split('=')[1]));
});

test('login, duplicate signup, logout, and credential validation follow one contract', async () => {
  const { service } = await setup();
  const account = { name: 'Amina', email: 'amina@example.test', password: 'password-123' };
  assert.equal((await call(service, 'signup', { method: 'POST', body: account })).status, 201);
  assert.equal((await call(service, 'signup', { method: 'POST', body: account })).status, 409);

  const invalidEmail = await call(service, 'signup', {
    method: 'POST',
    body: { name: 'Invalid', email: 'not-an-email', password: 'password-123' },
  });
  assert.equal(invalidEmail.status, 400);

  const shortPassword = await call(service, 'login', {
    method: 'POST',
    body: { email: account.email, password: 'short' },
  });
  assert.equal(shortPassword.status, 400);

  const wrong = await call(service, 'login', {
    method: 'POST',
    body: { email: account.email, password: 'wrong-password' },
  });
  assert.equal(wrong.status, 401);

  const login = await call(service, 'login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  assert.equal(login.status, 200);
  const cookie = cookieFrom(login);

  const logout = await call(service, 'logout', { method: 'POST', cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await call(service, 'me', { cookie })).status, 401);
});

test('authenticated user state round-trips and survives a service restart', async () => {
  const { service, dataFile } = await setup();
  const signup = await call(service, 'signup', {
    method: 'POST',
    body: { name: 'Traveler', email: 'traveler@example.test', password: 'state-password' },
  });
  const cookie = cookieFrom(signup);
  const state = {
    version: 1,
    profile: { version: 1, pace: 'slow' },
    trips: [{ id: 'trip-7', destination: 'milan', days: 4 }],
    activeTrip: 'trip-7',
    group: [{ id: 'member-1', name: 'Amina' }],
    journal: [{ id: 'journal-1', title: 'Milan', publicEntry: true }],
  };

  assert.equal((await call(service, 'state', { method: 'PUT', body: state })).status, 401);
  assert.equal((await call(service, 'state', { method: 'PUT', body: state, cookie })).status, 200);
  assert.deepEqual(await (await call(service, 'state', { cookie })).json(), state);

  await service.flush();
  const restarted = await createLocalAuthService({ dataFile });
  const login = await call(restarted, 'login', {
    method: 'POST',
    body: { email: 'traveler@example.test', password: 'state-password' },
  });
  const restartedCookie = cookieFrom(login);
  assert.deepEqual(await (await call(restarted, 'state', { cookie: restartedCookie })).json(), state);

  const community = await call(restarted, 'community');
  const published = (await community.json()).entries;
  assert.equal(published.length, 1);
  assert.equal(published[0].author, 'Traveler');
  assert.equal(published[0].destination, 'milan');
});

test('state endpoint rejects unsupported fields and bounded collection overflows', async () => {
  const { service } = await setup();
  const signup = await call(service, 'signup', {
    method: 'POST',
    body: { name: 'Limits', email: 'limits@example.test', password: 'limits-password' },
  });
  const cookie = cookieFrom(signup);

  const unsupported = await call(service, 'state', {
    method: 'PUT',
    cookie,
    body: { version: 1, profile: null, trips: [], activeTrip: null, group: [], journal: [], secret: 'no' },
  });
  assert.equal(unsupported.status, 400);

  const overflow = await call(service, 'state', {
    method: 'PUT',
    cookie,
    body: {
      version: 1,
      profile: null,
      trips: Array.from({ length: 101 }, (_, index) => ({ id: String(index) })),
      activeTrip: null,
      group: [],
      journal: [],
    },
  });
  assert.equal(overflow.status, 400);
});

test('account deletion removes credentials, sessions, and synchronized state', async () => {
  const { service, dataFile } = await setup();
  const signup = await call(service, 'signup', {
    method: 'POST',
    body: { name: 'Delete Me', email: 'delete@example.test', password: 'delete-password' },
  });
  const cookie = cookieFrom(signup);
  const state = {
    version: 1,
    profile: { pace: 'slow' },
    trips: [{ id: 'gone' }],
    activeTrip: 'gone',
    group: [],
    journal: [],
  };
  assert.equal((await call(service, 'state', { method: 'PUT', body: state, cookie })).status, 200);
  const deleted = await call(service, 'account', { method: 'DELETE', cookie });
  assert.equal(deleted.status, 200);
  assert.match(deleted.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await call(service, 'me', { cookie })).status, 401);
  assert.equal((await call(service, 'login', {
    method: 'POST',
    body: { email: 'delete@example.test', password: 'delete-password' },
  })).status, 401);
  assert.doesNotMatch(await readFile(dataFile, 'utf8'), /delete@example\.test|\"gone\"/);
});
