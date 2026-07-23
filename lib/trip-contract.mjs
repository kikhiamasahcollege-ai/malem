const MAX_TEXT = 4_000;
const MAX_DESCRIPTION = 1_200;
const MAX_OPERATIONS = 50;
const MAX_DOCUMENT_BYTES = 1_750_000;
const encoder = new TextEncoder();

export const TRIP_DOCUMENT_VERSION = 2;
export const TRIP_ROLES = Object.freeze({
  owner: 'owner',
  collaborator: 'collaborator',
  viewer: 'viewer',
});

export const canEditTrip = (role) => role === TRIP_ROLES.owner || role === TRIP_ROLES.collaborator;
export const canManageTrip = (role) => role === TRIP_ROLES.owner;
export const canVoteOnTrip = canEditTrip;

const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value, max = MAX_TEXT) => String(value ?? '').trim().slice(0, max);
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const integer = (value) => Number.isInteger(Number(value)) ? Number(value) : undefined;
const isoNow = () => new Date().toISOString();

export const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
};

export const makeMapsDirectionsUrl = (place = {}, origin = '') => {
  const destination = place.latitude != null && place.longitude != null
    ? `${Number(place.latitude)},${Number(place.longitude)}`
    : [place.name, place.address].filter(Boolean).join(', ');
  if (!destination) return '';
  const params = new URLSearchParams({ api: '1', destination });
  if (origin) params.set('origin', String(origin));
  if (place.providerPlaceId) params.set('destination_place_id', String(place.providerPlaceId));
  if (place.travelMode && ['driving', 'walking', 'bicycling', 'transit', 'two-wheeler'].includes(place.travelMode)) {
    params.set('travelmode', place.travelMode);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

const newId = (prefix, cryptoApi = globalThis.crypto) => {
  const random = cryptoApi?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
};

const normalizeMeta = (value, prefix, actor, cryptoApi) => ({
  id: text(value?.id, 120) || newId(prefix, cryptoApi),
  origin: value?.origin === 'manual' ? 'manual' : 'generated',
  locked: Boolean(value?.locked),
  updatedAt: text(value?.updatedAt, 60) || isoNow(),
  updatedBy: text(value?.updatedBy, 120) || actor || 'system',
});

export const normalizeBookingEvidence = (value = {}) => {
  const required = ['yes', 'no', 'unknown'].includes(value.required) ? value.required : 'unknown';
  const amount = finite(value.price?.amount);
  const currency = text(value.price?.currency, 8).toUpperCase();
  const price = amount != null && amount >= 0 && currency
    ? {
        amount,
        currency,
        ...(['from', 'standard'].includes(value.price?.qualifier) ? { qualifier: value.price.qualifier } : {}),
      }
    : undefined;
  return {
    required,
    ...(required === 'yes' && safeHttpUrl(value.officialBookingUrl) ? { officialBookingUrl: safeHttpUrl(value.officialBookingUrl) } : {}),
    ...(price ? { price } : {}),
    ...(text(value.priceCheckedAt, 40) ? { priceCheckedAt: text(value.priceCheckedAt, 40) } : {}),
    ...(safeHttpUrl(value.sourceUrl) ? { sourceUrl: safeHttpUrl(value.sourceUrl) } : {}),
  };
};

export const normalizePlaceOption = (value = {}, { cryptoApi = globalThis.crypto } = {}) => {
  const latitude = finite(value.latitude ?? value.location?.latitude);
  const longitude = finite(value.longitude ?? value.location?.longitude);
  const place = {
    id: text(value.id, 120) || newId('place', cryptoApi),
    ...(text(value.providerPlaceId || value.placeId, 240) ? { providerPlaceId: text(value.providerPlaceId || value.placeId, 240) } : {}),
    name: text(value.name || value.displayName?.text, 240),
    description: text(value.description || value.editorialSummary?.text || value.reviewSummary || value.sub, MAX_DESCRIPTION),
    category: text(value.category || value.primaryType || value.kind, 80),
    ...(text(value.address || value.formattedAddress, 500) ? { address: text(value.address || value.formattedAddress, 500) } : {}),
    ...(latitude != null && latitude >= -90 && latitude <= 90 ? { latitude } : {}),
    ...(longitude != null && longitude >= -180 && longitude <= 180 ? { longitude } : {}),
    ...(finite(value.rating) != null && finite(value.rating) >= 0 && finite(value.rating) <= 5 ? { rating: finite(value.rating) } : {}),
    ...(integer(value.reviewCount ?? value.userRatingCount) != null && integer(value.reviewCount ?? value.userRatingCount) >= 0
      ? { reviewCount: integer(value.reviewCount ?? value.userRatingCount) } : {}),
    ...(text(value.reviewSummary, MAX_DESCRIPTION) ? { reviewSummary: text(value.reviewSummary, MAX_DESCRIPTION) } : {}),
    sourceUrl: safeHttpUrl(value.sourceUrl || value.googleMapsUri || value.googleMapsLinks?.placeUri),
    ...(safeHttpUrl(value.reviewsUrl || value.reviewSourceUrl) ? { reviewsUrl: safeHttpUrl(value.reviewsUrl || value.reviewSourceUrl) } : {}),
    ...(safeHttpUrl(value.officialUrl || value.websiteUri) ? { officialUrl: safeHttpUrl(value.officialUrl || value.websiteUri) } : {}),
    checkedAt: text(value.checkedAt, 40) || new Date().toISOString().slice(0, 10),
  };
  place.directionsUrl = safeHttpUrl(value.directionsUrl) || makeMapsDirectionsUrl(place);
  return place;
};

const normalizeItinerary = (itinerary, actor, cryptoApi) => ({
  ...(itinerary || {}),
  respectedFromProfile: Array.isArray(itinerary?.respectedFromProfile)
    ? itinerary.respectedFromProfile.slice(0, 80).map((item) => text(item, 240)) : [],
  days: (Array.isArray(itinerary?.days) ? itinerary.days : []).slice(0, 60).map((day) => ({
    ...day,
    ...normalizeMeta(day, 'day', actor, cryptoApi),
    date: text(day.date, 40),
    theme: text(day.theme, 240),
    blocks: (Array.isArray(day.blocks) ? day.blocks : []).slice(0, 80).map((block) => {
      const place = block.place ? normalizePlaceOption(block.place, { cryptoApi }) : null;
      const sourceUrl = safeHttpUrl(block.sourceUrl);
      // Every named, non-transit itinerary stop gets a place record. Even when
      // upstream research is degraded, this gives the client a useful Maps
      // directions/search link instead of a dead card.
      const legacyPlace = !place && block.title && block.kind !== 'transit'
        ? normalizePlaceOption({
            ...block,
            name: block.title,
            description: block.reviewSummary || block.notes || '',
            category: block.kind,
          }, { cryptoApi })
        : null;
      return {
        ...block,
        ...normalizeMeta(block, 'block', actor, cryptoApi),
        time: text(block.time, 20),
        title: text(block.title, 240),
        duration: text(block.duration, 80),
        kind: ['meal', 'sight', 'activity', 'rest', 'transit', 'shopping'].includes(block.kind) ? block.kind : 'activity',
        ...(text(block.notes, MAX_DESCRIPTION) ? { notes: text(block.notes, MAX_DESCRIPTION) } : {}),
        ...(Array.isArray(block.respects) ? { respects: block.respects.slice(0, 30).map((item) => text(item, 120)) } : {}),
        ...((place || legacyPlace) ? { place: place || legacyPlace } : {}),
        booking: normalizeBookingEvidence(block.booking || {
          required: block.ticketRequired === true ? 'yes' : 'unknown',
          officialBookingUrl: block.bookingUrl,
          price: block.ticketPrice,
          priceCheckedAt: block.priceCheckedAt,
          sourceUrl: block.bookingSourceUrl,
        }),
      };
    }),
  })),
});

const normalizePacking = (packing, actor, cryptoApi) => ({
  ...(packing || {}),
  lists: (Array.isArray(packing?.lists) ? packing.lists : []).slice(0, 30).map((section) => ({
    ...section,
    ...normalizeMeta(section, 'pack-section', actor, cryptoApi),
    title: text(section.title, 160),
    tone: text(section.tone, 40),
    items: (Array.isArray(section.items) ? section.items : []).slice(0, 250).map((item) => ({
      ...item,
      ...normalizeMeta(item, 'pack-item', actor, cryptoApi),
      item: text(item.item, 300),
      why: text(item.why, 600),
      checked: Boolean(item.checked),
    })),
  })),
  reminders: (Array.isArray(packing?.reminders) ? packing.reminders : []).slice(0, 50).map((reminder) => ({
    ...reminder,
    ...normalizeMeta(reminder, 'reminder', actor, cryptoApi),
    when: text(reminder.when, 120),
    text: text(reminder.text, 600),
  })),
});

const normalizeDiscover = (sessions, actor, cryptoApi) =>
  (Array.isArray(sessions) ? sessions : []).slice(-20).map((session) => ({
    ...session,
    ...normalizeMeta(session, 'discover', actor, cryptoApi),
    context: {
      destination: text(session.context?.destination, 240),
      hours: Math.min(12, Math.max(1, Number(session.context?.hours) || 3)),
      weather: text(session.context?.weather, 40),
      energy: text(session.context?.energy, 40),
      party: text(session.context?.party, 40),
      startingLocation: text(session.context?.startingLocation, 500),
    },
    generatedAt: text(session.generatedAt, 60) || isoNow(),
    stale: Boolean(session.stale),
    degraded: Boolean(session.degraded),
    plans: (Array.isArray(session.plans) ? session.plans : []).slice(0, 6).map((plan) => ({
      ...plan,
      ...normalizeMeta(plan, 'discover-plan', actor, cryptoApi),
      title: text(plan.title, 200),
      badge: text(plan.badge, 120),
      why: text(plan.why, 800),
      steps: (Array.isArray(plan.steps) ? plan.steps : []).slice(0, 12).map((step) => ({
        ...(typeof step === 'string' ? { title: step } : step),
        ...normalizeMeta(typeof step === 'string' ? {} : step, 'discover-step', actor, cryptoApi),
        title: text(typeof step === 'string' ? step : step.title, 240),
        description: text(typeof step === 'string' ? '' : step.description, MAX_DESCRIPTION),
        intent: text(typeof step === 'string' ? '' : step.intent, 100),
        options: (Array.isArray(step?.options) ? step.options : []).slice(0, 4)
          .map((option) => normalizePlaceOption(option, { cryptoApi })),
        selectedOptionId: text(step?.selectedOptionId, 120),
      })),
    })),
  }));

export const normalizeTripDocument = (trip, {
  actor = 'system',
  group = [],
  journal = [],
  cryptoApi = globalThis.crypto,
} = {}) => {
  if (!trip || typeof trip !== 'object' || Array.isArray(trip)) {
    throw Object.assign(new Error('Trip document must be an object.'), { status: 400 });
  }
  const document = clone(trip);
  document.documentVersion = TRIP_DOCUMENT_VERSION;
  document.id = text(document.id, 120) || newId('trip', cryptoApi);
  document.destination = text(document.destination, 240);
  document.summary = text(document.summary, 300) || document.destination;
  document.bundle = document.bundle && typeof document.bundle === 'object' ? document.bundle : {};
  document.bundle.itinerary = normalizeItinerary(document.bundle.itinerary, actor, cryptoApi);
  document.bundle.packing = normalizePacking(document.bundle.packing, actor, cryptoApi);
  document.discoverSessions = normalizeDiscover(document.discoverSessions, actor, cryptoApi);
  document.group = Array.isArray(document.group) ? document.group : clone(group || []);
  document.collaboration = {
    ...(document.collaboration || {}),
    sharedConstraints: (Array.isArray(document.collaboration?.sharedConstraints)
      ? document.collaboration.sharedConstraints : [])
      .slice(0, 80).map((item) => text(item, 300)),
  };
  document.journal = (Array.isArray(document.journal) ? document.journal : clone(journal || []))
    .slice(0, 500).map((entry) => ({
      ...entry,
      ...normalizeMeta(entry, 'journal', actor, cryptoApi),
      title: text(entry.title || 'Untitled entry', 160),
      did: text(entry.did, 2_000),
      change: text(entry.change, 2_000),
      accessAccuracy: text(entry.accessAccuracy, 40),
      dietAccuracy: text(entry.dietAccuracy, 40),
      destination: text(entry.destination || document.destination, 240),
      date: text(entry.date, 40) || new Date().toISOString().slice(0, 10),
      publicEntry: Boolean(entry.publicEntry),
    }));
  assertTripDocument(document);
  return document;
};

export const assertTripDocument = (document) => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw Object.assign(new Error('Trip document must be an object.'), { status: 400 });
  }
  if (document.documentVersion !== TRIP_DOCUMENT_VERSION) {
    throw Object.assign(new Error('Unsupported trip document version.'), { status: 400 });
  }
  if (!text(document.id, 120) || !text(document.destination, 240)) {
    throw Object.assign(new Error('Trip ID and destination are required.'), { status: 400 });
  }
  if (!Array.isArray(document.bundle?.itinerary?.days) || !Array.isArray(document.bundle?.packing?.lists)) {
    throw Object.assign(new Error('Trip itinerary and packing lists are required.'), { status: 400 });
  }
  if (encoder.encode(JSON.stringify(document)).byteLength > MAX_DOCUMENT_BYTES) {
    throw Object.assign(new Error('Trip document is too large.'), { status: 413 });
  }
  return document;
};

const editablePatch = (patch, allowed) => Object.fromEntries(
  Object.entries(patch || {}).filter(([key]) => allowed.includes(key)),
);

const findDay = (document, dayId) => document.bundle.itinerary.days.find((day) => day.id === dayId);
const findSection = (document, sectionId) => document.bundle.packing.lists.find((section) => section.id === sectionId);
const findDiscoverSession = (document, sessionId) => document.discoverSessions.find((session) => session.id === sessionId);
const findPlan = (session, planId) => session?.plans?.find((plan) => plan.id === planId);

const placeAfter = (list, value, afterId) => {
  if (!afterId) list.push(value);
  else {
    const index = list.findIndex((item) => item.id === afterId);
    list.splice(index < 0 ? list.length : index + 1, 0, value);
  }
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

export const applyTripOperations = (source, operations, {
  actor = 'system',
  cryptoApi = globalThis.crypto,
} = {}) => {
  if (!Array.isArray(operations) || !operations.length || operations.length > MAX_OPERATIONS) {
    throw Object.assign(new Error(`Provide between 1 and ${MAX_OPERATIONS} trip operations.`), { status: 400 });
  }
  const document = normalizeTripDocument(source, { actor, cryptoApi });
  for (const operation of operations) {
    const type = text(operation?.type, 80);
    if (type === 'regeneration.apply') {
      const merged = mergeGeneratedTrip(document, operation.generatedTrip || {}, { actor, cryptoApi }).document;
      Object.keys(document).forEach((key) => { delete document[key]; });
      Object.assign(document, merged);
    } else if (type === 'itinerary.day.update') {
      const day = requireEntity(findDay(document, operation.dayId), 'Itinerary day');
      Object.assign(day, editablePatch(operation.patch, ['date', 'theme']));
      markManual(day, actor);
    } else if (type === 'itinerary.block.add') {
      const day = requireEntity(findDay(document, operation.dayId), 'Itinerary day');
      const block = normalizeItinerary({ days: [{ blocks: [{ ...(operation.block || {}), origin: 'manual', locked: true }] }] }, actor, cryptoApi).days[0].blocks[0];
      placeAfter(day.blocks, block, operation.afterId);
      markManual(day, actor);
    } else if (type === 'itinerary.block.update') {
      const day = requireEntity(findDay(document, operation.dayId), 'Itinerary day');
      const block = requireEntity(day.blocks.find((item) => item.id === operation.blockId), 'Itinerary item');
      Object.assign(block, editablePatch(operation.patch, ['time', 'title', 'duration', 'kind', 'notes', 'respects']));
      if (operation.patch?.place) block.place = normalizePlaceOption(operation.patch.place, { cryptoApi });
      if (operation.patch?.booking) block.booking = normalizeBookingEvidence(operation.patch.booking);
      markManual(block, actor);
    } else if (type === 'itinerary.block.remove') {
      const day = requireEntity(findDay(document, operation.dayId), 'Itinerary day');
      const before = day.blocks.length;
      day.blocks = day.blocks.filter((item) => item.id !== operation.blockId);
      if (day.blocks.length === before) requireEntity(null, 'Itinerary item');
      markManual(day, actor);
    } else if (type === 'itinerary.block.move') {
      const from = requireEntity(findDay(document, operation.fromDayId), 'Source itinerary day');
      const to = requireEntity(findDay(document, operation.toDayId), 'Destination itinerary day');
      const index = from.blocks.findIndex((item) => item.id === operation.blockId);
      const block = requireEntity(index >= 0 ? from.blocks[index] : null, 'Itinerary item');
      from.blocks.splice(index, 1);
      placeAfter(to.blocks, block, operation.afterId);
      markManual(block, actor);
    } else if (type === 'packing.section.add') {
      const section = normalizePacking({ lists: [{ ...(operation.section || {}), origin: 'manual', locked: true }] }, actor, cryptoApi).lists[0];
      placeAfter(document.bundle.packing.lists, section, operation.afterId);
    } else if (type === 'packing.replace') {
      document.bundle.packing = normalizePacking(operation.packing || {}, actor, cryptoApi);
    } else if (type === 'packing.section.update') {
      const section = requireEntity(findSection(document, operation.sectionId), 'Packing section');
      Object.assign(section, editablePatch(operation.patch, ['title', 'tone']));
      markManual(section, actor);
    } else if (type === 'packing.section.remove') {
      const before = document.bundle.packing.lists.length;
      document.bundle.packing.lists = document.bundle.packing.lists.filter((item) => item.id !== operation.sectionId);
      if (before === document.bundle.packing.lists.length) requireEntity(null, 'Packing section');
    } else if (type === 'packing.item.add') {
      const section = requireEntity(findSection(document, operation.sectionId), 'Packing section');
      const item = normalizePacking({ lists: [{ items: [{ ...(operation.item || {}), origin: 'manual', locked: true }] }] }, actor, cryptoApi).lists[0].items[0];
      placeAfter(section.items, item, operation.afterId);
      markManual(section, actor);
    } else if (type === 'packing.item.update') {
      const section = requireEntity(findSection(document, operation.sectionId), 'Packing section');
      const item = requireEntity(section.items.find((candidate) => candidate.id === operation.itemId), 'Packing item');
      Object.assign(item, editablePatch(operation.patch, ['item', 'why', 'checked']));
      markManual(item, actor);
    } else if (type === 'packing.item.remove') {
      const section = requireEntity(findSection(document, operation.sectionId), 'Packing section');
      const before = section.items.length;
      section.items = section.items.filter((candidate) => candidate.id !== operation.itemId);
      if (before === section.items.length) requireEntity(null, 'Packing item');
      markManual(section, actor);
    } else if (type === 'packing.item.move') {
      const from = requireEntity(findSection(document, operation.fromSectionId), 'Source packing section');
      const to = requireEntity(findSection(document, operation.toSectionId), 'Destination packing section');
      const index = from.items.findIndex((candidate) => candidate.id === operation.itemId);
      const item = requireEntity(index >= 0 ? from.items[index] : null, 'Packing item');
      from.items.splice(index, 1);
      placeAfter(to.items, item, operation.afterId);
      markManual(item, actor);
    } else if (type === 'packing.reminder.add') {
      const reminder = normalizePacking({ reminders: [{ ...(operation.reminder || {}), origin: 'manual', locked: true }] }, actor, cryptoApi).reminders[0];
      placeAfter(document.bundle.packing.reminders, reminder, operation.afterId);
    } else if (type === 'packing.reminder.update') {
      const reminder = requireEntity(document.bundle.packing.reminders.find((candidate) => candidate.id === operation.reminderId), 'Packing reminder');
      Object.assign(reminder, editablePatch(operation.patch, ['when', 'text']));
      markManual(reminder, actor);
    } else if (type === 'packing.reminder.remove') {
      const before = document.bundle.packing.reminders.length;
      document.bundle.packing.reminders = document.bundle.packing.reminders.filter((candidate) => candidate.id !== operation.reminderId);
      if (before === document.bundle.packing.reminders.length) requireEntity(null, 'Packing reminder');
    } else if (type === 'discover.session.upsert') {
      const normalized = normalizeDiscover([operation.session || {}], actor, cryptoApi)[0];
      const index = document.discoverSessions.findIndex((session) => session.id === normalized.id);
      if (index >= 0) document.discoverSessions[index] = normalized;
      else document.discoverSessions.push(normalized);
    } else if (type === 'discover.plan.update') {
      const session = requireEntity(findDiscoverSession(document, operation.sessionId), 'Discover session');
      const plan = requireEntity(findPlan(session, operation.planId), 'Discover plan');
      Object.assign(plan, editablePatch(operation.patch, ['title', 'badge', 'why']));
      markManual(plan, actor);
    } else if (type === 'discover.step.add') {
      const session = requireEntity(findDiscoverSession(document, operation.sessionId), 'Discover session');
      const plan = requireEntity(findPlan(session, operation.planId), 'Discover plan');
      const step = normalizeDiscover([{ plans: [{ steps: [{ ...(operation.step || {}), origin: 'manual', locked: true }] }] }], actor, cryptoApi)[0].plans[0].steps[0];
      placeAfter(plan.steps, step, operation.afterId);
      markManual(plan, actor);
    } else if (type === 'discover.step.update') {
      const session = requireEntity(findDiscoverSession(document, operation.sessionId), 'Discover session');
      const plan = requireEntity(findPlan(session, operation.planId), 'Discover plan');
      const step = requireEntity(plan.steps.find((item) => item.id === operation.stepId), 'Discover step');
      Object.assign(step, editablePatch(operation.patch, ['title', 'description', 'intent', 'selectedOptionId']));
      if (Array.isArray(operation.patch?.options)) {
        step.options = operation.patch.options.slice(0, 4).map((option) => normalizePlaceOption(option, { cryptoApi }));
      }
      markManual(step, actor);
    } else if (type === 'discover.step.remove') {
      const session = requireEntity(findDiscoverSession(document, operation.sessionId), 'Discover session');
      const plan = requireEntity(findPlan(session, operation.planId), 'Discover plan');
      const before = plan.steps.length;
      plan.steps = plan.steps.filter((item) => item.id !== operation.stepId);
      if (before === plan.steps.length) requireEntity(null, 'Discover step');
      markManual(plan, actor);
    } else if (type === 'discover.step.move') {
      const session = requireEntity(findDiscoverSession(document, operation.sessionId), 'Discover session');
      const plan = requireEntity(findPlan(session, operation.planId), 'Discover plan');
      const index = plan.steps.findIndex((item) => item.id === operation.stepId);
      const step = requireEntity(index >= 0 ? plan.steps[index] : null, 'Discover step');
      plan.steps.splice(index, 1);
      placeAfter(plan.steps, step, operation.afterId);
      markManual(step, actor);
    } else if (type === 'collaboration.constraints.update') {
      document.collaboration.sharedConstraints = (Array.isArray(operation.constraints) ? operation.constraints : [])
        .slice(0, 80).map((item) => text(item, 300)).filter(Boolean);
    } else if (type === 'journal.add') {
      const entry = {
        ...(operation.entry || {}),
        ...normalizeMeta({ ...(operation.entry || {}), origin: 'manual', locked: true }, 'journal', actor, cryptoApi),
        title: text(operation.entry?.title || 'Untitled entry', 160),
        did: text(operation.entry?.did, 2_000),
        change: text(operation.entry?.change, 2_000),
        accessAccuracy: text(operation.entry?.accessAccuracy, 40),
        dietAccuracy: text(operation.entry?.dietAccuracy, 40),
        destination: text(operation.entry?.destination || document.destination, 240),
        date: text(operation.entry?.date, 40) || new Date().toISOString().slice(0, 10),
        publicEntry: Boolean(operation.entry?.publicEntry),
      };
      document.journal.push(entry);
    } else if (type === 'journal.update') {
      const entry = requireEntity(document.journal.find((candidate) => candidate.id === operation.entryId), 'Journal entry');
      Object.assign(entry, editablePatch(operation.patch, ['title', 'did', 'change', 'accessAccuracy', 'dietAccuracy', 'publicEntry']));
      markManual(entry, actor);
    } else if (type === 'journal.remove') {
      const before = document.journal.length;
      document.journal = document.journal.filter((candidate) => candidate.id !== operation.entryId);
      if (before === document.journal.length) requireEntity(null, 'Journal entry');
    } else {
      throw Object.assign(new Error(`Unsupported trip operation: ${type || 'missing type'}.`), { status: 400 });
    }
  }
  assertTripDocument(document);
  return document;
};

export const mergeGeneratedTrip = (current, generated, {
  actor = 'generator',
  cryptoApi = globalThis.crypto,
} = {}) => {
  const before = normalizeTripDocument(current, { actor, cryptoApi });
  const proposed = normalizeTripDocument({ ...current, ...generated, id: current.id }, { actor, cryptoApi });
  const lockedBlocks = new Map();
  before.bundle.itinerary.days.forEach((day) => day.blocks.forEach((block) => {
    if (block.locked || block.origin === 'manual') lockedBlocks.set(block.id, { dayId: day.id, block });
  }));
  const lockedPacking = new Map();
  before.bundle.packing.lists.forEach((section) => section.items.forEach((item) => {
    if (item.locked || item.origin === 'manual') lockedPacking.set(item.id, { sectionId: section.id, item });
  }));
  const carried = { itinerary: [], packing: [] };
  lockedBlocks.forEach(({ dayId, block }) => {
    const target = proposed.bundle.itinerary.days.find((day) => day.id === dayId)
      || proposed.bundle.itinerary.days[0];
    if (target && !target.blocks.some((candidate) => candidate.id === block.id)) {
      target.blocks.push(block);
      carried.itinerary.push(block.id);
    }
  });
  lockedPacking.forEach(({ sectionId, item }) => {
    const target = proposed.bundle.packing.lists.find((section) => section.id === sectionId)
      || proposed.bundle.packing.lists[0];
    if (target && !target.items.some((candidate) => candidate.id === item.id)) {
      target.items.push(item);
      carried.packing.push(item.id);
    }
  });
  return { document: proposed, carried };
};

export const __test = {
  MAX_DOCUMENT_BYTES,
  MAX_OPERATIONS,
};
