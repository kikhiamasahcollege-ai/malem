/* malem prototype.
 * Dependency-free on purpose. Modules named the way a future React Native
 * port would organize them: `store`, `data`, `engine`, `ui`.
 */

// ---------- store ----------
const store = (() => {
  const K_PROFILE = 'malem.profile.v1';
  const K_GROUP   = 'malem.group.v1';
  const K_JOURNAL = 'malem.journal.v1';

  const emptyProfile = () => ({
    version: 1,
    vibes: [],
    budget: 'mid',
    pace: 'balanced',
    dietary: {
      halal: false, kosher: false, vegan: false, vegetarian: false,
      glutenFree: false, allergies: [], other: '',
    },
    accessibility: {
      stepFree: false, lowVision: false, lowHearing: false,
      seatingBreaks: false, notes: '',
    },
    religiousCultural: '',
    modesty: 'no-preference',
    medical: { devices: '', medications: '', reminderCadence: 'none' },
    family:  { childrenAges: [], babyOnBoard: false, notes: '' },
    avoid: [],
  });

  const readJSON = (k, fallback) => {
    try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  };

  return {
    emptyProfile,
    loadProfile:  () => ({ ...emptyProfile(), ...(readJSON(K_PROFILE, {}) || {}) }),
    saveProfile:  (p) => localStorage.setItem(K_PROFILE, JSON.stringify(p)),
    clearProfile: () => localStorage.removeItem(K_PROFILE),

    loadGroup:  () => readJSON(K_GROUP, []),
    saveGroup:  (g) => localStorage.setItem(K_GROUP, JSON.stringify(g)),
    clearGroup: () => localStorage.removeItem(K_GROUP),

    loadJournal:  () => readJSON(K_JOURNAL, []),
    saveJournal:  (j) => localStorage.setItem(K_JOURNAL, JSON.stringify(j)),
    clearJournal: () => localStorage.removeItem(K_JOURNAL),
  };
})();

// ---------- data ----------
// Small seed set. In production this becomes an API; the shape is stable.
const DATA = (() => {
  const destinations = [
    { key: 'istanbul',  name: 'Istanbul',  country: 'Türkiye',    voltage: '220V', plug: 'Type C/F',
      culturalNote: 'Muslim-majority; modest dress helpful at religious sites; strong tea and coffee culture.' },
    { key: 'kyoto',     name: 'Kyoto',     country: 'Japan',      voltage: '100V', plug: 'Type A/B',
      culturalNote: 'Quiet on transit; shoes off in traditional interiors; tipping is not expected.' },
    { key: 'marrakech', name: 'Marrakech', country: 'Morocco',    voltage: '220V', plug: 'Type C/E',
      culturalNote: 'Muslim-majority; haggling is normal in the souks; Friday afternoons quieter.' },
    { key: 'paris',     name: 'Paris',     country: 'France',     voltage: '230V', plug: 'Type C/E',
      culturalNote: 'Greet with bonjour in shops; small cafés are for lingering.' },
    { key: 'nyc',       name: 'New York',  country: 'USA',        voltage: '120V', plug: 'Type A/B',
      culturalNote: 'Tipping expected (~18–22%); walk-only routes are efficient; loud subway.' },
  ];

  const VIBES = [
    { key: 'live-like-local',    title: 'Live like a local' },
    { key: 'iconic-first-visit', title: 'Iconic first visit' },
    { key: 'relaxed-scenic',     title: 'Relaxed & scenic' },
    { key: 'hidden-gems',        title: 'Hidden gems' },
    { key: 'family-adventure',   title: 'Family adventure' },
    { key: 'halal-food-culture', title: 'Halal food & culture' },
    { key: 'luxury-without-rush',title: 'Luxury without rush' },
  ];

  // Places for local discovery. Kept small; realistic mix per city.
  const places = {
    istanbul: [
      { name: 'Hagia Sophia',           mix: 'famous',         cat: 'sights', sub: 'The essential first-visit site.', score: 'Icon status; expect crowds mid-day.', traffic: 'high' },
      { name: 'Karaköy simit stand',    mix: 'small-business', cat: 'food',   sub: 'Warm simit and hot çay from a family stand.', score: 'Loved by commuters; steady quality.', traffic: 'low' },
      { name: 'Balat side streets',     mix: 'neighborhood',   cat: 'sights', sub: 'Painted houses, antique doors, quiet mornings.', score: 'Beloved by locals; go early.', traffic: 'medium' },
      { name: 'Vefa Bozacısı',          mix: 'hidden',         cat: 'food',   sub: 'Century-old boza shop most tourists miss.', score: 'Strong local sentiment; repeat visitors.', traffic: 'low' },
      { name: 'Ramadan iftar in Sultanahmet', mix: 'seasonal', cat: 'food',  sub: 'Public iftar tables during Ramadan.', score: 'Seasonal; check dates.', traffic: 'high' },
      { name: 'Kadıköy fish market',    mix: 'neighborhood',   cat: 'shopping', sub: 'Everyday market on the Asian side.', score: 'Locals shop here first.', traffic: 'medium' },
    ],
    kyoto: [
      { name: 'Fushimi Inari (dawn)',   mix: 'famous',        cat: 'sights',   sub: 'Icon — go before 7 to breathe.', score: 'Iconic; go early.', traffic: 'high' },
      { name: 'Nishiki side alleys',    mix: 'neighborhood',  cat: 'food',     sub: 'Skip the main run, cut through the alleys.', score: 'Locals prefer the sides.', traffic: 'medium' },
      { name: 'Ippodo main shop',       mix: 'small-business',cat: 'shopping', sub: 'Old matcha house; short tastings.', score: 'Century-plus; consistent.', traffic: 'low' },
      { name: 'Ohara at rice-planting',  mix: 'seasonal',     cat: 'outdoors', sub: 'Rural hamlet north of the city.', score: 'Seasonal (May–June).', traffic: 'low' },
      { name: 'Kissa Master (silent café)', mix: 'hidden',    cat: 'food',     sub: 'Old-style jazz kissa; talk quietly.', score: 'Repeat-visit favorite.', traffic: 'low' },
      { name: 'Philosopher\'s Path stroll', mix: 'neighborhood', cat: 'outdoors', sub: 'Canal-side walk between two temples.', score: 'A local everyday route.', traffic: 'medium' },
    ],
    marrakech: [
      { name: 'Jemaa el-Fnaa (sunset)', mix: 'famous',        cat: 'sights',   sub: 'The square as it wakes up.', score: 'Iconic and busy.', traffic: 'high' },
      { name: 'Sidi Ghanem craft studios', mix: 'small-business', cat: 'shopping', sub: 'Design ateliers outside the medina.', score: 'Makers-first.', traffic: 'low' },
      { name: 'Neighborhood mahlaba', mix: 'neighborhood',    cat: 'food',     sub: 'Local dairy bar — msemmen and coffee.', score: 'Everyday spot for locals.', traffic: 'low' },
      { name: 'Ben Youssef library courtyard', mix: 'hidden', cat: 'sights',   sub: 'Reopened madrasa quiet in the afternoons.', score: 'Recently restored.', traffic: 'low' },
      { name: 'Rose festival day trip', mix: 'seasonal',      cat: 'outdoors', sub: 'Kelaa M\'Gouna in mid-May.', score: 'Seasonal.', traffic: 'medium' },
      { name: 'Bahia Palace',           mix: 'famous',        cat: 'sights',   sub: 'The most-photographed palace.', score: 'Iconic; midday queues.', traffic: 'high' },
    ],
    paris: [
      { name: 'Louvre (late Wednesday)', mix: 'famous',       cat: 'sights',   sub: 'Icon — go late-open days.', score: 'Icon status; strategy required.', traffic: 'high' },
      { name: 'Marché d\'Aligre',       mix: 'neighborhood',  cat: 'food',     sub: 'Everyday market, no tourist markup.', score: 'Everyday shopping for the 12th.', traffic: 'medium' },
      { name: 'Du Pain et des Idées',   mix: 'small-business',cat: 'food',     sub: 'Small bakery loved by neighbors.', score: 'Consistent; long queue by 10.', traffic: 'medium' },
      { name: 'Musée de la Vie Romantique tea garden', mix: 'hidden', cat: 'sights', sub: 'Quiet courtyard museum.', score: 'Local favorite hideaway.', traffic: 'low' },
      { name: 'Fête de la Musique',     mix: 'seasonal',      cat: 'sights',   sub: 'Free citywide music, June 21.', score: 'Seasonal event.', traffic: 'high' },
      { name: 'Coulée Verte walk',      mix: 'neighborhood',  cat: 'outdoors', sub: 'Elevated linear park.', score: 'A local commute favorite.', traffic: 'low' },
    ],
    nyc: [
      { name: 'Statue of Liberty',      mix: 'famous',        cat: 'sights',   sub: 'The icon.', score: 'Iconic; book ahead.', traffic: 'high' },
      { name: 'Arthur Avenue market',   mix: 'neighborhood',  cat: 'food',     sub: 'Bronx Italian food street.', score: 'Everyday shopping for locals.', traffic: 'medium' },
      { name: 'Sunny\'s (Red Hook)',    mix: 'small-business',cat: 'food',     sub: 'Neighborhood bar with live music.', score: 'Local sentiment strong.', traffic: 'low' },
      { name: 'City Island in summer',  mix: 'seasonal',      cat: 'outdoors', sub: 'Fishing-village feel in the Bronx.', score: 'Seasonal.', traffic: 'medium' },
      { name: 'The Frick (reopened)',   mix: 'hidden',        cat: 'sights',   sub: 'Smaller museum; slower pace.', score: 'Repeat-visitor favorite.', traffic: 'low' },
      { name: 'Corona taquería row',    mix: 'small-business',cat: 'food',     sub: 'Queens street tacos.', score: 'Community favorite.', traffic: 'medium' },
    ],
  };

  // What to expect: 13 categories per destination. Kept concise on purpose.
  const expectations = {
    istanbul: {
      etiquette:      'Modest dress at mosques; remove shoes; women often use a scarf indoors.',
      clothing:       'Long trousers and covered shoulders for mosque visits.',
      tipping:        '5–10% at sit-down meals; taxi rounding.',
      prayer:         'Five daily prayers; mosques open outside prayer times.',
      driving:        'Assertive; pedestrians should be firm at crossings.',
      transit:        'Istanbulkart works everywhere; ferries beat traffic.',
      scams:          'Watch shoe-cleaner drop trick and shifted taxi meters.',
      safety:         'Generally safe; keep pockets zipped in Beyoğlu.',
      accessibility:  'Cobblestones and hills; some tram stops step-free.',
      phrases:        'Merhaba (hello), teşekkür ederim (thanks), afiyet olsun (enjoy meal).',
      hours:          'Late lunches, dinners after 20:00; museums Mon closed varies.',
      photos:         'Ask before photographing people at mosques or bazaars.',
      difference:     'Calls to prayer punctuate the day — beautiful, not a problem.',
    },
    kyoto: {
      etiquette:      'Quiet on trains, no phone calls; small bows return greetings.',
      clothing:       'Neat casual; shoes off in tatami rooms.',
      tipping:        'Not expected; can be politely refused.',
      prayer:         'Shrines and temples both — bow twice, clap twice, bow once at Shinto shrines.',
      driving:        'Rarely needed; taxis clean, expensive, no need to tip.',
      transit:        'IC card for buses and trains; buses can be confusing.',
      scams:          'Rare; watch for tourist-only "geisha experiences" in Gion.',
      safety:         'Very safe.',
      accessibility:  'Older sites can be step-heavy; JR Kyoto is well equipped.',
      phrases:        'Konnichiwa (hello), sumimasen (excuse me/thanks), arigatou (thanks).',
      hours:          'Restaurants often 11:30–14 & 17:30–22; shrines dawn to dusk.',
      photos:         'No photos of maiko/geiko in Gion; signs enforced.',
      difference:     'Silence in public transit is the norm and it\'s peaceful.',
    },
    marrakech: {
      etiquette:      'Modest dress welcomed; men wear long shorts or trousers at religious sites.',
      clothing:       'Loose cotton for heat; long sleeves for evening breeze.',
      tipping:        '10% at sit-down; small rounding otherwise.',
      prayer:         'Five daily prayers; friday afternoons quieter around mosques.',
      driving:        'Chaotic in medina; hire a driver outside.',
      transit:        'Petit taxis are metered inside city limits.',
      scams:          'Uninvited "guides" in the medina; agree fees up front.',
      safety:         'Generally safe day and night in main areas.',
      accessibility:  'Medina alleys uneven; Gueliz is flatter and step-free.',
      phrases:        'Salam alaykum (hello), shukran (thanks), la, shukran (no, thanks).',
      hours:          'Souks close mid-afternoon Friday; dinners later.',
      photos:         'Ask before photographing anyone in the square.',
      difference:     'Bargaining is social; take your time and it becomes fun.',
    },
    paris: {
      etiquette:      'Say bonjour when entering a shop or café — it changes everything.',
      clothing:       'Smart casual; layers for spring/autumn.',
      tipping:        'Service compris; 1–2 € rounding welcome.',
      prayer:         'Multi-faith city; mosques and synagogues throughout.',
      driving:        'Not needed; parking painful.',
      transit:        'Navigo Easy card for a week; strikes can hit lines.',
      scams:          'Petition-signing distractions near tourist sights.',
      safety:         'Safe; pickpockets around Trocadéro and metro line 1.',
      accessibility:  'Older metro lines limited; buses better; RER major stations OK.',
      phrases:        'Bonjour, s\'il vous plaît, merci, pardon.',
      hours:          'Late lunches 12:30–14; some places closed Sunday.',
      photos:         'Museums vary; no flash generally.',
      difference:     'Small cafés are for lingering, not fast turnover.',
    },
    nyc: {
      etiquette:      'Direct is polite; keep to the right on sidewalks.',
      clothing:       'Layers year-round; comfortable walking shoes.',
      tipping:        '18–22% at restaurants; $1–2 per drink.',
      prayer:         'Many faiths; jum\'ah at midtown mosques.',
      driving:        'Not needed; parking and congestion pricing.',
      transit:        'OMNY tap-to-pay; late-night reroutes common.',
      scams:          'Character photos in Times Square demanding money.',
      safety:         'Safer than many think; late-night on empty platforms is the tricky bit.',
      accessibility:  'Only a fraction of subway stations elevator-served; buses fully accessible.',
      phrases:        'English works; a "thanks, have a good one" reads friendly.',
      hours:          '24-hour city in many places; grocery late is fine.',
      photos:         'Ask permission for portraits; museums vary.',
      difference:     'Loud is not rude; it\'s just the volume of the city.',
    },
  };

  const meta = {
    updated: '2026-06-01',
    sources: ['residents', 'transit authorities', 'tourism boards'],
  };

  return { destinations, VIBES, places, expectations, meta };
})();

// ---------- engine ----------
const engine = (() => {
  // ----- Vibe itinerary (feature 2) — same as before -----
  const vibeThemes = {
    'live-like-local':    ['Neighborhood morning', 'Everyday markets', 'Evening as locals do'],
    'iconic-first-visit': ['The essential first day', 'The other icons', 'One deep dive'],
    'relaxed-scenic':     ['Slow morning', 'Views & long lunches', 'A gentle evening'],
    'hidden-gems':        ['Off the tourist path', 'Craft & small makers', 'Neighborhood after dark'],
    'family-adventure':   ['Kid-paced discovery', 'Playful outdoors', 'Family-friendly evening'],
    'halal-food-culture': ['Halal breakfast & mosque tour', 'Bazaar & cultural site', 'Halal dinner & tea'],
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
      { time: '15:30', title: 'Independent gallery / craft',    duration: '90 min', kind: 'activity' },
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
      { time: '10:00', title: 'Guided mosque & quarter tour',   duration: '2 hr',   kind: 'sight' },
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
    if (p.accessibility.notes)         out.push('accessibility notes on file');
    if (p.religiousCultural)  out.push('religious/cultural notes respected');
    if (p.modesty !== 'no-preference') out.push(`${p.modesty} clothing suggestions`);
    if (p.medical.reminderCadence !== 'none') out.push(`medication reminders (${p.medical.reminderCadence})`);
    if (p.family.babyOnBoard)          out.push('baby-friendly stops');
    if ((p.family.childrenAges || []).length) out.push(`kids: ages ${p.family.childrenAges.join(', ')}`);
    if ((p.avoid || []).length)        out.push(`avoiding: ${p.avoid.join(', ')}`);
    out.push(`budget: ${p.budget}`);
    out.push(`pace: ${p.pace}`);
    return out;
  };

  const applyProfile = (block, p) => {
    const respects = [];
    let title = block.title;
    if (block.kind === 'meal') {
      if (p.dietary.halal)      { title = title.replace(/dinner|lunch|breakfast/i, m => `Halal ${m.toLowerCase()}`); respects.push('halal'); }
      else if (p.dietary.kosher){ title = title.replace(/dinner|lunch|breakfast/i, m => `Kosher ${m.toLowerCase()}`); respects.push('kosher'); }
      else if (p.dietary.vegan) { respects.push('vegan-friendly'); }
      else if (p.dietary.vegetarian) { respects.push('vegetarian-friendly'); }
      if (p.dietary.glutenFree) respects.push('gluten-free');
      if ((p.dietary.allergies || []).length) respects.push('allergy-safe');
    }
    if (p.accessibility.stepFree)      respects.push('step-free');
    if (p.accessibility.seatingBreaks && (block.kind === 'sight' || block.kind === 'activity'))
      respects.push('seating breaks noted');
    if (p.family.babyOnBoard && block.kind === 'rest') respects.push('baby nap window');
    if ((p.family.childrenAges || []).some(a => a <= 5) && block.kind === 'meal')
      respects.push('kid menu');
    if (p.medical.reminderCadence !== 'none' && block.kind === 'rest')
      respects.push('medication reminder here');
    if ((p.modesty === 'conservative' || p.modesty === 'modest') && /night|club|nightlife/i.test(block.title))
      respects.push('modesty note: skip suggested');
    return { ...block, title, respects: respects.length ? respects : undefined };
  };

  const paceFilter = (blocks, pace) => {
    if (pace === 'slow')   return blocks.filter((_, i) => i % 2 === 0).slice(0, 3);
    if (pace === 'packed') return blocks;
    return blocks.filter((_, i) => i !== 3);
  };

  const buildItinerary = (req, profile) => {
    const primary = req.primaryVibe, secondary = req.secondaryVibe;
    const blend = Math.max(0, Math.min(1, req.blendRatio ?? 0));
    const respected = respectedFromProfile(profile);
    const days = [];
    for (let d = 0; d < req.days; d++) {
      const useSecondary = (secondary && blend > 0 && d % 2 === 1 && blend >= 0.5) ||
                           (secondary && blend > 0.75);
      const vibeForDay = useSecondary ? secondary : primary;
      const themes = vibeThemes[vibeForDay] || [`Day ${d + 1}`];
      const theme = themes[d % themes.length];
      let pool = blockPools[vibeForDay] || [];
      if (useSecondary) {
        const primPool = blockPools[primary] || [];
        pool = [...pool];
        if (primPool.length) pool.splice(2, 0, primPool[2 % primPool.length]);
      }
      const shaped = paceFilter(pool, profile.pace).map(b => applyProfile(b, profile));
      const isoDate = req.arrivalDate
        ? new Date(new Date(req.arrivalDate).getTime() + d * 86400000).toISOString().slice(0, 10)
        : undefined;
      days.push({ date: isoDate, theme, blocks: shaped });
    }
    return { request: req, respectedFromProfile: respected, days };
  };

  // ----- Packing planner (feature 3) -----
  const buildPacking = (req, profile) => {
    const A = new Set(req.activities || []);
    const cold = req.season === 'winter' || A.has('cold-weather');
    const warm = req.season === 'summer' || A.has('beach') || A.has('tropical');
    const laundry = !!req.laundry;
    const rentThere = !!req.rentThere;

    const homeItems = [];
    const buyBefore = [];
    const buyRentThere = [];
    const personalBag = [];
    const doNotPack = [];
    const beforeDeparture = [];

    // Base clothing scaled by duration and laundry
    const outfits = laundry ? Math.min(4, Math.max(2, Math.ceil(req.days / 3))) : Math.min(7, req.days);
    homeItems.push({ item: `${outfits} outfits`, why: laundry ? 'laundry available; cycled' : 'no laundry; one per day' });

    // Weather
    if (cold) homeItems.push({ item: 'Insulated jacket + hat + gloves', why: 'cold-weather forecast' });
    if (warm) homeItems.push({ item: 'Sun hat and SPF 50', why: 'sunny / hot' });
    if (req.destination) homeItems.push({ item: 'Plug adapter', why: DATA.destinations.find(d => d.key === req.destination)?.plug || 'local plug' });

    // Activities
    if (A.has('walking-city'))     homeItems.push({ item: 'Broken-in walking shoes', why: 'city walking' });
    if (A.has('hiking'))           homeItems.push({ item: 'Hiking shoes + moisture-wicking layers', why: 'hiking' });
    if (A.has('beach'))            homeItems.push({ item: 'Swimwear', why: 'beach/swim' });
    if (A.has('fine-dining'))      homeItems.push({ item: 'One smart outfit', why: 'fine dining' });
    if (A.has('religious-sites') || profile.modesty !== 'no-preference') {
      homeItems.push({ item: 'Scarf or shoulder cover', why: 'religious sites / modesty' });
      homeItems.push({ item: 'Long trousers or long skirt', why: 'religious sites / modesty' });
    }
    if (A.has('museums'))          homeItems.push({ item: 'Small day bag', why: 'museums' });

    // Profile-driven
    if (profile.dietary.halal || profile.dietary.kosher) {
      personalBag.push({ item: 'Snack bars (verified halal/kosher)', why: 'safe backup between meals' });
    }
    if ((profile.dietary.allergies || []).length) {
      personalBag.push({ item: `Allergy card in local language`, why: `for ${profile.dietary.allergies.join(', ')}` });
      personalBag.push({ item: 'EpiPen or equivalent (check regulations)', why: 'allergy safety' });
    }
    if (profile.medical.medications) {
      personalBag.push({
        item: `${profile.medical.medications} — in original packaging + prescription copies`,
        why: 'customs & pharmacy access',
      });
    }
    if (profile.medical.devices) {
      personalBag.push({ item: profile.medical.devices + ' (with backup supplies)', why: 'medical equipment' });
    }
    if (profile.family.babyOnBoard) {
      homeItems.push({ item: 'Compact stroller or carrier', why: 'baby on trip' });
      personalBag.push({ item: 'Diaper kit + change of baby clothes', why: 'baby personal bag' });
    }
    if ((profile.family.childrenAges || []).some(a => a <= 8)) {
      personalBag.push({ item: 'Two comfort items (kids)', why: 'flight/transit resilience' });
    }
    if (profile.accessibility.stepFree)     personalBag.push({ item: 'Foldable seat cane / mobility aid', why: 'step-free trip' });
    if (profile.accessibility.lowVision)    personalBag.push({ item: 'Backup reading glasses', why: 'low-vision support' });

    // Buy before
    if (cold)  buyBefore.push({ item: 'Merino base layer', why: 'if you don\'t already own one' });
    if (A.has('tropical')) buyBefore.push({ item: 'DEET or picaridin repellent', why: 'humid climate' });
    buyBefore.push({ item: 'eSIM or local SIM plan', why: 'data on arrival' });

    // Buy or rent there
    if (rentThere) {
      buyRentThere.push({ item: 'Umbrella or beach chair', why: 'rents cheaper than luggage space' });
      if (warm) buyRentThere.push({ item: 'Local sandals', why: 'better sized / cheaper on-site' });
      if (A.has('hiking')) buyRentThere.push({ item: 'Trekking poles', why: 'rent locally if not a regular' });
    }
    // Do not pack
    if (req.destination === 'nyc' || req.destination === 'paris' || req.destination === 'kyoto') {
      doNotPack.push({ item: 'Large "sharp" pocket knives', why: 'restricted at some sites; not needed' });
    }
    if (req.destination === 'marrakech' || req.destination === 'istanbul') {
      doNotPack.push({ item: 'Uncleared drone', why: 'permits required; regulated' });
    }
    doNotPack.push({ item: 'Full-size aerosols', why: 'flight rules; refill locally' });

    // Documents / before departure
    beforeDeparture.push({ item: 'Passport valid 6+ months', why: 'entry requirement' });
    beforeDeparture.push({ item: 'Travel insurance confirmation', why: 'save PDF offline' });
    if (profile.medical.medications) beforeDeparture.push({ item: 'Doctor letter for medications', why: 'customs peace of mind' });
    if (profile.family.babyOnBoard) beforeDeparture.push({ item: 'Baby travel documents', why: 'some borders require' });
    beforeDeparture.push({ item: 'Notify bank of travel', why: 'card holds' });

    // Reminder timeline
    const reminders = [
      { when: 'Two weeks before', text: 'Book accessible transfers if needed. Check passport validity. Refill prescriptions with buffer.' },
      { when: 'Three days before', text: 'Print insurance PDF. Set up eSIM. Charge devices. Confirm reservations.' },
      { when: 'Night before',     text: 'Pack medications and documents in personal bag. Set out clothes for departure.' },
      { when: 'Departure day',    text: 'Water bottle empty for security. Snacks & meds in personal bag. Photo of luggage tags.' },
    ];

    return {
      lists: [
        { title: 'Pack from home',        items: homeItems,       tone: 'good' },
        { title: 'Buy before leaving',    items: buyBefore,       tone: '' },
        { title: 'Better to buy/rent there', items: buyRentThere, tone: '' },
        { title: 'Carry in your personal bag', items: personalBag, tone: 'good' },
        { title: 'Do not pack / restricted', items: doNotPack,    tone: 'warn' },
        { title: 'Complete before departure', items: beforeDeparture, tone: '' },
      ],
      reminders,
    };
  };

  // ----- Discover Now (feature 4) -----
  const buildDiscover = (ctx, profile) => {
    const hours = Number(ctx.hours) || 3;
    const wet = ctx.weather === 'light-rain' || ctx.weather === 'heavy-rain';
    const hot = ctx.weather === 'hot';
    const cold = ctx.weather === 'cold';
    const family = ctx.party === 'family';
    const lowE = ctx.energy === 'low';
    const highE = ctx.energy === 'high';

    const covered = (title) => title + (wet ? ' (covered)' : '');
    const dietTag = () => (
      profile.dietary.halal ? 'halal-only' :
      profile.dietary.kosher ? 'kosher-only' :
      profile.dietary.vegan  ? 'vegan-friendly' :
      profile.dietary.vegetarian ? 'veg-friendly' :
      'no dietary limits set'
    );

    // Three plans: relaxed / food / cultural — trimmed to hours available.
    const relaxed = {
      title: 'Relaxed',
      badge: lowE ? 'Low energy' : 'Easy pace',
      why: `You picked ${ctx.hours}h and ${ctx.weather}${lowE ? ', low energy' : ''}. This plan stays covered and seated.`,
      steps: [
        covered('A café with a view'),
        'Slow walk under cover',
        'Bookshop or small gallery',
        family ? 'Playful stop (rest for adults)' : 'Sit-down tea or coffee',
      ],
    };
    const food = {
      title: 'Food-focused',
      badge: dietTag(),
      why: `Nearest stalls / cafés matching your dietary profile (${dietTag()}).`,
      steps: [
        'Bakery start',
        wet ? 'Covered market walk' : hot ? 'Iced treat and short walk' : 'Local market walk',
        'Lunch — profile-respecting',
        'Sweet stop for the road',
      ],
    };
    const cultural = {
      title: 'Cultural',
      badge: profile.accessibility.stepFree ? 'Step-free preferred' : (highE ? 'Longer walk' : 'Moderate'),
      why: `A cultural loop calibrated to your energy and any step-free preferences.`,
      steps: [
        wet ? 'Museum or covered courtyard' : 'Historic quarter walk',
        cold ? 'Warm-up stop (tea)' : hot ? 'Shaded courtyard' : 'A small independent site',
        'Sunset viewpoint (if window fits)',
        'Bite before you head back',
      ],
    };

    // Trim to hours.
    const trim = (plan) => ({ ...plan, steps: plan.steps.slice(0, Math.max(2, Math.min(plan.steps.length, hours + 1))) });
    return [trim(relaxed), trim(food), trim(cultural)];
  };

  // ----- Local discovery (feature 5) -----
  const buildLocal = (ctx) => {
    const list = DATA.places[ctx.destination] || [];
    const mix = new Set(ctx.mix || []);
    const cat = ctx.category || 'all';
    const filtered = list.filter(p => (mix.size ? mix.has(p.mix) : true) && (cat === 'all' || p.cat === cat));
    // Add a hidden-gem score explainer for each.
    return filtered.map(p => ({
      ...p,
      gemScore: (
        p.mix === 'hidden'     ? 'Hidden — strong local sentiment, low tourist volume.' :
        p.mix === 'small-business' ? 'Small business — verified by repeat visitors.' :
        p.mix === 'neighborhood' ? 'Neighborhood favorite — locals visit weekly.' :
        p.mix === 'famous'     ? 'Icon — go early or off-hours to avoid crowds.' :
        p.mix === 'seasonal'   ? 'Seasonal — only during the noted period.' :
        ''
      ),
      trafficNote: (
        p.traffic === 'high' ? 'High traffic — consider off-hours.' :
        p.traffic === 'low'  ? 'Low traffic — respect the quiet.' :
        'Steady traffic.'
      ),
    }));
  };

  // ----- What to Expect (feature 6) -----
  const CATEGORY_LABELS = {
    etiquette:     'Cultural etiquette',
    clothing:      'Clothing',
    tipping:       'Tipping & payment',
    prayer:        'Prayer facilities',
    driving:       'Driving conditions',
    transit:       'Public transit',
    scams:         'Tourist traps & scams',
    safety:        'Safety',
    accessibility: 'Accessibility reality',
    phrases:       'Useful phrases',
    hours:         'Business hours & pace',
    photos:        'Photography',
    difference:    'What may feel different',
  };
  const CATEGORY_CONFIDENCE = {
    etiquette: 'high', clothing: 'high', tipping: 'high', prayer: 'high',
    driving: 'med', transit: 'high', scams: 'med', safety: 'med',
    accessibility: 'med', phrases: 'high', hours: 'high', photos: 'high', difference: 'high',
  };
  const buildExpect = (destinationKey) => {
    const e = DATA.expectations[destinationKey];
    if (!e) return [];
    return Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
      key, label,
      text: e[key] || 'No data yet — contribute in the journal.',
      confidence: CATEGORY_CONFIDENCE[key],
      updated: DATA.meta.updated,
      source: DATA.meta.sources[0],
    }));
  };

  // ----- Group vibe blending (feature 7) -----
  const blendGroupVibes = (members) => {
    const votes = {};
    members.forEach(m => { if (m.vibe) votes[m.vibe] = (votes[m.vibe] || 0) + 1; });
    const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return { winner: null, blend: null, votes };
    const [winner, wCount] = sorted[0];
    const runnerUp = sorted[1];
    // Blend if runner-up is at least half of winner.
    const blend = runnerUp && runnerUp[1] >= wCount / 2 ? runnerUp[0] : null;
    return { winner, blend, votes };
  };

  const consolidateConstraints = (members) => {
    const set = new Set();
    members.forEach(m => (m.constraints || []).forEach(c => set.add(c)));
    return Array.from(set);
  };

  return {
    buildItinerary, buildPacking, buildDiscover, buildLocal, buildExpect,
    blendGroupVibes, consolidateConstraints,
  };
})();

// ---------- ui ----------
const ui = (() => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const flash = (sel, msg) => {
    const el = $(sel); if (!el) return;
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.textContent = ''), 4500);
  };
  const parseList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const parseIntList = (s) => parseList(s).map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);

  const showTab = (name) => {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Fill every destination <select> uniformly.
  const populateDestinations = () => {
    const opts = DATA.destinations.map(d => `<option value="${d.key}">${escapeHtml(d.name)} — ${escapeHtml(d.country)}</option>`).join('');
    $$('select[data-destinations]').forEach(sel => { sel.innerHTML = opts; });
  };

  // ---- Profile (unchanged from before) ----
  const readProfile = () => {
    const f = $('#profile-form');
    const p = store.emptyProfile();
    p.vibes = $$('[data-chips="vibes"] input:checked').map(i => i.value);
    p.budget = f.budget.value;
    p.pace   = f.pace.value;
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
  const writeProfile = (p) => {
    const f = $('#profile-form');
    $$('[data-chips="vibes"] input').forEach(i => { i.checked = p.vibes.includes(i.value); });
    f.budget.value = p.budget; f.pace.value = p.pace;
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
    const mod = $(`input[name="modesty"][value="${p.modesty}"]`); if (mod) mod.checked = true;
    f.medDevices.value     = p.medical.devices || '';
    f.medMedications.value = p.medical.medications || '';
    f.medCadence.value     = p.medical.reminderCadence || 'none';
    f.childrenAges.value = (p.family.childrenAges || []).join(', ');
    f.babyOnBoard.checked = !!p.family.babyOnBoard;
    f.familyNotes.value = p.family.notes || '';
    f.avoid.value = (p.avoid || []).join(', ');
  };
  const initProfile = () => {
    writeProfile(store.loadProfile());
    $('#save-profile').addEventListener('click', () => {
      store.saveProfile(readProfile());
      flash('#save-note', 'Saved. Your profile applies to all planning tabs.');
    });
    $('#reset-profile').addEventListener('click', () => {
      if (!confirm('Clear your saved profile? Local only.')) return;
      store.clearProfile();
      writeProfile(store.emptyProfile());
      flash('#save-note', 'Profile cleared.');
    });
  };

  // ---- Vibes (unchanged output format, minor cleanup) ----
  const renderVibeGrid = (root, name) => {
    root.innerHTML = '';
    if (name === 'secondary') {
      const none = document.createElement('label');
      none.className = 'vibe-tile'; none.dataset.value = ''; none.dataset.selected = 'true';
      none.innerHTML = `<input type="radio" name="${name}" value="" checked />
                       <span class="title">No blend</span>
                       <span class="sub">Use only the primary vibe.</span>`;
      root.appendChild(none);
    }
    DATA.VIBES.forEach(v => {
      const label = document.createElement('label');
      label.className = 'vibe-tile'; label.dataset.value = v.key;
      label.innerHTML = `<input type="radio" name="${name}" value="${v.key}" />
                        <span class="title">${escapeHtml(v.title)}</span>
                        <span class="sub">${escapeHtml({
                          'live-like-local':'Neighborhood mornings, home-style meals, real coffee.',
                          'iconic-first-visit':'The must-sees, but timed to dodge the crowds.',
                          'relaxed-scenic':'Longer stops, gentle days, views over ticking boxes.',
                          'hidden-gems':'Places locals actually love — quality over hype.',
                          'family-adventure':'Kid-paced, nap-aware, story-worthy.',
                          'halal-food-culture':'Verified halal stops and cultural depth.',
                          'luxury-without-rush':'Comfort-first pacing, unhurried excellence.',
                        }[v.key] || '')}</span>`;
      root.appendChild(label);
    });
    root.addEventListener('change', () => {
      const val = (root.querySelector('input:checked') || {}).value || '';
      $$('.vibe-tile', root).forEach(t => { t.dataset.selected = String(t.dataset.value === val); });
      if (name === 'secondary') $('#blend-slider-wrap').hidden = !val;
    });
  };
  const initVibes = () => {
    renderVibeGrid($('[data-vibe-grid="primary"]'),   'primary');
    renderVibeGrid($('[data-vibe-grid="secondary"]'), 'secondary');
    const first = $('[data-vibe-grid="primary"] input');
    if (first) { first.checked = true; first.dispatchEvent(new Event('change', { bubbles: true })); }
    const blend = $('input[name="blendRatio"]');
    blend.addEventListener('input', () => {
      const b = Number(blend.value); $('#blend-output').textContent = `${100 - b} / ${b}`;
    });
    $('#build-itinerary').addEventListener('click', () => {
      const f = $('#vibe-form');
      const primary = ($('input[name="primary"]:checked') || {}).value;
      const secondary = ($('input[name="secondary"]:checked') || {}).value || undefined;
      if (!f.destination.value.trim()) { flash('#build-note', 'Give it a destination.'); return; }
      if (!primary) { flash('#build-note', 'Pick a primary vibe.'); return; }
      const req = {
        destination: f.destination.value.trim(),
        days: Math.max(1, Math.min(21, Number(f.days.value) || 3)),
        travelers: Math.max(1, Number(f.travelers.value) || 1),
        arrivalDate: f.arrivalDate.value || undefined,
        primaryVibe: primary, secondaryVibe: secondary,
        blendRatio: secondary ? (Number(blend.value) / 100) : 0,
      };
      const itin = engine.buildItinerary(req, store.loadProfile());
      renderItinerary(itin);
      flash('#build-note', 'Itinerary built.');
      $('#itinerary-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const renderItinerary = (itin) => {
    const root = $('#itinerary-output'); root.hidden = false;
    const primary = DATA.VIBES.find(v => v.key === itin.request.primaryVibe);
    const secondary = DATA.VIBES.find(v => v.key === itin.request.secondaryVibe);
    root.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'itin-header';
    header.innerHTML = `
      <h3>${escapeHtml(itin.request.destination)} — ${itin.request.days} day${itin.request.days > 1 ? 's' : ''}</h3>
      <p><strong>${escapeHtml(primary.title)}</strong>${
        secondary ? ` blended with <strong>${escapeHtml(secondary.title)}</strong> (${Math.round((itin.request.blendRatio || 0) * 100)}% secondary)` : ''
      }, for ${itin.request.travelers} traveler${itin.request.travelers > 1 ? 's' : ''}.</p>
      <p class="hint">Your profile shaped this plan:</p>
      <ul class="itin-respect">${itin.respectedFromProfile.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
    root.appendChild(header);
    itin.days.forEach((day, i) => {
      const el = document.createElement('article');
      el.className = 'itin-day';
      el.innerHTML = `
        <header>
          <h4>Day ${i + 1}${day.date ? ` — ${escapeHtml(day.date)}` : ''}</h4>
          <span class="theme">${escapeHtml(day.theme)}</span>
        </header>
        ${day.blocks.map(b => `
          <div class="itin-block">
            <div class="when">${escapeHtml(b.time)}<br><small>${escapeHtml(b.duration)}</small></div>
            <div class="what">
              <strong>${escapeHtml(b.title)}</strong>
              <small>${escapeHtml(b.kind)}</small>
              ${b.respects ? `<div class="respects">${b.respects.map(r => `<span>${escapeHtml(r)}</span>`).join('')}</div>` : ''}
            </div>
          </div>`).join('')}`;
      root.appendChild(el);
    });
  };

  // ---- Packing ----
  const initPacking = () => {
    $('#build-packing').addEventListener('click', () => {
      const f = $('#packing-form');
      const req = {
        destination: f.destination.value,
        days: Math.max(1, Number(f.days.value) || 5),
        season: f.season.value,
        luggage: f.luggage.value,
        laundry: f.laundry.checked,
        rentThere: f.rentThere.checked,
        activities: $$('[data-chips="activities"] input:checked').map(i => i.value),
      };
      const result = engine.buildPacking(req, store.loadProfile());
      renderPacking(result);
      flash('#packing-note', 'List built.');
      $('#packing-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const renderPacking = (result) => {
    const root = $('#packing-output'); root.hidden = false;
    root.innerHTML = `
      <div class="pack-grid">
        ${result.lists.map(l => `
          <section class="pack-list"${l.tone ? ` data-tone="${l.tone}"` : ''}>
            <h4>${escapeHtml(l.title)} <span class="count">${l.items.length}</span></h4>
            <ul>${l.items.map(it => `<li>${escapeHtml(it.item)}${it.why ? ` <span class="why">— ${escapeHtml(it.why)}</span>` : ''}</li>`).join('') || '<li class="why">Nothing to add.</li>'}</ul>
          </section>`).join('')}
      </div>
      <section class="reminders">
        <h3 class="card-head">Reminder timeline</h3>
        <ol>
          ${result.reminders.map(r => `<li><span class="when">${escapeHtml(r.when)}</span><span>${escapeHtml(r.text)}</span></li>`).join('')}
        </ol>
      </section>`;
  };

  // ---- Discover ----
  const initDiscover = () => {
    $('#build-discover').addEventListener('click', () => {
      const f = $('#discover-form');
      const ctx = {
        destination: f.destination.value,
        hours: f.hours.value, weather: f.weather.value,
        energy: f.energy.value, party: f.party.value, outingBudget: f.outingBudget.value,
      };
      const plans = engine.buildDiscover(ctx, store.loadProfile());
      renderDiscover(ctx, plans);
      flash('#discover-note', 'Here are three plans.');
      $('#discover-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const renderDiscover = (ctx, plans) => {
    const root = $('#discover-output'); root.hidden = false;
    const dest = DATA.destinations.find(d => d.key === ctx.destination)?.name || ctx.destination;
    root.innerHTML = `
      <section class="itin-header">
        <h3>You're in ${escapeHtml(dest)} with ${escapeHtml(ctx.hours)}h and ${escapeHtml(ctx.weather)} weather.</h3>
        <p class="hint">Pick the vibe that fits you right now.</p>
      </section>
      <div class="plans">
        ${plans.map(p => `
          <article class="plan">
            <header><h4>${escapeHtml(p.title)}</h4><span class="badge">${escapeHtml(p.badge)}</span></header>
            <p class="plan-why">${escapeHtml(p.why)}</p>
            <ol>${p.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
          </article>`).join('')}
      </div>`;
  };

  // ---- Local ----
  const initLocal = () => {
    $('#build-local').addEventListener('click', () => {
      const f = $('#local-form');
      const ctx = {
        destination: f.destination.value,
        category:    f.category.value,
        mix: $$('[data-chips="local-mix"] input:checked').map(i => i.value),
      };
      const places = engine.buildLocal(ctx);
      renderLocal(ctx, places);
      flash('#local-note', places.length ? `${places.length} places.` : 'Nothing matched — expand the filters.');
      $('#local-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const renderLocal = (ctx, places) => {
    const root = $('#local-output'); root.hidden = false;
    if (!places.length) { root.innerHTML = `<p class="hint">Expand filters to see more.</p>`; return; }
    root.innerHTML = `
      <div class="places">
        ${places.map(p => `
          <article class="place" data-mix="${escapeHtml(p.mix)}">
            <header><h4>${escapeHtml(p.name)}</h4><span class="type">${escapeHtml(p.mix.replace('-', ' '))}</span></header>
            <p class="sub">${escapeHtml(p.sub)}</p>
            <p class="score">${escapeHtml(p.gemScore)}</p>
            <span class="traffic">${escapeHtml(p.trafficNote)}</span>
          </article>`).join('')}
      </div>`;
  };

  // ---- Expect ----
  const initExpect = () => {
    const sel = $('#expect-form select[name="destination"]');
    const render = () => renderExpect(sel.value);
    sel.addEventListener('change', render);
    // Render initial after populate.
    setTimeout(render, 0);
  };
  const renderExpect = (destinationKey) => {
    const root = $('#expect-output'); root.hidden = false;
    const items = engine.buildExpect(destinationKey);
    const dest = DATA.destinations.find(d => d.key === destinationKey);
    root.innerHTML = `
      <section class="itin-header">
        <h3>What to expect in ${escapeHtml(dest?.name || destinationKey)}</h3>
        <p class="hint">${escapeHtml(dest?.culturalNote || '')}</p>
      </section>
      <div class="expect-grid">
        ${items.map(x => `
          <section class="expect-card">
            <h4>${escapeHtml(x.label)}</h4>
            <p>${escapeHtml(x.text)}</p>
            <div class="expect-meta">
              <span class="conf-${x.confidence === 'high' ? 'high' : x.confidence === 'med' ? 'med' : 'low'}">Confidence: ${escapeHtml(x.confidence)}</span>
              <span>Updated ${escapeHtml(x.updated)}</span>
              <span>Source: ${escapeHtml(x.source)}</span>
            </div>
          </section>`).join('')}
      </div>`;
  };

  // ---- Group + journal ----
  const initGroup = () => {
    renderMembers();
    renderJournal();

    $('#add-member').addEventListener('click', () => {
      const f = $('#member-form');
      const name = f.name.value.trim();
      if (!name) return;
      const members = store.loadGroup();
      members.push({
        id: 'm' + Math.floor(performance.now()),
        name,
        ageBand: f.ageBand.value,
        constraints: parseList(f.constraints.value),
        vibe: f.vibe.value || '',
      });
      store.saveGroup(members);
      f.reset();
      renderMembers();
    });

    $('#members-list').addEventListener('click', (e) => {
      const btn = e.target.closest('button.remove'); if (!btn) return;
      const id = btn.dataset.id;
      store.saveGroup(store.loadGroup().filter(m => m.id !== id));
      renderMembers();
    });

    $('#add-journal').addEventListener('click', () => {
      const f = $('#journal-form');
      const title = f.title.value.trim() || 'Untitled entry';
      const entry = {
        id: 'j' + Math.floor(performance.now()),
        title,
        did: f.did.value.trim(),
        change: f.change.value.trim(),
        accessAccuracy: f.accessAccuracy.value,
        dietAccuracy: f.dietAccuracy.value,
        publicEntry: f.publicEntry.checked,
      };
      const j = store.loadJournal(); j.push(entry); store.saveJournal(j);
      f.reset();
      renderJournal();
      flash('#journal-note', 'Entry saved.');
    });
  };

  const renderMembers = () => {
    const list = $('#members-list');
    const members = store.loadGroup();
    if (!members.length) {
      list.innerHTML = `<li class="hint">No members yet. Add yourself and companions.</li>`;
    } else {
      list.innerHTML = members.map(m => `
        <li class="member">
          <header>
            <strong>${escapeHtml(m.name)}</strong>
            <span class="age">${escapeHtml(m.ageBand)}</span>
            <button class="remove" data-id="${m.id}" aria-label="Remove ${escapeHtml(m.name)}">Remove</button>
          </header>
          <div class="cons">${m.constraints && m.constraints.length ? escapeHtml(m.constraints.join(', ')) : '<span class="hint">no personal constraints listed</span>'}</div>
          ${m.vibe ? `<div class="hint">Prefers: ${escapeHtml(DATA.VIBES.find(v => v.key === m.vibe)?.title || m.vibe)}</div>` : ''}
        </li>`).join('');
    }

    renderTally();
  };

  const renderTally = () => {
    const wrap = $('#vote-tally');
    const summary = $('#shared-summary');
    const members = store.loadGroup();
    const votes = {};
    members.forEach(m => { if (m.vibe) votes[m.vibe] = (votes[m.vibe] || 0) + 1; });
    const rows = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((n, [, c]) => n + c, 0) || 1;
    wrap.innerHTML = rows.length
      ? rows.map(([k, c]) => {
          const label = DATA.VIBES.find(v => v.key === k)?.title || k;
          const pct = Math.round((c / total) * 100);
          return `<div class="row">
              <span class="name">${escapeHtml(label)}</span>
              <span class="name" style="text-align:right">${c}</span>
              <span class="bar"><span style="width:${pct}%"></span></span>
            </div>`;
        }).join('')
      : '<p class="hint">Nobody has picked a preferred vibe yet.</p>';

    const { winner, blend } = engine.blendGroupVibes(members);
    const constraints = engine.consolidateConstraints(members);
    if (!winner) {
      summary.innerHTML = 'Add members with preferred vibes to see the shared direction.';
    } else {
      const winnerLabel  = DATA.VIBES.find(v => v.key === winner)?.title  || winner;
      const blendLabel   = blend ? (DATA.VIBES.find(v => v.key === blend)?.title || blend) : null;
      summary.innerHTML = `Shared vibe: <strong>${escapeHtml(winnerLabel)}</strong>${
        blendLabel ? ` blended with <strong>${escapeHtml(blendLabel)}</strong>` : ''
      }. Every plan will also respect: ${constraints.length ? escapeHtml(constraints.join(', ')) : 'no group-wide constraints yet'}.`;
    }
  };

  const renderJournal = () => {
    const list = $('#journal-list');
    const entries = store.loadJournal();
    if (!entries.length) { list.innerHTML = ''; return; }
    list.innerHTML = entries.map(e => `
      <li class="entry">
        <h5>${escapeHtml(e.title)}</h5>
        ${e.did    ? `<p><strong>Did:</strong> ${escapeHtml(e.did)}</p>` : ''}
        ${e.change ? `<p><strong>Change:</strong> ${escapeHtml(e.change)}</p>` : ''}
        <div class="meta">
          ${e.accessAccuracy ? `<span>Access: ${escapeHtml(e.accessAccuracy)}</span>` : ''}
          ${e.dietAccuracy   ? `<span>Dietary: ${escapeHtml(e.dietAccuracy)}</span>`   : ''}
          <span>${e.publicEntry ? 'Public' : 'Private'}</span>
        </div>
      </li>`).join('');
  };

  // ---- Tabs + Demo seed ----
  const initTabs = () => {
    $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    $$('[data-goto]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.goto)));
  };

  const seedDemo = () => {
    const demoProfile = {
      version: 1,
      vibes: ['local', 'food-focused', 'family-friendly'],
      budget: 'comfort', pace: 'balanced',
      dietary: { halal: true, kosher: false, vegan: false, vegetarian: false,
        glutenFree: false, allergies: ['peanuts'], other: 'no pork' },
      accessibility: { stepFree: true, lowVision: false, lowHearing: false,
        seatingBreaks: true, notes: 'occasional wheelchair user (Nour)' },
      religiousCultural: 'Prefers to keep afternoon prayer window; Fridays quieter.',
      modesty: 'modest',
      medical: { devices: 'CPAP machine', medications: 'Insulin (refrigerated)', reminderCadence: 'twice-daily' },
      family:  { childrenAges: [5, 9], babyOnBoard: false, notes: 'nap window 14:30–15:30 for the 5-year-old' },
      avoid: ['crowded nightclubs', 'extreme heights'],
    };
    const demoGroup = [
      { id: 'demo-1', name: 'Amina',  ageBand: 'adult', constraints: ['halal','modest'], vibe: 'halal-food-culture' },
      { id: 'demo-2', name: 'Yusuf',  ageBand: 'adult', constraints: ['halal'],           vibe: 'live-like-local' },
      { id: 'demo-3', name: 'Nour',   ageBand: 'adult', constraints: ['step-free','seating breaks','halal'], vibe: 'relaxed-scenic' },
      { id: 'demo-4', name: 'Lena',   ageBand: 'child', constraints: ['peanut allergy'],  vibe: 'family-adventure' },
      { id: 'demo-5', name: 'Tariq',  ageBand: 'child', constraints: ['nap 14:30'],       vibe: 'family-adventure' },
    ];
    const demoJournal = [{
      id: 'demo-j1',
      title: 'Istanbul, day 2 — Balat and the ferry',
      did: 'Swapped Topkapı queue for a Balat morning walk and a Kadıköy ferry lunch. Kids loved the ferry.',
      change: 'Skip Grand Bazaar mid-day; do it near opening.',
      accessAccuracy: 'as-listed',
      dietAccuracy: 'better',
      publicEntry: true,
    }];
    store.saveProfile(demoProfile);
    store.saveGroup(demoGroup);
    store.saveJournal(demoJournal);
  };

  const initDemo = () => {
    $('#load-demo').addEventListener('click', () => {
      seedDemo();
      writeProfile(store.loadProfile());
      renderMembers();
      renderJournal();
      // Nudge the What-to-expect view too, if visible.
      const expSel = $('#expect-form select[name="destination"]');
      if (expSel) { expSel.value = 'istanbul'; expSel.dispatchEvent(new Event('change')); }
      flash('#demo-note', 'Demo trip loaded: a family of five to Istanbul. Open any tab to see it in action.');
    });
  };

  return {
    initTabs, populateDestinations,
    initProfile, initVibes,
    initPacking, initDiscover, initLocal, initExpect, initGroup, initDemo,
  };
})();

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', () => {
  ui.populateDestinations();
  ui.initTabs();
  ui.initProfile();
  ui.initVibes();
  ui.initPacking();
  ui.initDiscover();
  ui.initLocal();
  ui.initExpect();
  ui.initGroup();
  ui.initDemo();
});
