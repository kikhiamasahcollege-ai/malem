import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalAuthService } from '../lib/local-auth-service.mjs';

const setup = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'malem-plan-'));
  return createLocalAuthService({ dataFile: join(directory, 'accounts.json') });
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

const signup = async (service) => {
  const response = await call(service, 'signup', {
    method: 'POST',
    body: { name: 'Planner', email: 'planner@example.test', password: 'plan-password' },
  });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie').split(';')[0];
};

const signupAs = async (service, name, email) => {
  const response = await call(service, 'signup', {
    method: 'POST',
    body: { name, email, password: 'plan-password' },
  });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie').split(';')[0];
};

test('Plan API creates, lists, edits, and exposes legacy trip compatibility', async () => {
  const service = await setup();
  const cookie = await signup(service);
  const created = await call(service, 'plans', {
    method: 'POST',
    cookie,
    body: {
      plan: {
        id: 'plan-rome-party',
        type: 'event',
        title: 'Rooftop birthday',
        aiMode: 'off',
        timezone: 'Europe/Rome',
        currency: 'EUR',
        event: { subtype: 'birthday', venueName: 'Terrazza', guestCount: 18 },
        bundle: { itinerary: { days: [] }, packing: { lists: [], reminders: [] } },
      },
    },
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.plan.documentVersion, 3);
  assert.equal(createdBody.plan.type, 'event');
  assert.equal(createdBody.role, 'owner');

  const listing = await call(service, 'plans', { cookie });
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).plans.length, 1);

  const changed = await call(service, 'plans/plan-rome-party/document', {
    method: 'PATCH',
    cookie,
    body: {
      baseRevision: 1,
      clientMutationId: 'rename-party',
      operations: [{
        type: 'plan.update',
        patch: { title: 'Rooftop birthday dinner', startAt: '2026-09-05T19:00:00+02:00' },
      }],
    },
  });
  assert.equal(changed.status, 200);
  const changedBody = await changed.json();
  assert.equal(changedBody.revision, 2);
  assert.equal(changedBody.plan.title, 'Rooftop birthday dinner');

  const legacy = await call(service, 'trips/plan-rome-party', { cookie });
  assert.equal(legacy.status, 200);
  const legacyBody = await legacy.json();
  assert.equal(legacyBody.trip.documentVersion, 2);
  assert.equal(legacyBody.plan.documentVersion, 3);
});

test('Plan API rejects stale revisions and keeps idempotent mutation results', async () => {
  const service = await setup();
  const cookie = await signup(service);
  await call(service, 'plans', {
    method: 'POST',
    cookie,
    body: {
      plan: {
        id: 'blank-plan',
        type: 'blank',
        title: 'Friends planning',
        bundle: { itinerary: { days: [] }, packing: { lists: [], reminders: [] } },
      },
    },
  });
  const mutation = {
    baseRevision: 1,
    clientMutationId: 'enable-tasks',
    operations: [{ type: 'plan.module.update', module: 'tasks', enabled: true, order: 6 }],
  };
  const first = await call(service, 'plans/blank-plan/document', {
    method: 'PATCH', cookie, body: mutation,
  });
  assert.equal(first.status, 200);

  const retry = await call(service, 'plans/blank-plan/document', {
    method: 'PATCH', cookie, body: mutation,
  });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).idempotent, true);

  const stale = await call(service, 'plans/blank-plan/document', {
    method: 'PATCH',
    cookie,
    body: {
      baseRevision: 1,
      clientMutationId: 'stale',
      operations: [{ type: 'plan.update', patch: { title: 'Too late' } }],
    },
  });
  assert.equal(stale.status, 409);
});

test('Plan invites support participant access without granting plan editing', async () => {
  const service = await setup();
  const ownerCookie = await signupAs(service, 'Owner', 'plan-owner@example.test');
  await call(service, 'plans', {
    method: 'POST',
    cookie: ownerCookie,
    body: {
      plan: {
        id: 'shared-plan',
        type: 'blank',
        title: 'Shared planning',
        bundle: { itinerary: { days: [] }, packing: { lists: [], reminders: [] } },
      },
    },
  });
  const invitation = await call(service, 'plans/shared-plan/invites', {
    method: 'POST',
    cookie: ownerCookie,
    body: { role: 'participant', expiresInDays: 7, maxUses: 1 },
  });
  assert.equal(invitation.status, 201);
  const { token } = await invitation.json();

  const participantCookie = await signupAs(service, 'Participant', 'participant@example.test');
  const accepted = await call(service, `invites/${token}/accept`, {
    method: 'POST',
    cookie: participantCookie,
  });
  assert.equal(accepted.status, 200);

  const opened = await call(service, 'plans/shared-plan', { cookie: participantCookie });
  assert.equal(opened.status, 200);
  assert.equal((await opened.json()).role, 'participant');

  const forbidden = await call(service, 'plans/shared-plan/document', {
    method: 'PATCH',
    cookie: participantCookie,
    body: {
      baseRevision: 1,
      clientMutationId: 'participant-edit',
      operations: [{ type: 'plan.update', patch: { title: 'Not allowed' } }],
    },
  });
  assert.equal(forbidden.status, 403);

  const contribution = await call(service, 'plans/shared-plan/document', {
    method: 'PATCH',
    cookie: participantCookie,
    body: {
      baseRevision: 1,
      clientMutationId: 'participant-task',
      operations: [{
        type: 'workspace.collection.replace',
        collection: 'tasks',
        items: [{ id: 'task-1', title: 'Bring ice', status: 'open' }],
      }],
    },
  });
  assert.equal(contribution.status, 200);
  assert.equal((await contribution.json()).plan.workspace.tasks[0].title, 'Bring ice');
});
