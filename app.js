/* malem — dependency-free. Modules: store, data, engine, auth, parser, ai, ui. */

// ---------- store ----------
const store = (() => {
  const K = {
    legacySession: 'malem.session.v1',
    legacyAccounts: 'malem.accounts.v1',
    profile:  (e) => `malem.profile.v1.${e}`,
    trips:    (e) => `malem.trips.v2.${e}`,          // NEW: array of trips
    activeTrip: (e) => `malem.activeTrip.v1.${e}`,   // NEW: id of active trip
    legacyTrip: (e) => `malem.trip.v1.${e}`,         // OLD: single trip
    group:    (e) => `malem.group.v1.${e}`,
    journal:  (e) => `malem.journal.v1.${e}`,
    theme:    'malem.theme.v1',
    openaiKey:    'malem.openaiKey.v1',
    openaiModel:  'malem.openaiModel.v1',
  };
  // These are deliberately separate calls, so research, review-reading,
  // selection, and presentation can be tuned and metered independently.
  const DEFAULT_OPENROUTER_PIPELINE = Object.freeze({
    discover: 'google/gemini-3-flash-preview',
    reviews: 'google/gemini-3.1-flash-lite',
    select: 'openai/gpt-5.6-terra',
    present: 'google/gemini-3.5-flash',
  });
  const DEFAULT_OUTFIT_PIPELINE = Object.freeze({
    plan: 'google/gemini-3.5-flash',
    curate: 'google/gemini-3.1-flash-lite',
  });
  const readJSON = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };
  let activeEmail = '';
  let syncHandler = null;
  let suppressSync = false;
  const notifySync = (email) => {
    if (!suppressSync && syncHandler && email && email === activeEmail) syncHandler(email);
  };
  // The OpenRouter integration moved to the server proxy. Remove the old
  // browser-stored value without reading it, so a legacy secret is not retained.
  localStorage.removeItem('malem.openrouterKey.v1');
  // Version 7 moved identity to HttpOnly server sessions. Delete obsolete
  // browser-side account hashes and sessions without reading or migrating them.
  localStorage.removeItem(K.legacySession);
  localStorage.removeItem(K.legacyAccounts);

  const emptyProfile = () => ({
    version: 1,
    vibes: [], budget: 'mid', pace: 'balanced',
    // Keep existing profiles on the women's setting that was used in the
    // product brief; this is explicit, editable preference—not inference.
    wardrobePresentation: 'women',
    styleAgeBand: 'adult',
    dietary: { halal: false, kosher: false, vegan: false, vegetarian: false, glutenFree: false, allergies: [], other: '' },
    accessibility: { stepFree: false, lowVision: false, lowHearing: false, seatingBreaks: false, notes: '' },
    religiousCultural: '',
    modesty: 'no-preference',
    medical: { devices: '', medications: '', reminderCadence: 'none' },
    family:  { childrenAges: [], babyOnBoard: false, notes: '' },
    avoid: [],
  });

  const nextId = (() => { let n = 0; return () => `t${Date.now()}${(++n).toString(36)}`; })();

  const trips = {
    load: (e) => readJSON(K.trips(e), []),
    save: (e, arr) => {
      localStorage.setItem(K.trips(e), JSON.stringify(arr));
      notifySync(e);
    },
    add:  (e, trip) => {
      const arr = readJSON(K.trips(e), []);
      const t = { id: trip.id || nextId(), createdAt: trip.createdAt || Date.now(), ...trip };
      arr.push(t); localStorage.setItem(K.trips(e), JSON.stringify(arr)); notifySync(e);
      return t;
    },
    update: (e, id, patch) => {
      const arr = readJSON(K.trips(e), []);
      const index = arr.findIndex(t => t.id === id);
      if (index < 0) return null;
      arr[index] = { ...arr[index], ...patch, updatedAt: Date.now() };
      localStorage.setItem(K.trips(e), JSON.stringify(arr)); notifySync(e);
      return arr[index];
    },
    remove: (e, id) => {
      const arr = readJSON(K.trips(e), []).filter(t => t.id !== id);
      localStorage.setItem(K.trips(e), JSON.stringify(arr)); notifySync(e);
    },
    // Review evidence is generated per place and saved with a trip so it can
    // be shown offline. This deliberately removes only review-derived fields,
    // preserving the trip, itinerary structure, and first-party source links.
    clearPlaceReviewFeedback: () => {
      const reviewFields = ['rating', 'reviewCount', 'reviewSummary', 'reviewSourceUrl'];
      let removed = 0;
      const scrubPlace = (place) => {
        const copy = { ...place };
        reviewFields.forEach(field => {
          if (Object.hasOwn(copy, field)) { delete copy[field]; removed++; }
        });
        return copy;
      };
      (activeEmail ? [activeEmail] : []).forEach(email => {
        const current = readJSON(K.trips(email), []);
        const cleaned = current.map(trip => {
          if (!trip.bundle) return trip;
          const bundle = { ...trip.bundle };
          if (Array.isArray(bundle.local)) bundle.local = bundle.local.map(scrubPlace);
          if (Array.isArray(bundle.itinerary?.days)) {
            bundle.itinerary = {
              ...bundle.itinerary,
              days: bundle.itinerary.days.map(day => ({
                ...day,
                ...(Array.isArray(day.blocks) ? { blocks: day.blocks.map(scrubPlace) } : {}),
              })),
            };
          }
          return { ...trip, bundle };
        });
        localStorage.setItem(K.trips(email), JSON.stringify(cleaned));
        notifySync(email);
      });
      return removed;
    },
  };
  const activeTrip = {
    get: (e) => readJSON(K.activeTrip(e), null),
    set: (e, id) => { localStorage.setItem(K.activeTrip(e), JSON.stringify(id)); notifySync(e); },
    clear: (e) => { localStorage.removeItem(K.activeTrip(e)); notifySync(e); },
  };
  // Migrate legacy single-trip storage into the trips array on first access.
  const migrate = (email) => {
    const legacy = readJSON(K.legacyTrip(email), null);
    if (!legacy) return;
    const arr = readJSON(K.trips(email), []);
    if (!arr.length) {
      const t = { id: nextId(), createdAt: Date.now(), ...legacy };
      arr.push(t);
      localStorage.setItem(K.trips(email), JSON.stringify(arr));
      localStorage.setItem(K.activeTrip(email), JSON.stringify(t.id));
    }
    localStorage.removeItem(K.legacyTrip(email));
    notifySync(email);
  };

  const emptyState = () => ({
    version: 1,
    profile: null,
    trips: [],
    activeTrip: null,
    group: [],
    journal: [],
  });
  const syncableTrips = (email) => readJSON(K.trips(email), []).map((trip) => {
    // Pipeline traces can be very large and are diagnostic/device-local. The
    // completed plan and its source evidence remain synchronized.
    const { llmRun: _deviceOnlyTrace, ...syncable } = trip;
    return syncable;
  });
  const stateSnapshot = (email) => ({
    version: 1,
    profile: readJSON(K.profile(email), null),
    trips: syncableTrips(email),
    activeTrip: readJSON(K.activeTrip(email), null),
    group: readJSON(K.group(email), []),
    journal: readJSON(K.journal(email), []),
  });
  const hasLocalState = (email) => {
    const state = stateSnapshot(email);
    return Boolean(state.profile || state.trips.length || state.group.length || state.journal.length);
  };
  const hydrateState = (email, value) => {
    const state = { ...emptyState(), ...(value || {}) };
    const localTrips = new Map(readJSON(K.trips(email), []).map((trip) => [trip.id, trip]));
    const hydratedTrips = (Array.isArray(state.trips) ? state.trips : []).map((trip) => {
      const localTrace = localTrips.get(trip.id)?.llmRun;
      return localTrace ? { ...trip, llmRun: localTrace } : trip;
    });
    suppressSync = true;
    try {
      if (state.profile) localStorage.setItem(K.profile(email), JSON.stringify(state.profile));
      else localStorage.removeItem(K.profile(email));
      localStorage.setItem(K.trips(email), JSON.stringify(hydratedTrips));
      if (state.activeTrip) localStorage.setItem(K.activeTrip(email), JSON.stringify(state.activeTrip));
      else localStorage.removeItem(K.activeTrip(email));
      localStorage.setItem(K.group(email), JSON.stringify(Array.isArray(state.group) ? state.group : []));
      localStorage.setItem(K.journal(email), JSON.stringify(Array.isArray(state.journal) ? state.journal : []));
    } finally {
      suppressSync = false;
    }
  };
  const clearUserState = (email) => {
    suppressSync = true;
    try {
      [K.profile(email), K.trips(email), K.activeTrip(email), K.legacyTrip(email), K.group(email), K.journal(email)]
        .forEach((key) => localStorage.removeItem(key));
    } finally {
      suppressSync = false;
    }
  };

  return {
    emptyProfile,
    profile: {
      load: (e) => ({ ...emptyProfile(), ...(readJSON(K.profile(e), {}) || {}) }),
      save: (e, v) => { localStorage.setItem(K.profile(e), JSON.stringify(v)); notifySync(e); },
      clear: (e) => { localStorage.removeItem(K.profile(e)); notifySync(e); },
    },
    trips, activeTrip, migrate,
    group:  {
      load: (e) => readJSON(K.group(e), []),
      save: (e, g) => { localStorage.setItem(K.group(e), JSON.stringify(g)); notifySync(e); },
      clear: (e) => { localStorage.removeItem(K.group(e)); notifySync(e); },
    },
    journal:{
      load: (e) => readJSON(K.journal(e), []),
      save: (e, j) => { localStorage.setItem(K.journal(e), JSON.stringify(j)); notifySync(e); },
      clear: (e) => { localStorage.removeItem(K.journal(e)); notifySync(e); },
    },
    cloud: {
      connect: (email) => { activeEmail = email || ''; },
      disconnect: () => { activeEmail = ''; },
      setSyncHandler: (handler) => { syncHandler = handler; },
      snapshot: stateSnapshot,
      hydrate: hydrateState,
      clear: clearUserState,
      hasLocalState,
      empty: emptyState,
    },
    theme:  { get: () => localStorage.getItem(K.theme) || '', set: (t) => t ? localStorage.setItem(K.theme, t) : localStorage.removeItem(K.theme) },
    ai: {
      openaiKey:    { get: () => localStorage.getItem(K.openaiKey) || '',
                      set: (k) => k ? localStorage.setItem(K.openaiKey, k) : localStorage.removeItem(K.openaiKey) },
      openaiModel:  { get: () => localStorage.getItem(K.openaiModel) || 'gpt-4o-mini',
                      set: (m) => m ? localStorage.setItem(K.openaiModel, m) : localStorage.removeItem(K.openaiModel) },
      claudeKey:    { get: () => localStorage.getItem('malem.anthropicKey.v1') || '',
                      set: (k) => k ? localStorage.setItem('malem.anthropicKey.v1', k) : localStorage.removeItem('malem.anthropicKey.v1') },
      claudeModel:  { get: () => {
                        const saved = localStorage.getItem('malem.anthropicModel.v1') || '';
                        // Migrate model ids that were placeholders or are now retired.
                        return ['claude-sonnet-5', 'claude-3-5-sonnet-latest'].includes(saved)
                          ? 'claude-sonnet-4-20250514'
                          : (saved || 'claude-sonnet-4-20250514');
                      },
                      set: (m) => m ? localStorage.setItem('malem.anthropicModel.v1', m) : localStorage.removeItem('malem.anthropicModel.v1') },
      provider:     { get: () => localStorage.getItem('malem.aiProvider.v1') || 'auto',
                      set: (p) => p ? localStorage.setItem('malem.aiProvider.v1', p) : localStorage.removeItem('malem.aiProvider.v1') },
      openrouterModel: { get: () => {
                           const saved = localStorage.getItem('malem.openrouterModel.v1') || '';
                           return saved || 'openai/gpt-5.6-luna';
                         },
                         set: (m) => m ? localStorage.setItem('malem.openrouterModel.v1', m) : localStorage.removeItem('malem.openrouterModel.v1') },
      pipeline: {
        get: () => ({ ...DEFAULT_OPENROUTER_PIPELINE, ...(readJSON('malem.openrouterPipeline.v1', {}) || {}) }),
        set: (pipeline) => localStorage.setItem('malem.openrouterPipeline.v1', JSON.stringify({ ...DEFAULT_OPENROUTER_PIPELINE, ...pipeline })),
      },
      outfitPipeline: {
        get: () => ({ ...DEFAULT_OUTFIT_PIPELINE, ...(readJSON('malem.openrouterOutfitPipeline.v1', {}) || {}) }),
        set: (pipeline) => localStorage.setItem('malem.openrouterOutfitPipeline.v1', JSON.stringify({ ...DEFAULT_OUTFIT_PIPELINE, ...pipeline })),
      },
      usage: {
        all: () => readJSON('malem.openrouterUsage.v1', []),
        add: (entry) => {
          const entries = readJSON('malem.openrouterUsage.v1', []);
          entries.unshift(entry);
          localStorage.setItem('malem.openrouterUsage.v1', JSON.stringify(entries.slice(0, 100)));
        },
        clear: () => localStorage.removeItem('malem.openrouterUsage.v1'),
      },
      lastRun: {
        get: () => readJSON('malem.openrouterLastRun.v1', null),
        set: (run) => localStorage.setItem('malem.openrouterLastRun.v1', JSON.stringify(run)),
        clear: () => localStorage.removeItem('malem.openrouterLastRun.v1'),
      },
      // Back-compat for older callers:
      getKey:   () => localStorage.getItem(K.openaiKey) || '',
      setKey:   (k) => k ? localStorage.setItem(K.openaiKey, k) : localStorage.removeItem(K.openaiKey),
      getModel: () => localStorage.getItem(K.openaiModel) || 'gpt-4o-mini',
      setModel: (m) => m ? localStorage.setItem(K.openaiModel, m) : localStorage.removeItem(K.openaiModel),
    },
    pinterest: {
      extraKeywords: {
        get: () => localStorage.getItem('malem.pinterestKeywords.v1') || '',
        set: (v) => v ? localStorage.setItem('malem.pinterestKeywords.v1', v) : localStorage.removeItem('malem.pinterestKeywords.v1'),
      },
    },
    images: {
      key: { get: () => localStorage.getItem('malem.googleImgKey.v1') || '',
             set: (k) => k ? localStorage.setItem('malem.googleImgKey.v1', k) : localStorage.removeItem('malem.googleImgKey.v1') },
      cx:  { get: () => localStorage.getItem('malem.googleImgCx.v1') || '',
             set: (c) => c ? localStorage.setItem('malem.googleImgCx.v1', c) : localStorage.removeItem('malem.googleImgCx.v1') },
    },
  };
})();

// ---------- data ----------
const DATA = (() => {
  const destinations = [
    { key: 'istanbul',  name: 'Istanbul',  country: 'Türkiye',  plug: 'Type C/F',
      culturalNote: 'Muslim-majority; modest dress helps at religious sites; strong tea and coffee culture.',
      palette: ['#B84E2E', '#1F3A5F', '#EEDFAA', '#C89B3C', '#5A2E1B'],
      paletteNote: 'Terracotta rooftops, Bosphorus indigo, cream tiles, honeyed gold, and roasted coffee.' },
    { key: 'kyoto',     name: 'Kyoto',     country: 'Japan',    plug: 'Type A/B',
      culturalNote: 'Quiet on transit; shoes off in traditional interiors; tipping not expected.',
      palette: ['#5C6B4B', '#EFE7D3', '#2B3242', '#8E1A28', '#0F0F0E'],
      paletteNote: 'Moss green temples, ivory paper walls, indigo cotton, deep torii red, and ink black.' },
    { key: 'marrakech', name: 'Marrakech', country: 'Morocco',  plug: 'Type C/E',
      culturalNote: 'Muslim-majority; haggling is normal in the souks; Friday afternoons quieter.',
      palette: ['#D6852E', '#2F79B5', '#C4626F', '#B87333', '#E8DCC0'],
      paletteNote: 'Saffron souks, Majorelle cerulean, rose adobe, ochre earth, and sand.' },
    { key: 'paris',     name: 'Paris',     country: 'France',   plug: 'Type C/E',
      culturalNote: 'Greet with bonjour in shops; small cafés are for lingering.',
      palette: ['#8F9BA6', '#F4EBDA', '#B3C4D3', '#1A1A1A', '#7B1F2D'],
      paletteNote: 'Haussmann grey, cream stone, pale sky, ink black, and bordeaux wine.' },
    { key: 'nyc',       name: 'New York',  country: 'USA',      plug: 'Type A/B',
      culturalNote: 'Tipping expected (~18–22%); walk-only routes are efficient; loud subway.',
      palette: ['#2E2C2A', '#9C3A2D', '#B7B0A2', '#6B7051', '#F1E9D5'],
      paletteNote: 'Basalt sidewalk, brick red brownstone, chrome tone, olive uniform, and cream.' },
  ];

  const weatherLine = (key, season) => ({
    istanbul:  { summer:'Hot and humid, breeze off the Bosphorus in the evenings.', winter:'Cold and grey, occasional rain.',
                 spring:'Mild and blooming; some afternoon showers.', autumn:'Crisp and clear, jacket weather.' },
    kyoto:     { summer:'Hot and humid, brief thunderstorms.', winter:'Cold and dry, some snow on the temples.',
                 spring:'Mild with cherry blossoms; cool mornings.', autumn:'Cool and dry, deep foliage colours.' },
    marrakech: { summer:'Very hot and dry, cool desert nights.', winter:'Warm days, cold nights.',
                 spring:'Warm and sunny.', autumn:'Warm and dry, tourist high season.' },
    paris:     { summer:'Warm days, occasional heatwaves.', winter:'Cold and grey; damp.',
                 spring:'Cool with light showers.', autumn:'Cool and drizzly.' },
    nyc:       { summer:'Hot and humid; air-conditioning everywhere.', winter:'Cold and windy; layers essential.',
                 spring:'Cool with sudden showers.', autumn:'Crisp and colourful.' },
  }[key]?.[season] || 'Check the forecast closer to travel.');

  const VIBES = [
    { key: 'live-like-local',    title: 'Live like a local',    sub: 'Neighborhood mornings, home-style meals.' },
    { key: 'iconic-first-visit', title: 'Iconic first visit',   sub: 'The must-sees, timed to dodge crowds.' },
    { key: 'relaxed-scenic',     title: 'Relaxed & scenic',     sub: 'Longer stops, gentle days, views.' },
    { key: 'hidden-gems',        title: 'Hidden gems',          sub: 'Places locals actually love.' },
    { key: 'family-adventure',   title: 'Family adventure',     sub: 'Kid-paced, nap-aware.' },
    { key: 'halal-food-culture', title: 'Halal food & culture', sub: 'Verified halal, cultural depth.' },
    { key: 'luxury-without-rush',title: 'Luxury without rush',  sub: 'Comfort-first pacing.' },
  ];

  const places = {
    istanbul: [
      { name: 'Hagia Sophia',              mix: 'famous',         cat: 'sights',   sub: 'The essential first visit.',                     traffic: 'high' },
      { name: 'Karaköy simit stand',       mix: 'small-business', cat: 'food',     sub: 'Warm simit and hot çay from a family stand.',    traffic: 'low' },
      { name: 'Balat side streets',        mix: 'neighborhood',   cat: 'sights',   sub: 'Painted houses, antique doors, quiet mornings.', traffic: 'medium' },
      { name: 'Vefa Bozacısı',             mix: 'hidden',         cat: 'food',     sub: 'Century-old boza shop most tourists miss.',      traffic: 'low' },
      { name: 'Ramadan iftar in Sultanahmet', mix: 'seasonal',    cat: 'food',     sub: 'Public iftar tables during Ramadan.',            traffic: 'high' },
      { name: 'Kadıköy fish market',       mix: 'neighborhood',   cat: 'shopping', sub: 'Everyday market on the Asian side.',             traffic: 'medium' },
    ],
    kyoto: [
      { name: 'Fushimi Inari (dawn)',      mix: 'famous',         cat: 'sights',   sub: 'Icon — go before 7 to breathe.',                 traffic: 'high' },
      { name: 'Nishiki side alleys',       mix: 'neighborhood',   cat: 'food',     sub: 'Skip the main run, cut through the alleys.',     traffic: 'medium' },
      { name: 'Ippodo main shop',          mix: 'small-business', cat: 'shopping', sub: 'Old matcha house; short tastings.',              traffic: 'low' },
      { name: 'Ohara at rice-planting',    mix: 'seasonal',       cat: 'outdoors', sub: 'Rural hamlet north of the city.',                traffic: 'low' },
      { name: 'Kissa Master (silent café)', mix: 'hidden',        cat: 'food',     sub: 'Old-style jazz kissa; talk quietly.',            traffic: 'low' },
      { name: "Philosopher's Path stroll", mix: 'neighborhood',   cat: 'outdoors', sub: 'Canal-side walk between two temples.',           traffic: 'medium' },
    ],
    marrakech: [
      { name: 'Jemaa el-Fnaa (sunset)',    mix: 'famous',         cat: 'sights',   sub: 'The square as it wakes up.',                     traffic: 'high' },
      { name: 'Sidi Ghanem craft studios', mix: 'small-business', cat: 'shopping', sub: 'Design ateliers outside the medina.',            traffic: 'low' },
      { name: 'Neighborhood mahlaba',      mix: 'neighborhood',   cat: 'food',     sub: 'Local dairy bar — msemmen and coffee.',          traffic: 'low' },
      { name: 'Ben Youssef library courtyard', mix: 'hidden',     cat: 'sights',   sub: 'Quiet in the afternoons.',                       traffic: 'low' },
      { name: 'Rose festival day trip',    mix: 'seasonal',       cat: 'outdoors', sub: "Kelaa M'Gouna in mid-May.",                      traffic: 'medium' },
      { name: 'Bahia Palace',              mix: 'famous',         cat: 'sights',   sub: 'The most-photographed palace.',                  traffic: 'high' },
    ],
    paris: [
      { name: 'Louvre (late Wednesday)',   mix: 'famous',         cat: 'sights',   sub: 'Icon — go late-open days.',                      traffic: 'high' },
      { name: "Marché d'Aligre",           mix: 'neighborhood',   cat: 'food',     sub: 'Everyday market, no tourist markup.',            traffic: 'medium' },
      { name: 'Du Pain et des Idées',      mix: 'small-business', cat: 'food',     sub: 'Small bakery loved by neighbors.',               traffic: 'medium' },
      { name: 'Musée de la Vie Romantique tea garden', mix: 'hidden', cat: 'sights', sub: 'Quiet courtyard museum.',                    traffic: 'low' },
      { name: 'Fête de la Musique',        mix: 'seasonal',       cat: 'sights',   sub: 'Free citywide music, June 21.',                  traffic: 'high' },
      { name: 'Coulée Verte walk',         mix: 'neighborhood',   cat: 'outdoors', sub: 'Elevated linear park.',                          traffic: 'low' },
    ],
    nyc: [
      { name: 'Statue of Liberty',         mix: 'famous',         cat: 'sights',   sub: 'The icon.',                                      traffic: 'high' },
      { name: 'Arthur Avenue market',      mix: 'neighborhood',   cat: 'food',     sub: 'Bronx Italian food street.',                     traffic: 'medium' },
      { name: "Sunny's (Red Hook)",        mix: 'small-business', cat: 'food',     sub: 'Neighborhood bar with live music.',              traffic: 'low' },
      { name: 'City Island in summer',     mix: 'seasonal',       cat: 'outdoors', sub: 'Fishing-village feel in the Bronx.',             traffic: 'medium' },
      { name: 'The Frick (reopened)',      mix: 'hidden',         cat: 'sights',   sub: 'Smaller museum; slower pace.',                   traffic: 'low' },
      { name: 'Corona taquería row',       mix: 'small-business', cat: 'food',     sub: 'Queens street tacos.',                           traffic: 'medium' },
    ],
  };

  const expectations = {
    istanbul: { etiquette:'Modest dress at mosques; remove shoes; women often use a scarf indoors.', clothing:'Long trousers and covered shoulders for mosque visits.', tipping:'5–10% at sit-down meals; taxi rounding.', prayer:'Five daily prayers; mosques open outside prayer times.', driving:'Assertive; pedestrians firm at crossings.', transit:'Istanbulkart works everywhere; ferries beat traffic.', scams:'Shoe-cleaner drop trick; shifted taxi meters.', safety:'Generally safe; keep pockets zipped in Beyoğlu.', accessibility:'Cobblestones and hills; some tram stops step-free.', phrases:'Merhaba (hello), teşekkür ederim (thanks), afiyet olsun (enjoy meal).', hours:'Late lunches, dinners after 20:00; museum closures vary.', photos:'Ask before photographing people at mosques or bazaars.', difference:'Calls to prayer punctuate the day — beautiful, not a problem.' },
    kyoto:    { etiquette:'Quiet on trains; small bows return greetings.', clothing:'Neat casual; shoes off in tatami rooms.', tipping:'Not expected; can be politely refused.', prayer:'Shrines and temples — bow twice, clap twice, bow once at Shinto shrines.', driving:'Rarely needed; taxis clean, expensive.', transit:'IC card for buses and trains; buses can be confusing.', scams:'Rare; watch for tourist-only "geisha experiences" in Gion.', safety:'Very safe.', accessibility:'Older sites can be step-heavy; JR Kyoto well equipped.', phrases:'Konnichiwa (hello), sumimasen (excuse me/thanks), arigatou (thanks).', hours:'Restaurants 11:30–14 & 17:30–22; shrines dawn to dusk.', photos:'No photos of maiko/geiko in Gion; signs enforced.', difference:"Silence in public transit is the norm and it's peaceful." },
    marrakech:{ etiquette:'Modest dress welcomed; men wear long shorts or trousers at religious sites.', clothing:'Loose cotton for heat; long sleeves for evening breeze.', tipping:'10% at sit-down; small rounding otherwise.', prayer:'Five daily prayers; Friday afternoons quieter around mosques.', driving:'Chaotic in medina; hire a driver outside.', transit:'Petit taxis metered inside city limits.', scams:'Uninvited "guides" in the medina; agree fees up front.', safety:'Generally safe day and night in main areas.', accessibility:'Medina alleys uneven; Gueliz is flatter and step-free.', phrases:'Salam alaykum (hello), shukran (thanks), la, shukran (no, thanks).', hours:'Souks close mid-afternoon Friday; dinners later.', photos:'Ask before photographing anyone in the square.', difference:'Bargaining is social; take your time and it becomes fun.' },
    paris:    { etiquette:'Say bonjour when entering a shop or café — it changes everything.', clothing:'Smart casual; layers for spring/autumn.', tipping:'Service compris; 1–2 € rounding welcome.', prayer:'Multi-faith city; mosques and synagogues throughout.', driving:'Not needed; parking painful.', transit:'Navigo Easy card for a week; strikes can hit lines.', scams:'Petition-signing distractions near tourist sights.', safety:'Safe; pickpockets around Trocadéro and metro line 1.', accessibility:'Older metro limited; buses better; RER major stations OK.', phrases:"Bonjour, s'il vous plaît, merci, pardon.", hours:'Late lunches 12:30–14; some places closed Sunday.', photos:'Museums vary; no flash generally.', difference:'Small cafés are for lingering, not fast turnover.' },
    nyc:      { etiquette:'Direct is polite; keep to the right on sidewalks.', clothing:'Layers year-round; comfortable walking shoes.', tipping:'18–22% at restaurants; $1–2 per drink.', prayer:"Many faiths; jum'ah at midtown mosques.", driving:'Not needed; parking and congestion pricing.', transit:'OMNY tap-to-pay; late-night reroutes common.', scams:'Character photos in Times Square demanding money.', safety:'Safer than many think; late-night empty platforms is the tricky bit.', accessibility:'Only a fraction of subway stations elevator-served; buses fully accessible.', phrases:'English works; a "thanks, have a good one" reads friendly.', hours:'24-hour city in many places; grocery late is fine.', photos:'Ask permission for portraits; museums vary.', difference:"Loud is not rude; it's just the volume of the city." },
  };

  const meta = { updated: '2026-06-01', sources: ['residents','transit authorities','tourism boards'] };

  const communityEntries = [
    { id: 'c1', authorName: 'Amina',   destination: 'istanbul',  date: '2026-05-12',
      title: 'Balat and the ferry, with two under ten',
      did: 'Swapped the Topkapı queue for a Balat morning walk. The kids drew the painted houses in a notebook while we had breakfast at a small mahalle bakery. Took the ferry to Kadıköy for lunch — best decision of the trip.',
      change: "Skip the Grand Bazaar mid-day — the crowds hit hard by 11. Go at opening or don't bother.",
      accessAccuracy: 'as-listed', dietAccuracy: 'better',
      tags: ['halal','step-free','modest','family'] },
    { id: 'c2', authorName: 'Ehsan',   destination: 'kyoto',     date: '2026-04-03',
      title: 'Fushimi Inari before the light',
      did: "We arrived at the base at 5:40. The lanterns were still lit; we saw maybe six other people the entire climb. Breakfast at a coffee stand outside the station on the way back.",
      change: 'Book the ryokan closer to Fushimi — the extra sleep matters when you\'re up at five.',
      accessAccuracy: '', dietAccuracy: 'as-listed', tags: ['kosher','solo'] },
    { id: 'c3', authorName: 'Priya',   destination: 'marrakech', date: '2026-03-19',
      title: 'Souks on a rest day',
      did: 'I was tired after three days of medina, so I did a slow morning at Le Jardin Secret, then Sidi Ghanem for the crafts and coffee. The pace saved the trip.',
      change: 'Would have paid more for a riad with a real garden.',
      accessAccuracy: 'worse', dietAccuracy: 'as-listed', tags: ['vegetarian','solo','modest'] },
    { id: 'c4', authorName: 'Marco',   destination: 'paris',     date: '2026-06-08',
      title: "Marché d'Aligre morning",
      did: 'Went to the market at 9. Bought half a wheel of comté and ate it on a bench in the Coulée Verte. Small joys.',
      change: 'Skip the Louvre — the Musée de la Vie Romantique was ten times better.',
      accessAccuracy: '', dietAccuracy: 'as-listed', tags: ['solo'] },
    { id: 'c5', authorName: 'Kenji',   destination: 'kyoto',     date: '2026-11-04',
      title: "Philosopher's Path in the rain",
      did: 'The maples were mid-turn and the drizzle kept everyone home. My mother uses a cane — the whole path was flat and the temples on either end had elevators to the main halls.',
      change: 'Would have started earlier so we could have coffee at Blue Bottle before the walk.',
      accessAccuracy: 'as-listed', dietAccuracy: 'as-listed', tags: ['senior','step-free'] },
    { id: 'c6', authorName: 'Sophie',  destination: 'nyc',       date: '2026-08-22',
      title: 'Brooklyn with a stroller',
      did: 'Rented a folding stroller from a mom in Park Slope. Did the Botanic Garden in the morning, DUMBO for the afternoon shade, and ate slices at Di Fara after the baby went down.',
      change: 'The G train elevator was out — plan around that if you go weekend.',
      accessAccuracy: 'worse', dietAccuracy: 'as-listed', tags: ['family','step-free'] },
    { id: 'c7', authorName: 'Nour',    destination: 'istanbul',  date: '2026-05-14',
      title: 'Wheelchair notes on Balat',
      did: "Balat is beautiful but not step-free at all — cobbles + hills. Kadıköy was the opposite: flat, wide sidewalks, ferry with a ramp. I'd stay there next time.",
      change: 'Ask the hotel about accessible taxis in advance.',
      accessAccuracy: 'worse', dietAccuracy: 'as-listed', tags: ['halal','step-free'] },
    { id: 'c8', authorName: 'Yuki',    destination: 'paris',     date: '2026-05-01',
      title: 'A vegan patisserie hunt',
      did: 'Three days, six patisseries. Land&Monkeys was consistent, Cloud Cakes was fun. Skipped the tourist-heavy ones.',
      change: "Would have added Aujourd'hui Demain for a proper sit-down lunch.",
      accessAccuracy: '', dietAccuracy: 'as-listed', tags: ['vegan','solo'] },
    { id: 'c9', authorName: 'Fatima',  destination: 'marrakech', date: '2026-02-11',
      title: 'Modest dressing in the medina',
      did: 'Long linen everything. A shopkeeper adjusted my scarf and taught me to tie it Moroccan-style — it stayed on all day.',
      change: 'Bring one dark scarf that hides indigo transfer.',
      accessAccuracy: 'as-listed', dietAccuracy: 'better', tags: ['halal','modest','solo'] },
    { id: 'c10', authorName: 'Daniel', destination: 'nyc',       date: '2026-10-14',
      title: 'The Frick on a Wednesday',
      did: 'Wednesday afternoon: quiet, no timed entry needed, and the reopened Fifth Avenue rooms feel like a private home.',
      change: 'Pair it with a walk through Central Park to the reservoir.',
      accessAccuracy: 'better', dietAccuracy: '', tags: ['solo','senior'] },
    { id: 'c11', authorName: 'Zineb',  destination: 'istanbul',  date: '2026-06-01',
      title: 'Iftar tables in Sultanahmet',
      did: 'Public iftar at the Blue Mosque grounds. Strangers passed dates, an aunt insisted I take her extra tea. I have never felt more welcomed.',
      change: "Arrive an hour before maghrib — you'll get a proper seat.",
      accessAccuracy: 'as-listed', dietAccuracy: 'better', tags: ['halal','modest','family'] },
    { id: 'c12', authorName: 'Hannah', destination: 'paris',     date: '2026-09-20',
      title: 'Fête des Vendanges in Montmartre',
      did: "Wine harvest weekend. A choir on Rue Lepic, tastings in the vineyard, and dinner at a bistro that hadn't caught on to the crowd yet.",
      change: 'Book the bistro. We got lucky and shouldn\'t rely on it.',
      accessAccuracy: '', dietAccuracy: 'as-listed', tags: ['solo'] },
  ];

  return { destinations, weatherLine, VIBES, places, expectations, meta, communityEntries };
})();

// ---------- parser: turn free-form user text into a trip + profile hints ----------
const parser = (() => {
  const DEST_ALIASES = {
    istanbul: ['istanbul','istambul','stambul','constantinople'],
    kyoto:    ['kyoto','japan','japanese'],
    marrakech:['marrakech','marrakesh','morocco','moroccan','medina'],
    paris:    ['paris','france','french','parisian','parisienne'],
    nyc:      ['nyc','new york','new york city','manhattan','brooklyn','queens','bronx','the big apple'],
  };

  const numberWords = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, a:1, an:1 };

  const slugifyPlace = (value) => String(value || '')
    .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // The dependency-free parser should still accept any destination, not just the
  // five cities with bundled demo data. Keep the match conservative so phrases
  // such as "with my parents" do not become part of the place name.
  const genericDestination = (text) => {
    const raw = String(text || '').trim();
    const nonDestinations = new Set([
      'january','february','march','april','may','june','july','august','september','october','november','december',
      'spring','summer','autumn','fall','winter','the morning','the afternoon','the evening',
    ]);
    const stop = '(?=\\s+(?:for|with|from|on|next|this|during|because|and\\s+(?:i|we|my|our))\\b|[,;.!?]|$)';
    const patterns = [
      new RegExp('\\b(?:go(?:ing)?|travel(?:l)?ing|head(?:ing)?|fly(?:ing)?|visit(?:ing)?|vacation(?:ing)?)\\s+(?:to|in)\\s+([a-z][a-z .\\\'-]{1,48}?)' + stop, 'i'),
      new RegExp('\\b(?:trip|vacation|weekend)\\s+(?:to|in)\\s+([a-z][a-z .\\\'-]{1,48}?)' + stop, 'i'),
      new RegExp('\\b(?:to|in)\\s+([a-z][a-z .\\\'-]{1,48}?)' + stop, 'i'),
    ];
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      const candidate = match?.[1]?.trim();
      if (candidate && !nonDestinations.has(candidate.toLowerCase()) && slugifyPlace(candidate)) return candidate;
    }
    // A short reply such as "Barcelona" or "Mexico City" is a destination.
    if (/^[a-z][a-z .'-]{1,48}$/i.test(raw) && raw.trim().split(/\s+/).length <= 4
      && !/^(yes|no|maybe|thanks|thank you|surprise me|not sure)$/i.test(raw)) return raw;
    return '';
  };

  const parseTrip = (text) => {
    const t = ' ' + text.toLowerCase() + ' ';
    const trip = { destination: null, days: null, travelers: null, arrivalDate: null,
      primaryVibe: null, season: null };
    const prefs = {
      dietary: { halal: false, kosher: false, vegan: false, vegetarian: false, glutenFree: false, allergies: [], other: '' },
      accessibility: { stepFree: false, lowVision: false, lowHearing: false, seatingBreaks: false, notes: '' },
      modesty: 'no-preference',
      medical: { devices: '', medications: '', reminderCadence: 'none' },
      family: { childrenAges: [], babyOnBoard: false, notes: '' },
      budget: null, pace: null, avoid: [],
    };
    const inferred = [];

    // Destination
    for (const [k, aliases] of Object.entries(DEST_ALIASES)) {
      if (aliases.some(a => t.includes(' ' + a + ' ') || t.includes(' ' + a + ',') || t.includes(' ' + a + '.'))) {
        trip.destination = k; inferred.push(DATA.destinations.find(d => d.key === k).name); break;
      }
    }
    if (!trip.destination) {
      const place = genericDestination(text);
      if (place) {
        trip.destination = slugifyPlace(place);
        inferred.push(String(place).replace(/\b\w/g, c => c.toUpperCase()));
      }
    }

    // Days
    let daysMatch = t.match(/(\d+)\s*(?:day|days|nights?)/);
    if (daysMatch) trip.days = Number(daysMatch[1]);
    else {
      const wordMatch = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:day|days|nights?)/);
      if (wordMatch) trip.days = numberWords[wordMatch[1]];
    }
    if (!trip.days && /\bweekend\b/.test(t)) trip.days = 3;
    if (!trip.days && /\bweek\b/.test(t) && !/\bweekend\b/.test(t)) trip.days = 7;

    // Travelers
    if (/\bsolo\b|\balone\b|\bby myself\b|\bjust me\b/.test(t)) trip.travelers = 1;
    else if (/\bcouple\b|\bmy (?:partner|husband|wife|boyfriend|girlfriend|spouse)\b/.test(t)) trip.travelers = 2;
    else {
      const trav = t.match(/(\d+)\s*(?:travelers?|people|of us|adults?)/);
      if (trav) trip.travelers = Number(trav[1]);
    }

    // Children
    const kidsAges = [];
    const agesMatch = t.match(/(?:kids?|children|ages?)[\s,-]+(\d+(?:\s*(?:and|,|&)\s*\d+)*)/);
    if (agesMatch) {
      const nums = agesMatch[1].match(/\d+/g) || [];
      nums.forEach(n => kidsAges.push(Number(n)));
    }
    if (kidsAges.length) prefs.family.childrenAges = kidsAges;
    if (/\bbaby\b|\binfant\b|\bnewborn\b/.test(t)) { prefs.family.babyOnBoard = true; inferred.push('baby'); }
    if (kidsAges.length) inferred.push(`kids ages ${kidsAges.join(', ')}`);
    if (kidsAges.length && !trip.travelers) trip.travelers = 2 + kidsAges.length;

    // Season / month
    const seasonMap = { january:'winter', february:'winter', december:'winter',
      march:'spring', april:'spring', may:'spring',
      june:'summer', july:'summer', august:'summer',
      september:'autumn', october:'autumn', november:'autumn' };
    for (const [m, s] of Object.entries(seasonMap)) {
      if (new RegExp('\\b' + m + '\\b').test(t)) { trip.season = s; inferred.push(m); break; }
    }
    if (!trip.season) {
      if (/\bsummer\b/.test(t)) trip.season = 'summer';
      else if (/\bwinter\b/.test(t)) trip.season = 'winter';
      else if (/\bspring\b/.test(t)) trip.season = 'spring';
      else if (/\bautumn\b|\bfall\b/.test(t)) trip.season = 'autumn';
    }

    // Dietary
    if (/\bhalal\b/.test(t))     { prefs.dietary.halal = true;      inferred.push('halal'); }
    if (/\bkosher\b/.test(t))    { prefs.dietary.kosher = true;     inferred.push('kosher'); }
    if (/\bvegan\b/.test(t))     { prefs.dietary.vegan = true;      inferred.push('vegan'); }
    if (/\bvegetarian\b|\bveggie\b/.test(t)) { prefs.dietary.vegetarian = true; inferred.push('vegetarian'); }
    if (/\bgluten[\s-]?free\b/.test(t)) { prefs.dietary.glutenFree = true; inferred.push('gluten-free'); }
    const allergyMatch = t.match(/allerg[ic\w]*\s+(?:to\s+)?([\w\s,]+?)(?:\.|,|;| and (?!\w+ allerg))/);
    if (allergyMatch) prefs.dietary.allergies = allergyMatch[1].split(/,|\band\b/).map(s => s.trim()).filter(Boolean);
    if (/peanut/.test(t) && !prefs.dietary.allergies.includes('peanuts')) prefs.dietary.allergies.push('peanuts');
    if (/\bno pork\b/.test(t)) prefs.dietary.other = 'no pork';

    // Accessibility
    if (/\bwheelchair\b|\bstep[\s-]?free\b|\baccessib/.test(t)) { prefs.accessibility.stepFree = true; inferred.push('step-free'); }
    if (/\bno stairs?\b|\bavoid stairs?\b|\bno steep hills?\b|\bavoid (?:steep )?hills?\b/.test(t)) {
      prefs.accessibility.stepFree = true;
      inferred.push('step-free');
    }
    if (/\bcane\b|\bcanes\b|\bwalker\b/.test(t))                  { prefs.accessibility.seatingBreaks = true; inferred.push('frequent seating'); }
    if (/\blow vision\b|\bblind\b|\bvisually\s+impaired\b/.test(t)) { prefs.accessibility.lowVision = true; inferred.push('low-vision'); }
    if (/\bdeaf\b|\bhearing\s+impaired\b|\blow hearing\b/.test(t)) { prefs.accessibility.lowHearing = true; inferred.push('low-hearing'); }

    const explicitAvoids = [
      [/\b(?:no|avoid)\s+(?:steep\s+)?hills?\b/, 'steep hills'],
      [/\b(?:no|avoid)\s+stairs?\b/, 'stairs'],
      [/\b(?:no|avoid)\s+(?:large\s+)?crowds?\b/, 'crowds'],
      [/\bno early (?:starts?|mornings?)\b|\bavoid early (?:starts?|mornings?)\b/, 'early starts'],
      [/\b(?:no|avoid)\s+nightlife\b/, 'nightlife'],
      [/\b(?:no|avoid)\s+alcohol\b|\balcohol[\s-]?free\b/, 'alcohol'],
    ];
    explicitAvoids.forEach(([pattern, label]) => { if (pattern.test(t)) prefs.avoid.push(label); });

    // Modesty
    if (/\bmodest\b/.test(t))         { prefs.modesty = 'modest';       inferred.push('modest'); }
    if (/\bconservative\b/.test(t))   { prefs.modesty = 'conservative'; inferred.push('conservative'); }

    // Medical
    const medMatch = t.match(/\b(insulin|cpap|epipen|epi[\s-]?pen|nebulizer|inhaler)\b/);
    if (medMatch) { prefs.medical.medications = medMatch[1]; inferred.push(medMatch[1]); }

    // Budget
    if (/\bluxury\b|\b5[\s-]?star\b|\bhigh[\s-]?end\b/.test(t))        prefs.budget = 'luxury';
    else if (/\bcomfort\b|\bnice hotel\b/.test(t))                     prefs.budget = 'comfort';
    else if (/\bmedium\b|\bmid[\s-]?range\b|\bmiddle\b/.test(t))       prefs.budget = 'mid';
    else if (/\bshoestring\b|\bon a budget\b|\bbudget trip\b|\bbackpack/.test(t)) prefs.budget = 'shoestring';

    // Pace
    if (/\bslow\b|\bgentle\b|\brelax/.test(t))              prefs.pace = 'slow';
    else if (/\bpacked\b|\bsee everything\b|\bfit in\b/.test(t)) prefs.pace = 'packed';
    else if (/\bbalanced\b/.test(t))                        prefs.pace = 'balanced';

    // Vibe
    const vibeSignals = [
      ['halal-food-culture',   ['halal']],
      ['family-adventure',     ['kids','children','family']],
      ['luxury-without-rush',  ['luxury','5 star','fine dining']],
      ['live-like-local',      ['local','locals','neighborhood','authentic','food','markets','market']],
      ['iconic-first-visit',   ['first time','icons','must see','landmarks','tourist','iconic','sights']],
      ['relaxed-scenic',       ['relax','scenic','slow','views','sunset','peaceful','quiet','gardens']],
      ['hidden-gems',          ['hidden','off the beaten','undiscovered','unusual']],
    ];
    for (const [vibe, signals] of vibeSignals) {
      if (signals.some(s => t.includes(s))) { trip.primaryVibe = vibe; break; }
    }

    // Sensible defaults for anything we didn't extract
    if (!trip.destination) return { trip: null, prefs, inferred, missing: ['destination'] };
    if (!trip.days) { trip.days = 4;       inferred.push('4 days (default)'); }
    if (!trip.travelers) { trip.travelers = 1; }
    if (!trip.season)    { trip.season = 'summer'; }
    if (!trip.primaryVibe) trip.primaryVibe = 'iconic-first-visit';

    return { trip, prefs, inferred, missing: [] };
  };

  // Merge parsed prefs into an existing profile without clobbering user-set fields.
  const mergeProfile = (existing, prefs) => {
    const p = { ...existing };
    p.dietary = { ...existing.dietary };
    p.accessibility = { ...existing.accessibility };
    p.medical = { ...existing.medical };
    p.family  = { ...existing.family };
    ['halal','kosher','vegan','vegetarian','glutenFree'].forEach(k => { if (prefs.dietary[k]) p.dietary[k] = true; });
    if (prefs.dietary.allergies?.length) {
      p.dietary.allergies = Array.from(new Set([...(existing.dietary.allergies || []), ...prefs.dietary.allergies]));
    }
    if (prefs.dietary.other) p.dietary.other = prefs.dietary.other;
    ['stepFree','lowVision','lowHearing','seatingBreaks'].forEach(k => { if (prefs.accessibility[k]) p.accessibility[k] = true; });
    if (prefs.modesty !== 'no-preference') p.modesty = prefs.modesty;
    if (prefs.medical.medications) p.medical.medications = prefs.medical.medications;
    if (prefs.family.babyOnBoard) p.family.babyOnBoard = true;
    if (prefs.family.childrenAges?.length) {
      p.family.childrenAges = Array.from(new Set([...(existing.family.childrenAges || []), ...prefs.family.childrenAges])).sort((a,b) => a-b);
    }
    if (prefs.budget) p.budget = prefs.budget;
    if (prefs.pace)   p.pace   = prefs.pace;
    if (prefs.avoid?.length) p.avoid = Array.from(new Set([...(existing.avoid || []), ...prefs.avoid]));
    return p;
  };

  return { parseTrip, mergeProfile };
})();

// ---------- ai: OpenAI + Anthropic wrappers ----------
const ai = (() => {
  const hasOpenAI = () => !!store.ai.openaiKey.get();
  const hasClaude = () => !!store.ai.claudeKey.get();
  // OpenRouter credentials are intentionally server-side. This flag is
  // populated from the local proxy's status endpoint and never contains a key.
  let openRouterConfigured = false;
  const hasOpenRouter = () => openRouterConfigured;
  const refreshOpenRouterStatus = async () => {
    try {
      const res = await fetch('/api/openrouter/status', { cache: 'no-store' });
      const data = res.ok ? await res.json() : null;
      openRouterConfigured = Boolean(data?.configured);
    } catch {
      openRouterConfigured = false;
    }
    return openRouterConfigured;
  };
  const enabled = () => hasOpenRouter() || hasOpenAI() || hasClaude();
  const provider = () => {
    const pref = store.ai.provider.get();
    if (pref === 'openrouter' && hasOpenRouter()) return 'openrouter';
    if (pref === 'openai' && hasOpenAI()) return 'openai';
    if (pref === 'claude' && hasClaude()) return 'claude';
    // Auto: prefer OpenRouter, then Claude, then OpenAI.
    if (hasOpenRouter()) return 'openrouter';
    if (hasClaude()) return 'claude';
    if (hasOpenAI()) return 'openai';
    return null;
  };

  const SYSTEM_PROMPT = `You are malem, a warm and precise travel-planning assistant.

Given the user's free-form description of a trip, return STRICT JSON with:
{
  "reply": "one short conversational reply, first person, warm, under 40 words",
  "trip": {
    "destination": "a lowercase slug of ANY city, region, or country the user names (e.g. \"istanbul\", \"lisbon\", \"kyoto\", \"amalfi-coast\"), or null if none is given",
    "days": integer or null,
    "travelers": integer or null,
    "arrivalDate": "YYYY-MM-DD" or null,
    "season": "spring"|"summer"|"autumn"|"winter" or null,
    "primaryVibe": "live-like-local"|"iconic-first-visit"|"relaxed-scenic"|"hidden-gems"|"family-adventure"|"halal-food-culture"|"luxury-without-rush" or null
  },
  "profile": {
    "dietary": { "halal": bool, "kosher": bool, "vegan": bool, "vegetarian": bool, "glutenFree": bool, "allergies": [string], "other": string },
    "accessibility": { "stepFree": bool, "lowVision": bool, "lowHearing": bool, "seatingBreaks": bool, "notes": string },
    "modesty": "no-preference"|"modest"|"conservative",
    "medical": { "medications": string, "devices": string, "reminderCadence": "none"|"daily"|"twice-daily" },
    "family": { "childrenAges": [int], "babyOnBoard": bool, "notes": string },
    "budget": "shoestring"|"mid"|"comfort"|"luxury" or null,
    "pace":   "slow"|"balanced"|"packed" or null,
    "avoid":  [string]
  },
  "missing": [string]
}

If no destination is mentioned, set destination null and put a friendly clarifying question in "reply".
Never invent constraints the user didn't state. Fields not stated → null / false / empty.
Respond with ONLY the JSON object — no prose, no code fences.`;

  const askOpenAI = async (userInput) => {
    const key = store.ai.openaiKey.get();
    if (!key) throw new Error('No OpenAI key set.');
    const model = store.ai.openaiModel.get();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userInput },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('OpenAI returned no JSON object.');
    return JSON.parse(match[0]);
  };

  // Anthropic-hosted web search tool. Claude runs the searches itself; results
  // come back in the same response, so there's no client-side tool loop to run.
  const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 12 };

  // Collect text across all content blocks (a web-search turn interleaves
  // server_tool_use / web_search_tool_result blocks between the text blocks).
  const collectText = (content) => (content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // One Claude JSON call, with an optional server-side tool loop (pause_turn).
  const claudeJSON = async ({ system, user, tools, maxTokens }) => {
    const key = store.ai.claudeKey.get();
    if (!key) throw new Error('No Anthropic key set.');
    const model = store.ai.claudeModel.get();
    const messages = [{ role: 'user', content: user }];
    let data, guard = 0;
    do {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens || 1024,
          system,
          ...(tools ? { tools } : {}),
          messages,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status} — ${await res.text().catch(() => '')}`.slice(0, 300));
      data = await res.json();
      if (data.stop_reason === 'pause_turn') messages.push({ role: 'assistant', content: data.content });
    } while (data.stop_reason === 'pause_turn' && ++guard < 6);

    const text = collectText(data.content);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude returned no JSON object.');
    return JSON.parse(jsonMatch[0]);
  };

  // Fast structured parse of the chat message (no web search needed).
  const askClaude = (userInput) => claudeJSON({ system: SYSTEM_PROMPT, user: userInput, maxTokens: 1024 });

  // Current OpenRouter list pricing (USD/token), checked 2026-07-15. The API
  // response cost is preferred whenever OpenRouter returns it; these values are
  // only a transparent fallback for an immediate in-app estimate.
  const OPENROUTER_PRICING = {
    'openai/gpt-5.6-luna':          { input: 1.00 / 1e6, output: 6.00 / 1e6 },
    'google/gemini-3-flash-preview':{ input: 0.50 / 1e6, output: 3.00 / 1e6 },
    'google/gemini-3.1-flash-lite': { input: 0.25 / 1e6, output: 1.50 / 1e6 },
    'openai/gpt-5.6-terra':         { input: 2.50 / 1e6, output: 15.00 / 1e6 },
    'google/gemini-3.5-flash':      { input: 1.50 / 1e6, output: 9.00 / 1e6 },
    'google/gemini-2.5-flash':      { input: 0.30 / 1e6, output: 2.50 / 1e6 },
    'openai/gpt-4.1-mini':          { input: 0.40 / 1e6, output: 1.60 / 1e6 },
    'qwen/qwen3-32b':               { input: 0.08 / 1e6, output: 0.28 / 1e6 },
    'google/gemini-2.5-flash-lite': { input: 0.10 / 1e6, output: 0.40 / 1e6 },
  };
  const WEB_RESEARCH_TOOL = {
    type: 'openrouter:web_search',
    parameters: { engine: 'exa', max_results: 5, max_total_results: 15, max_characters: 3500 },
  };
  const stageName = {
    discover: 'Place discovery', reviews: 'Review research', select: 'Vibe selection',
    present: 'Itinerary presentation', repair: 'Itinerary repair',
    outfitPlan: 'Outfit board planning', outfitBoardCurate: 'Live-piece visual curation', outfitBoardAudit: 'Cutout-only visual audit',
  };
  const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const usageFor = (model, usage = {}) => {
    const inputTokens = numeric(usage.prompt_tokens ?? usage.input_tokens);
    const outputTokens = numeric(usage.completion_tokens ?? usage.output_tokens);
    const searches = numeric(usage.server_tool_use?.web_search_requests);
    const exactCost = Number(usage.cost);
    if (Number.isFinite(exactCost) && exactCost >= 0) return { inputTokens, outputTokens, searches, cost: exactCost, estimated: false };
    const rate = OPENROUTER_PRICING[model] || { input: 0, output: 0 };
    return {
      inputTokens, outputTokens, searches,
      // Exa web search is $0.005/request. It is included only when the API did
      // not give us the authoritative cost for this response.
      cost: inputTokens * rate.input + outputTokens * rate.output + searches * 0.005,
      estimated: true,
    };
  };

  // OpenRouter requests go through the same-origin proxy. The proxy owns the
  // Bearer key, so neither localStorage nor browser requests contain a secret.
  const openRouterJSON = async ({ model, system, user, messages, maxTokens, tools, stage, runId, temperature = 0.35 }) => {
    const res = await fetch('/api/openrouter/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages || [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: maxTokens || 1024,
        ...(tools?.length ? { tools } : {}),
        response_format: { type: 'json_object' },
        temperature,
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300);
      if (res.status === 401) throw new Error('OpenRouter 401 — the server key is invalid. Replace OPENROUTER_API_KEY and restart the server.');
      if (res.status === 402) throw new Error('OpenRouter 402 — out of credits. Top up at openrouter.ai/credits.');
      if (res.status === 429) throw new Error('OpenRouter 429 — rate-limited; wait a moment and retry.');
      if (res.status === 503) throw new Error('OpenRouter is not configured. Set OPENROUTER_API_KEY on the server and restart it.');
      throw new Error(`OpenRouter HTTP ${res.status} — ${body}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('OpenRouter returned no JSON object.');
    const actualModel = data.model || model;
    const usage = usageFor(model, data.usage || {});
    const meta = {
      id: `llm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      runId: runId || null,
      stage: stage || 'chat',
      label: stageName[stage] || 'Trip parsing',
      model: actualModel,
      configuredModel: model,
      createdAt: new Date().toISOString(),
      ...usage,
    };
    if (stage) store.ai.usage.add(meta);
    return { json: JSON.parse(m[0]), meta };
  };

  const askOpenRouter = (userInput) =>
    openRouterJSON({ model: store.ai.openrouterModel.get(), system: SYSTEM_PROMPT, user: userInput, maxTokens: 1024, temperature: 0.2 })
      .then(result => result.json);

  const parseTripViaGPT = async (userInput) => {
    const p = provider();
    if (p === 'openrouter') return await askOpenRouter(userInput);
    if (p === 'claude') return await askClaude(userInput);
    if (p === 'openai') return await askOpenAI(userInput);
    throw new Error('No AI provider configured.');
  };

  // ---- Full trip generation: web-grounded, weather-aware, profile-personalized ----
  const GEN_SYSTEM = `You are malem, an expert real-time travel researcher and planner. You MUST search the live web before answering. Verify every named restaurant, shop, market, attraction, neighborhood business, opening-status claim, rating, and review summary from current sources. Never rely only on model memory when a web tool is available.

Personalize everything to the traveler's profile (dietary, accessibility, modesty, medical, family, budget, pace, and things to avoid) and to the provided live Open-Meteo forecast.

SMALL-BUSINESS PRIORITY:
- At least 70% of food, shopping, and activity recommendations must be independent small businesses, neighborhood institutions, markets, makers, or locally owned operators.
- Include at most two famous/high-traffic places unless the user explicitly asks for icons.
- Prefer strong recent local sentiment and specific review evidence over raw popularity.
- Do not call a place a small business unless a current source supports that inference. Use "unknown" when ownership/size is unclear.
- Never invent a rating, review count, hours, review quote, URL, or accessibility claim. Use null/empty fields when current evidence is unavailable.
- Paraphrase review themes; do not reproduce long review text.

Return STRICT JSON ONLY — no prose, no code fences, no citation text — matching EXACTLY this shape:
{
  "destinationMeta": {
    "key": "lowercase-slug",
    "name": "Proper Place Name",
    "country": "Country",
    "plug": "one warm sentence about the place",
    "culturalNote": "one sentence a first-time visitor should know",
    "palette": ["#hex","#hex","#hex","#hex","#hex"],
    "paletteNote": "a few words on the palette"
  },
  "itinerary": {
    "respectedFromProfile": ["short phrases naming which profile constraints shaped the plan"],
    "days": [
      { "date": "YYYY-MM-DD or empty string", "theme": "short day theme",
        "blocks": [ { "time": "HH:MM", "title": "Specific, verified place or activity", "duration": "e.g. 90 min", "kind": "meal|sight|activity|rest|transit|shopping", "respects": ["profile fields this honored, optional"], "businessSize": "small|local-institution|large|public|unknown", "rating": number or null, "reviewCount": integer or null, "reviewSummary": "short paraphrase of recent review themes or empty", "sourceUrl": "current official or reputable listing URL", "reviewSourceUrl": "current review/listing URL or empty", "checkedAt": "YYYY-MM-DD" } ] }
    ]
  },
  "expect": [ { "key": "etiquette|clothing|tipping|prayer|driving|transit|scams|safety|accessibility|phrases|hours|photos|difference", "label": "Human label", "text": "1-2 practical sentences", "confidence": "high|med", "updated": "YYYY-MM", "source": "web or local knowledge" } ],
  "local": [ { "name": "Verified named place", "mix": "famous|small-business|neighborhood|hidden|seasonal", "businessSize": "small|local-institution|large|public|unknown", "sub": "what it is, one line", "gemScore": "why it is worth it based on current evidence", "trafficNote": "crowds/best timing", "rating": number or null, "reviewCount": integer or null, "reviewSummary": "short paraphrase of recent review themes", "sourceUrl": "current official or reputable listing URL", "reviewSourceUrl": "current review/listing URL or empty", "checkedAt": "YYYY-MM-DD" } ],
  "packing": {
    "lists": [
      {"title":"Pack from home","items":[{"item":"...","why":"..."}],"tone":"good"},
      {"title":"Buy before leaving","items":[{"item":"...","why":"..."}],"tone":""},
      {"title":"Buy or rent there","items":[{"item":"...","why":"..."}],"tone":""},
      {"title":"Carry in your personal bag","items":[{"item":"...","why":"..."}],"tone":"good"},
      {"title":"Do not pack","items":[{"item":"...","why":"..."}],"tone":"warn"},
      {"title":"Before departure","items":[{"item":"...","why":"..."}],"tone":""}
    ],
    "reminders": [ {"when":"Two weeks before","text":"..."}, {"when":"Three days before","text":"..."}, {"when":"Night before","text":"..."}, {"when":"Morning of","text":"..."} ]
  }
}
Rules: itinerary.days length MUST equal the trip's day count. "expect" MUST cover all 13 keys. "local" MUST include at least 10 places and be ordered with small businesses first. Weather must visibly shape clothing, packing, and outdoor timing. Every non-transit itinerary place and every local entry needs a current sourceUrl and checkedAt date. Never invent profile constraints the traveler did not state.`;

  const buildGenUser = (trip, profile, weatherObj) => {
    const wxLine = (weatherObj && weatherObj.days && weatherObj.days.length)
      ? `${weather.describe(weatherObj)}\nDaily: ${weatherObj.days.map(d => `${d.date} ${Math.round(d.min)}–${Math.round(d.max)}°C ${d.summary} ${d.precip ?? 0}% rain`).join('; ')}`
      : 'No live forecast available — use seasonal norms.';
    return [
      `Trip: ${trip.days} day(s) in "${trip.destination}"${trip.arrivalDate ? `, arriving ${trip.arrivalDate}` : ''}, ${trip.travelers || 1} traveler(s).`,
      `Chosen vibe: ${trip.primaryVibe || 'unspecified'}. Season: ${trip.season || 'unspecified'}.`,
      `Live weather (Open-Meteo): ${wxLine}`,
      `Research date: ${new Date().toISOString().slice(0, 10)}. Search for current openings, official sites, recent reviews, closures, and neighborhood small businesses now.`,
      `Traveler profile — honor ALL of this and reference it in "respectedFromProfile":\n${JSON.stringify(profile)}`,
      `Now produce the complete JSON bundle for this trip.`,
    ].join('\n\n');
  };

  // Claude: web-grounded generation via the server-side web_search tool.
  const generateViaClaude = (trip, profile, weatherObj) =>
    claudeJSON({ system: GEN_SYSTEM, user: buildGenUser(trip, profile, weatherObj), tools: [WEB_SEARCH_TOOL], maxTokens: 16000 });

  const responseOutputText = (data) => (data?.output || [])
    .filter(item => item.type === 'message')
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text || '')
    .join('\n');

  // OpenAI: Responses API with the current web_search tool, so place/review
  // research is live rather than limited to the model's knowledge cutoff.
  const generateViaOpenAI = async (trip, profile, weatherObj) => {
    const key = store.ai.openaiKey.get();
    if (!key) throw new Error('No OpenAI key set.');
    const configured = store.ai.openaiModel.get();
    const model = /^gpt-(?:5\.[4-9]|[6-9])/.test(configured) ? configured : 'gpt-5.4-mini';
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        instructions: GEN_SYSTEM,
        input: buildGenUser(trip, profile, weatherObj),
        tools: [{ type: 'web_search', search_context_size: 'medium' }],
        tool_choice: 'auto',
        max_output_tokens: 12000,
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300);
      if (res.status === 429) throw new Error('OpenAI 429 — your key is out of quota or rate-limited. Add billing/credits at platform.openai.com (Settings → Billing), then try again.');
      if (res.status === 401) throw new Error('OpenAI 401 — that API key is invalid. Re-check it in Settings.');
      throw new Error(`OpenAI HTTP ${res.status} — ${body}`);
    }
    const data = await res.json();
    const text = responseOutputText(data);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('OpenAI web search returned no JSON object.');
    return JSON.parse(match[0]);
  };

  const DISCOVERY_SYSTEM = `You are the discovery stage in malem's travel pipeline. You MUST use the web-search tool before responding. Find at least 24 current, visitable places for the given destination and traveler constraints. Prioritize independent businesses, neighborhood institutions, and publicly accessible places. Search several neighborhoods and sources. The run context includes a variation nonce: use it to explore a different valid evidence set on each run while never sacrificing constraint fit or factual grounding. Do not invent ratings, hours, ownership, or URLs. Return STRICT JSON only:
{"places":[{"name":"","category":"meal|sight|activity|shopping|rest","neighborhood":"","why":"","businessSize":"small|local-institution|large|public|unknown","sourceUrl":"","checkedAt":"YYYY-MM-DD"}],"researchNotes":[""]}`;
  const REVIEWS_SYSTEM = `You are the review-research stage in malem's travel pipeline. You MUST use the web-search tool before responding. Given a candidate list, verify current review evidence for each viable place. Prefer official listings, reputable review platforms, and recent review themes. Do not fabricate ratings, counts, or quotes; use null or an empty string when not found. Return STRICT JSON only:
{"reviews":[{"name":"","rating":null,"reviewCount":null,"reviewSummary":"","reviewSourceUrl":"","sourceUrl":"","checkedAt":"YYYY-MM-DD","cautions":""}]}`;
  const SELECTION_SYSTEM = `You are the selection stage in malem's travel pipeline. Choose the best places from researched candidate and review evidence for the requested vibe and traveler profile. Favor evidence, fit, variety, geographic coherence, and appropriate pacing over popularity. The variation nonce is a deterministic tie-breaker: when two candidates fit equally well, vary the choice across runs. Never weaken dietary, accessibility, modesty, medical, family, budget, pace, or avoid constraints merely to be different. Do not create or alter factual claims. Return STRICT JSON only:
{"selected":[{"name":"","category":"meal|sight|activity|shopping|rest","day":1,"priority":1,"selectionReason":""}]}`;
  const PRESENTATION_SYSTEM = GEN_SYSTEM.replace(
    'You are malem, an expert real-time travel researcher and planner. You MUST search the live web before answering. Verify every named restaurant, shop, market, attraction, neighborhood business, opening-status claim, rating, and review summary from current sources. Never rely only on model memory when a web tool is available.',
    'You are malem\'s final itinerary-presentation stage. You receive structured, web-grounded evidence from earlier stages. Use only that evidence for factual place, rating, review, and URL claims; leave unavailable facts null or empty. Do not browse and do not rely on model memory for new factual claims.'
  );

  const buildPipelineContext = (trip, profile, weatherObj, variationNonce) =>
    `${buildGenUser(trip, profile, weatherObj)}\n\nVariation nonce for this run: ${variationNonce}.`;
  const validateTripBundle = (bundle, expectedDays) => {
    const errors = [];
    if (!bundle?.destinationMeta?.name) errors.push('destinationMeta.name is missing');
    const days = bundle?.itinerary?.days;
    if (!Array.isArray(days)) errors.push('itinerary.days is missing');
    else {
      if (days.length !== expectedDays) errors.push(`itinerary.days must contain exactly ${expectedDays} days, got ${days.length}`);
      days.forEach((day, index) => {
        if (!Array.isArray(day?.blocks) || day.blocks.length < 3) errors.push(`day ${index + 1} needs at least 3 blocks`);
        (day?.blocks || []).forEach((block, blockIndex) => {
          if (!block?.title || !block?.time || !block?.kind) errors.push(`day ${index + 1} block ${blockIndex + 1} is missing title, time, or kind`);
        });
      });
    }
    const expectKeys = new Set((bundle?.expect || []).map(item => item?.key));
    ['etiquette','clothing','tipping','prayer','driving','transit','scams','safety','accessibility','phrases','hours','photos','difference']
      .forEach(key => { if (!expectKeys.has(key)) errors.push(`expect is missing ${key}`); });
    if (!Array.isArray(bundle?.local) || bundle.local.length < 8) errors.push('local needs at least 8 verified places');
    if (!Array.isArray(bundle?.packing?.lists) || bundle.packing.lists.length < 4) errors.push('packing.lists is incomplete');
    return errors;
  };

  // Four intentionally isolated model calls. Research and review calls have
  // bounded server-side search; selection and presentation only consume the
  // structured evidence returned by earlier stages.
  const generateViaOpenRouter = async (trip, profile, weatherObj) => {
    const models = store.ai.pipeline.get();
    const runId = `trip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const variationNonce = crypto.randomUUID();
    const context = buildPipelineContext(trip, profile, weatherObj, variationNonce);
    const traceStages = [];
    const trace = (result) => {
      traceStages.push({ ...result.meta, response: result.json });
      return result;
    };
    const saveTrace = (error) => {
      const stages = traceStages.map(({ response, ...meta }) => meta);
      const run = {
        id: runId, createdAt: new Date().toISOString(), stageCount: traceStages.length,
        models: stages.map(stage => stage.model),
        cost: stages.reduce((sum, stage) => sum + numeric(stage.cost), 0),
        estimated: stages.some(stage => stage.estimated), stages: traceStages,
        ...(error ? { error: String(error?.message || error).slice(0, 240) } : {}),
      };
      // Keep a single inspectable trace in this browser. The compact usage
      // ledger remains separate so history does not retain every response.
      store.ai.lastRun.set(run);
      return { llmRun: { ...run, stages }, trace: run };
    };
    try {
      const discovery = trace(await openRouterJSON({
        model: models.discover, system: DISCOVERY_SYSTEM, user: context,
        maxTokens: 5000, tools: [WEB_RESEARCH_TOOL], stage: 'discover', runId, temperature: 0.55,
      }));
      const reviews = trace(await openRouterJSON({
        model: models.reviews, system: REVIEWS_SYSTEM,
        user: `${context}\n\nCandidate places from discovery (treat as leads, not facts):\n${JSON.stringify(discovery.json)}`,
        maxTokens: 5000, tools: [WEB_RESEARCH_TOOL], stage: 'reviews', runId, temperature: 0.2,
      }));
      const selection = trace(await openRouterJSON({
        model: models.select, system: SELECTION_SYSTEM,
        user: `${context}\n\nCandidate evidence:\n${JSON.stringify(discovery.json)}\n\nReview evidence:\n${JSON.stringify(reviews.json)}`,
        maxTokens: 3500, stage: 'select', runId, temperature: 0.6,
      }));
      let presentation = trace(await openRouterJSON({
        model: models.present, system: PRESENTATION_SYSTEM,
        user: `${context}\n\nDiscovery evidence:\n${JSON.stringify(discovery.json)}\n\nReview evidence:\n${JSON.stringify(reviews.json)}\n\nPlaces selected for this traveler:\n${JSON.stringify(selection.json)}\n\nBuild the final itinerary JSON strictly from this evidence. Do not browse or invent missing facts.`,
        maxTokens: 14000, stage: 'present', runId, temperature: 0.45,
      }));
      const validationErrors = validateTripBundle(presentation.json, Number(trip.days));
      if (validationErrors.length) {
        presentation = trace(await openRouterJSON({
          model: models.present,
          system: PRESENTATION_SYSTEM,
          user: `${context}\n\nThe previous final JSON failed validation:\n- ${validationErrors.join('\n- ')}\n\nPrevious JSON:\n${JSON.stringify(presentation.json)}\n\nRepair it now. Preserve all grounded evidence and constraints, add no unsupported facts, and return the complete corrected JSON object.`,
          maxTokens: 14000, stage: 'repair', runId, temperature: 0.15,
        }));
        const remainingErrors = validateTripBundle(presentation.json, Number(trip.days));
        if (remainingErrors.length) throw new Error(`The itinerary did not pass validation after repair: ${remainingErrors.slice(0, 4).join('; ')}`);
      }
      const saved = saveTrace();
      return { bundle: presentation.json, llmRun: saved.llmRun };
    } catch (error) {
      saveTrace(error);
      throw error;
    }
  };

  const OUTFIT_PLAN_SYSTEM = `You are malem's travel wardrobe editor. Build one cohesive full-outfit direction per itinerary day from the supplied immutable trip context. Treat the original user input, saved profile, live weather, itinerary, and destination palette as one consistent source of truth. The UI will use the look's destination, activities, name, theme, and vibeWords to retrieve several photographs of complete outfits.

Rules:
- The profile's wardrobePresentation and styleAgeBand are explicit styling instructions. If wardrobePresentation is "women", create ONLY women's garments, women's footwear, and women's accessories. Never substitute menswear, menswear sizing, or unisex items. If it is "men", do the equivalent for men. If it is "unisex", use gender-neutral pieces. Select silhouettes and styling appropriate to styleAgeBand without stereotyping.
- destinationMeta.palette and destinationMeta.paletteNote are the LOCKED colour story chosen by the itinerary. Return capsulePalette as those exact hex values in the same order. Every piece.color must use a named colour from that colour story or a neutral needed to support it (ivory, cream, black, white, tan, or metallic). Do not introduce a competing colour palette.
- Honor every explicit modesty, accessibility, medical, sensory, family, budget, laundry, activity, and avoid constraint.
- Weather and the actual activities for each day must visibly change the pieces, footwear, layers, and practical notes.
- Create exactly one board for every itinerary day. Include any needed evening transition piece inside that day's board rather than creating another board.
- Make looks cohesive but not repetitive. Reuse capsule pieces intentionally and identify them.
- Describe 4–6 coordinated pieces as the practical recipe for the complete look. Do not write per-item image-search queries.
- Make name, theme, activityNote, and vibeWords visually specific enough to drive a full-body outfit-inspiration search (for example beach resort, Milan city street style, museum day, or evening dinner).
- Write short editorial annotations suitable for a modern inspiration gallery. Favor specific fabrics, silhouettes, colors, textures, and practical footwear over brand names.

Return STRICT JSON only:
{"version":3,"contextSummary":["short immutable constraints"],"capsulePalette":["#hex"],"looks":[{"id":"day-1","day":1,"period":"day","name":"","why":"","weatherNote":"","activityNote":"","vibeWords":[""],"stylingNote":"","pieces":[{"part":"top|bottom|dress|outerwear|shoes|accessory","item":"","color":"","reason":""}],"reuse":["piece reused from another board"]}]}`;

  const OUTFIT_CURATE_SYSTEM = `You are malem's visual fashion editor. You will receive real web-image candidates grouped by wardrobe piece. Select exactly one candidate for every piece. Judge the visible image itself, not brand prestige.

Prioritize:
- the requested garment type, color, fabric, and silhouette;
- a clean isolated product, cutout, or flat-lay composition that layers well in a Pinterest-style collage;
- weather, activity, modesty, accessibility, and budget fidelity from the immutable trip context;
- the explicit wardrobePresentation: when it is women, accept only a women's product; when it is men, accept only a men's product; when it is unisex, accept only a gender-neutral product. A candidate that is menswear for a women's board (or vice versa) must receive candidateIndex -1;
- the locked itinerary palette: reject a candidate whose visible dominant garment colour conflicts with its requested piece.color or the palette;
- a cohesive but not monotonous board.

Never select an image containing a visible person, face, body, hand, limb, mannequin, or worn garment. If a piece group has no model-free product image, use candidateIndex -1 so the UI can show an editorial text placeholder. Do not select a candidate from the wrong piece group. Return STRICT JSON only:
{"selections":[{"pieceIndex":0,"candidateIndex":0,"confidence":0.0,"reason":""}],"boardNote":""}`;

  const OUTFIT_AUDIT_SYSTEM = `You are a strict binary image auditor for a cutout-only fashion collage. Inspect each labeled image independently.

Reject an image if it contains any visible person, face, body, skin, hand, limb, mannequin, clothing worn by a person, or a full styled outfit on a person. Accept only an individual garment/accessory shown alone as a product cutout, product still life, or flat lay.

Return STRICT JSON only:
{"audits":[{"pieceIndex":0,"reject":true,"reason":"visible torso wearing garment"}]}`;

  const outfitContext = (trip, profile, weatherObj) => ({
    originalUserInput: trip.originalInput || '',
    trip: {
      // A new trip is always a new creative brief, even when someone enters
      // the same city twice. This prevents a prior board being reused.
      id: trip.id || null, destination: trip.destination, days: trip.days, travelers: trip.travelers,
      arrivalDate: trip.arrivalDate || null, season: trip.season,
      primaryVibe: trip.primaryVibe, summary: trip.summary,
    },
    profile,
    liveWeather: weatherObj || trip.weather || null,
    itinerary: trip.bundle?.itinerary || null,
    destinationMeta: trip.bundle?.destinationMeta || null,
  });

  const outfitPlanErrors = (plan, days) => {
    const errors = [];
    if (!Array.isArray(plan?.looks)) return ['looks is missing'];
    const dayLooks = plan.looks.filter(look => look?.period === 'day');
    for (let day = 1; day <= Number(days); day++) {
      if (dayLooks.filter(look => Number(look.day) === day).length !== 1) errors.push(`day ${day} must have exactly one primary day look`);
    }
    if (plan.looks.length !== Number(days)) errors.push('looks must contain exactly one board per itinerary day');
    plan.looks.forEach((look, index) => {
      if (!look?.id || !look?.name) errors.push(`look ${index + 1} is missing id or name`);
      if (!Array.isArray(look?.pieces) || look.pieces.length < 4 || look.pieces.length > 6) errors.push(`look ${index + 1} needs 4–6 pieces`);
      (look?.pieces || []).forEach((piece, pieceIndex) => {
        if (!piece?.item) errors.push(`look ${index + 1}, piece ${pieceIndex + 1} needs an item`);
      });
    });
    return errors;
  };

  const createOutfitPlan = async (trip, profile, weatherObj, force = false) => {
    if (!hasOpenRouter()) throw new Error('OpenRouter is required for context-aware outfit boards.');
    const models = store.ai.outfitPipeline.get();
    const runId = `outfit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const context = outfitContext(trip, profile, weatherObj);
    const contextHash = outfitRecommender.idFor(`full-look-board-v1:${JSON.stringify(context)}`);
    if (!force && trip.bundle?.outfits?.version === 3 && trip.bundle?.outfits?.contextHash === contextHash && Array.isArray(trip.bundle.outfits.looks)) {
      return trip.bundle.outfits;
    }
    const variationNonce = crypto.randomUUID();
    let result = await openRouterJSON({
      model: models.plan, system: OUTFIT_PLAN_SYSTEM,
      user: `Immutable trip context:\n${JSON.stringify(context)}\n\nVariation nonce: ${variationNonce}. Create a new capsule direction that still obeys every constraint.`,
      maxTokens: 6500, stage: 'outfitPlan', runId, temperature: 0.75,
    });
    let errors = outfitPlanErrors(result.json, trip.days);
    const lockedPalette = (context.destinationMeta?.palette || []).map(color => String(color).toLowerCase());
    if (lockedPalette.length && JSON.stringify((result.json?.capsulePalette || []).map(color => String(color).toLowerCase())) !== JSON.stringify(lockedPalette)) {
      errors.push('capsulePalette must exactly match the itinerary destination palette');
    }
    if (errors.length) {
      result = await openRouterJSON({
        model: models.plan, system: OUTFIT_PLAN_SYSTEM,
        user: `Immutable trip context:\n${JSON.stringify(context)}\n\nThe previous wardrobe JSON failed validation:\n- ${errors.join('\n- ')}\n\nPrevious JSON:\n${JSON.stringify(result.json)}\n\nReturn the complete corrected wardrobe JSON.`,
        maxTokens: 6500, stage: 'outfitPlan', runId, temperature: 0.15,
      });
      errors = outfitPlanErrors(result.json, trip.days);
      if (lockedPalette.length && JSON.stringify((result.json?.capsulePalette || []).map(color => String(color).toLowerCase())) !== JSON.stringify(lockedPalette)) {
        errors.push('capsulePalette must exactly match the itinerary destination palette');
      }
      if (errors.length) throw new Error(`The outfit plan did not pass validation: ${errors.slice(0, 4).join('; ')}`);
    }
    return { ...result.json, version: 3, contextHash, variationNonce, generatedAt: new Date().toISOString(), model: result.meta.model };
  };

  const curateOutfitBoard = async ({ trip, profile, plan, look, candidateGroups }) => {
    const model = store.ai.outfitPipeline.get().curate;
    const context = outfitContext(trip, profile, trip.weather);
    const content = [{
      type: 'text',
      text: `Immutable trip context:\n${JSON.stringify(context)}\n\nBoard direction:\n${JSON.stringify(look)}\n\nHard selection contract: wardrobePresentation=${profile.wardrobePresentation || 'women'}; capsule palette=${JSON.stringify(plan.capsulePalette || [])}. Reject wrong-gendered or wrong-colour products with candidateIndex -1. Each following image is labeled pieceIndex/candidateIndex. Select one per piece.`,
    }];
    candidateGroups.forEach((group, pieceIndex) => {
      group.slice(0, 4).forEach((candidate, candidateIndex) => {
        content.push({ type: 'text', text: `pieceIndex ${pieceIndex}, candidateIndex ${candidateIndex}: ${candidate.title || candidate.query || 'live web result'}` });
        content.push({ type: 'image_url', image_url: { url: candidate.url } });
      });
    });
    const result = await openRouterJSON({
      model, stage: 'outfitBoardCurate', runId: `outfit_board_${plan.variationNonce}`, maxTokens: 1800, temperature: 0.1,
      messages: [
        { role: 'system', content: OUTFIT_CURATE_SYSTEM },
        { role: 'user', content },
      ],
    });
    const selectedContent = [{ type: 'text', text: 'Audit every labeled image. Any visible human or worn garment must be rejected.' }];
    (result.json?.selections || []).forEach(selection => {
      const pieceIndex = Number(selection.pieceIndex);
      const candidateIndex = Number(selection.candidateIndex);
      const candidate = candidateGroups[pieceIndex]?.[candidateIndex];
      if (!candidate || candidateIndex < 0) return;
      selectedContent.push({ type: 'text', text: `pieceIndex ${pieceIndex}` });
      selectedContent.push({ type: 'image_url', image_url: { url: candidate.url } });
    });
    if (selectedContent.length === 1) return { ...result.json, meta: result.meta };
    const audit = await openRouterJSON({
      model, stage: 'outfitBoardAudit', runId: `outfit_board_${plan.variationNonce}`, maxTokens: 1000, temperature: 0,
      messages: [
        { role: 'system', content: OUTFIT_AUDIT_SYSTEM },
        { role: 'user', content: selectedContent },
      ],
    });
    const audited = new Map((audit.json?.audits || []).map(item => [Number(item.pieceIndex), item?.reject === false]));
    const rejected = new Set((result.json?.selections || [])
      .map(item => Number(item.pieceIndex))
      .filter(pieceIndex => !audited.get(pieceIndex)));
    return {
      ...result.json,
      selections: (result.json?.selections || []).map(selection => rejected.has(Number(selection.pieceIndex))
        ? { ...selection, candidateIndex: -1, confidence: 0, reason: 'Removed by the cutout-only visual audit.' }
        : selection),
      meta: result.meta,
      auditMeta: audit.meta,
    };
  };

  const generateTrip = async (trip, profile, weatherObj) => {
    const p = provider();
    if (p === 'openrouter') return await generateViaOpenRouter(trip, profile, weatherObj);
    if (p === 'claude') return { bundle: await generateViaClaude(trip, profile, weatherObj), llmRun: null };
    if (p === 'openai') return { bundle: await generateViaOpenAI(trip, profile, weatherObj), llmRun: null };
    return null;
  };

  // Legacy alias
  const hasKey = enabled;

  return {
    enabled, hasKey, hasOpenAI, hasClaude, hasOpenRouter, refreshOpenRouterStatus,
    provider, parseTripViaGPT, generateTrip, createOutfitPlan, curateOutfitBoard,
  };
})();

// ---------- weather: live forecast via Open-Meteo (free, no API key, CORS-open) ----------
const weather = (() => {
  const CODES = { 0:'clear', 1:'mainly clear', 2:'partly cloudy', 3:'overcast', 45:'fog', 48:'freezing fog',
    51:'light drizzle', 53:'drizzle', 55:'heavy drizzle', 56:'freezing drizzle', 57:'freezing drizzle',
    61:'light rain', 63:'rain', 65:'heavy rain', 66:'freezing rain', 67:'freezing rain',
    71:'light snow', 73:'snow', 75:'heavy snow', 77:'snow grains',
    80:'rain showers', 81:'rain showers', 82:'violent rain showers', 85:'snow showers', 86:'snow showers',
    95:'thunderstorm', 96:'thunderstorm with hail', 99:'thunderstorm with hail' };
  const codeText = (c) => CODES[c] ?? 'mixed';

  const geocode = async (place) => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Geocoding HTTP ${r.status}`);
    const j = await r.json();
    return (j.results && j.results[0]) || null;
  };

  // Live daily forecast for a free-text place. Open-Meteo covers ~16 days out;
  // for trips further ahead this returns the nearest window as a seasonal proxy.
  const forecast = async (place, days = 7) => {
    const g = await geocode(place);
    if (!g) return null;
    const n = Math.min(Math.max(days || 3, 1), 16);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code`
      + `&forecast_days=${n}&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Forecast HTTP ${r.status}`);
    const j = await r.json();
    const d = j.daily || {};
    const list = (d.time || []).map((date, i) => ({
      date,
      max: d.temperature_2m_max?.[i],
      min: d.temperature_2m_min?.[i],
      precip: d.precipitation_probability_max?.[i],
      code: d.weather_code?.[i],
      summary: codeText(d.weather_code?.[i]),
    }));
    return { place: g.name, country: g.country || '', admin: g.admin1 || '',
      lat: g.latitude, lon: g.longitude, timezone: j.timezone || 'auto', days: list,
      updatedAt: new Date().toISOString(), source: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/' };
  };

  // Compact human/LLM-readable summary line.
  const describe = (w) => {
    if (!w || !w.days || !w.days.length) return '';
    const mins = w.days.map(d => d.min).filter(Number.isFinite);
    const maxs = w.days.map(d => d.max).filter(Number.isFinite);
    if (!mins.length || !maxs.length) return '';
    const lo = Math.round(Math.min(...mins)), hi = Math.round(Math.max(...maxs));
    const wet = w.days.filter(d => (d.precip || 0) >= 40).length;
    const conds = w.days.map(d => d.summary);
    const common = conds.slice().sort((a, b) =>
      conds.filter(v => v === b).length - conds.filter(v => v === a).length)[0];
    return `${lo}–${hi}°C, mostly ${common}${wet ? `, rain likely on ${wet} day${wet > 1 ? 's' : ''}` : ''}.`;
  };

  return { forecast, describe, codeText, geocode };
})();

// ---------- imageSearch: real product photos via Google Custom Search (browser-callable) ----------
// Powers the Shuffles-style outfit collages. Needs a Google API key + a Programmable
// Search Engine id (cx) set in Settings. Free tier is ~100 queries/day, so results
// are cached and queries are de-duplicated across looks.
const imageSearch = (() => {
  const hasKeys = () => !!(store.images.key.get() && store.images.cx.get());
  const _cache = new Map(); // query -> Promise<string[]>
  const search = (query) => {
    if (!query || !hasKeys()) return Promise.resolve([]);
    if (_cache.has(query)) return _cache.get(query);
    const key = store.images.key.get(), cx = store.images.cx.get();
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}`
      + `&cx=${encodeURIComponent(cx)}&searchType=image&num=4&imgType=photo&safe=active`
      + `&q=${encodeURIComponent(query)}`;
    const p = fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('CSE HTTP ' + r.status)))
      .then(j => (j.items || []).map(it => it.link).filter(Boolean))
      .catch(err => { console.warn('image search failed:', err.message); return []; });
    _cache.set(query, p);
    return p;
  };
  const first = (query) => search(query).then(list => list[0] || null);
  const clearCache = () => _cache.clear();
  return { hasKeys, search, first, clearCache };
})();

// ---------- pinterest: bounded full-look outfit inspiration retrieval ----------
const pinterest = (() => {
  const STORAGE_KEY = 'malem.outfitSearchCache.v3';
  const FRESH_MS = 24 * 60 * 60 * 1000;
  const STALE_MS = 7 * FRESH_MS;
  const MAX_SAVED_QUERIES = 36;
  const MAX_PINS_PER_QUERY = 12;
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180).toLowerCase();
  const uniqueWords = (value) => {
    const seen = new Set();
    return String(value || '').split(/\s+/).filter(word => {
      const key = word.toLowerCase().replace(/[^a-z0-9'-]/g, '');
      return key && !seen.has(key) && seen.add(key);
    }).join(' ');
  };
  const locationLabel = (trip) => {
    const meta = trip.bundle?.destinationMeta || {};
    const fallbackName = String(trip.destination || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
    const name = meta.name || DATA.destinations.find(d => d.key === trip.destination)?.name || fallbackName;
    const country = meta.country || '';
    return [country, name].filter((part, index, all) => part && all.findIndex(other => other.toLowerCase() === part.toLowerCase()) === index).join(' ');
  };
  const settingFor = (look, itineraryDay, trip) => {
    const text = [
      look?.name, look?.theme, look?.why, look?.weatherNote, look?.activityNote,
      ...(look?.vibeWords || []),
      itineraryDay?.theme,
      ...(itineraryDay?.blocks || []).flatMap(block => [block.title, block.kind]),
      trip?.summary, trip?.primaryVibe,
      trip?.bundle?.destinationMeta?.plug, trip?.bundle?.destinationMeta?.culturalNote,
    ].filter(Boolean).join(' ').toLowerCase();
    if (/beach|coast|coastal|seaside|swim|island|resort|waterfront|boat|sailing/.test(text)) return 'beach resort';
    if (/hike|trail|mountain|outdoor|nature|national park/.test(text)) return 'outdoor walking';
    if (/dinner|evening|night|opera|theatre|theater|cocktail/.test(text)) return 'evening';
    if (/museum|gallery|café|cafe|shopping|market|old town|city|architecture/.test(text)) return 'city street style';
    return 'travel street style';
  };
  const buildQueries = (trip, profile, look, itineraryDay) => {
    const location = locationLabel(trip);
    const audience = profile.wardrobePresentation === 'men' ? "men's" : profile.wardrobePresentation === 'unisex' ? 'unisex' : "women's";
    const ageStyle = profile.styleAgeBand === 'teen' ? 'teen' : profile.styleAgeBand === 'mature' ? 'mature' : '';
    const modest = profile.modesty !== 'no-preference' ? 'modest' : '';
    const setting = settingFor(look, itineraryDay, trip);
    const vibe = [...(look?.vibeWords || []), look?.theme, look?.name].filter(Boolean).join(' ');
    const extra = store.pinterest.extraKeywords.get();
    return [
      `${location} ${trip.season || ''} ${setting} ${audience} ${ageStyle} ${modest} full outfit inspiration ${extra}`,
      `${location} ${vibe} ${audience} ${modest} full body travel outfit lookbook ${extra}`,
    ].map(query => normalize(uniqueWords(query))).filter((query, index, all) => query && all.indexOf(query) === index).slice(0, 2);
  };
  const buildQuery = (trip, profile, look, itineraryDay) => buildQueries(trip, profile, look, itineraryDay)[0] || '';
  const searchURL = (query) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
  const readSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } };
  const savedPins = (query, maxAge) => {
    const entry = readSaved()[query];
    return entry && Date.now() - Number(entry.savedAt) <= maxAge && Array.isArray(entry.pins) ? entry.pins.slice(0, MAX_PINS_PER_QUERY) : [];
  };
  const savePins = (query, pins) => {
    if (!pins.length) return;
    try {
      const saved = readSaved();
      saved[query] = { savedAt: Date.now(), pins: pins.slice(0, MAX_PINS_PER_QUERY) };
      const trimmed = Object.fromEntries(Object.entries(saved).sort((a, b) => Number(b[1]?.savedAt) - Number(a[1]?.savedAt)).slice(0, MAX_SAVED_QUERIES));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {}
  };
  const _cache = new Map();
  let batch = { remaining: 12 };
  const beginBatch = (maximum = 12) => { batch = { remaining: Math.max(1, Math.min(Number(maximum) || 12, 12)) }; };
  const searchPins = (query) => {
    const key = normalize(query);
    if (!key) return Promise.resolve([]);
    if (_cache.has(key)) return _cache.get(key);
    const fresh = savedPins(key, FRESH_MS);
    if (fresh.length) {
      const hit = Promise.resolve(fresh);
      _cache.set(key, hit);
      return hit;
    }
    const stale = savedPins(key, STALE_MS);
    if (batch.remaining <= 0) return Promise.resolve(stale);
    batch.remaining -= 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const p = fetch(`/api/pinterest?q=${encodeURIComponent(key)}`, { cache: 'force-cache', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Outfit image endpoint HTTP ${response.status}`);
        const data = await response.json();
        const pins = data.pins?.length ? data.pins : (data.images || []).map(image => ({ image, title: key, sourceUrl: searchURL(key) }));
        const seen = new Set();
        const unique = pins.filter(pin => pin?.image && !seen.has(pin.image) && seen.add(pin.image)).slice(0, MAX_PINS_PER_QUERY);
        if (unique.length) savePins(key, unique);
        return unique.length ? unique : stale;
      })
      .catch(error => {
        console.warn('Full-outfit search degraded:', error.message);
        return stale;
      })
      .finally(() => clearTimeout(timeout));
    _cache.set(key, p);
    return p;
  };
  const clearCache = ({ persistent = false } = {}) => {
    _cache.clear();
    if (persistent) localStorage.removeItem(STORAGE_KEY);
  };
  const budgetStatus = () => ({ ...batch });

  return { buildQuery, buildQueries, searchPins, searchURL, clearCache, beginBatch, budgetStatus, settingFor, locationLabel };
})();

// ---------- outfitRecommender: a tiny, local Pinterest-style ranking stack ----------
// This keeps three compact indexes in localStorage: semantic vectors for search,
// visual vectors sampled from loaded images, and implicit feedback events. It is
// deliberately browser-sized so personalization works on Pages without a new
// database account or a heavyweight model download.
const outfitRecommender = (() => {
  const VECTOR_KEY = 'malem.outfitVectors.v2';
  const EVENT_KEY = 'malem.outfitEvents.v2';
  const TEXT_DIMS = 64;
  const MAX_VECTORS = 320;
  const MAX_EVENTS = 800;
  const STOP = new Set('a an and are as at be by for from in is it look of on or outfit style the to with inspiration fashion day'.split(' '));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn('Outfit taste storage full:', error.message); } };
  const hash = (value) => {
    let h = 2166136261;
    for (const ch of String(value || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const idFor = (url) => `pin-${hash(url).toString(36)}`;
  const normalize = (values) => {
    const length = Math.sqrt(values.reduce((sum, v) => sum + (v * v), 0)) || 1;
    return values.map(v => Number((v / length).toFixed(5)));
  };
  const cosine = (a, b) => {
    if (!a?.length || !b?.length || a.length !== b.length) return 0;
    let total = 0; for (let i = 0; i < a.length; i++) total += a[i] * b[i];
    return Math.max(-1, Math.min(1, total));
  };
  const tokens = (text) => {
    const words = String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
    return [...words, ...words.slice(0, -1).map((word, i) => `${word}_${words[i + 1]}`)];
  };
  // Feature hashing gives us a dense-retrieval-style semantic index with no
  // external model payload. Bigrams preserve useful phrases such as linen shirt.
  const textVector = (text) => {
    const vector = Array(TEXT_DIMS).fill(0);
    tokens(text).forEach((token, index) => {
      const h = hash(token); const slot = h % TEXT_DIMS;
      vector[slot] += (h & 1 ? 1 : -1) * (token.includes('_') ? 1.35 : 1) / Math.sqrt(index + 1);
    });
    return normalize(vector);
  };
  const centroid = (weighted) => {
    if (!weighted.length) return null;
    const dims = weighted[0].vector.length; const out = Array(dims).fill(0); let weightSum = 0;
    weighted.forEach(({ vector, weight }) => { for (let i = 0; i < dims; i++) out[i] += vector[i] * weight; weightSum += Math.abs(weight); });
    return weightSum ? normalize(out.map(v => v / weightSum)) : null;
  };
  const vectorDb = () => read(VECTOR_KEY, {});
  const events = () => read(EVENT_KEY, []);
  const upsert = (candidate, visual) => {
    const db = vectorDb(); const id = candidate.id || idFor(candidate.url);
    db[id] = {
      id, url: candidate.url, title: candidate.title, query: candidate.query,
      text: candidate.text || textVector(`${candidate.title || ''} ${candidate.query || ''} ${(candidate.tags || []).join(' ')}`),
      visual: visual || db[id]?.visual || null, updatedAt: Date.now(),
    };
    const trimmed = Object.fromEntries(Object.entries(db).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_VECTORS));
    write(VECTOR_KEY, trimmed); return trimmed[id];
  };
  const eventWeight = (type) => ({ save: 4.5, unsave: -4.5, hide: -5, open: 1.25, zoom: 1.75 }[type] || 0);
  const record = (user, candidate, type) => {
    upsert(candidate);
    const list = events();
    list.push({ user, itemId: candidate.id, type, at: Date.now(), session: sessionStorage.getItem('malem.outfitSession') || '' });
    write(EVENT_KEY, list.slice(-MAX_EVENTS));
  };
  const isSaved = (user, itemId) => {
    const latest = events().filter(e => e.user === user && e.itemId === itemId && (e.type === 'save' || e.type === 'unsave')).at(-1);
    return latest?.type === 'save';
  };
  const userProfile = (user) => {
    const db = vectorDb(); const list = events(); const now = Date.now();
    const mine = list.filter(e => e.user === user && db[e.itemId]);
    const weighted = mine.map(e => {
      const ageDays = Math.max(0, (now - e.at) / 86400000);
      return { entry: db[e.itemId], weight: eventWeight(e.type) * Math.exp(-ageDays / 120) };
    }).filter(x => x.weight);
    return {
      text: centroid(weighted.map(x => ({ vector: x.entry.text, weight: x.weight }))),
      visual: centroid(weighted.filter(x => x.entry.visual).map(x => ({ vector: x.entry.visual, weight: x.weight }))),
      eventCount: mine.length,
    };
  };
  const directAffinity = (user, itemId) => {
    const relevant = events().filter(e => e.user === user && e.itemId === itemId).slice(-8);
    return Math.tanh(relevant.reduce((sum, e) => sum + eventWeight(e.type), 0) / 5);
  };
  const crowdAffinity = (user, itemId) => {
    const others = events().filter(e => e.user !== user && e.itemId === itemId);
    if (!others.length) return 0;
    return Math.tanh(others.reduce((sum, e) => sum + eventWeight(e.type), 0) / 8);
  };
  const rank = (candidates, intent, user, limit = 6) => {
    const target = textVector(intent); const profile = userProfile(user); const db = vectorDb();
    const scored = candidates.map(candidate => {
      candidate.id ||= idFor(candidate.url);
      candidate.text ||= textVector(`${candidate.title || ''} ${candidate.query || ''} ${(candidate.tags || []).join(' ')}`);
      const stored = db[candidate.id];
      const textMatch = (cosine(candidate.text, target) + 1) / 2;
      const visualMatch = profile.visual && stored?.visual ? (cosine(stored.visual, profile.visual) + 1) / 2 : .5;
      const tasteMatch = profile.text ? (cosine(candidate.text, profile.text) + 1) / 2 : .5;
      const collaborative = Math.max(0, Math.min(1, .5 + (.28 * directAffinity(user, candidate.id)) + (.12 * crowdAffinity(user, candidate.id)) + (.2 * (tasteMatch - .5))));
      return { ...candidate, textMatch, visualMatch, collaborative, score: (.5 * textMatch) + (.3 * visualMatch) + (.2 * collaborative) };
    });
    // Maximal marginal relevance prevents near-identical search-result clusters.
    const selected = [];
    while (scored.length && selected.length < limit) {
      scored.forEach(candidate => {
        const duplicate = selected.length ? Math.max(...selected.map(chosen => (cosine(candidate.text, chosen.text) + 1) / 2)) : 0;
        candidate.mmr = candidate.score - (.16 * duplicate);
      });
      scored.sort((a, b) => b.mmr - a.mmr);
      selected.push(scored.shift());
    }
    return { candidates: selected, profile };
  };
  // A 4x4 RGB grid is a small image embedding: it captures palette and visual
  // layout well enough for similarity ranking while staying fast and private.
  const captureVisual = (img, candidate) => {
    try {
      const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(img, 0, 0, 4, 4);
      const pixels = context.getImageData(0, 0, 4, 4).data; const values = [];
      for (let i = 0; i < pixels.length; i += 4) values.push(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
      upsert(candidate, normalize(values));
    } catch (error) {
      // Cross-origin images commonly block canvas reads even though the image
      // itself renders correctly. Treat that as an expected visual-vector miss.
      if (error?.name !== 'SecurityError') console.warn('Could not index outfit image:', error.message);
    }
  };
  const clearUser = (user) => write(EVENT_KEY, events().filter(e => e.user !== user));
  const stats = (user) => ({ indexed: Object.keys(vectorDb()).length, signals: events().filter(e => e.user === user).length, ...userProfile(user) });
  try { if (!sessionStorage.getItem('malem.outfitSession')) sessionStorage.setItem('malem.outfitSession', `s${Date.now().toString(36)}`); } catch {}
  return { idFor, textVector, rank, record, isSaved, captureVisual, clearUser, stats };
})();

// ---------- engine ----------
const engine = (() => {
  const vibeThemes = {
    'live-like-local':    ['Neighborhood morning', 'Everyday markets', 'Evening as locals do'],
    'iconic-first-visit': ['The essential first day', 'The other icons', 'One deep dive'],
    'relaxed-scenic':     ['Slow morning', 'Views and long lunches', 'A gentle evening'],
    'hidden-gems':        ['Off the tourist path', 'Craft and small makers', 'Neighborhood after dark'],
    'family-adventure':   ['Kid-paced discovery', 'Playful outdoors', 'Family-friendly evening'],
    'halal-food-culture': ['Halal breakfast and mosque tour', 'Bazaar and cultural site', 'Halal dinner and tea'],
    'luxury-without-rush':['Unhurried morning', 'Curated afternoon', 'Refined evening'],
  };
  const blockPools = {
    'live-like-local': [
      { time: '09:00', title: 'Coffee at a corner café',      duration: '45 min', kind: 'meal' },
      { time: '10:00', title: 'Walk a local neighborhood',    duration: '90 min', kind: 'activity' },
      { time: '12:30', title: 'Home-style lunch',             duration: '75 min', kind: 'meal' },
      { time: '15:00', title: 'Independent shop crawl',       duration: '90 min', kind: 'shopping' },
      { time: '19:00', title: 'Dinner where locals eat',      duration: '2 hr',   kind: 'meal' },
    ],
    'iconic-first-visit': [
      { time: '08:30', title: 'The signature landmark (early)', duration: '2 hr', kind: 'sight' },
      { time: '11:30', title: 'Historic quarter walk',         duration: '90 min', kind: 'activity' },
      { time: '13:30', title: 'Well-known lunch spot',         duration: '75 min', kind: 'meal' },
      { time: '15:30', title: 'Second essential sight',        duration: '2 hr',   kind: 'sight' },
      { time: '19:30', title: 'Classic dinner',                duration: '2 hr',   kind: 'meal' },
    ],
    'relaxed-scenic': [
      { time: '10:00', title: 'Late breakfast with a view',    duration: '90 min', kind: 'meal' },
      { time: '12:00', title: 'Waterfront stroll',             duration: '90 min', kind: 'activity' },
      { time: '14:00', title: 'Long, unhurried lunch',         duration: '2 hr',   kind: 'meal' },
      { time: '17:00', title: 'Sunset viewpoint',              duration: '75 min', kind: 'sight' },
      { time: '20:00', title: 'Quiet dinner',                  duration: '90 min', kind: 'meal' },
    ],
    'hidden-gems': [
      { time: '09:30', title: 'Local baker most tourists miss', duration: '45 min', kind: 'meal' },
      { time: '10:30', title: 'Under-the-radar museum',         duration: '90 min', kind: 'sight' },
      { time: '13:00', title: 'Neighborhood lunch counter',     duration: '60 min', kind: 'meal' },
      { time: '15:30', title: 'Independent gallery',            duration: '90 min', kind: 'activity' },
      { time: '19:30', title: 'Locals-only dinner spot',        duration: '2 hr',   kind: 'meal' },
    ],
    'family-adventure': [
      { time: '09:00', title: 'Easy breakfast, kids welcome',   duration: '60 min', kind: 'meal' },
      { time: '10:30', title: 'Interactive attraction',         duration: '2 hr',   kind: 'activity' },
      { time: '12:30', title: 'Family-friendly lunch',          duration: '75 min', kind: 'meal' },
      { time: '14:00', title: 'Nap / rest window',              duration: '90 min', kind: 'rest' },
      { time: '16:30', title: 'Park or outdoor play',           duration: '90 min', kind: 'activity' },
      { time: '18:30', title: 'Early dinner',                   duration: '75 min', kind: 'meal' },
    ],
    'halal-food-culture': [
      { time: '08:30', title: 'Halal breakfast at a bakery',    duration: '60 min', kind: 'meal' },
      { time: '10:00', title: 'Guided mosque and quarter tour', duration: '2 hr',   kind: 'sight' },
      { time: '13:00', title: 'Verified halal lunch',           duration: '75 min', kind: 'meal' },
      { time: '15:00', title: 'Bazaar / cultural site',         duration: '2 hr',   kind: 'activity' },
      { time: '19:30', title: 'Halal dinner and tea',           duration: '2 hr',   kind: 'meal' },
    ],
    'luxury-without-rush': [
      { time: '10:00', title: 'Unhurried breakfast',            duration: '90 min', kind: 'meal' },
      { time: '12:00', title: 'Private curated visit',          duration: '2 hr',   kind: 'sight' },
      { time: '14:30', title: 'Tasting-menu lunch',             duration: '2 hr',   kind: 'meal' },
      { time: '17:30', title: 'Spa or lounge',                  duration: '90 min', kind: 'rest' },
      { time: '20:30', title: 'Refined dinner',                 duration: '2.5 hr', kind: 'meal' },
    ],
  };

  const respectedFromProfile = (p) => {
    const out = [];
    if (p.dietary.halal)      out.push('halal-only food stops');
    if (p.dietary.kosher)     out.push('kosher-only food stops');
    if (p.dietary.vegan)      out.push('vegan-friendly stops');
    if (p.dietary.vegetarian) out.push('vegetarian-friendly stops');
    if (p.dietary.glutenFree) out.push('gluten-free options');
    if ((p.dietary.allergies || []).length) out.push(`avoiding: ${p.dietary.allergies.join(', ')}`);
    if (p.dietary.other)      out.push(`diet note: ${p.dietary.other}`);
    if (p.accessibility.stepFree)      out.push('step-free routes');
    if (p.accessibility.lowVision)     out.push('low-vision considerations');
    if (p.accessibility.lowHearing)    out.push('low-hearing considerations');
    if (p.accessibility.seatingBreaks) out.push('frequent seating breaks');
    if (p.religiousCultural)  out.push('religious/cultural notes respected');
    if (p.modesty !== 'no-preference') out.push(`${p.modesty} clothing`);
    if (p.medical.reminderCadence !== 'none') out.push(`medication reminders (${p.medical.reminderCadence})`);
    if (p.family.babyOnBoard)          out.push('baby-friendly stops');
    if ((p.family.childrenAges || []).length) out.push(`kids: ages ${p.family.childrenAges.join(', ')}`);
    if ((p.avoid || []).length)        out.push(`avoiding: ${p.avoid.join(', ')}`);
    return out;
  };

  const applyProfile = (block, p) => {
    const respects = [];
    let title = block.title;
    if (block.kind === 'meal') {
      if (p.dietary.halal) {
        if (!/halal/i.test(title)) title = title.replace(/dinner|lunch|breakfast/i, m => `Halal ${m.toLowerCase()}`);
        respects.push('halal');
      }
      else if (p.dietary.kosher) {
        if (!/kosher/i.test(title)) title = title.replace(/dinner|lunch|breakfast/i, m => `Kosher ${m.toLowerCase()}`);
        respects.push('kosher');
      }
      else if (p.dietary.vegan) respects.push('vegan-friendly');
      else if (p.dietary.vegetarian) respects.push('vegetarian-friendly');
      if (p.dietary.glutenFree) respects.push('gluten-free');
      if ((p.dietary.allergies || []).length) respects.push('allergy-safe');
    }
    if (p.accessibility.stepFree) respects.push('step-free');
    if (p.accessibility.seatingBreaks && (block.kind === 'sight' || block.kind === 'activity')) respects.push('seating breaks');
    if (p.family.babyOnBoard && block.kind === 'rest') respects.push('baby nap window');
    if ((p.family.childrenAges || []).some(a => a <= 5) && block.kind === 'meal') respects.push('kid menu');
    if (p.medical.reminderCadence !== 'none' && block.kind === 'rest') respects.push('medication reminder');
    if ((p.modesty === 'conservative' || p.modesty === 'modest') && /night|club|nightlife/i.test(block.title))
      respects.push('modesty: skip suggested');
    return { ...block, title, respects: respects.length ? respects : undefined };
  };

  const paceFilter = (blocks, pace) => {
    if (pace === 'slow')   return blocks.filter((_, i) => i % 2 === 0).slice(0, 3);
    if (pace === 'packed') return blocks;
    return blocks.filter((_, i) => i !== 3);
  };

  const buildItinerary = (req, profile) => {
    const respected = respectedFromProfile(profile);
    const days = [];
    for (let d = 0; d < req.days; d++) {
      const themes = vibeThemes[req.primaryVibe] || [`Day ${d + 1}`];
      const theme = themes[d % themes.length];
      const pool = blockPools[req.primaryVibe] || [];
      const shaped = paceFilter(pool, profile.pace).map(b => applyProfile(b, profile));
      const isoDate = req.arrivalDate
        ? new Date(new Date(req.arrivalDate).getTime() + d * 86400000).toISOString().slice(0, 10)
        : undefined;
      days.push({ date: isoDate, theme, blocks: shaped });
    }
    return { request: req, respectedFromProfile: respected, days };
  };

  // ----- Packing -----
  const buildPacking = (req, profile) => {
    const A = new Set(req.activities || []);
    const cold = req.season === 'winter' || A.has('cold-weather');
    const warm = req.season === 'summer' || A.has('beach') || A.has('tropical');
    const home = [], buyBefore = [], buyRentThere = [], personalBag = [], doNotPack = [], beforeDeparture = [];

    const outfits = req.laundry ? Math.min(4, Math.max(2, Math.ceil(req.days / 3))) : Math.min(7, req.days);
    home.push({ item: `${outfits} outfits`, why: req.laundry ? 'laundry available; cycled' : 'no laundry; one per day' });

    if (cold) home.push({ item: 'Insulated jacket, hat, gloves', why: 'cold forecast' });
    if (warm) home.push({ item: 'Sun hat and SPF 50', why: 'sunny or hot' });
    if (req.destination) home.push({ item: 'Plug adapter', why: DATA.destinations.find(d => d.key === req.destination)?.plug || 'local plug' });

    if (A.has('walking-city'))    home.push({ item: 'Broken-in walking shoes', why: 'city walking' });
    if (A.has('hiking'))          home.push({ item: 'Hiking shoes and moisture-wicking layers', why: 'hiking' });
    if (A.has('beach'))           home.push({ item: 'Swimwear', why: 'beach or swim' });
    if (A.has('fine-dining'))     home.push({ item: 'One smart outfit', why: 'fine dining' });
    if (A.has('religious-sites') || profile.modesty !== 'no-preference') {
      home.push({ item: 'Silk scarf or shoulder cover', why: 'religious sites / modesty' });
      home.push({ item: 'Long trousers or long skirt', why: 'religious sites / modesty' });
    }
    if (A.has('museums'))         home.push({ item: 'Small day bag', why: 'museums' });

    if (profile.dietary.halal || profile.dietary.kosher) personalBag.push({ item: 'Snack bars (verified halal or kosher)', why: 'safe backup between meals' });
    if ((profile.dietary.allergies || []).length) {
      personalBag.push({ item: 'Allergy card in local language', why: `for ${profile.dietary.allergies.join(', ')}` });
      personalBag.push({ item: 'EpiPen or equivalent (check regulations)', why: 'allergy safety' });
    }
    if (profile.medical.medications) personalBag.push({ item: `${profile.medical.medications} — in original packaging + prescription copies`, why: 'customs and pharmacy access' });
    if (profile.medical.devices)     personalBag.push({ item: `${profile.medical.devices} (with backup supplies)`, why: 'medical equipment' });
    if (profile.family.babyOnBoard) {
      home.push({ item: 'Compact stroller or carrier', why: 'baby on trip' });
      personalBag.push({ item: 'Diaper kit and change of baby clothes', why: 'baby personal bag' });
    }
    if ((profile.family.childrenAges || []).some(a => a <= 8)) personalBag.push({ item: 'Two comfort items (kids)', why: 'flight or transit resilience' });
    if (profile.accessibility.stepFree)  personalBag.push({ item: 'Foldable seat cane or mobility aid', why: 'step-free trip' });
    if (profile.accessibility.lowVision) personalBag.push({ item: 'Backup reading glasses', why: 'low-vision support' });

    if (cold) buyBefore.push({ item: 'Merino base layer', why: "if you don't already own one" });
    if (A.has('tropical')) buyBefore.push({ item: 'DEET or picaridin repellent', why: 'humid climate' });
    buyBefore.push({ item: 'eSIM or local SIM plan', why: 'data on arrival' });

    if (req.rentThere) {
      buyRentThere.push({ item: 'Umbrella or beach chair', why: 'rents cheaper than luggage space' });
      if (warm) buyRentThere.push({ item: 'Local sandals', why: 'better sized on-site' });
      if (A.has('hiking')) buyRentThere.push({ item: 'Trekking poles', why: 'rent locally' });
    }

    if (['nyc','paris','kyoto'].includes(req.destination)) doNotPack.push({ item: 'Large sharp knives', why: 'restricted at some sites' });
    if (['marrakech','istanbul'].includes(req.destination)) doNotPack.push({ item: 'Uncleared drone', why: 'permits required' });
    doNotPack.push({ item: 'Full-size aerosols', why: 'flight rules' });

    beforeDeparture.push({ item: 'Passport valid 6+ months', why: 'entry requirement' });
    beforeDeparture.push({ item: 'Travel insurance confirmation', why: 'save PDF offline' });
    if (profile.medical.medications) beforeDeparture.push({ item: 'Doctor letter for medications', why: 'customs peace of mind' });
    if (profile.family.babyOnBoard)  beforeDeparture.push({ item: 'Baby travel documents', why: 'some borders require' });
    beforeDeparture.push({ item: 'Notify bank of travel', why: 'card holds' });

    const reminders = [
      { when: 'Two weeks before', text: 'Book accessible transfers if needed. Check passport validity. Refill prescriptions with buffer.' },
      { when: 'Three days before', text: 'Print insurance PDF. Set up eSIM. Charge devices. Confirm reservations.' },
      { when: 'Night before',     text: 'Pack medications and documents in personal bag. Set out clothes for departure.' },
      { when: 'Departure day',    text: 'Water bottle empty for security. Snacks and meds in personal bag. Photo of luggage tags.' },
    ];

    return {
      lists: [
        { title: 'Pack from home',           items: home,             tone: 'good' },
        { title: 'Buy before leaving',       items: buyBefore,        tone: '' },
        { title: 'Buy or rent there',        items: buyRentThere,     tone: '' },
        { title: 'Carry in your personal bag', items: personalBag,    tone: 'good' },
        { title: 'Do not pack',              items: doNotPack,        tone: 'warn' },
        { title: 'Before departure',         items: beforeDeparture,  tone: '' },
      ],
      reminders,
    };
  };

  // ----- Discover Now -----
  const buildDiscover = (ctx, profile) => {
    const hours = Number(ctx.hours) || 3;
    const wet  = ctx.weather === 'light-rain' || ctx.weather === 'heavy-rain';
    const hot  = ctx.weather === 'hot';
    const cold = ctx.weather === 'cold';
    const family = ctx.party === 'family';
    const lowE = ctx.energy === 'low';

    const covered = (t) => t + (wet ? ' (covered)' : '');
    const dietTag = () => profile.dietary.halal ? 'halal-only' : profile.dietary.kosher ? 'kosher-only' : profile.dietary.vegan ? 'vegan-friendly' : profile.dietary.vegetarian ? 'veg-friendly' : 'no dietary limits set';

    const plans = [
      { title: 'Relaxed', badge: lowE ? 'Low energy' : 'Easy pace',
        why: `${ctx.hours}h and ${ctx.weather}${lowE ? ', low energy' : ''}. Covered, seated, quiet.`,
        steps: [ covered('A café with a view'), 'Slow walk under cover', 'Bookshop or small gallery', family ? 'Playful stop' : 'Sit-down tea' ] },
      { title: 'Food-focused', badge: dietTag(),
        why: `Stalls and cafés respecting your dietary profile (${dietTag()}).`,
        steps: [ 'Bakery start', wet ? 'Covered market walk' : hot ? 'Iced treat and short walk' : 'Local market walk', 'Lunch — profile-respecting', 'Sweet stop for the road' ] },
      { title: 'Cultural', badge: profile.accessibility.stepFree ? 'Step-free preferred' : 'Moderate',
        why: 'A cultural loop calibrated to your energy and any step-free needs.',
        steps: [ wet ? 'Museum or covered courtyard' : 'Historic quarter walk', cold ? 'Warm-up stop' : hot ? 'Shaded courtyard' : 'A small independent site', 'Sunset viewpoint', 'Bite before heading back' ] },
    ];
    return plans.map(p => ({ ...p, steps: p.steps.slice(0, Math.max(2, Math.min(p.steps.length, hours + 1))) }));
  };

  // ----- Local -----
  const buildLocal = (ctx) => {
    const list = DATA.places[ctx.destination] || [
      { name: 'Independent neighborhood café', sub: 'Use the map near your accommodation and choose a busy, well-reviewed independent café.', mix: 'neighborhood', cat: 'food', traffic: 'med' },
      { name: 'Local market or food hall', sub: 'Ask your host which market residents use, then verify today’s opening hours before leaving.', mix: 'hidden', cat: 'food', traffic: 'med' },
      { name: 'Small cultural space', sub: 'Look for an independent gallery, workshop, or community museum with current opening information.', mix: 'small-business', cat: 'culture', traffic: 'low' },
      { name: 'Neighborhood green space', sub: 'Choose a nearby park, waterfront, or public garden with a route that fits your mobility needs.', mix: 'neighborhood', cat: 'outdoors', traffic: 'low' },
      { name: 'Locally recommended shop', sub: 'Prioritize a locally owned shop with recent reviews instead of a generic souvenir stop.', mix: 'small-business', cat: 'shopping', traffic: 'med' },
    ];
    const mix = new Set(ctx.mix || []);
    const cat = ctx.category || 'all';
    return list.filter(p => (mix.size ? mix.has(p.mix) : true) && (cat === 'all' || p.cat === cat)).map(p => ({
      ...p,
      gemScore: p.mix === 'hidden' ? 'Hidden — strong local sentiment.'
              : p.mix === 'small-business' ? 'Small business — repeat visitors verify.'
              : p.mix === 'neighborhood'   ? 'Neighborhood favourite.'
              : p.mix === 'famous'         ? 'Icon — go early or off-hours.'
              : p.mix === 'seasonal'       ? 'Seasonal — check the window.' : '',
      trafficNote: p.traffic === 'high' ? 'High traffic — consider off-hours.'
                 : p.traffic === 'low'  ? 'Low traffic — respect the quiet.' : 'Steady traffic.',
    }));
  };

  // ----- What to expect -----
  const CATEGORY_LABELS = {
    etiquette:'Etiquette', clothing:'Clothing', tipping:'Tipping', prayer:'Prayer facilities',
    driving:'Driving', transit:'Public transit', scams:'Common scams', safety:'Safety',
    accessibility:'Accessibility', phrases:'Useful phrases', hours:'Hours & pacing', photos:'Photography',
    difference:'What may feel different',
  };
  const CATEGORY_CONFIDENCE = {
    etiquette:'high', clothing:'high', tipping:'high', prayer:'high',
    driving:'med', transit:'high', scams:'med', safety:'med',
    accessibility:'med', phrases:'high', hours:'high', photos:'high', difference:'high',
  };
  const buildExpect = (destinationKey) => {
    const e = DATA.expectations[destinationKey];
    if (!e) {
      const destination = String(destinationKey || 'your destination')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
      const fallback = {
        etiquette: `Observe local cues in ${destination}; greetings, personal space, and queueing customs can vary by neighborhood and setting.`,
        clothing: 'Pack adaptable layers and verify dress rules before religious, ceremonial, or formal sites.',
        tipping: 'Check the bill for service charges and confirm current tipping norms with your accommodation or a recent official visitor source.',
        transit: 'Download an offline map, confirm the last return service, and use official transport or licensed ride providers.',
        safety: 'Keep valuables controlled, use well-lit routes after dark, and check current official travel advisories before departure.',
        accessibility: 'Accessibility varies by venue. Contact important stops directly and keep a backup route or seated break nearby.',
        phrases: 'Save greetings, thanks, please, and an allergy or accessibility request in the local language before arrival.',
        hours: 'Verify same-day opening hours and reservation requirements; holidays and seasonal schedules can change quickly.',
        photos: 'Ask before photographing people, ceremonies, security areas, or private interiors.',
        difference: 'Treat this as preparation, not a rulebook: follow current local guidance and adjust respectfully in context.',
      };
      return Object.entries(fallback).map(([key, text]) => ({
        key,
        label: CATEGORY_LABELS[key],
        text,
        confidence: 'general',
        updated: new Date().toISOString().slice(0, 10),
        source: 'General fallback — verify locally',
      }));
    }
    return Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
      key, label, text: e[key] || '', confidence: CATEGORY_CONFIDENCE[key],
      updated: DATA.meta.updated, source: DATA.meta.sources[0],
    }));
  };

  // ----- Outfits (image URLs use keyword-based Unsplash Source, changes per trip) -----
  const seasonInfo = (season) => ({
    spring:{ warmth:'cool', words:['spring','trench','light'],   outer:'trench coat' },
    summer:{ warmth:'warm', words:['linen','summer','airy'],     outer:'linen shirt' },
    autumn:{ warmth:'cool', words:['wool','autumn','layered'],   outer:'wool coat' },
    winter:{ warmth:'cold', words:['cashmere','winter','coat'],  outer:'wool overcoat' },
  }[season] || { warmth:'mild', words:['neutral'], outer:'light jacket' });

  const vibeStyleKeywords = (vibe) => ({
    'live-like-local':    ['neutral','minimal','effortless'],
    'iconic-first-visit': ['classic','tailored','clean'],
    'relaxed-scenic':     ['flowy','breezy','soft'],
    'hidden-gems':        ['understated','vintage','textured'],
    'family-adventure':   ['practical','durable','stretch'],
    'halal-food-culture': ['modest','elegant','draped'],
    'luxury-without-rush':['luxury','silk','refined'],
  }[vibe] || ['minimal','editorial']);

  // Curated, stable Unsplash fashion photos. Unlike random image endpoints, these
  // resolve quickly and consistently through the same-origin Cloudflare proxy.
  const STOCK_FASHION_PHOTOS = [
    'photo-1529139574466-a303027c1d8b', 'photo-1490481651871-ab68de25d43d',
    'photo-1483985988355-763728e1935b', 'photo-1521572163474-6864f9cf17ab',
    'photo-1445205170230-053b83016050', 'photo-1539109136881-3be0616acf4b',
    'photo-1542291026-7eec264c27ff', 'photo-1548036328-c9fa89d128fa',
    'photo-1595777457583-95e059d581b8', 'photo-1551488831-00ddcb6c6bd3',
    'photo-1515886657613-9f3515b0c78f', 'photo-1469334031218-e382a71b716b',
    'photo-1509631179647-0177331693ae', 'photo-1525507119028-ed4c629a60a3',
  ];
  const stockURL = (_keywords, w = 480, h = 600, lock = 1) => {
    const photo = STOCK_FASHION_PHOTOS[Math.abs(Number(lock) || 1) % STOCK_FASHION_PHOTOS.length];
    return `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=${w}&h=${h}&q=82`;
  };

  const buildOutfits = (itinerary, profile, season, destinationKey, trip) => {
    const s = seasonInfo(season);
    const modest = profile.modesty !== 'no-preference';
    const family = (profile.family.childrenAges || []).length || profile.family.babyOnBoard;
    const styleWords = vibeStyleKeywords(trip.primaryVibe);
    const palette = (trip?.bundle?.destinationMeta?.palette?.length ? trip.bundle.destinationMeta.palette
      : DATA.destinations.find(d => d.key === destinationKey)?.palette) || ['#E4D9BC','#8E6E4C','#1F1C15','#D5C7A6','#5C4232'];
    const destName = (trip?.bundle?.destinationMeta?.name || DATA.destinations.find(d => d.key === destinationKey)?.name || '').toLowerCase();

    const pick = (arr, i) => arr[i % arr.length];

    // Per-item keyword mix for image search
    const partKeywords = (partName, look) => {
      const wardrobe = {
        top:      ['blouse','shirt','sweater','knitwear'],
        bottom:   ['trouser','skirt','pants'],
        outer:    ['coat','jacket','trench'],
        shoes:    ['shoes','loafer','sandal','boot'],
        accessory:['scarf','hat','bag','earring'],
      };
      const p = partName.toLowerCase();
      return [
        ...wardrobe[p] || ['fashion'],
        ...s.words.slice(0, 1),
        modest && p !== 'shoes' ? 'modest' : '',
        ...styleWords.slice(0, 1),
        'editorial','fashion',
      ].filter(Boolean);
    };
    const heroKeywords = (look) => [
      'outfit', ...styleWords.slice(0, 2), ...s.words.slice(0, 1),
      modest ? 'modest' : '',
      look.name.toLowerCase().includes('evening') ? 'evening' : 'street',
      'editorial','fashion','neutral',
    ].filter(Boolean);

    const colors = ['ivory', 'indigo', 'sage', 'terracotta', 'charcoal', 'sand', 'deep navy'];
    const warmTops = modest
      ? ['long-sleeve linen tunic', 'relaxed poplin shirt', 'lightweight draped blouse', 'oversized cotton button-down']
      : ['linen camp shirt', 'ribbed cotton top', 'breathable knit polo', 'crisp poplin blouse', 'relaxed linen tee'];
    const coldTops = modest
      ? ['fine merino turtleneck', 'long cashmere cardigan', 'brushed wool overshirt', 'ribbed mock-neck sweater']
      : ['cashmere crewneck', 'merino polo knit', 'textured wool sweater', 'fitted mock-neck knit'];
    const dayBottoms = modest
      ? ['wide-leg linen trousers', 'fluid ankle-length skirt', 'pleated full-length trousers', 'structured midi skirt']
      : ['pleated trousers', 'relaxed straight-leg denim', 'linen midi skirt', 'cropped tailored trousers', 'utility trousers'];
    const dayOuters = s.warmth === 'cold'
      ? ['belted wool coat', 'quilted liner jacket', 'long tailored overcoat', 'water-resistant trench']
      : ['cropped linen jacket', 'light cotton overshirt', 'unstructured blazer', 'packable rain shell'];
    const dayShoes = ['retro walking sneakers', 'soft leather loafers', 'supportive ballet flats', 'low-profile trainers', 'cushioned walking sandals'];
    const dayAccessories = ['woven crossbody bag', 'silk neck scarf', 'structured canvas tote', 'wide-brim sun hat', 'compact shoulder bag'];
    const eveningTops = modest
      ? ['draped long-sleeve satin blouse', 'high-neck silk shell with light wrap', 'fluid crepe tunic']
      : ['draped silk blouse', 'satin camisole with blazer', 'fine-gauge evening knit', 'sculpted crepe top'];
    const eveningBottoms = modest
      ? ['full-length satin trousers', 'flowing pleated maxi skirt', 'tailored wide-leg trousers']
      : ['tailored evening trousers', 'bias-cut midi skirt', 'dark straight-leg trousers', 'silk midi skirt'];

    const looks = [];
    itinerary.days.forEach((day, dayIndex) => {
      const walking = day.blocks.some(b => b.kind === 'activity' || b.kind === 'sight');
      const religious = day.blocks.some(b => /mosque|shrine|temple|religious/i.test(b.title)) || /halal/i.test(day.theme);
      const fine = day.blocks.some(b => /tasting|refined|classic dinner/i.test(b.title));
      const evening = day.blocks.some(b => Number(b.time.split(':')[0]) >= 18);
      const color = pick(colors, dayIndex);
      const top = `${color} ${pick(s.warmth === 'cold' ? coldTops : warmTops, dayIndex)}`;
      const bottom = pick(dayBottoms, dayIndex + 1);
      const outer = pick(dayOuters, dayIndex + 2);
      const shoes = profile.accessibility.stepFree ? `cushioned ${pick(dayShoes, dayIndex)}` : pick(dayShoes, dayIndex);
      const accessory = religious ? 'lightweight coverage scarf' : pick(dayAccessories, dayIndex + 3);

      looks.push({
        dayIndex: dayIndex + 1, date: day.date, theme: day.theme,
        name: religious ? 'Modest day look' : 'Day look',
        why: [ walking ? 'Walking day' : 'Easier day',
               religious ? 'Covered for religious stops' : '',
               modest ? 'Modest cut' : '',
               family ? 'Kid-friendly' : '',
               profile.accessibility.stepFree ? 'Step-free footwear' : '',
               s.warmth === 'cold' ? 'Layered for cold' : s.warmth === 'warm' ? 'Breathable' : '' ].filter(Boolean).join(' · '),
        items: [
          { part: 'Top',       value: top },
          { part: 'Bottom',    value: bottom },
          { part: 'Outer',     value: outer },
          { part: 'Shoes',     value: walking ? shoes : pick(dayShoes, dayIndex + 2) },
          { part: 'Accessory', value: accessory },
        ],
      });

      if (evening) {
        looks.push({
          dayIndex: dayIndex + 1, date: day.date, theme: day.theme,
          name: fine ? 'Refined evening' : (religious ? 'Modest evening' : 'Evening look'),
          why: [ fine ? 'Fine dinner' : 'City evening',
                 modest ? 'Modest cut kept' : '',
                 profile.accessibility.stepFree ? 'Step-free footwear' : '' ].filter(Boolean).join(' · '),
          items: [
            { part: 'Top',       value: `${pick(colors, dayIndex + 3)} ${pick(eveningTops, dayIndex)}` },
            { part: 'Bottom',    value: pick(eveningBottoms, dayIndex + 1) },
            { part: 'Outer',     value: s.warmth === 'cold' ? pick(dayOuters, dayIndex + 1) : pick(['silk-blend blazer', 'cropped evening jacket', 'lightweight tailored wrap'], dayIndex) },
            { part: 'Shoes',     value: profile.accessibility.stepFree ? pick(['elegant flat', 'low block heel', 'polished loafer'], dayIndex) : (fine ? pick(['polished heel', 'sleek brogue', 'dress loafer'], dayIndex) : pick(['Chelsea boot', 'minimal slingback', 'polished loafer'], dayIndex)) },
            { part: 'Accessory', value: pick(['statement pendant', 'sculptural earrings', 'small evening bag', 'slim watch'], dayIndex + 1) },
          ],
        });
      }
    });

    const pins = [];
    looks.forEach((look, looki) => {
      pins.push({
        kind: 'look', dayIndex: look.dayIndex, date: look.date, theme: look.theme,
        look: look.name, why: look.why, items: look.items,
        img: stockURL(['fashion', 'outfit'], 520, 640, looki + 1),
        toneA: palette[looki % palette.length],
        toneB: palette[(looki + 3) % palette.length],
        ar: pick(['3/4', '4/5', '2/3'], looki),
      });
      // Two key-piece pins per look
      ['Top', 'Shoes'].forEach((partName, ki) => {
        const item = look.items.find(x => x.part === partName);
        if (!item) return;
        pins.push({
          kind: 'piece', dayIndex: look.dayIndex, date: look.date, theme: look.theme,
          look: look.name, part: item.part, value: item.value,
          img: stockURL(['fashion', partName.toLowerCase()], 420, 500, (looki * 3) + ki + 2),
          toneA: palette[(looki + ki + 1) % palette.length],
          toneB: palette[(looki + ki + 4) % palette.length],
          ar: pick(['4/5', '1/1', '3/4'], looki + ki),
        });
      });
    });

    return { looks, pins };
  };

  // ----- Group blend -----
  const blendGroupVibes = (members) => {
    const votes = {};
    members.forEach(m => { if (m.vibe) votes[m.vibe] = (votes[m.vibe] || 0) + 1; });
    const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return { winner: null, blend: null, votes };
    const [winner, wCount] = sorted[0]; const r = sorted[1];
    return { winner, blend: r && r[1] >= wCount / 2 ? r[0] : null, votes };
  };
  const consolidateConstraints = (members) => {
    const set = new Set();
    members.forEach(m => (m.constraints || []).forEach(c => set.add(c)));
    return Array.from(set);
  };

  return { buildItinerary, buildPacking, buildDiscover, buildLocal, buildExpect, buildOutfits, stockURL, blendGroupVibes, consolidateConstraints };
})();

// ---------- auth ----------
const auth = (() => {
  let user = null;
  let syncTimer = null;
  let syncChain = Promise.resolve();
  let stateDirty = false;

  const request = async (path, options = {}) => {
    let response;
    try {
      response = await fetch(`/api/${path}`, {
        credentials: 'same-origin',
        ...options,
        headers: {
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new Error('The account service is unavailable. Check your connection and try again.');
    }
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(body.error || 'The account service could not complete the request.');
      error.status = response.status;
      throw error;
    }
    return body;
  };

  const hydrate = async ({ preferLocal = false } = {}) => {
    if (!user) return;
    const localExists = store.cloud.hasLocalState(user.email);
    const serverState = await request('state');
    const serverHasContent = Boolean(
      serverState?.profile
      || serverState?.trips?.length
      || serverState?.group?.length
      || serverState?.journal?.length
    );
    if (preferLocal && localExists && !serverHasContent) {
      await request('state', { method: 'PUT', body: JSON.stringify(store.cloud.snapshot(user.email)) });
      return;
    }
    store.cloud.hydrate(user.email, serverState);
  };
  const hydrateSafely = async (options) => {
    try {
      await hydrate(options);
    } catch (error) {
      window.dispatchEvent(new CustomEvent('malem:sync-error', { detail: error.message }));
    }
  };

  const syncNow = () => {
    if (!user || !stateDirty) return syncChain;
    stateDirty = false;
    const email = user.email;
    const snapshot = store.cloud.snapshot(email);
    syncChain = syncChain
      .catch(() => {})
      .then(() => request('state', {
        method: 'PUT',
        body: JSON.stringify(snapshot),
        keepalive: true,
      }))
      .catch((error) => {
        stateDirty = true;
        window.dispatchEvent(new CustomEvent('malem:sync-error', { detail: error.message }));
        throw error;
      });
    return syncChain;
  };

  const scheduleSync = () => {
    if (!user) return;
    stateDirty = true;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncNow().catch(() => {}); }, 400);
  };
  store.cloud.setSyncHandler(scheduleSync);

  const init = async () => {
    try {
      user = await request('me');
    } catch (error) {
      if (error.status === 401) {
        user = null;
        store.cloud.disconnect();
        return null;
      }
      throw error;
    }
    store.cloud.connect(user.email);
    await hydrateSafely({ preferLocal: true });
    return user;
  };

  const signup = async (name, email, password) => {
    user = await request('signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    store.cloud.connect(user.email);
    await hydrateSafely({ preferLocal: true });
    return user;
  };

  const signin = async (email, password) => {
    user = await request('login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    store.cloud.connect(user.email);
    await hydrateSafely();
    return user;
  };

  const signout = async () => {
    clearTimeout(syncTimer);
    await syncNow().catch(() => {});
    await request('logout', { method: 'POST' });
    user = null;
    stateDirty = false;
    store.cloud.disconnect();
  };

  const deleteAccount = async () => {
    if (!user) throw new Error('You are not signed in.');
    clearTimeout(syncTimer);
    stateDirty = false;
    const email = user.email;
    await request('account', { method: 'DELETE' });
    store.cloud.clear(email);
    user = null;
    store.cloud.disconnect();
  };

  const current = () => user;
  const flush = () => {
    clearTimeout(syncTimer);
    return syncNow().catch(() => {});
  };

  return { init, signup, signin, signout, deleteAccount, current, flush, request };
})();

// ---------- ui ----------
const ui = (() => {
  // Accumulates clarification turns (for example "five days" followed by
  // "Barcelona") so both AI and the local parser receive the full request.
  let pendingTripText = '';
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const safeExternalUrl = (value) => {
    try {
      const u = new URL(String(value || ''));
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.toString() : '';
    } catch { return ''; }
  };
  const proxiedImage = (value) => value ? `/api/image?url=${encodeURIComponent(value)}` : '';
  const flash = (sel, msg) => { const el = $(sel); if (!el) return; el.textContent = msg; clearTimeout(el._t); el._t = setTimeout(() => (el.textContent = ''), 4500); };
  const parseList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const parseIntList = (s) => parseList(s).map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);

  const showScreen = (name) => {
    ['auth','app','public'].forEach(s => { $('#screen-' + s).hidden = s !== name; });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const applyTheme = () => {
    const t = store.theme.get();
    if (t) document.documentElement.setAttribute('data-theme', t);
    else   document.documentElement.removeAttribute('data-theme');
  };
  const toggleTheme = () => {
    const cur = store.theme.get() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    store.theme.set(cur === 'dark' ? 'light' : 'dark'); applyTheme();
  };

  // ---- Auth ----
  let authMode = 'signin';
  const initAuth = () => {
    const form = $('#auth-form');
    const setMode = (m) => {
      authMode = m; const isSignup = m === 'signup';
      $('#name-field').hidden = !isSignup; form.name.required = isSignup;
      $('#auth-title').textContent = isSignup ? 'Create your account.' : 'Welcome back.';
      $('#auth-lede').textContent  = isSignup
        ? 'Your account and trips will be available anywhere you sign in.'
        : "Sign in and tell malem where you're heading.";
      $('#auth-submit').textContent = isSignup ? 'Create account' : 'Sign in';
      $('#auth-tag').textContent = isSignup ? 'Sign up' : 'Sign in';
      $('#auth-switch').innerHTML = isSignup
        ? 'Already have an account? <a href="#" id="auth-toggle">Sign in</a>'
        : 'New here? <a href="#" id="auth-toggle">Create an account</a>';
      form.password.autocomplete = isSignup ? 'new-password' : 'current-password';
      $('#auth-toggle').addEventListener('click', (e) => { e.preventDefault(); setMode(isSignup ? 'signin' : 'signup'); });
    };
    $('#auth-toggle').addEventListener('click', (e) => { e.preventDefault(); setMode('signup'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = $('#auth-submit');
      submit.disabled = true;
      form.setAttribute('aria-busy', 'true');
      flash('#auth-note', authMode === 'signup' ? 'Creating your account…' : 'Signing you in…');
      try {
        if (authMode === 'signup') await auth.signup(form.name.value, form.email.value, form.password.value);
        else await auth.signin(form.email.value, form.password.value);
        form.reset();
        location.hash = '#/chat';
        route();
      } catch (err) { flash('#auth-note', err.message || 'Something went wrong.'); }
      finally {
        submit.disabled = false;
        form.removeAttribute('aria-busy');
      }
    });
  };

  // ---- Chat ----
  const chatSubmit = async () => {
    const ta = $('#chat-textarea');
    const text = ta.value.trim();
    if (!text) return;
    ta.value = ''; autosizeTextarea();
    $('#chat-suggestions').hidden = true;

    const me = auth.current();
    appendChatMessage('user', text);
    appendChatMessage('assistant', 'Reading your trip…', { pending: true });

    // Refresh once at submission so a newly started server becomes usable
    // immediately, rather than relying on the status check at page load.
    await ai.refreshOpenRouterStatus();
    updateChatHint();

    // 1) Parse the message into a trip request + profile preferences.
    const parseText = pendingTripText ? `${pendingTripText}\n${text}` : text;
    let result = null;
    let parseError = null;
    if (ai.enabled()) {
      try {
        const gpt = await ai.parseTripViaGPT(parseText);
        // The AI correctly leaves unstated fields null. Merge only its concrete
        // values over the conservative local parse so UI and downstream stages
        // always receive the product defaults instead of rendering "null".
        const localHints = parser.parseTrip(parseText);
        const concreteAITrip = Object.fromEntries(Object.entries(gpt.trip || {}).filter(([, value]) => value !== null && value !== undefined && value !== ''));
        const normalizedTrip = { ...(localHints.trip || {}), ...concreteAITrip };
        if (!normalizedTrip.days) normalizedTrip.days = 4;
        if (!normalizedTrip.travelers) normalizedTrip.travelers = 1;
        if (!normalizedTrip.season) normalizedTrip.season = 'summer';
        if (!normalizedTrip.primaryVibe) normalizedTrip.primaryVibe = 'iconic-first-visit';
        result = { trip: normalizedTrip, prefs: gpt.profile, reply: gpt.reply, missing: gpt.missing || [], inferred: localHints.inferred || [] };
      } catch (err) { parseError = err; console.error('AI parse failed, falling back to local parser', err); }
    }
    if (!result) {
      const local = parser.parseTrip(parseText);
      result = { trip: local.trip, prefs: local.prefs, missing: local.missing, inferred: local.inferred };
    }

    if (!result.trip || !result.trip.destination || (result.missing || []).includes('destination')) {
      pendingTripText = parseText;
      removePendingMessage();
      const providerNote = parseError
        ? ` I also couldn't reach your ${ai.provider() || 'AI'} connection (${String(parseError.message || parseError).slice(0, 120)}). You can update it in Settings.`
        : '';
      appendChatMessage('assistant',
        (result.reply || `Which destination are you thinking of? Tell me the place and roughly how many days, and I'll build the plan.`) + providerNote);
      return;
    }
    pendingTripText = '';

    // 2) Merge parsed preferences onto the saved profile (this is the AI's "memory").
    const existing = store.profile.load(me.email);
    const merged = parser.mergeProfile(existing, result.prefs);
    store.profile.save(me.email, merged);

    // 3) Generate the full, web-grounded, weather-aware, personalized plan.
    let wx = null, bundle = null, llmRun = null, genError = null;
    const destGuess = titleCase(result.trip.destination);
    setPendingMessage(`Checking live weather for ${destGuess}…`);
    try { wx = await weather.forecast(result.trip.destination, result.trip.days); }
    catch (e) { console.warn('weather lookup failed', e); }
    if (ai.enabled()) {
      setPendingMessage(`Researching ${destGuess} — real places, this week's live weather, and your profile. This can take up to a minute…`);
      try {
        const generated = await ai.generateTrip(result.trip, merged, wx);
        bundle = generated?.bundle || null;
        llmRun = generated?.llmRun || null;
      }
      catch (e) { console.error('trip generation failed', e); genError = e; }
    }

    removePendingMessage();
    let degraded = false;
    if (!bundle) {
      degraded = true;
      const fallbackPacking = {
        destination: result.trip.destination,
        days: result.trip.days,
        season: result.trip.season,
        laundry: true,
        rentThere: true,
        activities: ['walking-city'],
      };
      const staticMeta = DATA.destinations.find(d => d.key === result.trip.destination);
      bundle = {
        mode: 'degraded',
        destinationMeta: staticMeta || {
          key: result.trip.destination,
          name: destGuess,
          country: '',
          plug: 'Verify the local plug type',
          culturalNote: 'Live destination research is temporarily unavailable. Verify time-sensitive details before departure.',
          palette: ['#E4D9BC', '#8E6E4C', '#1F1C15', '#D5C7A6', '#5C4232'],
          paletteNote: 'A flexible neutral travel palette.',
        },
        itinerary: engine.buildItinerary(result.trip, merged),
        packing: engine.buildPacking(fallbackPacking, merged),
        local: engine.buildLocal({ destination: result.trip.destination, category: 'all', mix: [] }),
        expect: engine.buildExpect(result.trip.destination),
      };
    }

    // 4) Save either the live plan or an explicitly labelled local fallback.
    const staticDest = DATA.destinations.find(d => d.key === result.trip.destination);
    const vibe = DATA.VIBES.find(v => v.key === result.trip.primaryVibe);
    const destName = bundle?.destinationMeta?.name || staticDest?.name || destGuess;
    const summary = `${vibe ? vibe.title : 'Trip'} in ${destName}`;
    const trip = store.trips.add(me.email, { ...result.trip, originalInput: parseText, summary, weather: wx, bundle, llmRun });
    store.activeTrip.set(me.email, trip.id);

    // 5) Reply, tuned to what actually happened.
    let replyText;
    replyText = degraded
      ? `Done — I saved a practical ${destName} plan from Malem's on-device planner. Live research is unavailable right now, so verify named places, hours, entry rules, and transport before you go${genError ? ` (${String(genError.message || genError).slice(0, 100)})` : ''}.`
      : `Done — I built your ${destName} plan from real places and this week's forecast, shaped around your profile. Open it below.`;
    appendChatMessage('assistant', replyText);
    appendTripCard(trip);
    renderTripHistory(me);
  };

  const appendChatMessage = (role, text, opts = {}) => {
    const log = $('#chat-log');
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    if (opts.pending) el.dataset.pending = 'true';
    el.innerHTML = `<p>${escapeHtml(text).replace(/\n/g, '<br />')}</p>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    el.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };
  const removePendingMessage = () => { $$('#chat-log .msg[data-pending]').forEach(el => el.remove()); };
  const setPendingMessage = (text) => {
    const el = $('#chat-log .msg[data-pending] p');
    if (el) el.innerHTML = escapeHtml(text).replace(/\n/g, '<br />');
  };

  const refreshActiveTrip = async () => {
    const me = auth.current();
    const trip = me && activeTripFor(me.email);
    const button = $('#btn-refresh-live');
    const status = $('#research-status');
    if (!trip || !button || !status) return;
    await ai.refreshOpenRouterStatus();
    if (!ai.enabled()) {
      status.textContent = 'Connect OpenRouter, OpenAI, or Anthropic in Settings to refresh web research.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Refreshing…';
    status.textContent = 'Checking live weather, current openings, reviews, and neighborhood businesses…';
    try {
      const profile = store.profile.load(me.email);
      const wx = await weather.forecast(trip.destination, trip.days);
      const generated = await ai.generateTrip(trip, profile, wx);
      const bundle = generated?.bundle || null;
      const llmRun = generated?.llmRun || null;
      if (!bundle) throw new Error('The itinerary generator returned no plan.');
      const updated = store.trips.update(me.email, trip.id, {
        weather: wx, bundle, llmRun, researchUpdatedAt: new Date().toISOString(),
      });
      if (!updated) throw new Error('Could not update the saved trip.');
      status.textContent = `Live research refreshed ${new Date().toLocaleString()}.`;
      renderTripHistory(me);
      renderItinerary();
    } catch (error) {
      status.textContent = `Refresh failed: ${String(error?.message || error).slice(0, 180)}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Refresh live research';
    }
  };
  const titleCase = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const appendTripCard = (trip) => {
    const dest = DATA.destinations.find(d => d.key === trip.destination);
    const vibe = DATA.VIBES.find(v => v.key === trip.primaryVibe);
    const el = document.createElement('article');
    el.className = 'msg trip-card';
    el.innerHTML = `
      <div class="head">
        <h4>${escapeHtml(trip.bundle?.destinationMeta?.name || dest?.name || titleCase(trip.destination))}</h4>
        <span class="stamp">${trip.bundle?.mode === 'degraded' ? 'Offline-ready plan' : trip.bundle ? 'Live plan ready' : 'Trip saved'}</span>
      </div>
      <div class="details">
        <span>${trip.days} day${trip.days > 1 ? 's' : ''}</span>
        <span>${trip.travelers} traveler${trip.travelers > 1 ? 's' : ''}</span>
        <span>${escapeHtml(vibe ? vibe.title : trip.primaryVibe)}</span>
      </div>
      <div class="card-actions">
        <button type="button" class="btn primary" data-view-trip="${escapeHtml(trip.id)}">View the plan →</button>
        <button type="button" class="btn ghost" id="chat-new-trip">Start another</button>
      </div>`;
    $('#chat-log').appendChild(el);
    el.querySelector('[data-view-trip]').addEventListener('click', () => {
      const me = auth.current(); if (!me) return;
      store.activeTrip.set(me.email, trip.id);
      location.hash = '#/itinerary';
      route();
    });
    el.querySelector('#chat-new-trip').addEventListener('click', () => {
      startNewTrip();
    });
  };

  const autosizeTextarea = () => {
    const ta = $('#chat-textarea'); if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  };

  const initChat = () => {
    const form = $('#chat-form'); const ta = $('#chat-textarea');
    form.addEventListener('submit', (e) => { e.preventDefault(); chatSubmit(); });
    ta.addEventListener('input', autosizeTextarea);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSubmit(); }
    });
    $$('.chat-suggestions .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        ta.value = chip.dataset.prompt;
        autosizeTextarea();
        chatSubmit();
      });
    });
    $('#chat-settings-link').addEventListener('click', (e) => { e.preventDefault(); openSettings(); });
    updateChatHint();
  };

  const updateChatHint = () => {
    const el = $('#chat-hint');
    const p = ai.provider();
    if (p === 'openrouter')  el.innerHTML = 'Powered by OpenRouter (<a href="#" id="chat-settings-link-2">change</a>).';
    else if (p === 'claude') el.innerHTML = 'Powered by Claude (<a href="#" id="chat-settings-link-2">change</a>).';
    else if (p === 'openai') el.innerHTML = 'Powered by GPT (<a href="#" id="chat-settings-link-2">change</a>).';
    else                     el.innerHTML = 'Powered by a local parser. <a href="#" id="chat-settings-link-2">Configure the local OpenRouter server or add another provider key</a> to switch to AI.';
    const l = $('#chat-settings-link-2'); if (l) l.addEventListener('click', (e) => { e.preventDefault(); openSettings(); });
  };

  const startNewTrip = () => {
    const log = $('#chat-log'); log.innerHTML = '';
    $('#chat-suggestions').hidden = false;
    location.hash = '#/chat';
    const me = auth.current();
    if (me) { store.activeTrip.clear(me.email); renderTripHistory(me); }
    route();
  };

  // ---- Sidebar ----
  const renderSidebar = (me) => {
    $('#who-name').textContent = me.name;
    renderTripHistory(me);
    const activeId = store.activeTrip.get(me.email);
    const trips = store.trips.load(me.email);
    const activeTrip = trips.find(t => t.id === activeId);
    $('#trip-side-nav').hidden = !activeTrip;
  };

  const renderTripHistory = (me) => {
    const list = $('#trip-history');
    const trips = store.trips.load(me.email).slice().reverse();
    const activeId = store.activeTrip.get(me.email);
    if (!trips.length) {
      list.innerHTML = `<li class="th-empty">No trips yet — say where you're heading.</li>`;
      return;
    }
    list.innerHTML = trips.map(t => {
      const dest = DATA.destinations.find(d => d.key === t.destination);
      const vibe = DATA.VIBES.find(v => v.key === t.primaryVibe);
      return `<li>
          <a href="#/itinerary" data-trip-id="${escapeHtml(t.id)}"${t.id === activeId ? ' class="is-active"' : ''}>
            <span class="th-title">${escapeHtml(dest ? dest.name : t.destination)}</span>
            <span class="th-sub">${t.days} day${t.days > 1 ? 's' : ''} · ${escapeHtml(vibe ? vibe.title : t.primaryVibe)}</span>
          </a>
        </li>`;
    }).join('');
    // Bind clicks: set active trip before route runs
    list.querySelectorAll('a[data-trip-id]').forEach(a => {
      a.addEventListener('click', () => {
        store.activeTrip.set(me.email, a.dataset.tripId);
      });
    });
  };

  // ---- Community (public) ----
  const getCommunityEntries = async () => {
    const seeds = (DATA.communityEntries || []).map(e => ({ ...e, source: 'seed' }));
    try {
      const response = await auth.request('community');
      const published = (response.entries || []).map((entry) => ({
        ...entry,
        authorName: entry.author,
        source: 'community',
      }));
      return [...seeds, ...published].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch {
      return seeds;
    }
  };
  const initPublic = () => {
    const destSel = $('#public-filter-dest');
    DATA.destinations.forEach(d => {
      const o = document.createElement('option');
      o.value = d.key; o.textContent = `${d.name} — ${d.country}`;
      destSel.appendChild(o);
    });
    destSel.addEventListener('change', renderCommunity);
    $('#public-filter-tag').addEventListener('change', renderCommunity);
    $('#public-signin').addEventListener('click', (e) => { e.preventDefault();
      const me = auth.current();
      location.hash = me ? '#/itinerary' : '#/auth';
    });
  };
  const renderCommunity = async () => {
    const me = auth.current();
    const btn = $('#public-signin');
    if (me) { btn.textContent = 'Back to your trip'; btn.setAttribute('href', '#/itinerary'); }
    else    { btn.textContent = 'Sign in';           btn.setAttribute('href', '#/auth'); }

    const dest = $('#public-filter-dest').value;
    const tag  = $('#public-filter-tag').value;
    const root = $('#public-entries');
    root.setAttribute('aria-busy', 'true');
    let entries = await getCommunityEntries();
    if (dest !== 'all') entries = entries.filter(e => e.destination === dest);
    if (tag  !== 'all') entries = entries.filter(e => (e.tags || []).includes(tag));
    root.removeAttribute('aria-busy');
    if (!entries.length) { root.innerHTML = `<p class="hint">Nothing yet in that view. Try another filter.</p>`; return; }
    root.innerHTML = entries.map(e => {
      const destName = DATA.destinations.find(d => d.key === e.destination)?.name || e.destination;
      return `
        <article class="pub-entry">
          <div class="head">
            <div>
              <h3>${escapeHtml(e.title)}</h3>
              <div class="author">by ${escapeHtml(e.authorName)}${e.date ? ` · ${escapeHtml(e.date)}` : ''}</div>
            </div>
            <span class="dest">${escapeHtml(destName)}</span>
          </div>
          <div class="body">
            ${e.did    ? `<p><strong>Did</strong>${escapeHtml(e.did)}</p>` : ''}
            ${e.change ? `<p><strong>Change</strong>${escapeHtml(e.change)}</p>` : ''}
          </div>
          ${(e.tags && e.tags.length) || e.accessAccuracy || e.dietAccuracy ? `
            <div class="tags">
              ${(e.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join('')}
              ${e.accessAccuracy ? `<span>Access ${escapeHtml(e.accessAccuracy)}</span>` : ''}
              ${e.dietAccuracy   ? `<span>Dietary ${escapeHtml(e.dietAccuracy)}</span>`   : ''}
            </div>` : ''}
        </article>`;
    }).join('');
  };

  // ---- Profile sheet ----
  const readProfileForm = () => {
    const f = $('#profile-form'); const p = store.emptyProfile();
    p.vibes = $$('[data-chips="vibes"] input:checked').map(i => i.value);
    p.budget = f.budget.value; p.pace = f.pace.value;
    p.wardrobePresentation = f.wardrobePresentation.value || 'women';
    p.styleAgeBand = f.styleAgeBand.value || 'adult';
    p.dietary.halal      = $('[data-diet="halal"]').checked;
    p.dietary.kosher     = $('[data-diet="kosher"]').checked;
    p.dietary.vegan      = $('[data-diet="vegan"]').checked;
    p.dietary.vegetarian = $('[data-diet="vegetarian"]').checked;
    p.dietary.glutenFree = $('[data-diet="glutenFree"]').checked;
    p.dietary.allergies  = parseList(f.allergies.value);
    p.dietary.other      = f.dietOther.value.trim();
    p.accessibility.stepFree      = $('[data-access="stepFree"]').checked;
    p.accessibility.lowVision     = $('[data-access="lowVision"]').checked;
    p.accessibility.lowHearing    = $('[data-access="lowHearing"]').checked;
    p.accessibility.seatingBreaks = $('[data-access="seatingBreaks"]').checked;
    p.accessibility.notes         = f.accessNotes.value.trim();
    p.religiousCultural = f.religiousCultural.value.trim();
    p.modesty = ($('input[name="modesty"]:checked') || {}).value || 'no-preference';
    p.medical.devices         = f.medDevices.value.trim();
    p.medical.medications     = f.medMedications.value.trim();
    p.medical.reminderCadence = f.medCadence.value;
    p.family.childrenAges = parseIntList(f.childrenAges.value);
    p.family.babyOnBoard  = f.babyOnBoard.checked;
    p.family.notes        = f.familyNotes.value.trim();
    p.avoid = parseList(f.avoid.value);
    return p;
  };
  const writeProfileForm = (p) => {
    const f = $('#profile-form');
    $$('[data-chips="vibes"] input').forEach(i => { i.checked = (p.vibes || []).includes(i.value); });
    f.budget.value = p.budget || 'mid'; f.pace.value = p.pace || 'balanced';
    f.wardrobePresentation.value = p.wardrobePresentation || 'women';
    f.styleAgeBand.value = p.styleAgeBand || 'adult';
    $('[data-diet="halal"]').checked      = !!p.dietary.halal;
    $('[data-diet="kosher"]').checked     = !!p.dietary.kosher;
    $('[data-diet="vegan"]').checked      = !!p.dietary.vegan;
    $('[data-diet="vegetarian"]').checked = !!p.dietary.vegetarian;
    $('[data-diet="glutenFree"]').checked = !!p.dietary.glutenFree;
    f.allergies.value = (p.dietary.allergies || []).join(', ');
    f.dietOther.value = p.dietary.other || '';
    $('[data-access="stepFree"]').checked      = !!p.accessibility.stepFree;
    $('[data-access="lowVision"]').checked     = !!p.accessibility.lowVision;
    $('[data-access="lowHearing"]').checked    = !!p.accessibility.lowHearing;
    $('[data-access="seatingBreaks"]').checked = !!p.accessibility.seatingBreaks;
    f.accessNotes.value = p.accessibility.notes || '';
    f.religiousCultural.value = p.religiousCultural || '';
    const mod = $(`input[name="modesty"][value="${p.modesty || 'no-preference'}"]`); if (mod) mod.checked = true;
    f.medDevices.value     = p.medical.devices || '';
    f.medMedications.value = p.medical.medications || '';
    f.medCadence.value     = p.medical.reminderCadence || 'none';
    f.childrenAges.value = (p.family.childrenAges || []).join(', ');
    f.babyOnBoard.checked = !!p.family.babyOnBoard;
    f.familyNotes.value = p.family.notes || '';
    f.avoid.value = (p.avoid || []).join(', ');
  };
  const openProfileSheet = () => {
    const me = auth.current(); if (!me) return;
    writeProfileForm(store.profile.load(me.email));
    $('#sheet-profile').hidden = false;
    const close = () => $('#sheet-profile').hidden = true;
    $$('#sheet-profile [data-close-sheet]').forEach(el => el.addEventListener('click', close, { once: true }));
    $('#save-profile').onclick = () => { store.profile.save(me.email, readProfileForm()); flash('#save-note', 'Saved.'); };
    $('#reset-profile').onclick = () => {
      if (!confirm('Clear your saved profile on every signed-in device?')) return;
      store.profile.clear(me.email); writeProfileForm(store.emptyProfile());
      flash('#save-note', 'Profile cleared.');
    };
  };

  // ---- Settings sheet (connected accounts) ----
  const formatLLMCost = (cost) => {
    const amount = Number(cost) || 0;
    return amount < 0.01 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(3)}`;
  };
  const renderPipelineUsage = () => {
    const root = $('#pipeline-usage');
    const count = $('#pipeline-model-count');
    if (!root || !count) return;
    const configured = store.ai.pipeline.get();
    const configuredModels = new Set(Object.values(configured));
    const all = store.ai.usage.all();
    const itineraryStages = new Set(['discover', 'reviews', 'select', 'present', 'repair']);
    const latestRunId = all.find(entry => itineraryStages.has(entry.stage) && entry.runId)?.runId;
    const latest = latestRunId ? all.filter(entry => entry.runId === latestRunId) : [];
    count.textContent = `4 stages · ${configuredModels.size} model${configuredModels.size === 1 ? '' : 's'}`;
    if (!latest.length) {
      root.textContent = `Configured: 4 isolated calls per itinerary using ${configuredModels.size} distinct model${configuredModels.size === 1 ? '' : 's'}. No completed itinerary calls yet.`;
      return;
    }
    const total = latest.reduce((sum, entry) => sum + (Number(entry.cost) || 0), 0);
    const searches = latest.reduce((sum, entry) => sum + (Number(entry.searches) || 0), 0);
    const estimated = latest.some(entry => entry.estimated);
    const details = latest.slice().reverse().map(entry => `${entry.label}: ${formatLLMCost(entry.cost)}`).join(' · ');
    const repaired = latest.some(entry => entry.stage === 'repair');
    root.textContent = `Latest itinerary: 4 core calls${repaired ? ' + 1 automatic repair' : ''}, ${formatLLMCost(total)}${estimated ? ' estimated' : ''}, ${searches} web search${searches === 1 ? '' : 'es'}. ${details}`;
  };
  const renderPipelineTrace = () => {
    const root = $('#pipeline-trace-output');
    if (!root) return;
    const run = store.ai.lastRun.get();
    if (!run) {
      root.textContent = 'No OpenRouter itinerary run yet. After a trip is generated, each stage’s JSON response will appear here.';
      return;
    }
    const stageHtml = (run.stages || []).map(stage => {
      const response = stage.response == null ? 'No response was recorded.' : JSON.stringify(stage.response, null, 2);
      const meta = `${stage.model || stage.configuredModel} · ${formatLLMCost(stage.cost)}${stage.estimated ? ' estimated' : ''} · ${stage.inputTokens || 0} input / ${stage.outputTokens || 0} output tokens${stage.searches ? ` · ${stage.searches} web searches` : ''}`;
      return `<article style="margin:.85rem 0;padding:.75rem;border:1px solid var(--line, #ddd);border-radius:.5rem;">
        <strong>${escapeHtml(stage.label || stage.stage)}</strong><br /><small>${escapeHtml(meta)}</small>
        <pre style="max-height:20rem;overflow:auto;white-space:pre-wrap;margin:.65rem 0 0;">${escapeHtml(response)}</pre>
      </article>`;
    }).join('');
    root.innerHTML = `${run.error ? `<p><strong>Run stopped:</strong> ${escapeHtml(run.error)}</p>` : ''}${stageHtml || 'No completed stages were recorded.'}`;
  };
  const refreshConnectionStatuses = () => {
    const setStatus = (id, connected) => {
      const el = $('#conn-status-' + id); if (!el) return;
      el.textContent = connected ? 'Connected' : 'Not connected';
      el.closest('.conn-tile')?.setAttribute('data-connected', String(connected));
    };
    setStatus('openrouter', ai.hasOpenRouter());
    setStatus('openai',    ai.hasOpenAI());
    setStatus('anthropic', ai.hasClaude());
    setStatus('images',    imageSearch.hasKeys());
    // Pinterest inspiration is always available; label it "Active".
    const pin = $('#conn-status-pinterest');
    if (pin) { pin.textContent = 'Active'; pin.closest('.conn-tile')?.setAttribute('data-connected', 'true'); }
  };

  const clearSavedPlaceFeedback = (noteSelector, button) => {
    if (button?.dataset.confirm !== 'true') {
      if (button) {
        button.dataset.confirm = 'true';
        button.textContent = 'Confirm clear saved review feedback';
        setTimeout(() => {
          button.dataset.confirm = '';
          button.textContent = button.id === 'clear-place-feedback' ? 'Clear saved place feedback' : 'Clear saved review feedback';
        }, 5000);
      }
      flash(noteSelector, 'Click again within five seconds to delete the saved review feedback.');
      return;
    }
    const removed = store.trips.clearPlaceReviewFeedback();
    // The latest pipeline trace can include review-stage JSON, so clear it
    // alongside the per-trip evidence. The cost ledger is intentionally kept.
    store.ai.lastRun.clear();
    renderPipelineTrace();
    route();
    flash(noteSelector, `Cleared ${removed} saved review field${removed === 1 ? '' : 's'}.`);
  };

  const openSettings = () => {
    const f = $('#settings-form');
    f.openrouterModel.value = store.ai.openrouterModel.get();
    const pipeline = store.ai.pipeline.get();
    f.pipelineDiscover.value = pipeline.discover;
    f.pipelineReviews.value = pipeline.reviews;
    f.pipelineSelect.value = pipeline.select;
    f.pipelinePresent.value = pipeline.present;
    const outfitPipeline = store.ai.outfitPipeline.get();
    f.outfitPlanModel.value = outfitPipeline.plan;
    f.outfitCurateModel.value = outfitPipeline.curate;
    f.googleImgKey.value = store.images.key.get();
    f.googleImgCx.value  = store.images.cx.get();
    f.openaiKey.value    = store.ai.openaiKey.get();
    f.openaiModel.value  = store.ai.openaiModel.get();
    f.anthropicKey.value = store.ai.claudeKey.get();
    f.anthropicModel.value = store.ai.claudeModel.get();
    const prov = store.ai.provider.get();
    const provRadio = $(`input[name="aiProvider"][value="${prov}"]`);
    if (provRadio) provRadio.checked = true;

    f.pinterestKeywords.value = store.pinterest.extraKeywords.get();

    refreshConnectionStatuses();
    renderPipelineUsage();
    renderPipelineTrace();

    $('#sheet-settings').hidden = false;
    ai.refreshOpenRouterStatus().then(() => refreshConnectionStatuses());
    const close = () => $('#sheet-settings').hidden = true;
    $$('#sheet-settings [data-close-sheet]').forEach(el => el.addEventListener('click', close, { once: true }));

    $('#save-settings').onclick = () => {
      store.ai.openrouterModel.set(f.openrouterModel.value.trim());
      store.ai.pipeline.set({
        discover: f.pipelineDiscover.value,
        reviews: f.pipelineReviews.value,
        select: f.pipelineSelect.value,
        present: f.pipelinePresent.value,
      });
      store.ai.outfitPipeline.set({
        plan: f.outfitPlanModel.value,
        curate: f.outfitCurateModel.value,
      });
      store.images.key.set(f.googleImgKey.value.trim());
      store.images.cx.set(f.googleImgCx.value.trim());
      store.ai.openaiKey.set(f.openaiKey.value.trim());
      store.ai.openaiModel.set(f.openaiModel.value);
      store.ai.claudeKey.set(f.anthropicKey.value.trim());
      store.ai.claudeModel.set(f.anthropicModel.value);
      const prov = ($('input[name="aiProvider"]:checked') || {}).value || 'auto';
      store.ai.provider.set(prov);

      const newKw = f.pinterestKeywords.value.trim();
      const oldKw = store.pinterest.extraKeywords.get();
      store.pinterest.extraKeywords.set(newKw);
      if (newKw !== oldKw) pinterest.clearCache();

      refreshConnectionStatuses();
      renderPipelineUsage();
      renderPipelineTrace();
      const p = ai.provider();
      flash('#settings-note', 'Saved.' + (p ? ` AI active (${p}).` : ' No AI configured; local parser.'));
      updateChatHint();
    };

    $('#clear-place-feedback').onclick = (event) => clearSavedPlaceFeedback('#place-feedback-note', event.currentTarget);
    $('#delete-account').onclick = async (event) => {
      if (!window.confirm('Permanently delete this account and all synchronized Malem data? This cannot be undone.')) return;
      const button = event.currentTarget;
      button.disabled = true;
      flash('#delete-account-note', 'Deleting account…');
      try {
        await auth.deleteAccount();
        $('#sheet-settings').hidden = true;
        location.hash = '#/auth';
        route();
      } catch (error) {
        flash('#delete-account-note', error.message || 'Could not delete the account.');
        button.disabled = false;
      }
    };
  };

  // ---- App shell + routing ----
  const initApp = () => {
    const dash = $('#screen-app');
    const collapseButton = $('#sidebar-collapse');
    const setSidebarCollapsed = (collapsed) => {
      dash.dataset.sidebarCollapsed = String(collapsed);
      collapseButton.setAttribute('aria-expanded', String(!collapsed));
      collapseButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      collapseButton.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      try { localStorage.setItem('malem.sidebarCollapsed.v1', String(collapsed)); } catch {}
    };
    setSidebarCollapsed(localStorage.getItem('malem.sidebarCollapsed.v1') === 'true');
    collapseButton.addEventListener('click', () => setSidebarCollapsed(dash.dataset.sidebarCollapsed !== 'true'));
    $('#btn-new-trip').addEventListener('click', startNewTrip);
    $('#btn-community').addEventListener('click', () => { location.hash = '#/community'; });
    $('#btn-profile').addEventListener('click', openProfileSheet);
    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-signout').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await auth.signout();
        location.hash = '#/auth';
        route();
      } catch (error) {
        flash('#global-status', error.message || 'Could not sign out. Please try again.');
      } finally {
        button.disabled = false;
      }
    });
    $('#btn-theme').addEventListener('click', toggleTheme);
    $('#side-toggle').addEventListener('click', () => {
      const d = $('#screen-app'); d.dataset.navOpen = d.dataset.navOpen === 'true' ? 'false' : 'true';
    });

    $('#toggle-packing-controls').addEventListener('click', () => { const f = $('#packing-form'); f.hidden = !f.hidden; });
    $('#btn-rebuild-packing').addEventListener('click', () => { renderPacking(readPackingReq()); });
    $('#toggle-discover-controls').addEventListener('click', () => { const f = $('#discover-form'); f.hidden = !f.hidden; });
    $('#btn-rebuild-discover').addEventListener('click', renderDiscover);
    $('#btn-refresh-live').addEventListener('click', refreshActiveTrip);
    $('#toggle-local-controls').addEventListener('click', () => { const f = $('#local-form'); f.hidden = !f.hidden; });
    $('#btn-rebuild-local').addEventListener('click', renderLocal);
    $('#clear-local-place-feedback').addEventListener('click', (event) => clearSavedPlaceFeedback('#local-place-feedback-note', event.currentTarget));

    $('#add-member').addEventListener('click', () => {
      const me = auth.current(); const f = $('#member-form');
      const name = f.name.value.trim(); if (!name) return;
      const members = store.group.load(me.email);
      members.push({ id: 'm' + performance.now(), name, ageBand: f.ageBand.value, constraints: parseList(f.constraints.value), vibe: f.vibe.value || '' });
      store.group.save(me.email, members); f.reset(); renderMembers();
    });
    $('#members-list').addEventListener('click', (e) => {
      const btn = e.target.closest('button.remove'); if (!btn) return;
      const me = auth.current();
      store.group.save(me.email, store.group.load(me.email).filter(m => m.id !== btn.dataset.id));
      renderMembers();
    });
    $('#add-journal').addEventListener('click', () => {
      const me = auth.current(); const f = $('#journal-form');
      const entry = {
        id: 'j' + performance.now(),
        title: f.title.value.trim() || 'Untitled entry',
        did: f.did.value.trim(), change: f.change.value.trim(),
        accessAccuracy: f.accessAccuracy.value, dietAccuracy: f.dietAccuracy.value,
        publicEntry: f.publicEntry.checked,
        destination: activeTripFor(me.email)?.destination || '',
        date: new Date().toISOString().slice(0, 10),
      };
      const list = store.journal.load(me.email); list.push(entry); store.journal.save(me.email, list);
      f.reset(); renderJournal(); flash('#journal-note', 'Entry saved.');
    });
    $('#journal-list').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-journal-action]');
      if (!button) return;
      const me = auth.current();
      let entries = store.journal.load(me.email);
      if (button.dataset.journalAction === 'remove') {
        entries = entries.filter((entry) => String(entry.id) !== button.dataset.id);
        flash('#journal-note', 'Entry removed.');
      } else {
        entries = entries.map((entry) => String(entry.id) === button.dataset.id
          ? { ...entry, publicEntry: !entry.publicEntry }
          : entry);
        flash('#journal-note', button.dataset.public === 'true' ? 'Entry is now private.' : 'Entry published.');
      }
      store.journal.save(me.email, entries);
      renderJournal();
    });
  };

  // ---- Renderers (unchanged from previous) ----
  const activeTripFor = (email) => {
    const trips = store.trips.load(email);
    const id = store.activeTrip.get(email);
    return trips.find(t => t.id === id) || trips[trips.length - 1] || null;
  };
  // Destination metadata: AI-generated bundle first, then built-in demo data, then a slug fallback.
  const destMetaFor = (trip) => trip?.bundle?.destinationMeta
    || DATA.destinations.find(d => d.key === trip?.destination)
    || { key: trip?.destination, name: titleCase(trip?.destination || ''), country: '', plug: '', culturalNote: '', palette: [], paletteNote: '' };

  const renderItinerary = () => {
    const me = auth.current(); const trip = activeTripFor(me.email); const profile = store.profile.load(me.email);
    if (!trip) return;
    const meta = destMetaFor(trip);
    const vibe = DATA.VIBES.find(v => v.key === trip.primaryVibe);
    $('#itin-hero').textContent = meta.name || trip.destination;
    $('#itin-vibe-label').textContent = vibe ? vibe.title : trip.primaryVibe;
    $('#itin-kicker').textContent = vibe ? vibe.sub : (meta.plug || '');
    if (trip.weather) {
      const checked = trip.weather.updatedAt ? new Date(trip.weather.updatedAt).toLocaleString() : '';
      $('#weather-note').innerHTML = `${escapeHtml(weather.describe(trip.weather))} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Live Open-Meteo</a>${checked ? ` · checked ${escapeHtml(checked)}` : ''}`;
    } else {
      $('#weather-note').textContent = DATA.weatherLine(trip.destination, trip.season || 'summer') || '';
    }
    $('#palette-note').textContent = meta.paletteNote || '';
    $('#palette-swatches').innerHTML = (meta.palette || []).map(c => `<span class="swatch" style="background:${c}"></span>`).join('');
    $('#badge-days').textContent = `${trip.days} day${trip.days > 1 ? 's' : ''}`;
    $('#badge-travelers').textContent = `${trip.travelers} traveler${trip.travelers > 1 ? 's' : ''}`;
    $('#badge-vibe').textContent = vibe?.title || trip.primaryVibe;
    const itin = trip.bundle?.itinerary?.days ? trip.bundle.itinerary : null;
    if (!itin) {
      $('#itinerary-output').innerHTML = `<div class="recommendation-empty">
        <strong>This saved trip does not contain a completed live itinerary.</strong>
        <p>Malem will not display the old repeated template in its place.</p>
        <button type="button" class="btn primary" data-build-live-itinerary>Build the live itinerary</button>
      </div>`;
      $('#itinerary-output [data-build-live-itinerary]')?.addEventListener('click', refreshActiveTrip);
      return;
    }
    $('#itinerary-output').innerHTML = (itin.days || []).map((day, i) => `
      <article class="itin-day">
        <header>
          <h3>Day ${i + 1}${day.date ? ` <span class="hint" style="font-family:var(--font-sans);font-size:.85rem;margin-left:.5rem;">${escapeHtml(day.date)}</span>` : ''}</h3>
          <span class="theme">${escapeHtml(day.theme)}</span>
        </header>
        ${(day.blocks || []).map(b => {
          const sourceUrl = safeExternalUrl(b.sourceUrl);
          const reviewUrl = safeExternalUrl(b.reviewSourceUrl);
          const evidence = [
            b.businessSize && b.businessSize !== 'unknown' ? b.businessSize.replace('-', ' ') : '',
            b.rating != null && b.rating !== '' && Number.isFinite(Number(b.rating)) ? `★ ${Number(b.rating).toFixed(1)}` : '',
            b.reviewCount != null && b.reviewCount !== '' && Number.isFinite(Number(b.reviewCount)) ? `${Number(b.reviewCount).toLocaleString()} reviews` : '',
            b.checkedAt ? `checked ${b.checkedAt}` : '',
          ].filter(Boolean);
          return `
          <div class="itin-block">
            <div class="when">${escapeHtml(b.time)}<br /><small>${escapeHtml(b.duration)}</small></div>
            <div class="what">
              <strong>${escapeHtml(b.title)}</strong>
              <small>${escapeHtml(b.kind)}</small>
              ${b.reviewSummary ? `<p class="place-review">${escapeHtml(b.reviewSummary)}</p>` : ''}
              ${evidence.length || sourceUrl || reviewUrl ? `<div class="place-evidence">${evidence.map(v => `<span>${escapeHtml(v)}</span>`).join('')}${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Source ↗</a>` : ''}${reviewUrl && reviewUrl !== sourceUrl ? `<a href="${escapeHtml(reviewUrl)}" target="_blank" rel="noopener">Reviews ↗</a>` : ''}</div>` : ''}
              ${b.respects ? `<div class="respects">${b.respects.map(r => `<span>${escapeHtml(r)}</span>`).join('')}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </article>`).join('');
  };

  // Concise product query from a verbose look value ("Cotton tee or linen shirt" -> "Cotton tee").
  const itemQuery = (v) => String(v || '').split(/\bor\b/i)[0].replace(/,.*$/, '').trim();
  let outfitRenderEpoch = 0;

  const renderLiveVisionBoards = async ({ me, trip, profile, itin, destination, epoch, forcePlan = false }) => {
    const root = $('#outfits-output');
    $('#outfits-source').textContent = 'Each board uses current, real full-outfit references matched to the destination, itinerary, weather, and requested vibe. Images are sourced from Pinterest and fashion image search—not generated.';
    root.innerHTML = `<div class="outfit-ai-status">
      <span class="spinner-dot" aria-hidden="true"></span>
      <div><strong>Styling the daily inspiration boards…</strong><small>Reading the itinerary and weather, then finding complete looks for each setting.</small></div>
    </div>`;

    const tripForOutfits = { ...trip, bundle: { ...(trip.bundle || {}), itinerary: itin } };
    let plan;
    try {
      plan = await ai.createOutfitPlan(tripForOutfits, profile, trip.weather, forcePlan);
      if (epoch !== outfitRenderEpoch) return;
      const savedBundle = { ...(trip.bundle || {}), outfits: plan };
      store.trips.update(me.email, trip.id, { bundle: savedBundle });
    } catch (error) {
      if (epoch !== outfitRenderEpoch) return;
      root.innerHTML = `<div class="recommendation-empty"><strong>The outfit planner could not finish.</strong><p>${escapeHtml(error.message || 'Unknown error')}</p><button type="button" class="btn ghost" data-retry-outfits>Try again</button></div>`;
      root.querySelector('[data-retry-outfits]')?.addEventListener('click', () => renderOutfits(true));
      return;
    }

    const looks = plan.looks.slice(0, Number(trip.days));
    const palette = (plan.capsulePalette || []).filter(color => /^#[0-9a-f]{3,8}$/i.test(color)).slice(0, 6);
    root.innerHTML = `<div class="recommendation-explainer outfit-workflow">
      <div><span class="algorithm-dot text"></span><strong>Live context</strong><small>request + profile + itinerary + weather</small></div>
      <div><span class="algorithm-dot visual"></span><strong>Complete looks</strong><small>destination + activity + vibe searches</small></div>
      <div><span class="algorithm-dot behavior"></span><strong>Reference gallery</strong><small>several full-outfit ideas per day</small></div>
    </div>
    <div class="outfit-context-strip">
      <div>${(plan.contextSummary || []).map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>
      <button type="button" class="btn ghost" data-new-capsule>New board direction</button>
    </div>
    <div class="vision-board-deck">
      ${looks.map(look => `
        <article class="vision-board-card" data-board-look="${escapeHtml(look.id)}">
          <header class="vision-board-head">
            <div>
              <span class="eyebrow">Day ${escapeHtml(look.day)} · ${escapeHtml(destination)}</span>
              <h3>${escapeHtml(look.name)}</h3>
            </div>
            <span class="live-chip">live-sourced</span>
          </header>
          <div class="vision-board-canvas">
            <div class="board-loading"><div class="pin-skeleton"></div><strong>Finding complete outfit references…</strong><small>Searching the location, activity, weather, and style direction.</small></div>
          </div>
          <footer class="vision-board-notes">
            <div class="board-why"><span>the direction</span><p>${escapeHtml(look.why)}</p></div>
            <div class="board-context">
              <span>☁ ${escapeHtml(look.weatherNote || 'Weather-aware layers')}</span>
              <span>⌁ ${escapeHtml(look.activityNote || 'Matched to the day’s route')}</span>
            </div>
            <div class="board-palette" aria-label="Capsule colour palette">${palette.map(color => `<i style="--swatch:${escapeHtml(color)}"></i>`).join('')}</div>
            <button type="button" class="text-button" data-refresh-board>Refresh this board</button>
          </footer>
        </article>`).join('')}
    </div>`;

    const cardForLook = (lookId) => [...root.querySelectorAll('[data-board-look]')]
      .find(card => card.dataset.boardLook === String(lookId));
    const claimedReferences = new Set();
    const retrieveCandidates = async (look) => {
      const dayNumber = Number(look.day || look.dayIndex) || 1;
      const itineraryDay = itin.days?.[Math.max(0, dayNumber - 1)] || null;
      const queries = pinterest.buildQueries(tripForOutfits, profile, look, itineraryDay);
      const groups = await Promise.all(queries.map(query => pinterest.searchPins(query)));
      const seen = new Set();
      const candidates = groups.flatMap((pins, queryIndex) => pins.map((pin, resultIndex) => ({
        id: outfitRecommender.idFor(pin.image),
        url: pin.image,
        title: pin.title || `${look.name} full outfit inspiration`,
        query: queries[queryIndex],
        tags: [destination, trip.season, look.name, look.theme, ...(look.vibeWords || [])].filter(Boolean),
        resultIndex,
        searchUrl: pin.sourceUrl || pinterest.searchURL(queries[queryIndex]),
      }))).filter(candidate => candidate.url && !seen.has(candidate.url) && seen.add(candidate.url));
      const intent = [destination, trip.season, look.name, look.why, look.activityNote, look.weatherNote, ...(look.vibeWords || [])].filter(Boolean).join(' ');
      const unclaimed = candidates.filter(candidate => !claimedReferences.has(candidate.url));
      const ranked = outfitRecommender.rank(unclaimed.length >= 3 ? unclaimed : candidates, intent, me.email, 6);
      ranked.candidates.forEach(candidate => claimedReferences.add(candidate.url));
      return { candidates: ranked.candidates, queries, intent };
    };
    const renderBoard = (card, look, context) => {
      const canvas = card.querySelector('.vision-board-canvas');
      if (!context.candidates.length) {
        const query = context.queries[0] || pinterest.buildQuery(tripForOutfits, profile, look);
        canvas.innerHTML = `<div class="recommendation-empty board-empty"><strong>Full-look references are temporarily limited.</strong><p>The wardrobe direction is still available below.</p><a href="${escapeHtml(pinterest.searchURL(query))}" target="_blank" rel="noopener">Open this outfit search ↗</a></div>`;
        return;
      }
      canvas.innerHTML = `<div class="board-paper-texture" aria-hidden="true"></div>
        <div class="board-title-note">${escapeHtml((look.vibeWords || []).slice(0, 3).join(' · ') || look.stylingNote || 'travel capsule')}</div>
        <div class="board-color-story" aria-label="Locked trip colour story">${palette.map(color => `<i style="--swatch:${escapeHtml(color)}"></i>`).join('')}</div>
        <div class="board-sticker">${escapeHtml(profile.wardrobePresentation === 'men' ? 'men’s edit' : profile.wardrobePresentation === 'unisex' ? 'unisex edit' : 'women’s edit')}</div>
        <div class="outfit-reference-grid">
          ${context.candidates.map((candidate, index) => `
            <a class="outfit-reference reference-${index + 1}" href="${escapeHtml(safeExternalUrl(candidate.searchUrl) || pinterest.searchURL(candidate.query))}" target="_blank" rel="noopener" aria-label="Open source for full outfit reference ${index + 1}">
              <span class="cutout-tape" aria-hidden="true"></span>
              <img src="${escapeHtml(candidate.url)}" data-proxy-src="${escapeHtml(proxiedImage(candidate.url))}" alt="${escapeHtml(`${look.name} full outfit reference ${index + 1}`)}" loading="${index < 3 ? 'eager' : 'lazy'}" />
              <span>full-look reference ${index + 1}</span>
            </a>`).join('')}
        </div>
        <div class="board-editor-note">${escapeHtml(look.stylingNote || 'Use these complete looks as references, then adapt the details to your capsule.')}</div>`;
      canvas.querySelectorAll('.outfit-reference img').forEach((image, index) => {
        const candidate = context.candidates[index];
        const capture = () => { if (candidate) outfitRecommender.captureVisual(image, candidate); };
        if (image.complete && image.naturalWidth) capture(); else image.addEventListener('load', capture, { once: true });
        image.addEventListener('error', () => {
          if (!image.dataset.triedProxy && image.dataset.proxySrc) {
            image.dataset.triedProxy = 'true';
            image.src = image.dataset.proxySrc;
            return;
          }
          image.closest('.outfit-reference')?.classList.add('image-failed');
        });
      });
    };
    const buildOne = async (look) => {
      const card = cardForLook(look.id);
      if (!card || epoch !== outfitRenderEpoch) return;
      const context = await retrieveCandidates(look);
      if (epoch === outfitRenderEpoch && card.isConnected) renderBoard(card, look, context);
    };

    root.querySelector('[data-new-capsule]')?.addEventListener('click', () => renderOutfits(true));
    root.querySelectorAll('[data-refresh-board]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      pinterest.clearCache();
      renderOutfits(true);
    }));

    let cursor = 0;
    const worker = async () => {
      while (cursor < looks.length && epoch === outfitRenderEpoch) {
        const look = looks[cursor++];
        try { await buildOne(look); }
        catch (error) {
          const card = cardForLook(look.id);
          if (card) card.querySelector('.vision-board-canvas').innerHTML = `<div class="recommendation-empty">Could not build this live board.<br>${escapeHtml(error.message)}</div>`;
        }
      }
    };
    await Promise.all([worker(), worker()]);
  };

  const renderOutfits = (forcePlan = false) => {
    const me = auth.current(); const trip = activeTripFor(me.email); const profile = store.profile.load(me.email);
    if (!trip) return;
    const epoch = ++outfitRenderEpoch;
    if (!ai.hasOpenRouter()) {
      ai.refreshOpenRouterStatus().then(configured => {
        if (configured && epoch === outfitRenderEpoch && location.hash.replace(/^#\/?/, '').startsWith('outfits')) renderOutfits(forcePlan);
      });
    }
    const itin = (trip.bundle && trip.bundle.itinerary && trip.bundle.itinerary.days) ? trip.bundle.itinerary : engine.buildItinerary(trip, profile);
    const { looks } = engine.buildOutfits(itin, profile, trip.season || 'summer', trip.destination, trip);
    const destination = trip.bundle?.destinationMeta?.name || DATA.destinations.find(d => d.key === trip.destination)?.name || titleCase(trip.destination);
    const styleKeywords = store.pinterest.extraKeywords.get();
    const user = me.email;
    // Cached queries do not spend this allowance. Uncached retrieval is capped
    // at two full-look searches per look and twelve requests per render.
    pinterest.beginBatch(Math.min(12, Math.max(4, looks.length * 2)));

    if (ai.hasOpenRouter()) {
      renderLiveVisionBoards({ me, trip, profile, itin, destination, epoch, forcePlan });
      return;
    }

    $('#outfits-source').innerHTML = `Real full-outfit references are retrieved with a bounded destination-and-vibe search, then ranked locally by text relevance, visual similarity, and your Save/Open/Zoom/Hide history. Your taste vectors stay in this browser. <button type="button" class="text-button" id="outfits-reset-taste">Reset learned taste</button>`;

    const byDay = {};
    looks.forEach(l => { (byDay[l.dayIndex] ||= []).push(l); });
    const root = $('#outfits-output');
    const stats = outfitRecommender.stats(user);

    root.innerHTML = `<div class="recommendation-explainer">
      <div><span class="algorithm-dot visual"></span><strong>Visual vectors</strong><small data-vector-count>${stats.indexed} images indexed</small></div>
      <div><span class="algorithm-dot text"></span><strong>Text retrieval</strong><small>destination + weather + wardrobe</small></div>
      <div><span class="algorithm-dot behavior"></span><strong>Collaborative rank</strong><small data-signal-count>${stats.signals} personal signals</small></div>
    </div>` + Object.keys(byDay).map(k => {
      const dayLooks = byDay[k]; const first = dayLooks[0];
      return `
        <div class="outfit-day-head">
          <h3>Day ${escapeHtml(k)}${first.date ? ` <span class="hint" style="font-family:var(--font-sans);font-size:.85rem;margin-left:.5rem;">${escapeHtml(first.date)}</span>` : ''}</h3>
          <p class="theme">${escapeHtml(first.theme)}</p>
        </div>
        <div class="curation-grid">
          ${dayLooks.map((look, lookIndex) => {
            const lookId = `look-${look.dayIndex}-${lookIndex}`;
            const itemsList = look.items.map(it => `<li><span class="k">${escapeHtml(it.part)}</span><span>${escapeHtml(it.value)}</span></li>`).join('');
            return `
              <article class="curation-card" data-look-id="${escapeHtml(lookId)}">
                <div class="curation-heading">
                  <div><span class="eyebrow">${escapeHtml(look.name)}</span><p>${escapeHtml(look.why || '')}</p></div>
                  <span class="live-chip">ranking live</span>
                </div>
                <div class="ranked-pins" data-ranked-pins><div class="pin-skeleton"></div><div class="pin-skeleton"></div><div class="pin-skeleton"></div></div>
                <details class="wardrobe-brief">
                  <summary>Wardrobe brief used for retrieval</summary>
                  <ul class="look-items">${itemsList}</ul>
                </details>
              </article>`;
          }).join('')}
        </div>`;
    }).join('');

    const updateRecommenderStats = () => {
      const current = outfitRecommender.stats(user);
      const vectors = root.querySelector('[data-vector-count]'); const signals = root.querySelector('[data-signal-count]');
      if (vectors) vectors.textContent = `${current.indexed} images indexed`;
      if (signals) signals.textContent = `${current.signals} personal signals`;
    };
    const pools = new Map();
    const claimedUrls = new Set();
    const paint = (lookId) => {
      const context = pools.get(lookId); const container = root.querySelector(`[data-look-id="${lookId}"] [data-ranked-pins]`);
      if (!context || !container || epoch !== outfitRenderEpoch) return;
      const ranked = outfitRecommender.rank(context.candidates, context.intent, user, 6);
      context.ranked = ranked.candidates;
      if (!ranked.candidates.length) {
        container.innerHTML = `<div class="recommendation-empty">Pinterest did not return images for this look. <a href="${escapeHtml(pinterest.searchURL(context.queries[0]))}" target="_blank" rel="noopener">Open the search ↗</a></div>`;
        return;
      }
      ranked.candidates.forEach(candidate => claimedUrls.add(candidate.url));
      container.innerHTML = ranked.candidates.map((candidate, index) => {
        const saved = outfitRecommender.isSaved(user, candidate.id);
        const confidence = Math.round(candidate.score * 100);
        return `<article class="ranked-pin" data-candidate-id="${escapeHtml(candidate.id)}" style="--rank:${index + 1}">
          <button type="button" class="pin-image-button" data-outfit-action="zoom" aria-label="Zoom outfit inspiration ${index + 1}">
            <img src="${escapeHtml(candidate.url)}" data-proxy-src="${escapeHtml(proxiedImage(candidate.url))}" alt="${escapeHtml(candidate.title)}" loading="${index < 3 ? 'eager' : 'lazy'}" />
            <span class="rank-badge">#${index + 1} · ${confidence}% match</span>
          </button>
          <div class="ranked-pin-meta">
            <strong>${escapeHtml(candidate.title)}</strong>
            <span>${Math.round(candidate.textMatch * 100)}% text · ${Math.round(candidate.visualMatch * 100)}% visual · ${Math.round(candidate.collaborative * 100)}% taste</span>
          </div>
          <div class="pin-actions">
            <button type="button" data-outfit-action="save" aria-pressed="${saved}">${saved ? 'Saved' : 'Save'}</button>
            <button type="button" data-outfit-action="open">Open source ↗</button>
            <button type="button" data-outfit-action="hide">Hide</button>
          </div>
        </article>`;
      }).join('');
      container.querySelectorAll('.ranked-pin img').forEach(img => {
        const candidate = ranked.candidates.find(c => c.id === img.closest('[data-candidate-id]')?.dataset.candidateId);
        if (!candidate) return;
        const capture = () => { outfitRecommender.captureVisual(img, candidate); updateRecommenderStats(); };
        if (img.complete && img.naturalWidth) capture(); else img.addEventListener('load', capture, { once: true });
        img.addEventListener('error', () => {
          if (!img.dataset.triedProxy && img.dataset.proxySrc) {
            img.dataset.triedProxy = 'true';
            img.src = img.dataset.proxySrc;
            return;
          }
          img.closest('.ranked-pin')?.classList.add('image-failed');
        });
      });
    };

    Object.values(byDay).flat().forEach((look, flatIndex) => {
      const lookIndex = byDay[look.dayIndex].indexOf(look); const lookId = `look-${look.dayIndex}-${lookIndex}`;
      const pieces = look.items.map(it => itemQuery(it.value)).join(' ');
      const modest = profile.modesty !== 'no-preference' ? 'modest' : '';
      const itineraryDay = itin.days?.[Math.max(0, Number(look.dayIndex || 1) - 1)] || null;
      const queries = pinterest.buildQueries(trip, profile, look, itineraryDay);
      const intent = `${destination} ${trip.season || ''} ${look.theme} ${look.name} ${look.why || ''} ${pieces} ${modest} ${styleKeywords}`;
      Promise.all(queries.map(query => pinterest.searchPins(query).then(pins => pins.slice(0, 12).map((pin, resultIndex) => ({
        id: outfitRecommender.idFor(pin.image), url: pin.image, query, title: pin.title || `${look.name} · ${look.theme}`, tags: [destination, trip.season, look.name, look.theme, styleKeywords].filter(Boolean), searchUrl: pin.sourceUrl || pinterest.searchURL(query), resultIndex,
      })))))
        .then(groups => {
          if (epoch !== outfitRenderEpoch) return;
          const seen = new Set(); const candidates = groups.flat().filter(candidate => !claimedUrls.has(candidate.url) && !seen.has(candidate.url) && seen.add(candidate.url));
          pools.set(lookId, { candidates, intent, queries }); paint(lookId);
        })
        .catch(error => {
          console.warn('Outfit candidate retrieval failed:', error.message);
          pools.set(lookId, { candidates: [], intent, queries }); paint(lookId);
        });
    });

    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-outfit-action]'); if (!button) return;
      const pin = button.closest('[data-candidate-id]'); const card = button.closest('[data-look-id]');
      const context = card && pools.get(card.dataset.lookId); const candidate = context?.ranked?.find(c => c.id === pin?.dataset.candidateId);
      if (!candidate) return;
      const action = button.dataset.outfitAction;
      if (action === 'zoom') {
        pin.classList.toggle('is-zoomed'); outfitRecommender.record(user, candidate, 'zoom');
      } else if (action === 'open') {
        outfitRecommender.record(user, candidate, 'open'); window.open(candidate.searchUrl, '_blank', 'noopener');
      } else if (action === 'save') {
        outfitRecommender.record(user, candidate, outfitRecommender.isSaved(user, candidate.id) ? 'unsave' : 'save'); paint(card.dataset.lookId);
      } else if (action === 'hide') {
        outfitRecommender.record(user, candidate, 'hide'); context.candidates = context.candidates.filter(c => c.id !== candidate.id); paint(card.dataset.lookId);
      }
      updateRecommenderStats();
    });

    $('#outfits-reset-taste')?.addEventListener('click', () => {
      if (!confirm('Clear the outfit clicks and saves learned in this browser?')) return;
      outfitRecommender.clearUser(user); renderOutfits();
    });
  };

  const readPackingReq = () => {
    const me = auth.current(); const trip = activeTripFor(me.email); const f = $('#packing-form');
    return {
      destination: trip.destination, days: trip.days,
      season: f.season.value, luggage: f.luggage.value,
      laundry: f.laundry.checked, rentThere: f.rentThere.checked,
      activities: $$('[data-chips="activities"] input:checked').map(i => i.value),
    };
  };
  const renderPacking = (req) => {
    const me = auth.current();
    const trip = activeTripFor(me.email);
    const customized = Boolean(req);
    if (!req) {
      if (!trip) return;
      const defaults = { 'live-like-local':['walking-city'], 'iconic-first-visit':['walking-city','museums'],
        'relaxed-scenic':[], 'hidden-gems':['walking-city'], 'family-adventure':['walking-city'],
        'halal-food-culture':['walking-city','religious-sites'], 'luxury-without-rush':['fine-dining'] };
      const acts = defaults[trip.primaryVibe] || ['walking-city'];
      $$('[data-chips="activities"] input').forEach(i => { i.checked = acts.includes(i.value); });
      $('#packing-form select[name="season"]').value = trip.season || 'summer';
      req = readPackingReq();
    }
    // Prefer the saved live plan; the deterministic builder works for any destination.
    let result;
    if (!customized && trip?.bundle?.packing?.lists?.length) result = trip.bundle.packing;
    else result = engine.buildPacking(req, store.profile.load(me.email));
    $('#packing-output').innerHTML = `
      <div class="pack-grid">
        ${result.lists.map(l => `
          <section class="pack-list"${l.tone ? ` data-tone="${l.tone}"` : ''}>
            <h4>${escapeHtml(l.title)} <span class="count">${l.items.length}</span></h4>
            <ul>${l.items.map(it => `<li><strong>${escapeHtml(it.item)}</strong>${it.why ? `<span class="why">${escapeHtml(it.why)}</span>` : ''}</li>`).join('') || '<li class="why">Nothing to add.</li>'}</ul>
          </section>`).join('')}
      </div>
      <section class="reminders">
        <h3>Reminder timeline</h3>
        <ol>${result.reminders.map(r => `<li><span class="when">${escapeHtml(r.when)}</span><span>${escapeHtml(r.text)}</span></li>`).join('')}</ol>
      </section>`;
  };

  const renderDiscover = () => {
    const me = auth.current(); const trip = activeTripFor(me.email); if (!trip) return;
    const f = $('#discover-form');
    const ctx = { destination: trip.destination, hours: f.hours.value, weather: f.weather.value, energy: f.energy.value, party: f.party.value };
    const plans = engine.buildDiscover(ctx, store.profile.load(me.email));
    const dest = DATA.destinations.find(d => d.key === ctx.destination)?.name || ctx.destination;
    $('#discover-output').innerHTML = `
      <p class="hint" style="margin-bottom:1rem;">In ${escapeHtml(dest)} with ${escapeHtml(ctx.hours)}h and ${escapeHtml(ctx.weather)} weather.</p>
      <div class="plans">
        ${plans.map(p => `
          <article class="plan">
            <header><h4>${escapeHtml(p.title)}</h4><span class="badge">${escapeHtml(p.badge)}</span></header>
            <p class="plan-why">${escapeHtml(p.why)}</p>
            <ol>${p.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
          </article>`).join('')}
      </div>`;
  };

  const renderLocal = () => {
    const me = auth.current(); const trip = activeTripFor(me.email); if (!trip) return;
    const f = $('#local-form');
    const ctx = { destination: trip.destination, category: f.category.value, mix: $$('[data-chips="local-mix"] input:checked').map(i => i.value) };
    const basePlaces = (trip.bundle && trip.bundle.local && trip.bundle.local.length)
      ? trip.bundle.local
      : engine.buildLocal(ctx);
    const selectedMix = new Set(ctx.mix || []);
    const places = basePlaces.filter((place) => {
      const category = place.cat || place.category || 'all';
      const mix = place.mix || 'neighborhood';
      return (ctx.category === 'all' || category === ctx.category)
        && (!selectedMix.size || selectedMix.has(mix));
    });
    $('#local-output').innerHTML = places.length ? `
      <div class="places">
        ${places.map(p => {
          const sourceUrl = safeExternalUrl(p.sourceUrl);
          const reviewUrl = safeExternalUrl(p.reviewSourceUrl);
          const evidence = [
            p.businessSize && p.businessSize !== 'unknown' ? p.businessSize.replace('-', ' ') : '',
            p.rating != null && p.rating !== '' && Number.isFinite(Number(p.rating)) ? `★ ${Number(p.rating).toFixed(1)}` : '',
            p.reviewCount != null && p.reviewCount !== '' && Number.isFinite(Number(p.reviewCount)) ? `${Number(p.reviewCount).toLocaleString()} reviews` : '',
            p.checkedAt ? `checked ${p.checkedAt}` : '',
          ].filter(Boolean);
          return `
          <article class="place" data-mix="${escapeHtml(p.mix || 'neighborhood')}">
            <header><h4>${escapeHtml(p.name)}</h4><span class="type">${escapeHtml(String(p.mix || 'neighborhood').replace('-', ' '))}</span></header>
            <p class="sub">${escapeHtml(p.sub)}</p>
            <p class="score">${escapeHtml(p.gemScore)}</p>
            ${p.reviewSummary ? `<p class="place-review">${escapeHtml(p.reviewSummary)}</p>` : ''}
            ${evidence.length || sourceUrl || reviewUrl ? `<div class="place-evidence">${evidence.map(v => `<span>${escapeHtml(v)}</span>`).join('')}${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Source ↗</a>` : ''}${reviewUrl && reviewUrl !== sourceUrl ? `<a href="${escapeHtml(reviewUrl)}" target="_blank" rel="noopener">Reviews ↗</a>` : ''}</div>` : ''}
            <span class="traffic">${escapeHtml(p.trafficNote)}</span>
          </article>`;
        }).join('')}
      </div>` : `<p class="hint">Nothing matched — expand the filters.</p>`;
  };

  const renderExpect = () => {
    const me = auth.current(); const trip = activeTripFor(me.email); if (!trip) return;
    const items = (trip.bundle && trip.bundle.expect && trip.bundle.expect.length)
      ? trip.bundle.expect
      : engine.buildExpect(trip.destination);
    $('#expect-kicker').textContent = destMetaFor(trip).culturalNote || '';
    $('#expect-output').innerHTML = `
      <div class="expect-grid">
        ${items.map(x => `
          <section class="expect-card">
            <h4>${escapeHtml(x.label)}</h4>
            <p>${escapeHtml(x.text)}</p>
            <div class="expect-meta">
              <span>Confidence ${escapeHtml(x.confidence)}</span>
              <span>Updated ${escapeHtml(x.updated)}</span>
              <span>Source ${escapeHtml(x.source)}</span>
            </div>
          </section>`).join('')}
      </div>`;
  };

  const renderMembers = () => {
    const me = auth.current(); const members = store.group.load(me.email);
    $('#members-list').innerHTML = members.length ? members.map(m => `
      <li class="member">
        <header>
          <strong>${escapeHtml(m.name)}</strong>
          <span class="age">${escapeHtml(m.ageBand)}</span>
          <button class="remove" data-id="${m.id}">Remove</button>
        </header>
        <div class="cons">${(m.constraints || []).length ? escapeHtml(m.constraints.join(', ')) : '<span class="hint">no personal constraints listed</span>'}</div>
        ${m.vibe ? `<div class="hint">Prefers: ${escapeHtml(DATA.VIBES.find(v => v.key === m.vibe)?.title || m.vibe)}</div>` : ''}
      </li>`).join('') : `<li class="hint">No members yet.</li>`;
    renderTally(members);
  };
  const renderTally = (members) => {
    const wrap = $('#vote-tally'); const summary = $('#shared-summary');
    const { winner, blend, votes } = engine.blendGroupVibes(members);
    const rows = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((n, [, c]) => n + c, 0) || 1;
    wrap.innerHTML = rows.length ? rows.map(([k, c]) => {
      const label = DATA.VIBES.find(v => v.key === k)?.title || k;
      const pct = Math.round((c / total) * 100);
      return `<div class="row">
          <span class="name">${escapeHtml(label)}</span>
          <span class="name">${c}</span>
          <span class="bar"><span style="width:${pct}%"></span></span>
        </div>`;
    }).join('') : `<p class="hint">Nobody has picked a preferred vibe yet.</p>`;
    const constraints = engine.consolidateConstraints(members);
    if (!winner) summary.innerHTML = 'Add members with preferred vibes to see the shared direction.';
    else {
      const w = DATA.VIBES.find(v => v.key === winner)?.title || winner;
      const b = blend ? (DATA.VIBES.find(v => v.key === blend)?.title || blend) : null;
      summary.innerHTML = `Shared vibe: <strong>${escapeHtml(w)}</strong>${b ? ` blended with <strong>${escapeHtml(b)}</strong>` : ''}. Every plan will also respect: ${constraints.length ? escapeHtml(constraints.join(', ')) : 'no group-wide constraints yet'}.`;
    }
  };
  const renderJournal = () => {
    const me = auth.current(); const entries = store.journal.load(me.email);
    $('#journal-list').innerHTML = entries.map(e => `
      <li class="entry">
        <h5>${escapeHtml(e.title)}</h5>
        ${e.did    ? `<p><strong>Did.</strong> ${escapeHtml(e.did)}</p>` : ''}
        ${e.change ? `<p><strong>Change.</strong> ${escapeHtml(e.change)}</p>` : ''}
        <div class="meta">
          ${e.accessAccuracy ? `<span>Access: ${escapeHtml(e.accessAccuracy)}</span>` : ''}
          ${e.dietAccuracy   ? `<span>Dietary: ${escapeHtml(e.dietAccuracy)}</span>`   : ''}
          <span>${e.publicEntry ? 'Public' : 'Private'}</span>
        </div>
        <div class="entry-actions">
          <button type="button" class="text-button" data-journal-action="visibility" data-public="${String(Boolean(e.publicEntry))}" data-id="${escapeHtml(e.id)}">${e.publicEntry ? 'Make private' : 'Publish'}</button>
          <button type="button" class="text-button" data-journal-action="remove" data-id="${escapeHtml(e.id)}">Remove entry</button>
        </div>
      </li>`).join('');
  };

  // Route handler for signed-in dashboard
  const showRoute = () => {
    if ((location.hash || '').startsWith('#/community') || location.hash === '#/auth') { route(); return; }
    if ($('#screen-app').hidden) return;
    const me = auth.current(); if (!me) return;

    const raw = (location.hash || '#/chat').replace(/^#\/?/, '').split('?')[0] || 'chat';
    const known = ['chat','itinerary','outfits','packing','expect','discover','local','group'];
    const name = known.includes(raw) ? raw : 'chat';

    // If routing to a trip page but no trip active, redirect to chat.
    const trip = activeTripFor(me.email);
    const tripPage = ['itinerary','outfits','packing','expect','discover','local','group'].includes(name);
    if (tripPage && !trip) {
      history.replaceState(null, '', '#/chat');
      return showRoute();
    }

    $$('.page').forEach(p => p.hidden = p.dataset.page !== name);
    $$('#trip-side-nav a').forEach(a => a.classList.toggle('is-active', a.dataset.route === name));

    if (name === 'itinerary') renderItinerary();
    if (name === 'outfits')   renderOutfits();
    if (name === 'packing')   renderPacking(null);
    if (name === 'expect')    renderExpect();
    if (name === 'discover')  renderDiscover();
    if (name === 'local')     renderLocal();
    if (name === 'group')     { renderMembers(); renderJournal(); }

    renderSidebar(me);
    document.querySelector('.content').scrollTo?.(0, 0);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const route = () => {
    // Public community is always accessible
    if ((location.hash || '').startsWith('#/community')) {
      renderCommunity(); showScreen('public'); return;
    }
    const me = auth.current();
    if (!me) { showScreen('auth'); return; }

    // Migrate legacy single-trip storage
    store.migrate(me.email);

    // Signed in — always land in the app shell. Chat page if no active trip, else routed page.
    if (!location.hash || location.hash === '#/auth') {
      const trip = activeTripFor(me.email);
      history.replaceState(null, '', trip ? '#/itinerary' : '#/chat');
    }
    renderSidebar(me);
    showScreen('app');
    showRoute();
  };

  return {
    boot: async () => {
      applyTheme();
      initAuth();
      initChat();
      initPublic();
      initApp();
      autosizeTextarea();
      window.addEventListener('malem:sync-error', (event) => {
        console.warn('Malem state sync failed:', event.detail);
        flash('#global-status', 'Your latest change is saved on this device and will sync when the connection returns.');
      });
      window.addEventListener('pagehide', () => { auth.flush(); });
      ai.refreshOpenRouterStatus().then(() => updateChatHint());
      window.addEventListener('hashchange', route);
      try {
        await auth.init();
      } catch (error) {
        flash('#auth-note', error.message || 'The account service is unavailable.');
      }
      route();
    },
  };
})();

if (location.protocol === 'file:') {
  const servedUrl = `http://localhost:8000/${location.hash || '#/chat'}`;
  document.body.innerHTML = `<main class="server-required">
    <p class="eyebrow">Server required</p>
    <h1>Opening the live version of Malem…</h1>
    <p>The secure OpenRouter workflow cannot run from a <code>file://</code> page.</p>
    <p><a class="btn primary" href="${servedUrl}">Open Malem at localhost:8000</a></p>
  </main>`;
  location.replace(servedUrl);
} else {
  document.addEventListener('DOMContentLoaded', ui.boot);
}
