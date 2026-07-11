/* malem — dependency-free. Modules: store, data, engine, auth, ui. */

// ---------- store ----------
const store = (() => {
  const K = {
    session: 'malem.session.v1',
    accounts: 'malem.accounts.v1',
    profile:  (e) => `malem.profile.v1.${e}`,
    trip:     (e) => `malem.trip.v1.${e}`,
    group:    (e) => `malem.group.v1.${e}`,
    journal:  (e) => `malem.journal.v1.${e}`,
    theme:    'malem.theme.v1',
  };
  const readJSON = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };

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

  return {
    emptyProfile,
    session: { get: () => readJSON(K.session, null), set: (s) => localStorage.setItem(K.session, JSON.stringify(s)), clear: () => localStorage.removeItem(K.session) },
    accounts: { all: () => readJSON(K.accounts, {}), save: (m) => localStorage.setItem(K.accounts, JSON.stringify(m)) },
    profile: {
      load: (e) => ({ ...emptyProfile(), ...(readJSON(K.profile(e), {}) || {}) }),
      save: (e, v) => localStorage.setItem(K.profile(e), JSON.stringify(v)),
      clear: (e) => localStorage.removeItem(K.profile(e)),
    },
    trip:   { load: (e) => readJSON(K.trip(e), null),    save: (e, t) => localStorage.setItem(K.trip(e), JSON.stringify(t)),   clear: (e) => localStorage.removeItem(K.trip(e)) },
    group:  { load: (e) => readJSON(K.group(e), []),     save: (e, g) => localStorage.setItem(K.group(e), JSON.stringify(g)),  clear: (e) => localStorage.removeItem(K.group(e)) },
    journal:{ load: (e) => readJSON(K.journal(e), []),   save: (e, j) => localStorage.setItem(K.journal(e), JSON.stringify(j)), clear: (e) => localStorage.removeItem(K.journal(e)) },
    theme:  { get: () => localStorage.getItem(K.theme) || '', set: (t) => t ? localStorage.setItem(K.theme, t) : localStorage.removeItem(K.theme) },
  };
})();

// ---------- data ----------
const DATA = (() => {
  const destinations = [
    { key: 'istanbul',  name: 'Istanbul',  country: 'Türkiye',  plug: 'Type C/F',
      culturalNote: 'Muslim-majority; modest dress helps at religious sites; strong tea and coffee culture.',
      // Curated palette (5 tones)
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

  const weatherLine = (key, season) => {
    const t = {
      istanbul:  { summer: 'Hot and humid, breeze off the Bosphorus in the evenings.',
                   winter: 'Cold and grey, with occasional rain.',
                   spring: 'Mild and blooming; some afternoon showers.',
                   autumn: 'Crisp and clear, jacket weather most mornings.' },
      kyoto:     { summer: 'Hot and humid, brief thunderstorms.',
                   winter: 'Cold and dry, some snow on the temples.',
                   spring: 'Mild with cherry blossoms; cool mornings.',
                   autumn: 'Cool and dry, deep foliage colours.' },
      marrakech: { summer: 'Very hot and dry, cool desert nights.',
                   winter: 'Warm days, cold nights.',
                   spring: 'Warm and sunny; comfortable.',
                   autumn: 'Warm and dry, tourist high season.' },
      paris:     { summer: 'Warm days, occasional heatwaves.',
                   winter: 'Cold and grey; damp.',
                   spring: 'Cool with light showers.',
                   autumn: 'Cool and drizzly.' },
      nyc:       { summer: 'Hot and humid; air-conditioning everywhere.',
                   winter: 'Cold and windy; layers essential.',
                   spring: 'Cool with sudden showers.',
                   autumn: 'Crisp and colourful; layer weather.' },
    };
    return (t[key] || {})[season] || 'Season varies — check forecast closer to travel.';
  };

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
      { name: 'Hagia Sophia',           mix: 'famous',         cat: 'sights',   sub: 'The essential first visit.',                     traffic: 'high' },
      { name: 'Karaköy simit stand',    mix: 'small-business', cat: 'food',     sub: 'Warm simit and hot çay from a family stand.',    traffic: 'low' },
      { name: 'Balat side streets',     mix: 'neighborhood',   cat: 'sights',   sub: 'Painted houses, antique doors, quiet mornings.', traffic: 'medium' },
      { name: 'Vefa Bozacısı',          mix: 'hidden',         cat: 'food',     sub: 'Century-old boza shop most tourists miss.',      traffic: 'low' },
      { name: 'Ramadan iftar in Sultanahmet', mix: 'seasonal', cat: 'food',     sub: 'Public iftar tables during Ramadan.',            traffic: 'high' },
      { name: 'Kadıköy fish market',    mix: 'neighborhood',   cat: 'shopping', sub: 'Everyday market on the Asian side.',             traffic: 'medium' },
    ],
    kyoto: [
      { name: 'Fushimi Inari (dawn)',   mix: 'famous',         cat: 'sights',   sub: 'Icon — go before 7 to breathe.',                 traffic: 'high' },
      { name: 'Nishiki side alleys',    mix: 'neighborhood',   cat: 'food',     sub: 'Skip the main run, cut through the alleys.',     traffic: 'medium' },
      { name: 'Ippodo main shop',       mix: 'small-business', cat: 'shopping', sub: 'Old matcha house; short tastings.',              traffic: 'low' },
      { name: 'Ohara at rice-planting', mix: 'seasonal',       cat: 'outdoors', sub: 'Rural hamlet north of the city.',                traffic: 'low' },
      { name: 'Kissa Master (silent café)', mix: 'hidden',     cat: 'food',     sub: 'Old-style jazz kissa; talk quietly.',            traffic: 'low' },
      { name: "Philosopher's Path stroll", mix: 'neighborhood', cat: 'outdoors', sub: 'Canal-side walk between two temples.',           traffic: 'medium' },
    ],
    marrakech: [
      { name: 'Jemaa el-Fnaa (sunset)', mix: 'famous',         cat: 'sights',   sub: 'The square as it wakes up.',                     traffic: 'high' },
      { name: 'Sidi Ghanem craft studios', mix: 'small-business', cat: 'shopping', sub: 'Design ateliers outside the medina.',         traffic: 'low' },
      { name: 'Neighborhood mahlaba',   mix: 'neighborhood',   cat: 'food',     sub: 'Local dairy bar — msemmen and coffee.',          traffic: 'low' },
      { name: 'Ben Youssef library courtyard', mix: 'hidden', cat: 'sights',   sub: 'Quiet in the afternoons.',                       traffic: 'low' },
      { name: 'Rose festival day trip', mix: 'seasonal',       cat: 'outdoors', sub: "Kelaa M'Gouna in mid-May.",                      traffic: 'medium' },
      { name: 'Bahia Palace',           mix: 'famous',         cat: 'sights',   sub: 'The most-photographed palace.',                  traffic: 'high' },
    ],
    paris: [
      { name: 'Louvre (late Wednesday)', mix: 'famous',        cat: 'sights',   sub: 'Icon — go late-open days.',                      traffic: 'high' },
      { name: "Marché d'Aligre",        mix: 'neighborhood',   cat: 'food',     sub: 'Everyday market, no tourist markup.',            traffic: 'medium' },
      { name: 'Du Pain et des Idées',   mix: 'small-business', cat: 'food',     sub: 'Small bakery loved by neighbors.',               traffic: 'medium' },
      { name: 'Musée de la Vie Romantique tea garden', mix: 'hidden', cat: 'sights', sub: 'Quiet courtyard museum.',                traffic: 'low' },
      { name: 'Fête de la Musique',     mix: 'seasonal',       cat: 'sights',   sub: 'Free citywide music, June 21.',                  traffic: 'high' },
      { name: 'Coulée Verte walk',      mix: 'neighborhood',   cat: 'outdoors', sub: 'Elevated linear park.',                          traffic: 'low' },
    ],
    nyc: [
      { name: 'Statue of Liberty',      mix: 'famous',         cat: 'sights',   sub: 'The icon.',                                      traffic: 'high' },
      { name: 'Arthur Avenue market',   mix: 'neighborhood',   cat: 'food',     sub: 'Bronx Italian food street.',                     traffic: 'medium' },
      { name: "Sunny's (Red Hook)",     mix: 'small-business', cat: 'food',     sub: 'Neighborhood bar with live music.',              traffic: 'low' },
      { name: 'City Island in summer',  mix: 'seasonal',       cat: 'outdoors', sub: 'Fishing-village feel in the Bronx.',             traffic: 'medium' },
      { name: 'The Frick (reopened)',   mix: 'hidden',         cat: 'sights',   sub: 'Smaller museum; slower pace.',                   traffic: 'low' },
      { name: 'Corona taquería row',    mix: 'small-business', cat: 'food',     sub: 'Queens street tacos.',                           traffic: 'medium' },
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

  // Seed community journal entries — the public "what travelers actually did" feed.
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
      accessAccuracy: '', dietAccuracy: 'as-listed',
      tags: ['kosher','solo'] },
    { id: 'c3', authorName: 'Priya',   destination: 'marrakech', date: '2026-03-19',
      title: 'Souks on a rest day',
      did: 'I was tired after three days of medina, so I did a slow morning at Le Jardin Secret, then Sidi Ghanem for the crafts and coffee. The pace saved the trip.',
      change: 'Would have paid more for a riad with a real garden. The one I chose had a plunge pool and it went unused.',
      accessAccuracy: 'worse', dietAccuracy: 'as-listed',
      tags: ['vegetarian','solo','modest'] },
    { id: 'c4', authorName: 'Marco',   destination: 'paris',     date: '2026-06-08',
      title: "Marché d'Aligre morning",
      did: 'Went to the market at 9. Bought half a wheel of comté and ate it on a bench in the Coulée Verte. Small joys.',
      change: 'Skip the Louvre — the Musée de la Vie Romantique on the same afternoon was ten times better and a fifth of the crowd.',
      accessAccuracy: '', dietAccuracy: 'as-listed',
      tags: ['solo'] },
    { id: 'c5', authorName: 'Kenji',   destination: 'kyoto',     date: '2026-11-04',
      title: "Philosopher's Path in the rain",
      did: 'The maples were mid-turn and the drizzle kept everyone home. My mother uses a cane — the whole path was flat and the temples on either end had elevators to the main halls.',
      change: 'Would have started earlier so we could have coffee at Blue Bottle before the walk.',
      accessAccuracy: 'as-listed', dietAccuracy: 'as-listed',
      tags: ['senior','step-free'] },
    { id: 'c6', authorName: 'Sophie',  destination: 'nyc',       date: '2026-08-22',
      title: 'Brooklyn with a stroller',
      did: 'Rented a folding stroller from a mom in Park Slope. Did the Botanic Garden in the morning, DUMBO for the afternoon shade, and ate slices at Di Fara after the baby went down.',
      change: 'The G train elevator was out — plan around that if you go weekend.',
      accessAccuracy: 'worse', dietAccuracy: 'as-listed',
      tags: ['family','step-free'] },
    { id: 'c7', authorName: 'Nour',    destination: 'istanbul',  date: '2026-05-14',
      title: 'Wheelchair notes on Balat',
      did: "Balat is beautiful but not step-free at all — cobbles + hills. Kadıköy was the opposite: flat, wide sidewalks, ferry with a ramp. I'd stay there next time.",
      change: 'Ask the hotel about accessible taxis in advance. The regular ones aren\'t.',
      accessAccuracy: 'worse', dietAccuracy: 'as-listed',
      tags: ['halal','step-free'] },
    { id: 'c8', authorName: 'Yuki',    destination: 'paris',     date: '2026-05-01',
      title: 'A vegan patisserie hunt',
      did: 'Three days, six patisseries. Land&Monkeys was consistent, Cloud Cakes was fun. Skipped the tourist-heavy ones.',
      change: 'Would have added Aujourd\'hui Demain for a proper sit-down lunch.',
      accessAccuracy: '', dietAccuracy: 'as-listed',
      tags: ['vegan','solo'] },
    { id: 'c9', authorName: 'Fatima',  destination: 'marrakech', date: '2026-02-11',
      title: 'Modest dressing in the medina',
      did: 'Long linen everything. A shopkeeper adjusted my scarf and taught me to tie it Moroccan-style — it stayed on all day.',
      change: 'Bring one dark scarf that hides indigo transfer from local textiles.',
      accessAccuracy: 'as-listed', dietAccuracy: 'better',
      tags: ['halal','modest','solo'] },
    { id: 'c10', authorName: 'Daniel', destination: 'nyc',       date: '2026-10-14',
      title: 'The Frick on a Wednesday',
      did: 'Wednesday afternoon: quiet, no timed entry needed, and the reopened Fifth Avenue rooms feel like a private home.',
      change: 'Would pair it with a walk through Central Park to the reservoir on the way out.',
      accessAccuracy: 'better', dietAccuracy: '',
      tags: ['solo','senior'] },
    { id: 'c11', authorName: 'Zineb',  destination: 'istanbul',  date: '2026-06-01',
      title: 'Iftar tables in Sultanahmet',
      did: 'Public iftar at the Blue Mosque grounds. Strangers passed dates, an aunt insisted I take her extra tea. I have never felt more welcomed anywhere.',
      change: 'Arrive an hour before maghrib — you\'ll get a proper seat.',
      accessAccuracy: 'as-listed', dietAccuracy: 'better',
      tags: ['halal','modest','family'] },
    { id: 'c12', authorName: 'Hannah', destination: 'paris',     date: '2026-09-20',
      title: 'Fête des Vendanges in Montmartre',
      did: "Wine harvest weekend. A choir on Rue Lepic, tastings in the vineyard, and dinner at a bistro that hadn't caught on to the crowd yet.",
      change: 'Book the bistro. We got lucky and shouldn\'t rely on it.',
      accessAccuracy: '', dietAccuracy: 'as-listed',
      tags: ['solo'] },
  ];

  // Curated Unsplash editorial photo IDs, chosen for warm/neutral fashion mood.
  // (URLs use images.unsplash.com direct — network hosting shows them; sandboxed previews fall back to gradient tiles.)
  const outfitImages = {
    'top':       ['1554568218-0f1715e72254','1490481651871-ab68de25d43d','1571679654681-ba01b9e1e117','1509316975850-ff9c5deb0cd9'],
    'bottom':    ['1548036328-c9fa89d128fa','1591047139829-d91aecb6caea','1552327819-8ea4b7e0c9b6','1544441893-675973e31985'],
    'outer':     ['1594633312681-425c7b97ccd1','1551803091-e20673f15770','1524504388940-b1c1722653e1','1509316975850-ff9c5deb0cd9'],
    'shoes':     ['1560243563-062bfc001d68','1595950653106-6c9ebd614d3a','1543163521-1bf539c55dd2','1608231387042-66d1773070a5'],
    'accessory': ['1483985988355-763728e1935b','1541101767792-f9b2b1c4f127','1571513800374-df1bbe650e56','1517254797898-04edd251bfb3'],
  };

  return { destinations, weatherLine, VIBES, places, expectations, meta, outfitImages, communityEntries };
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
      else if (p.dietary.vegan) { respects.push('vegan-friendly'); }
      else if (p.dietary.vegetarian) { respects.push('vegetarian-friendly'); }
      if (p.dietary.glutenFree) respects.push('gluten-free');
      if ((p.dietary.allergies || []).length) respects.push('allergy-safe');
    }
    if (p.accessibility.stepFree)      respects.push('step-free');
    if (p.accessibility.seatingBreaks && (block.kind === 'sight' || block.kind === 'activity'))
      respects.push('seating breaks');
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
    const primary = req.primaryVibe;
    const respected = respectedFromProfile(profile);
    const days = [];
    for (let d = 0; d < req.days; d++) {
      const themes = vibeThemes[primary] || [`Day ${d + 1}`];
      const theme = themes[d % themes.length];
      const pool = blockPools[primary] || [];
      const shaped = paceFilter(pool, profile.pace).map(b => applyProfile(b, profile));
      const isoDate = req.arrivalDate
        ? new Date(new Date(req.arrivalDate).getTime() + d * 86400000).toISOString().slice(0, 10)
        : undefined;
      days.push({ date: isoDate, theme, blocks: shaped });
    }
    return { request: req, respectedFromProfile: respected, days };
  };

  const suggestVibe = (profile) => {
    const v = new Set(profile.vibes || []);
    if (profile.dietary.halal) return 'halal-food-culture';
    if ((profile.family.childrenAges || []).length || profile.family.babyOnBoard) return 'family-adventure';
    if (v.has('luxury') || profile.budget === 'luxury') return 'luxury-without-rush';
    if (v.has('local') || v.has('food-focused')) return 'live-like-local';
    if (v.has('relaxed')) return 'relaxed-scenic';
    if (v.has('adventurous')) return 'hidden-gems';
    return 'iconic-first-visit';
  };

  // ----- Packing (same generator as before, refined text) -----
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
        steps: [ covered('A café with a view'), 'Slow walk under cover', 'Bookshop or small gallery',
                 family ? 'Playful stop' : 'Sit-down tea' ] },
      { title: 'Food-focused', badge: dietTag(),
        why: `Stalls and cafés respecting your dietary profile (${dietTag()}).`,
        steps: [ 'Bakery start',
                 wet ? 'Covered market walk' : hot ? 'Iced treat and short walk' : 'Local market walk',
                 'Lunch — profile-respecting', 'Sweet stop for the road' ] },
      { title: 'Cultural', badge: profile.accessibility.stepFree ? 'Step-free preferred' : 'Moderate',
        why: 'A cultural loop calibrated to your energy and any step-free needs.',
        steps: [ wet ? 'Museum or covered courtyard' : 'Historic quarter walk',
                 cold ? 'Warm-up stop' : hot ? 'Shaded courtyard' : 'A small independent site',
                 'Sunset viewpoint', 'Bite before heading back' ] },
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
      gemScore: p.mix === 'hidden'   ? 'Hidden — strong local sentiment.' :
                p.mix === 'small-business' ? 'Small business — repeat visitors verify.' :
                p.mix === 'neighborhood'   ? 'Neighborhood favourite.' :
                p.mix === 'famous'         ? 'Icon — go early or off-hours.' :
                p.mix === 'seasonal'       ? 'Seasonal — check the window.' : '',
      trafficNote: p.traffic === 'high' ? 'High traffic — consider off-hours.' :
                   p.traffic === 'low'  ? 'Low traffic — respect the quiet.' : 'Steady traffic.',
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

  // ----- Outfits (mood-board pins per day) -----
  const buildOutfits = (itinerary, profile, season, destinationKey) => {
    const s = ({ spring:{ warmth:'cool', outer:'trench' },
                 summer:{ warmth:'warm', outer:'linen shirt for evening' },
                 autumn:{ warmth:'cool', outer:'wool coat' },
                 winter:{ warmth:'cold', outer:'insulated overcoat' } }[season])
             || { warmth:'mild', outer:'light jacket' };
    const modest = profile.modesty !== 'no-preference';
    const family = (profile.family.childrenAges || []).length || profile.family.babyOnBoard;
    const palette = (DATA.destinations.find(d => d.key === destinationKey)?.palette) || ['#E4D9BC','#8E6E4C','#1F1C15','#D5C7A6','#5C4232'];

    const pick = (arr, i) => arr[i % arr.length];
    const IM = DATA.outfitImages;

    const pieceForTop = (fine) => fine ? (modest ? 'Draped silk blouse, long sleeve' : 'Silk blouse')
                                       : (modest ? 'Loose linen shirt, long sleeve' : (s.warmth === 'cold' ? 'Cream cashmere sweater' : 'Cotton tee or linen shirt'));
    const pieceForBottom = (fine) => fine ? (modest ? 'Ankle-length silk trouser' : 'Tailored trouser')
                                          : (modest ? 'Midi skirt or wide-leg trouser' : (s.warmth === 'cold' ? 'Straight-leg denim' : 'Tailored short or midi skirt'));

    const looks = [];
    itinerary.days.forEach((day, dayIndex) => {
      const walking = day.blocks.some(b => b.kind === 'activity' || b.kind === 'sight');
      const religious = day.blocks.some(b => /mosque|shrine|temple|religious/i.test(b.title)) || /halal/i.test(day.theme);
      const fine = day.blocks.some(b => /tasting|refined|classic dinner/i.test(b.title));
      const evening = day.blocks.some(b => Number(b.time.split(':')[0]) >= 18);

      // Day look
      const dayLook = {
        dayIndex: dayIndex + 1, date: day.date, theme: day.theme,
        name: religious ? 'Modest day look' : 'Day look',
        why: [ walking ? 'Walking day' : 'Easier day',
               religious ? 'Covered for religious stops' : '',
               modest ? 'Modest cut' : '',
               family ? 'Kid-friendly' : '',
               profile.accessibility.stepFree ? 'Step-free footwear' : '',
               s.warmth === 'cold' ? 'Layered for cold' : s.warmth === 'warm' ? 'Breathable' : '' ].filter(Boolean).join(' · '),
        items: [
          { part: 'Top',       value: pieceForTop(false) },
          { part: 'Bottom',    value: pieceForBottom(false) },
          { part: 'Outer',     value: s.warmth === 'cold' ? s.outer : 'Light layer if evening cools' },
          { part: 'Shoes',     value: profile.accessibility.stepFree ? 'Cushioned flats' : (walking ? 'Soft leather sneakers or loafers' : 'Slim loafers') },
          { part: 'Accessory', value: religious ? 'Silk headscarf' : (s.warmth === 'cold' ? 'Wool scarf' : 'Wide-brim straw hat') },
        ],
      };
      looks.push(dayLook);

      if (evening) {
        looks.push({
          dayIndex: dayIndex + 1, date: day.date, theme: day.theme,
          name: fine ? 'Refined evening' : (religious ? 'Modest evening' : 'Evening look'),
          why: [ fine ? 'Fine dinner' : 'City evening',
                 modest ? 'Modest cut kept' : '',
                 profile.accessibility.stepFree ? 'Step-free footwear' : '' ].filter(Boolean).join(' · '),
          items: [
            { part: 'Top',       value: pieceForTop(true) },
            { part: 'Bottom',    value: pieceForBottom(true) + (modest ? ', midi length' : '') },
            { part: 'Outer',     value: s.warmth === 'cold' ? 'Long wool coat' : 'Silk-blend blazer' },
            { part: 'Shoes',     value: profile.accessibility.stepFree ? 'Block-heel or elegant flat' : (fine ? 'Polished heel or brogue' : 'Chelsea boot') },
            { part: 'Accessory', value: fine ? 'Statement pendant' : 'Slim watch, simple earrings' },
          ],
        });
      }
    });

    // Build pins: one "hero" pin per look (the whole outfit), plus two key
    // pieces as separate mood tiles. Keeps the board dense but not overwhelming.
    const pins = [];
    looks.forEach((look, looki) => {
      const [heroImg, ...restImgs] = IM.top; // just to seed indices deterministically
      // 1) Hero pin — the whole look
      pins.push({
        kind: 'look',
        dayIndex: look.dayIndex, date: look.date, theme: look.theme,
        look: look.name, why: look.why,
        items: look.items,
        img: `https://images.unsplash.com/photo-${pick(IM.top, looki)}?w=520&q=80&auto=format&fit=crop`,
        toneA: palette[looki % palette.length],
        toneB: palette[(looki + 3) % palette.length],
        ar: pick(['3/4', '4/5', '2/3'], looki),
      });
      // 2) Two key pieces (rotates across parts so the board has variety)
      const keyParts = ['Top', 'Shoes'];
      keyParts.forEach((partName, ki) => {
        const item = look.items.find(x => x.part === partName);
        if (!item) return;
        const imgs = IM[partName.toLowerCase()] || IM.top;
        pins.push({
          kind: 'piece',
          dayIndex: look.dayIndex, date: look.date, theme: look.theme,
          look: look.name,
          part: item.part, value: item.value,
          img: `https://images.unsplash.com/photo-${pick(imgs, looki * 3 + ki)}?w=420&q=80&auto=format&fit=crop`,
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
    const [winner, wCount] = sorted[0];
    const r = sorted[1];
    return { winner, blend: r && r[1] >= wCount / 2 ? r[0] : null, votes };
  };
  const consolidateConstraints = (members) => {
    const set = new Set();
    members.forEach(m => (m.constraints || []).forEach(c => set.add(c)));
    return Array.from(set);
  };

  return { buildItinerary, suggestVibe, buildPacking, buildDiscover, buildLocal, buildExpect, buildOutfits, blendGroupVibes, consolidateConstraints };
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
    store.session.set({ email });
  };
  return { signup, signin, signout, current, useDemo };
})();

// ---------- ui ----------
const ui = (() => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const flash = (sel, msg) => { const el = $(sel); if (!el) return; el.textContent = msg; clearTimeout(el._t); el._t = setTimeout(() => (el.textContent = ''), 4500); };
  const parseList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const parseIntList = (s) => parseList(s).map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);

  const showScreen = (name) => {
    ['auth','setup','dash','public'].forEach(s => { $('#screen-' + s).hidden = s !== name; });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const populateDestinations = () => {
    const opts = DATA.destinations.map(d => `<option value="${d.key}">${escapeHtml(d.name)} — ${escapeHtml(d.country)}</option>`).join('');
    $$('select[data-destinations]').forEach(sel => { sel.innerHTML = opts; });
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
      $('#auth-lede').textContent  = isSignup ? 'Prototype accounts are stored in this browser.' : 'Sign in to pick up your next trip.';
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
        route();
      } catch (err) { flash('#auth-note', err.message || 'Something went wrong.'); }
    });
    $('#try-demo-account').addEventListener('click', (e) => {
      e.preventDefault(); auth.useDemo();
      const email = auth.current().email;
      if (!store.trip.load(email)) {
        store.trip.save(email, { destination: 'istanbul', arrivalDate: '', days: 4, travelers: 5, primaryVibe: 'halal-food-culture', season: 'summer' });
      }
      route();
    });
  };

  // ---- Setup ----
  const initSetup = () => {
    const form = $('#setup-form'); const grid = $('#setup-vibes'); const hint = $('#vibe-hint');
    const renderVibeGrid = (suggested) => {
      grid.innerHTML = DATA.VIBES.map(v => `
        <label class="vibe-tile" data-value="${v.key}"${v.key === suggested ? ' data-selected="true"' : ''}>
          <input type="radio" name="primaryVibe" value="${v.key}"${v.key === suggested ? ' checked' : ''} />
          <span class="title">${escapeHtml(v.title)}</span>
          <span class="sub">${escapeHtml(v.sub)}</span>
        </label>`).join('');
      grid.addEventListener('change', () => {
        const val = (grid.querySelector('input:checked') || {}).value || '';
        $$('.vibe-tile', grid).forEach(t => t.dataset.selected = String(t.dataset.value === val));
      });
    };
    const render = () => {
      const me = auth.current();
      $('#setup-hi').textContent = `Hi, ${me.name.split(/\s+/)[0]}`;
      const profile = store.profile.load(me.email);
      const suggested = engine.suggestVibe(profile);
      hint.textContent = (profile.vibes && profile.vibes.length)
        ? 'Pick one. Suggestion is drawn from your saved profile.'
        : 'Pick a vibe. You can adjust your profile any time.';
      renderVibeGrid(suggested);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const me = auth.current();
      const primaryVibe = (form.primaryVibe.value || engine.suggestVibe(store.profile.load(me.email)));
      const trip = {
        destination: form.destination.value,
        arrivalDate: form.arrivalDate.value || '',
        days: Math.max(1, Math.min(21, Number(form.days.value) || 4)),
        travelers: Math.max(1, Number(form.travelers.value) || 1),
        primaryVibe, season: guessSeason(form.arrivalDate.value),
      };
      store.trip.save(me.email, trip);
      location.hash = '#/itinerary';
      route();
    });
    $('#setup-edit-profile').addEventListener('click', () => openProfileSheet(render));
    $('#setup-signout').addEventListener('click', (e) => { e.preventDefault(); auth.signout(); route(); });
    return { render };
  };
  let setupRender = null;

  const guessSeason = (isoDate) => {
    if (!isoDate) return 'summer';
    const m = new Date(isoDate).getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
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
  const openProfileSheet = (onClose) => {
    const me = auth.current(); if (!me) return;
    writeProfileForm(store.profile.load(me.email));
    $('#sheet-profile').hidden = false;
    const close = () => { $('#sheet-profile').hidden = true; onClose && onClose(); };
    $$('#sheet-profile [data-close-sheet]').forEach(el => el.addEventListener('click', close, { once: true }));
    $('#save-profile').onclick = () => { store.profile.save(me.email, readProfileForm()); flash('#save-note', 'Saved.'); };
    $('#reset-profile').onclick = () => {
      if (!confirm('Clear your saved profile? Local only.')) return;
      store.profile.clear(me.email); writeProfileForm(store.emptyProfile());
      flash('#save-note', 'Profile cleared.');
    };
  };

  // ---- Dashboard ----
  const initDash = () => {
    $('#btn-change-trip').addEventListener('click', () => {
      const me = auth.current();
      store.trip.clear(me.email);
      location.hash = '';
      route();
    });
    $('#btn-profile').addEventListener('click', () => openProfileSheet(renderDashCurrent));
    $('#btn-signout').addEventListener('click', () => { auth.signout(); route(); });
    $('#btn-theme').addEventListener('click', toggleTheme);
    $('#side-toggle').addEventListener('click', () => {
      const d = $('#screen-dash'); d.dataset.navOpen = d.dataset.navOpen === 'true' ? 'false' : 'true';
    });

    // Packing / discover / local option toggles
    $('#toggle-packing-controls').addEventListener('click', () => { const f = $('#packing-form'); f.hidden = !f.hidden; });
    $('#btn-rebuild-packing').addEventListener('click', () => { renderPacking(readPackingReq()); });
    $('#toggle-discover-controls').addEventListener('click', () => { const f = $('#discover-form'); f.hidden = !f.hidden; });
    $('#btn-rebuild-discover').addEventListener('click', renderDiscover);
    $('#toggle-local-controls').addEventListener('click', () => { const f = $('#local-form'); f.hidden = !f.hidden; });
    $('#btn-rebuild-local').addEventListener('click', renderLocal);

    // Group + journal
    $('#add-member').addEventListener('click', () => {
      const me = auth.current(); const f = $('#member-form');
      const name = f.name.value.trim(); if (!name) return;
      const members = store.group.load(me.email);
      members.push({ id: 'm' + Math.floor(performance.now()), name, ageBand: f.ageBand.value, constraints: parseList(f.constraints.value), vibe: f.vibe.value || '' });
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
        id: 'j' + Math.floor(performance.now()),
        title: f.title.value.trim() || 'Untitled entry',
        did: f.did.value.trim(), change: f.change.value.trim(),
        accessAccuracy: f.accessAccuracy.value, dietAccuracy: f.dietAccuracy.value,
        publicEntry: f.publicEntry.checked,
      };
      const list = store.journal.load(me.email); list.push(entry); store.journal.save(me.email, list);
      f.reset(); renderJournal(); flash('#journal-note', 'Entry saved.');
    });

    // Route on hash change / nav clicks
    window.addEventListener('hashchange', showRoute);
    $$('.side-nav a').forEach(a => a.addEventListener('click', () => {
      $('#screen-dash').dataset.navOpen = 'false';
    }));
  };

  // Individual page renderers -------
  const renderSidebar = (me, trip) => {
    $('#who-name').textContent = me.name;
    const dest = DATA.destinations.find(d => d.key === trip.destination);
    $('#trip-dest').textContent = dest ? dest.name : trip.destination;
    $('#trip-meta').textContent =
      `${trip.days} day${trip.days > 1 ? 's' : ''}, ${trip.travelers} traveler${trip.travelers > 1 ? 's' : ''} · ` +
      (DATA.VIBES.find(v => v.key === trip.primaryVibe)?.title || trip.primaryVibe);
  };

  const renderItinerary = () => {
    const me = auth.current(); const trip = store.trip.load(me.email); const profile = store.profile.load(me.email);
    const dest = DATA.destinations.find(d => d.key === trip.destination);
    const vibe = DATA.VIBES.find(v => v.key === trip.primaryVibe);
    $('#itin-hero').textContent = dest ? dest.name : trip.destination;
    $('#itin-vibe-label').textContent = vibe ? vibe.title : trip.primaryVibe;
    $('#itin-kicker').textContent = vibe ? vibe.sub : '';
    $('#weather-note').textContent = DATA.weatherLine(trip.destination, trip.season || 'summer');
    $('#palette-note').textContent = dest?.paletteNote || '';
    $('#palette-swatches').innerHTML = (dest?.palette || []).map(c => `<span class="swatch" style="background:${c}"></span>`).join('');
    $('#badge-days').textContent = `${trip.days} day${trip.days > 1 ? 's' : ''}`;
    $('#badge-travelers').textContent = `${trip.travelers} traveler${trip.travelers > 1 ? 's' : ''}`;
    $('#badge-vibe').textContent = vibe?.title || trip.primaryVibe;

    const itin = engine.buildItinerary(trip, profile);
    $('#itinerary-output').innerHTML = itin.days.map((day, i) => `
      <article class="itin-day">
        <header>
          <h3>Day ${i + 1}${day.date ? ` <span class="hint" style="font-family:var(--font-sans);font-size:.85rem;margin-left:.5rem;">${escapeHtml(day.date)}</span>` : ''}</h3>
          <span class="theme">${escapeHtml(day.theme)}</span>
        </header>
        ${day.blocks.map(b => `
          <div class="itin-block">
            <div class="when">${escapeHtml(b.time)}<br /><small>${escapeHtml(b.duration)}</small></div>
            <div class="what">
              <strong>${escapeHtml(b.title)}</strong>
              <small>${escapeHtml(b.kind)}</small>
              ${b.respects ? `<div class="respects">${b.respects.map(r => `<span>${escapeHtml(r)}</span>`).join('')}</div>` : ''}
            </div>
          </div>`).join('')}
      </article>`).join('');
  };

  const renderOutfits = () => {
    const me = auth.current(); const trip = store.trip.load(me.email); const profile = store.profile.load(me.email);
    const itin = engine.buildItinerary(trip, profile);
    const { pins } = engine.buildOutfits(itin, profile, trip.season || 'summer', trip.destination);
    // Group pins by day for section headers, but render one big masonry per day.
    const byDay = {};
    pins.forEach(p => { (byDay[p.dayIndex] ||= []).push(p); });
    const root = $('#outfits-output');
    root.innerHTML = Object.keys(byDay).map(k => {
      const dayPins = byDay[k];
      const first = dayPins[0];
      return `
        <div class="outfit-day-head">
          <h3>Day ${escapeHtml(k)}${first.date ? ` <span class="hint" style="font-family:var(--font-sans);font-size:.85rem;margin-left:.5rem;">${escapeHtml(first.date)}</span>` : ''}</h3>
          <p class="theme">${escapeHtml(first.theme)}</p>
        </div>
        <div class="moodboard">
          ${dayPins.map(p => {
            if (p.kind === 'look') {
              const itemsList = p.items.map(it => `<li><span class="k">${escapeHtml(it.part)}</span><span>${escapeHtml(it.value)}</span></li>`).join('');
              return `
                <div class="pin pin--hero">
                  <div class="thumb" style="--ar:${p.ar}; --tone-a:${p.toneA}; --tone-b:${p.toneB};">
                    <img loading="lazy" decoding="async" src="${p.img}" alt="${escapeHtml(p.look)}" onerror="this.remove()" />
                    <span class="motif" aria-hidden="true">${escapeHtml(p.look)}</span>
                  </div>
                  <div class="caption">
                    <span class="eyebrow">${escapeHtml(p.look)}</span>
                    <ul class="look-items">${itemsList}</ul>
                    ${p.why ? `<div class="meta">${escapeHtml(p.why)}</div>` : ''}
                  </div>
                </div>`;
            }
            return `
              <div class="pin">
                <div class="thumb" style="--ar:${p.ar}; --tone-a:${p.toneA}; --tone-b:${p.toneB};">
                  <img loading="lazy" decoding="async" src="${p.img}" alt="${escapeHtml(p.value)}" onerror="this.remove()" />
                  <span class="motif small" aria-hidden="true">${escapeHtml(p.value.split(/\s+/).slice(0, 2).join(' '))}</span>
                </div>
                <div class="caption">
                  <span class="eyebrow">${escapeHtml(p.part)}</span>
                  <div class="name">${escapeHtml(p.value)}</div>
                  <div class="meta">${escapeHtml(p.look)}</div>
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');
  };

  const readPackingReq = () => {
    const me = auth.current(); const trip = store.trip.load(me.email); const f = $('#packing-form');
    return {
      destination: trip.destination, days: trip.days,
      season: f.season.value, luggage: f.luggage.value,
      laundry: f.laundry.checked, rentThere: f.rentThere.checked,
      activities: $$('[data-chips="activities"] input:checked').map(i => i.value),
    };
  };
  const renderPacking = (req) => {
    const me = auth.current();
    if (!req) {
      // Set defaults from trip on first render
      const trip = store.trip.load(me.email);
      const defaults = { 'live-like-local':['walking-city'], 'iconic-first-visit':['walking-city','museums'],
        'relaxed-scenic':[], 'hidden-gems':['walking-city'], 'family-adventure':['walking-city'],
        'halal-food-culture':['walking-city','religious-sites'], 'luxury-without-rush':['fine-dining'] };
      const acts = defaults[trip.primaryVibe] || ['walking-city'];
      $$('[data-chips="activities"] input').forEach(i => { i.checked = acts.includes(i.value); });
      $('#packing-form select[name="season"]').value = trip.season || 'summer';
      req = readPackingReq();
    }
    const result = engine.buildPacking(req, store.profile.load(me.email));
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
    const me = auth.current(); const trip = store.trip.load(me.email); const f = $('#discover-form');
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
    const me = auth.current(); const trip = store.trip.load(me.email); const f = $('#local-form');
    const ctx = { destination: trip.destination, category: f.category.value, mix: $$('[data-chips="local-mix"] input:checked').map(i => i.value) };
    const places = engine.buildLocal(ctx);
    $('#local-output').innerHTML = places.length ? `
      <div class="places">
        ${places.map(p => `
          <article class="place" data-mix="${escapeHtml(p.mix)}">
            <header><h4>${escapeHtml(p.name)}</h4><span class="type">${escapeHtml(p.mix.replace('-', ' '))}</span></header>
            <p class="sub">${escapeHtml(p.sub)}</p>
            <p class="score">${escapeHtml(p.gemScore)}</p>
            <span class="traffic">${escapeHtml(p.trafficNote)}</span>
          </article>`).join('')}
      </div>` : `<p class="hint">Nothing matched — expand the filters.</p>`;
  };

  const renderExpect = () => {
    const me = auth.current(); const trip = store.trip.load(me.email);
    const dest = DATA.destinations.find(d => d.key === trip.destination);
    const items = engine.buildExpect(trip.destination);
    $('#expect-kicker').textContent = dest?.culturalNote || '';
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
          ${e.accessAccuracy ? `<span>Access ${escapeHtml(e.accessAccuracy)}</span>` : ''}
          ${e.dietAccuracy   ? `<span>Dietary ${escapeHtml(e.dietAccuracy)}</span>`   : ''}
          <span>${e.publicEntry ? 'Public' : 'Private'}</span>
        </div>
      </li>`).join('');
  };

  // Whole-dashboard render used after profile edit or account switch.
  const renderDashCurrent = () => {
    const me = auth.current(); const trip = store.trip.load(me.email);
    if (!me || !trip) return;
    renderSidebar(me, trip);
    renderItinerary();
    renderMembers();
    renderJournal();
    // Re-render whatever's currently visible
    showRoute();
  };

  // Route handling — one page visible at a time
  const showRoute = () => {
    // If the hash is for a public/auth surface, delegate to the top-level router.
    if ((location.hash || '').startsWith('#/community') || location.hash === '#/auth') { route(); return; }
    // Only render dashboard pages when the dashboard screen is actually up.
    if ($('#screen-dash').hidden) return;
    const me = auth.current(); if (!me) return;
    const trip = store.trip.load(me.email); if (!trip) return;

    const raw = (location.hash || '#/itinerary').replace(/^#\/?/, '').split('?')[0] || 'itinerary';
    const known = ['itinerary','outfits','packing','expect','discover','local','group'];
    const name = known.includes(raw) ? raw : 'itinerary';
    $$('.page').forEach(p => p.hidden = p.dataset.page !== name);
    $$('.side-nav a').forEach(a => a.classList.toggle('is-active', a.dataset.route === name));

    if (name === 'itinerary') renderItinerary();
    if (name === 'outfits')   renderOutfits();
    if (name === 'packing')   renderPacking(null);
    if (name === 'expect')    renderExpect();
    if (name === 'discover')  renderDiscover();
    if (name === 'local')     renderLocal();
    if (name === 'group')     { renderMembers(); renderJournal(); }
    document.querySelector('.content').scrollTo?.(0, 0);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // ---- Community (public) ----
  const getCommunityEntries = () => {
    // Bring together seed entries + any *local* accounts' public journal entries,
    // so users who publish appear alongside the seeded community feed.
    const seeds = (DATA.communityEntries || []).map(e => ({ ...e, source: 'seed' }));
    const localAccounts = store.accounts.all();
    const local = [];
    Object.entries(localAccounts).forEach(([email, acc]) => {
      const j = store.journal.load(email);
      const trip = store.trip.load(email);
      j.filter(x => x.publicEntry).forEach(x => {
        local.push({
          id: `local-${email}-${x.id}`,
          authorName: acc.name || email.split('@')[0],
          destination: trip?.destination || 'unknown',
          date: x.date || '',
          title: x.title,
          did: x.did, change: x.change,
          accessAccuracy: x.accessAccuracy, dietAccuracy: x.dietAccuracy,
          tags: [],
          source: 'local',
        });
      });
    });
    // Newest first (by date string; safe fallback if empty)
    return [...seeds, ...local].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  };

  const initPublic = () => {
    // Populate destination filter from DATA
    const destSel = $('#public-filter-dest');
    DATA.destinations.forEach(d => {
      const o = document.createElement('option');
      o.value = d.key; o.textContent = `${d.name} — ${d.country}`;
      destSel.appendChild(o);
    });
    destSel.addEventListener('change', renderCommunity);
    $('#public-filter-tag').addEventListener('change', renderCommunity);

    // The "Sign in" link on public bar goes back to the auth gate.
    $('#public-signin').addEventListener('click', (e) => {
      e.preventDefault(); location.hash = '#/auth';
    });
    $('#auth-goto-community').addEventListener('click', (e) => {
      // Anchor click; nothing to do beyond letting the hash change fire the router.
    });
  };

  const renderCommunity = () => {
    // Relabel the top-right button based on session state.
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

  // Router: community is always public; otherwise sign-in → setup → dashboard.
  const route = () => {
    // Community view is public — anyone can browse it.
    if ((location.hash || '').startsWith('#/community')) {
      renderCommunity();
      showScreen('public');
      return;
    }
    const me = auth.current();
    // Not signed in → auth screen (regardless of hash).
    if (!me) { showScreen('auth'); return; }
    // Signed in but no trip → setup screen.
    const trip = store.trip.load(me.email);
    if (!trip) { setupRender && setupRender(); showScreen('setup'); return; }
    // Signed in with a trip → dashboard. Ignore #/auth left over from public nav.
    renderSidebar(me, trip);
    if (!location.hash || location.hash === '#/auth') {
      history.replaceState(null, '', '#/itinerary');
    }
    showScreen('dash');
    showRoute();
  };

  return {
    boot: () => {
      applyTheme();
      populateDestinations();
      initAuth();
      const s = initSetup(); setupRender = s.render;
      initDash();
      initPublic();
      window.addEventListener('hashchange', route);
      route();
    },
  };
})();

document.addEventListener('DOMContentLoaded', ui.boot);
