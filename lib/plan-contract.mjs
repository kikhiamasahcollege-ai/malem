import {
  applyTripOperations,
  normalizeTripDocument,
} from './trip-contract.mjs';

const MAX_PLAN_BYTES = 2_000_000;
const MAX_TEXT = 4_000;
const encoder = new TextEncoder();

export const PLAN_DOCUMENT_VERSION = 3;

export const PLAN_TYPES = Object.freeze({
  trip: 'trip',
  event: 'event',
  blank: 'blank',
});

export const PLAN_AI_MODES = Object.freeze({
  off: 'off',
  assist: 'assist',
  guided: 'guided',
});

export const PLAN_MODULES = Object.freeze([
  'overview',
  'schedule',
  'explore',
  'bookings',
  'inspiration',
  'packing',
  'tasks',
  'money',
  'people',
  'journal',
]);

export const PLAN_ROLES = Object.freeze({
  owner: 'owner',
  planner: 'planner',
  collaborator: 'collaborator',
  participant: 'participant',
  viewer: 'viewer',
});

export const PLAN_CAPABILITIES = Object.freeze({
  view: 'view',
  editContent: 'edit_content',
  managePlan: 'manage_plan',
  manageMembers: 'manage_members',
  vote: 'vote',
  manageOwnPacking: 'manage_own_packing',
  manageSharedPacking: 'manage_shared_packing',
  completeAssignedTasks: 'complete_assigned_tasks',
  addExpense: 'add_expense',
  manageMoney: 'manage_money',
  viewMoney: 'view_money',
  useAI: 'use_ai',
});

const ROLE_CAPABILITIES = Object.freeze({
  owner: new Set(Object.values(PLAN_CAPABILITIES)),
  planner: new Set([
    PLAN_CAPABILITIES.view,
    PLAN_CAPABILITIES.editContent,
    PLAN_CAPABILITIES.vote,
    PLAN_CAPABILITIES.manageOwnPacking,
    PLAN_CAPABILITIES.manageSharedPacking,
    PLAN_CAPABILITIES.completeAssignedTasks,
    PLAN_CAPABILITIES.addExpense,
    PLAN_CAPABILITIES.viewMoney,
    PLAN_CAPABILITIES.useAI,
  ]),
  participant: new Set([
    PLAN_CAPABILITIES.view,
    PLAN_CAPABILITIES.vote,
    PLAN_CAPABILITIES.manageOwnPacking,
    PLAN_CAPABILITIES.completeAssignedTasks,
    PLAN_CAPABILITIES.addExpense,
  ]),
  viewer: new Set([PLAN_CAPABILITIES.view]),
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value, max = MAX_TEXT) => String(value ?? '').trim().slice(0, max);
const isoNow = () => new Date().toISOString();
const id = (prefix, cryptoApi = globalThis.crypto) =>
  `${prefix}-${cryptoApi?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export const canonicalPlanRole = (role) =>
  role === PLAN_ROLES.collaborator ? PLAN_ROLES.planner
    : Object.values(PLAN_ROLES).includes(role) ? role
      : PLAN_ROLES.viewer;

export const capabilitiesForPlanRole = (role, overrides = {}) => {
  const canonical = canonicalPlanRole(role);
  const result = new Set(ROLE_CAPABILITIES[canonical] || ROLE_CAPABILITIES.viewer);
  Object.entries(overrides || {}).forEach(([capability, enabled]) => {
    if (!Object.values(PLAN_CAPABILITIES).includes(capability)) return;
    if (enabled) result.add(capability);
    else result.delete(capability);
  });
  return result;
};

export const hasPlanCapability = (role, capability, overrides) =>
  capabilitiesForPlanRole(role, overrides).has(capability);

export const canViewPlan = (role, overrides) =>
  hasPlanCapability(role, PLAN_CAPABILITIES.view, overrides);
export const canEditPlan = (role, overrides) =>
  hasPlanCapability(role, PLAN_CAPABILITIES.editContent, overrides);
export const canManagePlan = (role, overrides) =>
  hasPlanCapability(role, PLAN_CAPABILITIES.managePlan, overrides);
export const canVoteOnPlan = (role, overrides) =>
  hasPlanCapability(role, PLAN_CAPABILITIES.vote, overrides);

const defaultsByType = Object.freeze({
  trip: {
    overview: true,
    schedule: true,
    explore: true,
    bookings: true,
    inspiration: true,
    packing: true,
    tasks: true,
    money: true,
    people: true,
    journal: true,
  },
  event: {
    overview: true,
    schedule: true,
    explore: false,
    bookings: true,
    inspiration: true,
    packing: false,
    tasks: true,
    money: true,
    people: true,
    journal: true,
  },
  blank: {
    overview: true,
    schedule: false,
    explore: false,
    bookings: false,
    inspiration: false,
    packing: false,
    tasks: false,
    money: false,
    people: true,
    journal: false,
  },
});

export const defaultPlanModules = (type = PLAN_TYPES.trip) => {
  const planType = Object.values(PLAN_TYPES).includes(type) ? type : PLAN_TYPES.trip;
  return Object.fromEntries(PLAN_MODULES.map((key, index) => [
    key,
    {
      enabled: Boolean(defaultsByType[planType][key]),
      order: index,
    },
  ]));
};

export const normalizePlanModules = (value, type = PLAN_TYPES.trip) => {
  const defaults = defaultPlanModules(type);
  const usedOrders = new Set();
  return Object.fromEntries(PLAN_MODULES.map((key, fallbackOrder) => {
    const candidate = value?.[key];
    let order = Number.isInteger(Number(candidate?.order))
      ? Math.min(PLAN_MODULES.length - 1, Math.max(0, Number(candidate.order)))
      : fallbackOrder;
    while (usedOrders.has(order)) order = (order + 1) % PLAN_MODULES.length;
    usedOrders.add(order);
    return [
      key,
      {
        enabled: key === 'overview' || key === 'people'
          ? true
          : candidate?.enabled == null ? defaults[key].enabled : Boolean(candidate.enabled),
        order,
      },
    ];
  }));
};

const normalizeEditableMeta = (value, prefix, actor, cryptoApi) => ({
  id: text(value?.id, 120) || id(prefix, cryptoApi),
  origin: value?.origin === 'generated' ? 'generated' : 'manual',
  locked: value?.origin === 'generated' ? Boolean(value?.locked) : true,
  updatedAt: text(value?.updatedAt, 60) || isoNow(),
  updatedBy: text(value?.updatedBy, 120) || actor || 'system',
});

const normalizeInspiration = (value, legacyOutfits, actor, cryptoApi) => {
  const suppliedBoards = Array.isArray(value?.boards) ? value.boards : [];
  const boards = suppliedBoards.map((board) => ({
    ...normalizeEditableMeta(board, 'board', actor, cryptoApi),
    title: text(board.title || 'Untitled board', 160),
    kind: board.kind === 'outfits' ? 'outfits' : 'vibe',
    pins: (Array.isArray(board.pins) ? board.pins : []).slice(0, 500).map((pin) => ({
      ...normalizeEditableMeta(pin, 'pin', actor, cryptoApi),
      title: text(pin.title || 'Untitled inspiration', 200),
      caption: text(pin.caption, 1_200),
      sourceUrl: text(pin.sourceUrl, 2_000),
      assetId: text(pin.assetId, 120),
      wardrobeItemId: text(pin.wardrobeItemId, 120),
      scheduleItemId: text(pin.scheduleItemId, 120),
      section: text(pin.section, 120),
      tags: (Array.isArray(pin.tags) ? pin.tags : []).slice(0, 20).map((tag) => text(tag, 80)),
      reactions: pin.reactions && typeof pin.reactions === 'object' ? clone(pin.reactions) : {},
    })),
  }));

  if (!boards.some((board) => board.kind === 'outfits')) {
    boards.unshift({
      ...normalizeEditableMeta({}, 'board', actor, cryptoApi),
      title: 'Outfits',
      kind: 'outfits',
      pins: [],
      ...(legacyOutfits ? { legacyPlan: clone(legacyOutfits) } : {}),
    });
  }
  if (!boards.some((board) => board.kind === 'vibe')) {
    boards.push({
      ...normalizeEditableMeta({}, 'board', actor, cryptoApi),
      title: 'Vibe board',
      kind: 'vibe',
      pins: [],
    });
  }
  return { boards };
};

const collection = (value, limit = 1_000) =>
  (Array.isArray(value) ? value : []).slice(0, limit).map((item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? clone(item) : {});

const normalizeWorkspace = (value = {}) => ({
  tasks: collection(value.tasks),
  people: collection(value.people, 500),
  datePolls: collection(value.datePolls, 100),
  wardrobe: collection(value.wardrobe, 2_000),
  outfits: collection(value.outfits, 500),
  packingSections: collection(value.packingSections, 200),
  packingItems: collection(value.packingItems, 5_000),
  packingTemplates: collection(value.packingTemplates, 200),
  bookings: collection(value.bookings, 1_000),
  ticketWallet: collection(value.ticketWallet, 1_000),
  budgets: collection(value.budgets, 100),
  expenses: collection(value.expenses, 5_000),
  settlements: collection(value.settlements, 2_000),
  connections: collection(value.connections, 100),
  calendarEvents: collection(value.calendarEvents, 2_000),
  reminders: collection(value.reminders, 2_000),
  activity: collection(value.activity, 2_000),
});

const WORKSPACE_COLLECTIONS = Object.freeze(Object.keys(normalizeWorkspace()));

export const normalizePlanDocument = (source, {
  actor = 'system',
  cryptoApi = globalThis.crypto,
} = {}) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw Object.assign(new Error('Plan document must be an object.'), { status: 400 });
  }
  const type = Object.values(PLAN_TYPES).includes(source.type || source.planType)
    ? (source.type || source.planType)
    : PLAN_TYPES.trip;
  const title = text(source.title || source.summary || source.destination || 'Untitled plan', 240);
  const compatibilityTrip = normalizeTripDocument({
    ...clone(source),
    destination: text(source.destination || title, 240),
    summary: title,
    bundle: {
      ...(source.bundle || {}),
      ...(source.schedule ? { itinerary: source.schedule } : {}),
    },
  }, { actor, cryptoApi });
  const defaultMode = type === PLAN_TYPES.trip ? PLAN_AI_MODES.guided : PLAN_AI_MODES.off;
  const aiMode = Object.values(PLAN_AI_MODES).includes(source.aiMode) ? source.aiMode : defaultMode;
  const schedule = clone(source.schedule || compatibilityTrip.bundle.itinerary);
  const document = {
    ...compatibilityTrip,
    documentVersion: PLAN_DOCUMENT_VERSION,
    type,
    title,
    summary: title,
    destination: type === PLAN_TYPES.trip ? text(source.destination || title, 240) : text(source.destination, 240),
    startAt: text(source.startAt || source.arrivalDate || source.startDate, 60),
    endAt: text(source.endAt || source.endDate, 60),
    timezone: text(source.timezone || 'UTC', 100),
    currency: text(source.currency || 'USD', 8).toUpperCase(),
    aiMode,
    modules: normalizePlanModules(source.modules || source.moduleConfig, type),
    schedule,
    explore: {
      discoverSessions: clone(source.explore?.discoverSessions || compatibilityTrip.discoverSessions || []),
      whatToExpect: clone(source.explore?.whatToExpect || compatibilityTrip.bundle?.expect || {}),
      localGuide: clone(source.explore?.localGuide || compatibilityTrip.bundle?.local || {}),
    },
    inspiration: normalizeInspiration(
      source.inspiration,
      compatibilityTrip.bundle?.outfits,
      actor,
      cryptoApi,
    ),
    workspace: normalizeWorkspace(source.workspace),
    event: {
      subtype: text(source.event?.subtype, 80),
      venueName: text(source.event?.venueName, 240),
      guestCount: Math.min(5_000, Math.max(0, Number(source.event?.guestCount) || 0)),
    },
  };
  document.bundle = {
    ...(document.bundle || {}),
    itinerary: document.schedule,
  };
  document.discoverSessions = document.explore.discoverSessions;
  assertPlanDocument(document);
  return document;
};

export const assertPlanDocument = (document) => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw Object.assign(new Error('Plan document must be an object.'), { status: 400 });
  }
  if (document.documentVersion !== PLAN_DOCUMENT_VERSION) {
    throw Object.assign(new Error('Unsupported plan document version.'), { status: 400 });
  }
  if (!text(document.id, 120) || !text(document.title, 240)) {
    throw Object.assign(new Error('Plan ID and title are required.'), { status: 400 });
  }
  if (!Object.values(PLAN_TYPES).includes(document.type)) {
    throw Object.assign(new Error('Unsupported plan type.'), { status: 400 });
  }
  if (document.type === PLAN_TYPES.trip && !text(document.destination, 240)) {
    throw Object.assign(new Error('Trip plans require a destination.'), { status: 400 });
  }
  if (!Array.isArray(document.schedule?.days)) {
    throw Object.assign(new Error('Plan schedule is required.'), { status: 400 });
  }
  if (!document.modules || PLAN_MODULES.some((key) => !document.modules[key])) {
    throw Object.assign(new Error('Plan module configuration is incomplete.'), { status: 400 });
  }
  if (encoder.encode(JSON.stringify(document)).byteLength > MAX_PLAN_BYTES) {
    throw Object.assign(new Error('Plan document is too large.'), { status: 413 });
  }
  return document;
};

export const toTripDocument = (source, options = {}) => {
  const plan = source?.documentVersion === PLAN_DOCUMENT_VERSION
    ? clone(source)
    : normalizePlanDocument(source, options);
  return normalizeTripDocument({
    ...plan,
    documentVersion: 2,
    destination: plan.destination || plan.title,
    summary: plan.title,
    bundle: {
      ...(plan.bundle || {}),
      itinerary: plan.schedule,
      ...(plan.explore?.whatToExpect ? { expect: plan.explore.whatToExpect } : {}),
      ...(plan.explore?.localGuide ? { local: plan.explore.localGuide } : {}),
    },
    discoverSessions: plan.explore?.discoverSessions || plan.discoverSessions || [],
  }, options);
};

const requireEntity = (entity, label) => {
  if (!entity) throw Object.assign(new Error(`${label} was not found.`), { status: 404 });
  return entity;
};

const markManual = (entity, actor) => {
  entity.origin = 'manual';
  entity.locked = true;
  entity.updatedAt = isoNow();
  entity.updatedBy = actor;
};

export const applyPlanOperations = (source, operations, {
  actor = 'system',
  cryptoApi = globalThis.crypto,
} = {}) => {
  if (!Array.isArray(operations) || !operations.length || operations.length > 50) {
    throw Object.assign(new Error('Provide between 1 and 50 plan operations.'), { status: 400 });
  }
  let document = normalizePlanDocument(source, { actor, cryptoApi });
  for (const operation of operations) {
    const type = text(operation?.type, 100);
    if (type === 'plan.update') {
      const patch = operation.patch || {};
      if (patch.title != null) document.title = text(patch.title, 240) || document.title;
      if (patch.destination != null) document.destination = text(patch.destination, 240);
      if (patch.startAt != null) document.startAt = text(patch.startAt, 60);
      if (patch.endAt != null) document.endAt = text(patch.endAt, 60);
      if (patch.timezone != null) document.timezone = text(patch.timezone, 100) || 'UTC';
      if (patch.currency != null) document.currency = text(patch.currency, 8).toUpperCase() || 'USD';
      if (Object.values(PLAN_AI_MODES).includes(patch.aiMode)) document.aiMode = patch.aiMode;
      document.summary = document.title;
    } else if (type === 'schedule.day.add') {
      const next = normalizePlanDocument({
        ...document,
        schedule: {
          ...document.schedule,
          days: [
            ...(document.schedule?.days || []),
            {
              ...(operation.day || {}),
              id: text(operation.day?.id, 120) || id('day', cryptoApi),
              origin: 'manual',
              locked: true,
            },
          ],
        },
      }, { actor, cryptoApi });
      document.schedule = next.schedule;
      document.bundle.itinerary = document.schedule;
    } else if (type === 'schedule.day.remove') {
      const before = document.schedule.days.length;
      document.schedule.days = document.schedule.days.filter((day) => day.id !== operation.dayId);
      if (document.schedule.days.length === before) requireEntity(null, 'Schedule day');
      document.bundle.itinerary = document.schedule;
    } else if (type === 'plan.module.update') {
      const moduleKey = text(operation.module, 40);
      if (!PLAN_MODULES.includes(moduleKey)) {
        throw Object.assign(new Error('Unsupported plan module.'), { status: 400 });
      }
      document.modules[moduleKey] = {
        enabled: ['overview', 'people'].includes(moduleKey) ? true : Boolean(operation.enabled),
        order: Number.isInteger(Number(operation.order))
          ? Math.min(PLAN_MODULES.length - 1, Math.max(0, Number(operation.order)))
          : document.modules[moduleKey].order,
      };
      document.modules = normalizePlanModules(document.modules, document.type);
    } else if (type === 'inspiration.board.add') {
      const board = {
        ...normalizeEditableMeta({ ...(operation.board || {}), origin: 'manual' }, 'board', actor, cryptoApi),
        title: text(operation.board?.title || 'Untitled board', 160),
        kind: operation.board?.kind === 'outfits' ? 'outfits' : 'vibe',
        pins: [],
      };
      document.inspiration.boards.push(board);
    } else if (type === 'inspiration.board.update') {
      const board = requireEntity(
        document.inspiration.boards.find((candidate) => candidate.id === operation.boardId),
        'Inspiration board',
      );
      if (operation.patch?.title != null) board.title = text(operation.patch.title, 160) || board.title;
      markManual(board, actor);
    } else if (type === 'inspiration.board.remove') {
      const before = document.inspiration.boards.length;
      document.inspiration.boards = document.inspiration.boards.filter((board) => board.id !== operation.boardId);
      if (before === document.inspiration.boards.length) requireEntity(null, 'Inspiration board');
    } else if (type === 'inspiration.pin.add') {
      const board = requireEntity(
        document.inspiration.boards.find((candidate) => candidate.id === operation.boardId),
        'Inspiration board',
      );
      const pin = normalizeInspiration(
        { boards: [{ title: board.title, kind: board.kind, pins: [{ ...(operation.pin || {}), origin: 'manual' }] }] },
        null,
        actor,
        cryptoApi,
      ).boards[0].pins[0];
      board.pins.push(pin);
      markManual(board, actor);
    } else if (type === 'inspiration.pin.update') {
      const board = requireEntity(
        document.inspiration.boards.find((candidate) => candidate.id === operation.boardId),
        'Inspiration board',
      );
      const pin = requireEntity(board.pins.find((candidate) => candidate.id === operation.pinId), 'Inspiration pin');
      const allowed = ['title', 'caption', 'sourceUrl', 'assetId', 'wardrobeItemId', 'scheduleItemId', 'section'];
      allowed.forEach((key) => {
        if (operation.patch?.[key] != null) pin[key] = text(operation.patch[key], key === 'caption' ? 1_200 : 2_000);
      });
      if (Array.isArray(operation.patch?.tags)) pin.tags = operation.patch.tags.slice(0, 20).map((tag) => text(tag, 80));
      markManual(pin, actor);
    } else if (type === 'inspiration.pin.remove') {
      const board = requireEntity(
        document.inspiration.boards.find((candidate) => candidate.id === operation.boardId),
        'Inspiration board',
      );
      const before = board.pins.length;
      board.pins = board.pins.filter((pin) => pin.id !== operation.pinId);
      if (before === board.pins.length) requireEntity(null, 'Inspiration pin');
      markManual(board, actor);
    } else if (type === 'workspace.replace') {
      document.workspace = normalizeWorkspace(operation.workspace);
    } else if (type === 'workspace.collection.replace') {
      const collectionName = text(operation.collection, 80);
      if (!WORKSPACE_COLLECTIONS.includes(collectionName)) {
        throw Object.assign(new Error('Unsupported workspace collection.'), { status: 400 });
      }
      document.workspace[collectionName] = normalizeWorkspace({
        [collectionName]: operation.items,
      })[collectionName];
    } else if (type === 'workspace.activity.add') {
      const activity = operation.activity && typeof operation.activity === 'object'
        ? clone(operation.activity) : {};
      document.workspace.activity = [
        {
          id: text(activity.id, 120) || id('activity', cryptoApi),
          summary: text(activity.summary, 500),
          notes: text(activity.notes, 2_000),
          actor: text(activity.actor, 160) || actor,
          createdAt: text(activity.createdAt, 60) || isoNow(),
        },
        ...document.workspace.activity,
      ].slice(0, 2_000);
    } else {
      const legacyOperation = type.startsWith('schedule.')
        ? { ...operation, type: `itinerary.${type.slice('schedule.'.length)}` }
        : operation;
      const trip = applyTripOperations(toTripDocument(document, { actor, cryptoApi }), [legacyOperation], {
        actor,
        cryptoApi,
      });
      document = normalizePlanDocument({
        ...document,
        ...trip,
        documentVersion: PLAN_DOCUMENT_VERSION,
        type: document.type,
        title: document.title,
        destination: document.destination,
        schedule: trip.bundle.itinerary,
        modules: document.modules,
        inspiration: document.inspiration,
        aiMode: document.aiMode,
      }, { actor, cryptoApi });
    }
  }
  document.bundle.itinerary = document.schedule;
  document.summary = document.title;
  assertPlanDocument(document);
  return document;
};
