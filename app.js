/* malem — dependency-free. Modules: store, data, engine, auth, parser, ai, ui. */

// ---------- store ----------
const store = (() => {
  const K = {
    session: 'malem.session.v1',
    accounts: 'malem.accounts.v1',
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
  const readJSON = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };

  const emptyProfile = () => ({
    version: 1,
    vibes: [], budget: 'mid', pace: 'balanced',
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
    save: (e, arr) => localStorage.setItem(K.trips(e), JSON.stringify(arr)),
    add:  (e, trip) => {
      const arr = readJSON(K.trips(e), []);
      const t = { id: trip.id || nextId(), createdAt: trip.createdAt || Date.now(), ...trip };
      arr.push(t); localStorage.setItem(K.trips(e), JSON.stringify(arr));
      return t;
    },
    update: (e, id, patch) => {
      const arr = readJSON(K.trips(e), []);
      const index = arr.findIndex(t => t.id === id);
      if (index < 0) return null;
      arr[index] = { ...arr[index], ...patch, updatedAt: Date.now() };
      localStorage.setItem(K.trips(e), JSON.stringify(arr));
      return arr[index];
    },
    remove: (e, id) => {
      const arr = readJSON(K.trips(e), []).filter(t => t.id !== id);
      localStorage.setItem(K.trips(e), JSON.stringify(arr));
    },
  };
  const activeTrip = {
    get: (e) => readJSON(K.activeTrip(e), null),
    set: (e, id) => localStorage.setItem(K.activeTrip(e), JSON.stringify(id)),
    clear: (e) => localStorage.removeItem(K.activeTrip(e)),
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
  };

  return {
    emptyProfile,
    session: { get: () => readJSON(K.session, null), set: (s) => localStorage.setItem(K.session, JSON.stringify(s)), clear: () => localStorage.removeItem(K.session) },
    accounts: { all: () => readJSON(K.accounts, {}), save: (m) => localStorage.setItem(K.accounts, JSON.stringify(m)) },
    profile: {
      load: (e) => ({ ...emptyProfile(), ...(readJSON(K.profile(e), {}) || {}) }),
      save: (e, v) => localStorage.setItem(K.profile(e), JSON.stringify(v)),
      clear: (e) => localStorage.removeItem(K.profile(e)),
    },
    trips, activeTrip, migrate,
    group:  { load: (e) => readJSON(K.group(e), []),   save: (e, g) => localStorage.setItem(K.group(e), JSON.stringify(g)),  clear: (e) => localStorage.removeItem(K.group(e)) },
    journal:{ load: (e) => readJSON(K.journal(e), []), save: (e, j) => localStorage.setItem(K.journal(e), JSON.stringify(j)), clear: (e) => localStorage.removeItem(K.journal(e)) },
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
      openrouterKey:   { get: () => localStorage.getItem('malem.openrouterKey.v1') || '',
                         set: (k) => k ? localStorage.setItem('malem.openrouterKey.v1', k) : localStorage.removeItem('malem.openrouterKey.v1') },
      openrouterModel: { get: () => {
                           const saved = localStorage.getItem('malem.openrouterModel.v1') || '';
                           return saved === 'google/gemini-3.5-flash' ? 'openrouter/auto' : (saved || 'openrouter/auto');
                         },
                         set: (m) => m ? localStorage.setItem('malem.openrouterModel.v1', m) : localStorage.removeItem('malem.openrouterModel.v1') },
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
    const stop = '(?=\\s+(?:for|with|from|on|next|this|during|because|and\\s+(?:i|we|my|our))\\b|[,;.!?]|$)';
    const patterns = [
      new RegExp('\\b(?:go(?:ing)?|travel(?:l)?ing|head(?:ing)?|fly(?:ing)?|visit(?:ing)?|vacation(?:ing)?)\\s+(?:to|in)\\s+([a-z][a-z .\\\'-]{1,48}?)' + stop, 'i'),
      new RegExp('\\b(?:trip|vacation|weekend)\\s+(?:to|in)\\s+([a-z][a-z .\\\'-]{1,48}?)' + stop, 'i'),
      new RegExp('\\b(?:to|in)\\s+([a-z][a-z .\\\'-]{1,48}?)' + stop, 'i'),
    ];
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match && slugifyPlace(match[1])) return match[1].trim();
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
    if (/\bcane\b|\bcanes\b|\bwalker\b/.test(t))                  { prefs.accessibility.seatingBreaks = true; inferred.push('frequent seating'); }
    if (/\blow vision\b|\bblind\b|\bvisually\s+impaired\b/.test(t)) { prefs.accessibility.lowVision = true; inferred.push('low-vision'); }
    if (/\bdeaf\b|\bhearing\s+impaired\b|\blow hearing\b/.test(t)) { prefs.accessibility.lowHearing = true; inferred.push('low-hearing'); }

    // Modesty
    if (/\bmodest\b/.test(t))         { prefs.modesty = 'modest';       inferred.push('modest'); }
    if (/\bconservative\b/.test(t))   { prefs.modesty = 'conservative'; inferred.push('conservative'); }

    // Medical
    const medMatch = t.match(/\b(insulin|cpap|epipen|epi[\s-]?pen|nebulizer|inhaler)\b/);
    if (medMatch) { prefs.medical.medications = medMatch[1]; inferred.push(medMatch[1]); }

    // Budget
    if (/\bluxury\b|\b5[\s-]?star\b|\bhigh[\s-]?end\b/.test(t))        prefs.budget = 'luxury';
    else if (/\bcomfort\b|\bnice hotel\b/.test(t))                     prefs.budget = 'comfort';
    else if (/\bshoestring\b|\bbudget\b|\bbackpack/.test(t))           prefs.budget = 'shoestring';
    else if (/\bmedium\b|\bmid[\s-]?range\b|\bmiddle\b/.test(t))       prefs.budget = 'mid';

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
    return p;
  };

  return { parseTrip, mergeProfile };
})();

// ---------- ai: OpenAI + Anthropic wrappers ----------
const ai = (() => {
  const hasOpenAI = () => !!store.ai.openaiKey.get();
  const hasClaude = () => !!store.ai.claudeKey.get();
  const hasOpenRouter = () => !!store.ai.openrouterKey.get();
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

  // OpenRouter (OpenAI-compatible, CORS-friendly, routes to any model).
  const openRouterJSON = async ({ model, system, user, maxTokens, web = false }) => {
    const key = store.ai.openrouterKey.get();
    if (!key) throw new Error('No OpenRouter key set.');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': location.origin,
        'X-Title': 'malem',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: maxTokens || 1024,
        ...(web ? { plugins: [{ id: 'web' }] } : {}),
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300);
      if (res.status === 401) throw new Error('OpenRouter 401 — that key is invalid. Re-check it in Settings.');
      if (res.status === 402) throw new Error('OpenRouter 402 — out of credits. Top up at openrouter.ai/credits.');
      if (res.status === 429) throw new Error('OpenRouter 429 — rate-limited; wait a moment and retry.');
      throw new Error(`OpenRouter HTTP ${res.status} — ${body}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('OpenRouter returned no JSON object.');
    return JSON.parse(m[0]);
  };

  const askOpenRouter = (userInput) =>
    openRouterJSON({ model: store.ai.openrouterModel.get(), system: SYSTEM_PROMPT, user: userInput, maxTokens: 1024 });

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

  // OpenRouter: the supported web plugin works with fixed models and routers.
  const generateViaOpenRouter = (trip, profile, weatherObj) => {
    const base = store.ai.openrouterModel.get();
    const model = base.replace(/:online$/, '');
    return openRouterJSON({ model, system: GEN_SYSTEM, user: buildGenUser(trip, profile, weatherObj), maxTokens: 12000, web: true });
  };

  const generateTrip = async (trip, profile, weatherObj) => {
    const p = provider();
    if (p === 'openrouter') return await generateViaOpenRouter(trip, profile, weatherObj);
    if (p === 'claude') return await generateViaClaude(trip, profile, weatherObj);
    if (p === 'openai') return await generateViaOpenAI(trip, profile, weatherObj);
    return null;
  };

  // Legacy alias
  const hasKey = enabled;

  return { enabled, hasKey, hasOpenAI, hasClaude, hasOpenRouter, provider, parseTripViaGPT, generateTrip };
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

// ---------- pinterest: search Pinterest for outfit inspo (no login, no board) ----------
// Uses Pinterest's public search URL, scraped through a chain of CORS proxies.
// Falls back gracefully to Unsplash-by-keyword when Pinterest is unreachable.
const pinterest = (() => {
  const CORS_PROXIES = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];

  // Compose a Pinterest search query from the trip and (optionally) a specific look.
  // Example: "Istanbul modest summer evening outfit inspiration".
  const buildQuery = (trip, profile, look) => {
    const destName = (trip.bundle?.destinationMeta?.name || DATA.destinations.find(d => d.key === trip.destination)?.name || trip.destination || '').toString().toLowerCase();
    const season = trip.season || '';
    const modest = profile.modesty !== 'no-preference' ? 'modest' : '';
    const evening = look && String(look.name || look).toLowerCase().includes('evening');
    const timeOfDay = evening ? 'evening' : 'daytime';
    const extra = store.pinterest.extraKeywords.get();
    const lookName = look && String(look.name || look.look || '').toLowerCase();
    const theme = look && String(look.theme || '').toLowerCase();
    const day = look && look.dayIndex ? `day ${look.dayIndex}` : '';
    const parts = [destName, modest, season, day, theme, lookName, timeOfDay, 'outfit', 'inspiration'];
    if (extra) parts.push(extra);
    return parts.filter(Boolean).join(' ');
  };

  const fetchThroughProxy = async (targetUrl) => {
    let lastErr;
    for (const build of CORS_PROXIES) {
      try {
        const res = await fetch(build(targetUrl), {
          headers: { 'Accept': 'text/html,application/xhtml+xml,*/*' },
        });
        if (!res.ok) { lastErr = new Error(`Proxy HTTP ${res.status}`); continue; }
        const text = await res.text();
        if (text && text.length > 200) return text;
        lastErr = new Error('Empty response from proxy');
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('All CORS proxies failed.');
  };

  // Pull Pinterest CDN image URLs out of the HTML.
  const extractPinImagesFromHTML = (html) => {
    const set = new Set();
    // Pinterest commonly embeds URLs inside JSON where slashes are escaped.
    const normalized = String(html || '')
      .replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    // Direct references to i.pinimg.com (Pinterest's image CDN).
    const patterns = [
      /https:\/\/i\.pinimg\.com\/[0-9]+x\/[a-z0-9\/]+\.(?:jpg|jpeg|png|webp)/gi,
      /https:\/\/i\.pinimg\.com\/originals\/[a-z0-9\/]+\.(?:jpg|jpeg|png|webp)/gi,
    ];
    patterns.forEach(p => { (normalized.match(p) || []).forEach(u => set.add(u)); });
    // Upscale small results (Pinterest serves multiple sizes at the same path).
    return [...set].map(u => u.replace(/\/236x\//, '/474x/').replace(/\/60x60_RS\//, '/474x/'));
  };

  const searchURL = (query) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;

  // Cache per query so we don't re-fetch on every render.
  const _cache = new Map(); // query -> Promise<string[]>
  const searchPins = (query) => {
    if (!query) return Promise.resolve([]);
    if (_cache.has(query)) return _cache.get(query);
    const p = fetch(`/api/pinterest?q=${encodeURIComponent(query)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`Pinterest endpoint HTTP ${r.status}`);
        const data = await r.json();
        if (!data.images?.length) throw new Error('Pinterest endpoint returned no images');
        return data.images;
      })
      .catch(() => fetchThroughProxy(searchURL(query)).then(extractPinImagesFromHTML))
      .catch((err) => { console.warn('Pinterest search failed:', err.message); return []; });
    _cache.set(query, p);
    return p;
  };
  const clearCache = () => _cache.clear();

  return { buildQuery, searchPins, searchURL, clearCache };
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
    const list = DATA.places[ctx.destination] || [];
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
    const e = DATA.expectations[destinationKey]; if (!e) return [];
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
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); };

  const signup = (name, email, password) => {
    email = (email || '').trim().toLowerCase();
    if (!email || !password) throw new Error('Email and password required.');
    const map = store.accounts.all();
    if (map[email]) throw new Error('An account with that email already exists here.');
    map[email] = { name: (name || email.split('@')[0]).trim(), hash: hash(password) };
    store.accounts.save(map); store.session.set({ email }); return map[email];
  };
  const signin = (email, password) => {
    email = (email || '').trim().toLowerCase();
    const acc = store.accounts.all()[email];
    if (!acc || acc.hash !== hash(password)) throw new Error('That email and password combination does not match an account here.');
    store.session.set({ email }); return acc;
  };
  const signout = () => store.session.clear();
  const current = () => {
    const s = store.session.get(); if (!s) return null;
    const acc = store.accounts.all()[s.email];
    return acc ? { email: s.email, ...acc } : null;
  };

  const useDemo = () => {
    const email = 'amina.demo@malem.app';
    const map = store.accounts.all();
    if (!map[email]) { map[email] = { name: 'Amina', hash: hash('demo1234') }; store.accounts.save(map); }
    store.profile.save(email, {
      version: 1,
      vibes: ['local', 'food-focused', 'family-friendly'],
      budget: 'comfort', pace: 'balanced',
      dietary: { halal: true, kosher: false, vegan: false, vegetarian: false, glutenFree: false, allergies: ['peanuts'], other: 'no pork' },
      accessibility: { stepFree: true, lowVision: false, lowHearing: false, seatingBreaks: true, notes: 'occasional wheelchair user (Nour)' },
      religiousCultural: 'Prefers to keep afternoon prayer window; Fridays quieter.',
      modesty: 'modest',
      medical: { devices: 'CPAP machine', medications: 'Insulin (refrigerated)', reminderCadence: 'twice-daily' },
      family:  { childrenAges: [5, 9], babyOnBoard: false, notes: 'nap window 14:30–15:30 for the 5-year-old' },
      avoid: ['crowded nightclubs', 'extreme heights'],
    });
    store.group.save(email, [
      { id: 'demo-1', name: 'Amina', ageBand: 'adult', constraints: ['halal','modest'], vibe: 'halal-food-culture' },
      { id: 'demo-2', name: 'Yusuf', ageBand: 'adult', constraints: ['halal'],           vibe: 'live-like-local' },
      { id: 'demo-3', name: 'Nour',  ageBand: 'adult', constraints: ['step-free','seating breaks','halal'], vibe: 'relaxed-scenic' },
      { id: 'demo-4', name: 'Lena',  ageBand: 'child', constraints: ['peanut allergy'],  vibe: 'family-adventure' },
      { id: 'demo-5', name: 'Tariq', ageBand: 'child', constraints: ['nap 14:30'],       vibe: 'family-adventure' },
    ]);
    store.journal.save(email, [{
      id: 'demo-j1',
      title: 'Istanbul, day 2 — Balat and the ferry',
      did: 'Swapped Topkapı queue for a Balat morning walk and a Kadıköy ferry lunch. Kids loved the ferry.',
      change: 'Skip Grand Bazaar mid-day; do it near opening.',
      accessAccuracy: 'as-listed', dietAccuracy: 'better', publicEntry: true,
    }]);
    // Seed a trip, activate it.
    const trip = store.trips.add(email, {
      destination: 'istanbul', arrivalDate: '', days: 4, travelers: 5,
      primaryVibe: 'halal-food-culture', season: 'summer',
      summary: 'Halal food & culture in Istanbul',
    });
    store.activeTrip.set(email, trip.id);
    store.session.set({ email });
  };

  return { signup, signin, signout, current, useDemo };
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
      $('#auth-lede').textContent  = isSignup ? 'Prototype accounts are stored in this browser.' : "Sign in and tell malem where you're heading.";
      $('#auth-submit').textContent = isSignup ? 'Create account' : 'Sign in';
      $('#auth-tag').textContent = isSignup ? 'Sign up' : 'Sign in';
      $('#auth-switch').innerHTML = isSignup
        ? 'Already have an account? <a href="#" id="auth-toggle">Sign in</a>'
        : 'New here? <a href="#" id="auth-toggle">Create an account</a>';
      form.password.autocomplete = isSignup ? 'new-password' : 'current-password';
      $('#auth-toggle').addEventListener('click', (e) => { e.preventDefault(); setMode(isSignup ? 'signin' : 'signup'); });
    };
    $('#auth-toggle').addEventListener('click', (e) => { e.preventDefault(); setMode('signup'); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        if (authMode === 'signup') auth.signup(form.name.value, form.email.value, form.password.value);
        else auth.signin(form.email.value, form.password.value);
        location.hash = '#/chat';
        route();
      } catch (err) { flash('#auth-note', err.message || 'Something went wrong.'); }
    });
    $('#try-demo-account').addEventListener('click', (e) => {
      e.preventDefault(); auth.useDemo();
      location.hash = '#/itinerary';
      route();
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

    // 1) Parse the message into a trip request + profile preferences.
    const parseText = pendingTripText ? `${pendingTripText}\n${text}` : text;
    let result = null;
    let parseError = null;
    if (ai.enabled()) {
      try {
        const gpt = await ai.parseTripViaGPT(parseText);
        result = { trip: gpt.trip, prefs: gpt.profile, reply: gpt.reply, missing: gpt.missing || [], inferred: [] };
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

    // 3) Generate the full, web-grounded, weather-aware, personalized plan (Claude only).
    let wx = null, bundle = null, genError = null;
    const destGuess = titleCase(result.trip.destination);
    setPendingMessage(`Checking live weather for ${destGuess}…`);
    try { wx = await weather.forecast(result.trip.destination, result.trip.days); }
    catch (e) { console.warn('weather lookup failed', e); }
    if (ai.enabled()) {
      setPendingMessage(`Researching ${destGuess} — real places, this week's live weather, and your profile. This can take up to a minute…`);
      try { bundle = await ai.generateTrip(result.trip, merged, wx); }
      catch (e) { console.error('trip generation failed', e); genError = e; }
    }

    removePendingMessage();

    // 4) Save the trip with its live weather + generated bundle (when available).
    const staticDest = DATA.destinations.find(d => d.key === result.trip.destination);
    const vibe = DATA.VIBES.find(v => v.key === result.trip.primaryVibe);
    const destName = bundle?.destinationMeta?.name || staticDest?.name || destGuess;
    const summary = `${vibe ? vibe.title : 'Trip'} in ${destName}`;
    const trip = store.trips.add(me.email, { ...result.trip, summary, weather: wx, bundle });
    store.activeTrip.set(me.email, trip.id);

    // 5) Reply, tuned to what actually happened.
    let replyText;
    if (bundle) {
      replyText = `Done — I built your ${destName} plan from real places and this week's forecast, shaped around your profile. Open it below.`;
    } else if (ai.enabled()) {
      replyText = `I saved your ${destName} trip, but the plan didn't finish generating${genError ? ` (${String(genError.message || genError).slice(0, 140)})` : ' (network or key issue)'}. Check your API key in Settings, then start the trip again.`;
    } else if (staticDest) {
      replyText = result.reply || `Saved your ${destName} trip with live Open-Meteo weather. Add an OpenRouter, OpenAI, or Anthropic API key in Settings for current web-researched places and reviews.`;
    } else {
      replyText = `I saved your ${destName} trip with live weather. To add current places and reviews, connect OpenRouter, OpenAI, or Anthropic in Settings.`;
    }
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
      const bundle = await ai.generateTrip(trip, profile, wx);
      const updated = store.trips.update(me.email, trip.id, {
        weather: wx, bundle, researchUpdatedAt: new Date().toISOString(),
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
        <span class="stamp">${trip.bundle ? 'Live plan ready' : 'Trip saved'}</span>
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
    if (p === 'claude')      el.innerHTML = 'Powered by Claude (<a href="#" id="chat-settings-link-2">change</a>).';
    else if (p === 'openai') el.innerHTML = 'Powered by GPT (<a href="#" id="chat-settings-link-2">change</a>).';
    else                     el.innerHTML = 'Powered by a local parser. <a href="#" id="chat-settings-link-2">Add an OpenAI or Claude key</a> to switch to AI.';
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
  const getCommunityEntries = () => {
    const seeds = (DATA.communityEntries || []).map(e => ({ ...e, source: 'seed' }));
    const localAccounts = store.accounts.all();
    const local = [];
    Object.entries(localAccounts).forEach(([email, acc]) => {
      const journal = store.journal.load(email);
      const trip = store.trips.load(email).slice().reverse()[0]; // most recent trip
      journal.filter(x => x.publicEntry).forEach(x => {
        local.push({
          id: `local-${email}-${x.id}`,
          authorName: acc.name || email.split('@')[0],
          destination: trip?.destination || 'unknown',
          date: x.date || '',
          title: x.title, did: x.did, change: x.change,
          accessAccuracy: x.accessAccuracy, dietAccuracy: x.dietAccuracy,
          tags: [], source: 'local',
        });
      });
    });
    return [...seeds, ...local].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
  const renderCommunity = () => {
    const me = auth.current();
    const btn = $('#public-signin');
    if (me) { btn.textContent = 'Back to your trip'; btn.setAttribute('href', '#/itinerary'); }
    else    { btn.textContent = 'Sign in';           btn.setAttribute('href', '#/auth'); }

    const dest = $('#public-filter-dest').value;
    const tag  = $('#public-filter-tag').value;
    let entries = getCommunityEntries();
    if (dest !== 'all') entries = entries.filter(e => e.destination === dest);
    if (tag  !== 'all') entries = entries.filter(e => (e.tags || []).includes(tag));
    const root = $('#public-entries');
    if (!entries.length) { root.innerHTML = `<p class="hint">Nothing yet in that view. Try another filter.</p>`; return; }
    root.innerHTML = entries.map(e => {
      const destName = DATA.destinations.find(d => d.key === e.destination)?.name || e.destination;
      return `
        <article class="pub-entry">
          <div class="head">
            <div>
              <h3>${escapeHtml(e.title)}${e.source === 'local' ? '<span class="badge-local">Yours</span>' : ''}</h3>
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
      if (!confirm('Clear your saved profile? Local only.')) return;
      store.profile.clear(me.email); writeProfileForm(store.emptyProfile());
      flash('#save-note', 'Profile cleared.');
    };
  };

  // ---- Settings sheet (connected accounts) ----
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

  const openSettings = () => {
    const f = $('#settings-form');
    f.openrouterKey.value   = store.ai.openrouterKey.get();
    f.openrouterModel.value = store.ai.openrouterModel.get();
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

    $('#sheet-settings').hidden = false;
    const close = () => $('#sheet-settings').hidden = true;
    $$('#sheet-settings [data-close-sheet]').forEach(el => el.addEventListener('click', close, { once: true }));

    $('#save-settings').onclick = () => {
      store.ai.openrouterKey.set(f.openrouterKey.value.trim());
      store.ai.openrouterModel.set(f.openrouterModel.value.trim());
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
      const p = ai.provider();
      flash('#settings-note', 'Saved.' + (p ? ` AI active (${p}).` : ' No AI configured; local parser.'));
      updateChatHint();
    };
  };

  // ---- App shell + routing ----
  const initApp = () => {
    $('#btn-new-trip').addEventListener('click', startNewTrip);
    $('#btn-community').addEventListener('click', () => { location.hash = '#/community'; });
    $('#btn-profile').addEventListener('click', openProfileSheet);
    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-signout').addEventListener('click', () => { auth.signout(); location.hash = ''; route(); });
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
      };
      const list = store.journal.load(me.email); list.push(entry); store.journal.save(me.email, list);
      f.reset(); renderJournal(); flash('#journal-note', 'Entry saved.');
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
    const itin = (trip.bundle && trip.bundle.itinerary && trip.bundle.itinerary.days) ? trip.bundle.itinerary : engine.buildItinerary(trip, profile);
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

  // Flat-lay slots (percent of board) per wardrobe part — a Shuffles-style collage.
  const OUTFIT_SLOTS = {
    Top:       { left: 4,  top: 3,  w: 46, rot: -3, z: 3 },
    Outer:     { left: 48, top: 1,  w: 45, rot: 4,  z: 2 },
    Bottom:    { left: 46, top: 37, w: 40, rot: 2,  z: 1 },
    Shoes:     { left: 3,  top: 58, w: 38, rot: -5, z: 4 },
    Accessory: { left: 60, top: 60, w: 30, rot: 6,  z: 5 },
  };
  // Concise product query from a verbose look value ("Cotton tee or linen shirt" -> "Cotton tee").
  const itemQuery = (v) => String(v || '').split(/\bor\b/i)[0].replace(/,.*$/, '').trim();

  const renderOutfits = () => {
    const me = auth.current(); const trip = activeTripFor(me.email); const profile = store.profile.load(me.email);
    if (!trip) return;
    const itin = (trip.bundle && trip.bundle.itinerary && trip.bundle.itinerary.days) ? trip.bundle.itinerary : engine.buildItinerary(trip, profile);
    const { looks } = engine.buildOutfits(itin, profile, trip.season || 'summer', trip.destination, trip);

    $('#outfits-source').innerHTML = imageSearch.hasKeys()
      ? `Each day uses a distinct search built from its activities, look, weather, and destination, with real product photos.`
      : `Each day uses its own Pinterest inspiration search, with keyless fashion photos shown immediately. Add a Google image-search key in <a href="#" id="outfits-settings-link">Settings</a> for more product-specific results.`;

    const byDay = {};
    looks.forEach(l => { (byDay[l.dayIndex] ||= []).push(l); });
    const root = $('#outfits-output');

    root.innerHTML = Object.keys(byDay).map(k => {
      const dayLooks = byDay[k]; const first = dayLooks[0];
      return `
        <div class="outfit-day-head">
          <h3>Day ${escapeHtml(k)}${first.date ? ` <span class="hint" style="font-family:var(--font-sans);font-size:.85rem;margin-left:.5rem;">${escapeHtml(first.date)}</span>` : ''}</h3>
          <p class="theme">${escapeHtml(first.theme)}</p>
        </div>
        <div class="shuffle-grid">
          ${dayLooks.map((look, lookIndex) => {
            const pinQuery = pinterest.buildQuery(trip, profile, look);
            const search = pinterest.searchURL(pinQuery);
            const lookId = `look-${look.dayIndex}-${lookIndex}`;
            const board = look.items.map((it, itemIndex) => {
              const slot = OUTFIT_SLOTS[it.part] || { left: 30, top: 32, w: 36, rot: 0, z: 1 };
              const q = itemQuery(it.value);
              const imageQuery = [trip.destination, `day ${look.dayIndex}`, look.theme, look.name, q, it.part, 'fashion product'].filter(Boolean).join(' ');
              const lock = (look.dayIndex * 100) + (lookIndex * 10) + itemIndex + 1;
              const fallback = proxiedImage(engine.stockURL([look.name, it.part, q, trip.destination], 520, 620, lock));
              return `
                <div class="shuffle-item hasimg" style="left:${slot.left}%;top:${slot.top}%;width:${slot.w}%;--rot:${slot.rot}deg;z-index:${slot.z};">
                  <img src="${escapeHtml(fallback)}" data-fallback="${escapeHtml(fallback)}" data-q="${escapeHtml(imageQuery)}" alt="${escapeHtml(it.value)}" loading="lazy" />
                  <span class="chip"><span class="k">${escapeHtml(it.part)}</span>${escapeHtml(q)}</span>
                </div>`;
            }).join('');
            const itemsList = look.items.map(it => `<li><span class="k">${escapeHtml(it.part)}</span><span>${escapeHtml(it.value)}</span></li>`).join('');
            return `
              <article class="shuffle-card" data-look-id="${escapeHtml(lookId)}" data-pin-query="${escapeHtml(pinQuery)}">
                <div class="shuffle-board">
                  ${board}
                  <a class="shuffle-pin" href="${escapeHtml(search)}" target="_blank" rel="noopener" title="Find similar on Pinterest">Pinterest ↗</a>
                </div>
                <div class="shuffle-caption">
                  <span class="eyebrow">${escapeHtml(look.name)}</span>
                  <ul class="look-items">${itemsList}</ul>
                  ${look.why ? `<div class="meta">${escapeHtml(look.why)}</div>` : ''}
                </div>
              </article>`;
          }).join('')}
        </div>`;
    }).join('');

    const sl = $('#outfits-settings-link');
    if (sl) sl.addEventListener('click', (e) => { e.preventDefault(); openSettings(); });

    root.querySelectorAll('.shuffle-item img').forEach(im => {
      im.addEventListener('error', () => {
        const fallback = im.dataset.fallback;
        if (fallback && im.getAttribute('src') !== fallback) im.src = fallback;
        else im.closest('.shuffle-item')?.classList.remove('hasimg');
      });
    });

    // Progressive fill. Google CSE gives product-specific results when configured;
    // otherwise use distinct Pinterest results for each look. The keyless photo
    // URLs rendered above remain visible if either remote search is unavailable.
    if (imageSearch.hasKeys()) {
      const imgs = Array.from(root.querySelectorAll('.shuffle-item img[data-q]'));
      imgs.forEach(im => {
        imageSearch.first(im.getAttribute('data-q')).then(src => {
          if (!src) return;
          im.src = src; im.closest('.shuffle-item').classList.add('hasimg');
        });
      });
    } else {
      root.querySelectorAll('.shuffle-card[data-pin-query]').forEach(card => {
        pinterest.searchPins(card.dataset.pinQuery).then(images => {
          if (!images.length || !card.isConnected) return;
          card.querySelectorAll('.shuffle-item img').forEach((im, index) => {
            // Do not repeat one Pinterest result across every wardrobe piece;
            // unmatched slots keep their distinct, proxied keyless photos.
            const src = images[index];
            if (src) { im.src = proxiedImage(src); im.closest('.shuffle-item').classList.add('hasimg'); }
          });
        });
      });
    }
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
    // AI-generated packing (weather + profile aware) when present; else the demo engine (5 cities only).
    let result;
    if (trip?.bundle?.packing?.lists?.length) result = trip.bundle.packing;
    else if (DATA.destinations.find(d => d.key === trip?.destination)) result = engine.buildPacking(req, store.profile.load(me.email));
    else result = { lists: [], reminders: [] };
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
    const places = (trip.bundle && trip.bundle.local && trip.bundle.local.length)
      ? trip.bundle.local
      : (DATA.places[trip.destination] ? engine.buildLocal(ctx) : []);
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
          <article class="place" data-mix="${escapeHtml(p.mix)}">
            <header><h4>${escapeHtml(p.name)}</h4><span class="type">${escapeHtml(p.mix.replace('-', ' '))}</span></header>
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
      : (DATA.expectations[trip.destination] ? engine.buildExpect(trip.destination) : []);
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
    boot: () => {
      applyTheme();
      initAuth();
      initChat();
      initPublic();
      initApp();
      autosizeTextarea();
      window.addEventListener('hashchange', route);
      route();
    },
  };
})();

document.addEventListener('DOMContentLoaded', ui.boot);
