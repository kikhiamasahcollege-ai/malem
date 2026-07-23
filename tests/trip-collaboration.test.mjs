import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalAuthService } from '../lib/local-auth-service.mjs';
import {
  applyTripOperations,
  makeMapsDirectionsUrl,
  mergeGeneratedTrip,
  normalizeTripDocument,
} from '../lib/trip-contract.mjs';

const setup = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'malem-trip-'));
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

const signup = async (service, name, email) => cookieFrom(await call(service, 'signup', {
  method: 'POST', body: { name, email, password: 'trip-password' },
}));

const legacyTrip = () => ({
  id: 'legacy-milan',
  destination: 'milan',
  summary: 'Four days in Milan',
  days: 4,
  bundle: {
    itinerary: {
      respectedFromProfile: [],
      days: [{
        date: '2026-09-10', theme: 'Design and landmarks',
        blocks: [{ time: '09:00', title: 'Duomo di Milano', duration: '2 hr', kind: 'sight' }],
      }],
    },
    packing: {
      lists: [{ title: 'Pack from home', tone: 'good', items: [{ item: 'Walking shoes', why: 'City days' }] }],
      reminders: [],
    },
  },
});

test('Trip Document V2 normalizes stable editable IDs and safe Maps directions', () => {
  const document = normalizeTripDocument(legacyTrip(), { actor: 'owner-1' });
  const day = document.bundle.itinerary.days[0];
  const block = day.blocks[0];
  const item = document.bundle.packing.lists[0].items[0];
  assert.equal(document.documentVersion, 2);
  assert.match(day.id, /^day-/);
  assert.match(block.id, /^block-/);
  assert.match(item.id, /^pack-item-/);

  const directions = makeMapsDirectionsUrl({
    name: 'Duomo di Milano', providerPlaceId: 'place-123', latitude: 45.4642, longitude: 9.19,
  });
  assert.match(directions, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(directions, /destination_place_id=place-123/);

  const edited = applyTripOperations(document, [{
    type: 'itinerary.block.update', dayId: day.id, blockId: block.id,
    patch: { title: 'Morning at the Duomo', notes: 'Use the rooftop entrance.' },
  }], { actor: 'owner-1' });
  assert.equal(edited.bundle.itinerary.days[0].blocks[0].title, 'Morning at the Duomo');
  assert.equal(edited.bundle.itinerary.days[0].blocks[0].locked, true);
  assert.equal(edited.bundle.itinerary.days[0].blocks[0].origin, 'manual');
});

test('manual editor operations cover itinerary, packing, and Discover add/edit/reorder flows', () => {
  const legacy = legacyTrip();
  const base = normalizeTripDocument({
    ...legacy,
    bundle: {
      ...legacy.bundle,
      packing: {
        lists: [
          { title: 'First', items: [{ item: 'A' }, { item: 'B' }] },
          { title: 'Second', items: [{ item: 'C' }] },
        ],
        reminders: [],
      },
    },
    discoverSessions: [{
      context: { destination: 'milan', hours: 3 },
      plans: [{
        title: 'Local loop', badge: 'Nearby', why: 'Compact',
        steps: [
          { title: 'Market', options: [{ name: 'Mercato Centrale', sourceUrl: 'https://example.test/market' }] },
          { title: 'Coffee', options: [{ name: 'Cafe', sourceUrl: 'https://example.test/cafe' }] },
        ],
      }],
    }],
  }, { actor: 'owner-1' });
  const day = base.bundle.itinerary.days[0];
  const originalBlock = day.blocks[0];
  const firstSection = base.bundle.packing.lists[0];
  const secondSection = base.bundle.packing.lists[1];
  const session = base.discoverSessions[0];
  const plan = session.plans[0];
  const firstStep = plan.steps[0];
  const secondStep = plan.steps[1];

  const edited = applyTripOperations(base, [
    { type: 'itinerary.block.add', dayId: day.id, afterId: originalBlock.id, block: { title: 'Duplicate-ready stop' } },
    { type: 'packing.section.move', sectionId: secondSection.id, afterId: '' },
    { type: 'packing.item.move', fromSectionId: firstSection.id, toSectionId: secondSection.id, itemId: firstSection.items[0].id, afterId: '' },
    { type: 'discover.step.move', sessionId: session.id, planId: plan.id, stepId: secondStep.id, afterId: '' },
    { type: 'discover.step.update', sessionId: session.id, planId: plan.id, stepId: firstStep.id, patch: { title: 'Edited market walk' } },
  ], { actor: 'owner-1' });

  assert.equal(edited.bundle.itinerary.days[0].blocks[1].title, 'Duplicate-ready stop');
  assert.equal(edited.bundle.packing.lists[0].id, secondSection.id);
  assert.equal(edited.bundle.packing.lists[0].items[0].item, 'A');
  assert.equal(edited.discoverSessions[0].plans[0].steps[0].id, secondStep.id);
  assert.equal(edited.discoverSessions[0].plans[0].steps[1].title, 'Edited market walk');
  assert.equal(edited.discoverSessions[0].plans[0].steps[1].locked, true);
});

test('regeneration preserves locked human itinerary and packing edits for review', () => {
  const current = normalizeTripDocument(legacyTrip(), { actor: 'owner-1' });
  const day = current.bundle.itinerary.days[0];
  const block = day.blocks[0];
  const section = current.bundle.packing.lists[0];
  const item = section.items[0];
  const manual = applyTripOperations(current, [
    {
      type: 'itinerary.block.update',
      dayId: day.id,
      blockId: block.id,
      patch: { title: 'Human-selected Duomo rooftop' },
    },
    {
      type: 'packing.item.update',
      sectionId: section.id,
      itemId: item.id,
      patch: { item: 'Broken-in walking shoes' },
    },
  ], { actor: 'owner-1' });
  const regenerated = normalizeTripDocument({
    ...legacyTrip(),
    id: manual.id,
    bundle: {
      ...legacyTrip().bundle,
      itinerary: {
        respectedFromProfile: [],
        days: [{ id: day.id, date: day.date, theme: 'New proposal', blocks: [{ title: 'Generated replacement', kind: 'sight' }] }],
      },
      packing: {
        lists: [{ id: section.id, title: section.title, items: [{ item: 'Generated shoes' }] }],
        reminders: [],
      },
    },
  }, { actor: 'generator' });

  const preview = mergeGeneratedTrip(manual, regenerated, { actor: 'generator' });
  assert.ok(preview.carried.itinerary.includes(block.id));
  assert.ok(preview.carried.packing.includes(item.id));
  assert.ok(preview.document.bundle.itinerary.days[0].blocks.some((candidate) => candidate.title === 'Human-selected Duomo rooftop'));
  assert.ok(preview.document.bundle.packing.lists[0].items.some((candidate) => candidate.item === 'Broken-in walking shoes'));
});

test('legacy state migrates idempotently into an owner-scoped trip document', async () => {
  const { service, dataFile } = await setup();
  const cookie = await signup(service, 'Owner', 'owner@example.test');
  const state = {
    version: 1, profile: null, trips: [legacyTrip()], activeTrip: 'legacy-milan',
    group: [{ id: 'legacy-friend', name: 'Friend' }],
    journal: [{ id: 'legacy-note', title: 'Milan' }],
  };
  assert.equal((await call(service, 'state', { method: 'PUT', body: state, cookie })).status, 200);

  const first = await call(service, 'trips', { cookie });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.trips.length, 1);
  assert.equal(firstBody.trips[0].role, 'owner');
  assert.equal(firstBody.trips[0].trip.documentVersion, 2);
  assert.equal(firstBody.trips[0].trip.group[0].name, 'Friend');

  const secondBody = await (await call(service, 'trips', { cookie })).json();
  assert.equal(secondBody.trips.length, 1);
  const raw = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.equal(raw.userMigrations[Object.values(raw.users)[0].id], 2);
});

test('revision-safe mutations are idempotent, reject stale writes, and support immediate undo', async () => {
  const { service } = await setup();
  const cookie = await signup(service, 'Owner', 'owner-mutation@example.test');
  await call(service, 'state', {
    method: 'PUT', cookie,
    body: { version: 1, profile: null, trips: [legacyTrip()], activeTrip: 'legacy-milan', group: [], journal: [] },
  });
  const migrated = (await (await call(service, 'trips', { cookie })).json()).trips[0];
  const day = migrated.trip.bundle.itinerary.days[0];
  const block = day.blocks[0];
  const mutationBody = {
    baseRevision: migrated.revision,
    clientMutationId: 'client-edit-1',
    operations: [{ type: 'itinerary.block.update', dayId: day.id, blockId: block.id, patch: { title: 'Edited Duomo visit' } }],
  };
  const changed = await call(service, 'trips/legacy-milan/document', { method: 'PATCH', cookie, body: mutationBody });
  assert.equal(changed.status, 200);
  const changedBody = await changed.json();
  assert.equal(changedBody.revision, 2);
  assert.equal(changedBody.trip.bundle.itinerary.days[0].blocks[0].title, 'Edited Duomo visit');

  const duplicateBody = await (await call(service, 'trips/legacy-milan/document', { method: 'PATCH', cookie, body: mutationBody })).json();
  assert.equal(duplicateBody.idempotent, true);
  assert.equal(duplicateBody.revision, 2);

  const stale = await call(service, 'trips/legacy-milan/document', {
    method: 'PATCH', cookie,
    body: { ...mutationBody, clientMutationId: 'client-edit-stale', operations: [{ ...mutationBody.operations[0], patch: { title: 'Stale overwrite' } }] },
  });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).current.revision, 2);

  const undo = await call(service, 'trips/legacy-milan/undo', {
    method: 'POST', cookie,
    body: { mutationId: changedBody.mutation.id, baseRevision: 2, clientMutationId: 'undo-edit-1' },
  });
  assert.equal(undo.status, 200);
  const undone = await undo.json();
  assert.equal(undone.revision, 3);
  assert.equal(undone.trip.bundle.itinerary.days[0].blocks[0].title, 'Duomo di Milano');
});

test('secure invites enforce collaborator and viewer permissions', async () => {
  const { service } = await setup();
  const ownerCookie = await signup(service, 'Owner', 'invite-owner@example.test');
  await call(service, 'state', {
    method: 'PUT', cookie: ownerCookie,
    body: { version: 1, profile: null, trips: [legacyTrip()], activeTrip: 'legacy-milan', group: [], journal: [] },
  });
  const ownerTrip = (await (await call(service, 'trips', { cookie: ownerCookie })).json()).trips[0];
  const day = ownerTrip.trip.bundle.itinerary.days[0];
  const block = day.blocks[0];

  const viewerInvite = await call(service, 'trips/legacy-milan/invites', {
    method: 'POST', cookie: ownerCookie, body: { role: 'viewer', expiresInDays: 7 },
  });
  assert.equal(viewerInvite.status, 201);
  const viewerToken = (await viewerInvite.json()).token;
  const viewerCookie = await signup(service, 'Viewer', 'viewer@example.test');
  const acceptedViewer = await call(service, `invites/${viewerToken}/accept`, { method: 'POST', cookie: viewerCookie });
  assert.equal(acceptedViewer.status, 200);
  assert.equal((await acceptedViewer.json()).role, 'viewer');
  const viewerEdit = await call(service, 'trips/legacy-milan/document', {
    method: 'PATCH', cookie: viewerCookie,
    body: {
      baseRevision: 1, clientMutationId: 'viewer-cannot-edit',
      operations: [{ type: 'itinerary.block.update', dayId: day.id, blockId: block.id, patch: { title: 'Forbidden' } }],
    },
  });
  assert.equal(viewerEdit.status, 403);
  assert.equal((await call(service, `trips/legacy-milan/itinerary/${block.id}/vote`, {
    method: 'POST', cookie: viewerCookie, body: { value: 1 },
  })).status, 403);

  const collaboratorInvite = await call(service, 'trips/legacy-milan/invites', {
    method: 'POST', cookie: ownerCookie, body: { role: 'collaborator', expiresInDays: 7 },
  });
  const collaboratorToken = (await collaboratorInvite.json()).token;
  const collaboratorCookie = await signup(service, 'Collaborator', 'collaborator@example.test');
  const acceptedCollaborator = await call(service, `invites/${collaboratorToken}/accept`, { method: 'POST', cookie: collaboratorCookie });
  assert.equal((await acceptedCollaborator.json()).role, 'collaborator');
  const vibeVote = await call(service, 'trips/legacy-milan/vibes/vote', {
    method: 'POST', cookie: collaboratorCookie,
    body: { primaryVibe: 'live-like-local', secondaryVibe: 'food-focused' },
  });
  assert.equal(vibeVote.status, 200);
  assert.equal((await vibeVote.json()).context.vibeResult.primary, 'live-like-local');
  assert.equal((await call(service, `trips/legacy-milan/itinerary/${block.id}/vote`, {
    method: 'POST', cookie: collaboratorCookie, body: { value: -1, note: 'Too crowded' },
  })).status, 200);

  const ownerAfter = await (await call(service, 'trips/legacy-milan', { cookie: ownerCookie })).json();
  assert.equal(ownerAfter.members.length, 3);
  assert.equal(ownerAfter.votes.vibes.length, 1);
  assert.equal(ownerAfter.votes.itinerary[0].note, 'Too crowded');
});

test('revoked invitations cannot be accepted and raw tokens are not persisted', async () => {
  const { service, dataFile } = await setup();
  const ownerCookie = await signup(service, 'Owner', 'revoke-owner@example.test');
  await call(service, 'state', {
    method: 'PUT', cookie: ownerCookie,
    body: { version: 1, profile: null, trips: [legacyTrip()], activeTrip: 'legacy-milan', group: [], journal: [] },
  });
  await call(service, 'trips', { cookie: ownerCookie });
  const created = await call(service, 'trips/legacy-milan/invites', {
    method: 'POST', cookie: ownerCookie, body: { role: 'viewer' },
  });
  const invite = await created.json();
  assert.doesNotMatch(await readFile(dataFile, 'utf8'), new RegExp(invite.token));
  assert.equal((await call(service, `trips/legacy-milan/invites/${invite.invite.id}`, {
    method: 'DELETE', cookie: ownerCookie,
  })).status, 200);
  const recipientCookie = await signup(service, 'Recipient', 'recipient@example.test');
  assert.equal((await call(service, `invites/${invite.token}/accept`, {
    method: 'POST', cookie: recipientCookie,
  })).status, 410);
});
