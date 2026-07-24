import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_AI_MODES,
  PLAN_CAPABILITIES,
  PLAN_DOCUMENT_VERSION,
  PLAN_ROLES,
  applyPlanOperations,
  canEditPlan,
  canVoteOnPlan,
  capabilitiesForPlanRole,
  defaultPlanModules,
  normalizePlanDocument,
  toTripDocument,
} from '../lib/plan-contract.mjs';

const seedTrip = {
  id: 'trip-v3',
  destination: 'Milan',
  summary: 'Milan',
  arrivalDate: '2026-08-12',
  bundle: {
    itinerary: {
      days: [{
        id: 'day-1',
        date: '2026-08-12',
        theme: 'Arrival',
        blocks: [{
          id: 'block-1',
          time: '14:20',
          title: 'Arrive in Milan',
          duration: '90 min',
          kind: 'transit',
        }],
      }],
    },
    packing: {
      lists: [{
        id: 'section-1',
        title: 'Pack from home',
        items: [{ id: 'item-1', item: 'Passport', why: 'International trip' }],
      }],
      reminders: [],
    },
  },
};

test('Plan V3 migrates a Trip Document V2 without losing itinerary or packing compatibility', () => {
  const plan = normalizePlanDocument(seedTrip, { actor: 'user-1' });
  assert.equal(plan.documentVersion, PLAN_DOCUMENT_VERSION);
  assert.equal(plan.type, 'trip');
  assert.equal(plan.title, 'Milan');
  assert.equal(plan.schedule.days[0].blocks[0].title, 'Arrive in Milan');
  assert.equal(plan.bundle.itinerary.days[0].blocks[0].id, plan.schedule.days[0].blocks[0].id);
  assert.equal(plan.bundle.packing.lists[0].items[0].item, 'Passport');
  assert.equal(plan.aiMode, PLAN_AI_MODES.guided);
  assert.equal(plan.modules.explore.enabled, true);
  assert.equal(plan.inspiration.boards.some((board) => board.kind === 'outfits'), true);
  assert.equal(plan.inspiration.boards.some((board) => board.kind === 'vibe'), true);

  const compatibility = toTripDocument(plan, { actor: 'user-1' });
  assert.equal(compatibility.documentVersion, 2);
  assert.equal(compatibility.bundle.itinerary.days[0].blocks[0].title, 'Arrive in Milan');
});

test('blank plans default to no AI and enable only the non-removable shell modules', () => {
  const plan = normalizePlanDocument({
    id: 'blank-1',
    type: 'blank',
    title: 'Summer planning',
    bundle: { itinerary: { days: [] }, packing: { lists: [], reminders: [] } },
  });
  assert.equal(plan.aiMode, PLAN_AI_MODES.off);
  assert.equal(plan.destination, '');
  assert.equal(plan.modules.overview.enabled, true);
  assert.equal(plan.modules.people.enabled, true);
  assert.equal(plan.modules.schedule.enabled, false);
  assert.equal(plan.modules.explore.enabled, false);
  assert.deepEqual(defaultPlanModules('blank'), plan.modules);
});

test('role capabilities preserve legacy collaborators while adding participants', () => {
  assert.equal(canEditPlan(PLAN_ROLES.owner), true);
  assert.equal(canEditPlan(PLAN_ROLES.planner), true);
  assert.equal(canEditPlan(PLAN_ROLES.collaborator), true);
  assert.equal(canEditPlan(PLAN_ROLES.participant), false);
  assert.equal(canVoteOnPlan(PLAN_ROLES.participant), true);
  assert.equal(canVoteOnPlan(PLAN_ROLES.viewer), false);
  assert.equal(
    capabilitiesForPlanRole(PLAN_ROLES.participant).has(PLAN_CAPABILITIES.manageOwnPacking),
    true,
  );
});

test('plan operations update modules, inspiration, and schedule through one revision-safe contract', () => {
  const plan = normalizePlanDocument(seedTrip, { actor: 'user-1' });
  const outfits = plan.inspiration.boards.find((board) => board.kind === 'outfits');
  const updated = applyPlanOperations(plan, [
    { type: 'plan.update', patch: { title: 'Milan anniversary', currency: 'eur', aiMode: 'assist' } },
    { type: 'plan.module.update', module: 'journal', enabled: false, order: 9 },
    {
      type: 'inspiration.pin.add',
      boardId: outfits.id,
      pin: { title: 'Formal dinner look', section: 'Evening', tags: ['formal', 'black'] },
    },
    {
      type: 'schedule.block.update',
      dayId: 'day-1',
      blockId: 'block-1',
      patch: { title: 'Land at Malpensa' },
    },
  ], { actor: 'user-1' });

  assert.equal(updated.title, 'Milan anniversary');
  assert.equal(updated.currency, 'EUR');
  assert.equal(updated.aiMode, 'assist');
  assert.equal(updated.modules.journal.enabled, false);
  assert.equal(
    updated.inspiration.boards.find((board) => board.kind === 'outfits').pins[0].title,
    'Formal dinner look',
  );
  assert.equal(updated.schedule.days[0].blocks[0].title, 'Land at Malpensa');
});

test('workspace collections persist every integrated planning module through the plan contract', () => {
  const plan = normalizePlanDocument(seedTrip, { actor: 'user-1' });
  const updated = applyPlanOperations(plan, [{
    type: 'workspace.replace',
    workspace: {
      tasks: [{ id: 'task-1', title: 'Confirm dinner', status: 'open' }],
      wardrobe: [{ id: 'wear-1', name: 'Black linen dress', category: 'dress' }],
      packingItems: [{ id: 'pack-1', name: 'Black linen dress', section: 'wardrobe' }],
      bookings: [{ id: 'booking-1', type: 'flight', confirmation: 'ABC123' }],
      expenses: [{ id: 'expense-1', amount: 120, paidBy: 'user-1' }],
      reminders: [{ id: 'reminder-1', title: 'Check in', dueAt: '2026-08-11T14:00:00Z' }],
    },
  }], { actor: 'user-1' });
  assert.equal(updated.workspace.tasks[0].title, 'Confirm dinner');
  assert.equal(updated.workspace.wardrobe[0].name, 'Black linen dress');
  assert.equal(updated.workspace.packingItems[0].section, 'wardrobe');
  assert.equal(updated.workspace.bookings[0].confirmation, 'ABC123');
  assert.equal(updated.workspace.expenses[0].amount, 120);
  assert.equal(updated.workspace.reminders[0].title, 'Check in');
});

test('an empty event schedule can add its first day and item in one mutation', () => {
  const plan = normalizePlanDocument({
    id: 'event-1',
    type: 'event',
    title: 'Dinner',
    bundle: { itinerary: { days: [] }, packing: { lists: [], reminders: [] } },
  });
  const updated = applyPlanOperations(plan, [
    { type: 'schedule.day.add', day: { id: 'day-event', date: '2026-09-05', theme: 'Dinner' } },
    { type: 'schedule.block.add', dayId: 'day-event', block: { title: 'Guest arrival', time: '19:00' } },
  ]);
  assert.equal(updated.schedule.days.length, 1);
  assert.equal(updated.schedule.days[0].blocks[0].title, 'Guest arrival');
});
