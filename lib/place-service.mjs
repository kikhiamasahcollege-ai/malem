import { normalizePlaceOption } from './trip-contract.mjs';

const MAX_SEARCHES = 6;
const MAX_OPTIONS = 4;
const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

const PLAN_TEMPLATES = [
  {
    title: 'Relaxed nearby', badge: 'Easy pace',
    why: 'A calm route with comfortable pauses and minimal backtracking.',
    steps: [
      { title: 'Settle into a nearby café', intent: 'cafe' },
      { title: 'Browse a small gallery, bookshop, or public space', intent: 'public-space' },
      { title: 'Finish with tea or a scenic pause', intent: 'cafe' },
    ],
  },
  {
    title: 'Food-focused', badge: 'Local flavor',
    why: 'A market-led route with several ways to match dietary preferences.',
    steps: [
      { title: 'Start at a local bakery', intent: 'bakery' },
      { title: 'Walk a local market', intent: 'market' },
      { title: 'Choose a nearby lunch stop', intent: 'lunch' },
      { title: 'Pick up something sweet', intent: 'bakery' },
    ],
  },
  {
    title: 'Cultural loop', badge: 'History and place',
    why: 'A coherent cultural loop built around current, visitable places.',
    steps: [
      { title: 'Explore a cultural site', intent: 'museum' },
      { title: 'Walk a historic area', intent: 'public-space' },
      { title: 'End at a viewpoint or public space', intent: 'public-space' },
    ],
  },
];

const text = (value, max = 1_200) => String(value ?? '').trim().slice(0, max);

const profileSignals = (profile = {}) => {
  const signals = [];
  if (profile.dietary?.halal) signals.push('halal');
  if (profile.dietary?.kosher) signals.push('kosher');
  if (profile.dietary?.vegan) signals.push('vegan');
  if (profile.dietary?.vegetarian) signals.push('vegetarian');
  if (profile.dietary?.glutenFree) signals.push('gluten-free');
  if (profile.accessibility?.stepFree) signals.push('step-free preferred');
  if (profile.family?.babyOnBoard || profile.family?.childrenAges?.length) signals.push('family-friendly');
  return signals;
};

const queryFor = (intent, destination, context, profile) => {
  const near = text(context.startingLocation, 300) || destination;
  const signals = profileSignals(profile).join(' ');
  const intentQuery = {
    cafe: 'independent quiet cafe or tea room', 'public-space': 'independent gallery bookshop historic public space viewpoint',
    bakery: 'local bakery', market: 'local public market food market', lunch: 'independent lunch restaurant',
    museum: 'museum cultural center',
  }[intent] || intent;
  return `${intentQuery} near ${near} ${signals}`.replace(/\s+/g, ' ').trim();
};

const googleSearch = async ({ intent, destination, context, profile, apiKey, fetchImpl }) => {
  const body = {
    textQuery: queryFor(intent, destination, context, profile),
    pageSize: MAX_OPTIONS,
    languageCode: 'en',
    ...(Number.isFinite(Number(context.latitude)) && Number.isFinite(Number(context.longitude)) ? {
      locationBias: {
        circle: {
          center: { latitude: Number(context.latitude), longitude: Number(context.longitude) },
          radius: Math.min(12_000, Math.max(1_500, Number(context.radiusMeters) || 5_000)),
        },
      },
    } : {}),
  };
  const response = await fetchImpl(GOOGLE_PLACES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': [
        'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
        'places.primaryType', 'places.rating', 'places.userRatingCount', 'places.websiteUri',
        'places.googleMapsUri', 'places.businessStatus', 'places.editorialSummary', 'places.reviewSummary',
      ].join(','),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Google Places returned ${response.status}.`);
  const data = await response.json();
  return (data.places || []).filter((place) => place.businessStatus !== 'CLOSED_PERMANENTLY').map((place) => normalizePlaceOption({
    ...place,
    providerPlaceId: place.id,
    name: place.displayName?.text,
    description: place.reviewSummary?.text || place.editorialSummary?.text || `${place.primaryType || 'Place'} at ${place.formattedAddress || destination}.`,
    reviewSummary: place.reviewSummary?.text || '',
    category: intent,
    sourceUrl: place.googleMapsUri,
    reviewsUrl: place.googleMapsUri,
    officialUrl: place.websiteUri,
    checkedAt: new Date().toISOString().slice(0, 10),
  }));
};

const extractJson = (value) => {
  const source = String(value || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Place research returned no JSON object.');
  return JSON.parse(match[0]);
};

const openRouterSearch = async ({ destination, context, profile, apiKey, baseUrl, fetchImpl }) => {
  const intents = [...new Set(PLAN_TEMPLATES.flatMap((plan) => plan.steps.map((step) => step.intent)))];
  const response = await fetchImpl(`${String(baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: `You research real, currently operating places for a travel app. Use web search before answering. Return strict JSON only: {"places":[{"intent":"one requested intent","name":"verified place","description":"one short factual description or paraphrased review theme","address":"","latitude":number|null,"longitude":number|null,"rating":number|null,"reviewCount":number|null,"sourceUrl":"current reputable or official URL","reviewsUrl":"current review/listing URL","officialUrl":"official website or empty","checkedAt":"YYYY-MM-DD"}]}. Find at least two distinct real options per intent when evidence allows. Never invent ratings, counts, coordinates, URLs, accessibility, or open status. Omit unavailable values.`,
        },
        {
          role: 'user',
          content: [
            `Destination: ${destination}`,
            `Starting area: ${text(context.startingLocation, 300) || 'destination center'}`,
            `Available time: ${Number(context.hours) || 3} hours; weather: ${text(context.weather, 80)}; energy: ${text(context.energy, 80)}; party: ${text(context.party, 80)}.`,
            `Explicit traveler requirements: ${profileSignals(profile).join(', ') || 'none supplied'}.`,
            `Requested intents: ${intents.join(', ')}.`,
          ].join('\n'),
        },
      ],
      tools: [{ type: 'web_search' }],
      max_tokens: 7_000,
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`Live place research returned ${response.status}.`);
  const data = await response.json();
  const result = extractJson(data.choices?.[0]?.message?.content);
  return (Array.isArray(result.places) ? result.places : []).slice(0, 40).map((place) => ({
    intent: text(place.intent, 80),
    // checkedAt means when Malem performed this lookup, not a date the model
    // happened to emit from an example or stale page.
    place: normalizePlaceOption({ ...place, checkedAt: new Date().toISOString().slice(0, 10) }),
  })).filter((entry) => entry.intent && entry.place.name && entry.place.sourceUrl);
};

const fallbackOptions = (intent, destination, context) => {
  const query = queryFor(intent, destination, context, {});
  const sourceUrl = `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query }).toString()}`;
  return [normalizePlaceOption({
    name: `Search nearby ${intent} options`,
    description: `Live place research is temporarily unavailable. Open the map search and verify current hours and reviews before leaving.`,
    category: intent,
    sourceUrl,
    directionsUrl: sourceUrl,
    checkedAt: new Date().toISOString().slice(0, 10),
  })];
};

const buildPlans = ({ destination, context, grouped, degraded }) => {
  const maxSteps = Math.max(2, Math.min(4, (Number(context.hours) || 3) + 1));
  return PLAN_TEMPLATES.map((template) => ({
    ...template,
    badge: template.title === 'Relaxed nearby' && context.energy === 'low' ? 'Low energy' : template.badge,
    why: `${template.why} Built for ${Number(context.hours) || 3}h and ${text(context.weather, 40) || 'current'} weather.`,
    steps: template.steps.slice(0, maxSteps).map((step) => {
      const options = (grouped.get(step.intent) || []).slice(0, MAX_OPTIONS);
      const resolved = options.length ? options : fallbackOptions(step.intent, destination, context);
      return {
        ...step,
        description: options.length
          ? `${resolved.length} current option${resolved.length === 1 ? '' : 's'} near your starting area.`
          : 'Live results are unavailable; use the linked map search as a fallback.',
        options: resolved,
        selectedOptionId: resolved[0]?.id || '',
        degraded: degraded || !options.length,
      };
    }),
  }));
};

export const discoverPlaces = async ({
  destination,
  context = {},
  profile = {},
  googleApiKey = '',
  openRouterApiKey = '',
  openRouterBaseUrl = 'https://openrouter.ai/api/v1',
  fetchImpl = globalThis.fetch,
} = {}) => {
  if (!text(destination, 240)) throw Object.assign(new Error('Destination is required.'), { status: 400 });
  const grouped = new Map();
  let provider = 'degraded';
  let degraded = false;
  let upstreamCalls = 0;
  const errors = [];

  if (googleApiKey) {
    provider = 'google-places';
    const intents = [...new Set(PLAN_TEMPLATES.flatMap((plan) => plan.steps.map((step) => step.intent)))].slice(0, MAX_SEARCHES);
    const results = await Promise.all(intents.map(async (intent) => {
      upstreamCalls += 1;
      try { return [intent, await googleSearch({ intent, destination, context, profile, apiKey: googleApiKey, fetchImpl })]; }
      catch (error) { errors.push(error.message); return [intent, []]; }
    }));
    results.forEach(([intent, places]) => grouped.set(intent, places));
  } else if (openRouterApiKey) {
    provider = 'openrouter-web';
    upstreamCalls = 1;
    try {
      const candidates = await openRouterSearch({
        destination, context, profile, apiKey: openRouterApiKey,
        baseUrl: openRouterBaseUrl, fetchImpl,
      });
      candidates.forEach(({ intent, place }) => {
        const list = grouped.get(intent) || [];
        if (!list.some((candidate) => candidate.sourceUrl === place.sourceUrl || candidate.name.toLowerCase() === place.name.toLowerCase())) list.push(place);
        grouped.set(intent, list);
      });
    } catch (error) { errors.push(error.message); }
  }

  if (![...grouped.values()].some((places) => places.length)) degraded = true;
  const generatedAt = new Date().toISOString();
  return {
    provider,
    degraded,
    upstreamCalls,
    errors: errors.slice(0, 4),
    session: {
      context: {
        destination: text(destination, 240),
        hours: Math.min(12, Math.max(1, Number(context.hours) || 3)),
        weather: text(context.weather, 40),
        energy: text(context.energy, 40),
        party: text(context.party, 40),
        startingLocation: text(context.startingLocation, 500),
      },
      generatedAt,
      stale: false,
      degraded,
      plans: buildPlans({ destination, context, grouped, degraded }),
    },
  };
};

export const __test = { MAX_SEARCHES, MAX_OPTIONS, PLAN_TEMPLATES, queryFor };
