import { createServer } from 'node:http';

const port = Number(process.env.MOCK_OPENROUTER_PORT || 9100);
let call = 0;
let presentationShouldFail = true;

const readJSON = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch (error) { reject(error); }
  });
  req.on('error', reject);
});

const answer = (res, json, model = 'mock/model') => {
  const body = JSON.stringify({
    id: `mock-${++call}`, model,
    choices: [{ message: { role: 'assistant', content: JSON.stringify(json) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, cost: 0.001 },
  });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(body);
};

const outfitPlan = (days, palette = ['#334455', '#D8C7A1', '#6B4E3D']) => ({
  version: 2,
  contextSummary: ['live weather honored', 'saved profile honored', 'activities matched'],
  capsulePalette: palette,
  looks: Array.from({ length: Math.min(days, 6) }, (_, index) => ({
    id: `day-${index + 1}`, day: index + 1, period: 'day',
    name: `Context look ${index + 1}`, why: `Built for day ${index + 1}`,
    weatherNote: 'Layered for the forecast', activityNote: 'Walking-ready',
    vibeWords: ['quiet', 'editorial', 'travel-ready'],
    stylingNote: 'Texture-led practical layers.',
    pieces: [
      { part: 'top', item: 'breathable poplin shirt', color: 'ivory', reason: 'weather', searchQuery: 'ivory poplin shirt product cutout' },
      { part: 'bottom', item: 'wide-leg trousers', color: 'navy', reason: 'walking', searchQuery: 'navy wide leg trousers product cutout' },
      { part: 'shoes', item: 'cushioned walking shoes', color: 'brown', reason: 'comfort', searchQuery: 'brown walking shoes product cutout' },
      { part: 'outerwear', item: 'light rain layer', color: 'sand', reason: 'forecast', searchQuery: 'sand rain jacket product cutout' },
    ],
    reuse: ['walking shoes'],
  })),
});

const expectKeys = ['etiquette','clothing','tipping','prayer','driving','transit','scams','safety','accessibility','phrases','hours','photos','difference'];
const finalBundle = (days, destination) => ({
  destinationMeta: { key: destination, name: destination.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), country: 'Test Country', plug: 'A varied test trip.', culturalNote: 'Test local etiquette.', palette: ['#112233','#445566','#778899','#AA8855','#EEE0CC'], paletteNote: 'Test palette' },
  itinerary: {
    respectedFromProfile: ['saved profile'],
    days: Array.from({ length: days }, (_, i) => ({
      date: '', theme: `Different day ${i + 1}`,
      blocks: [
        { time: '09:30', title: `Independent café ${i + 1}`, duration: '60 min', kind: 'meal', sourceUrl: 'https://example.com', checkedAt: '2026-07-16' },
        { time: '11:00', title: `Neighborhood walk ${i + 1}`, duration: '90 min', kind: 'activity', sourceUrl: 'https://example.com', checkedAt: '2026-07-16' },
        { time: '14:00', title: `Small museum ${i + 1}`, duration: '90 min', kind: 'sight', sourceUrl: 'https://example.com', checkedAt: '2026-07-16' },
      ],
    })),
  },
  expect: expectKeys.map(key => ({ key, label: key, text: `Test ${key}`, confidence: 'high', updated: '2026-07', source: 'mock' })),
  local: Array.from({ length: 8 }, (_, i) => ({ name: `Local place ${i + 1}`, mix: 'small-business', businessSize: 'small', sub: 'Test', gemScore: 'Test', trafficNote: 'Test', rating: null, reviewCount: null, reviewSummary: '', sourceUrl: 'https://example.com', reviewSourceUrl: '', checkedAt: '2026-07-16' })),
  packing: {
    lists: ['Pack from home','Buy before leaving','Carry in your personal bag','Do not pack'].map(title => ({ title, items: [{ item: title, why: 'test' }], tone: '' })),
    reminders: [{ when: 'Night before', text: 'Test' }],
  },
});

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/chat/completions') {
    res.writeHead(404); res.end(); return;
  }
  const body = await readJSON(req);
  const system = String(body.messages?.[0]?.content || '');
  const userContent = body.messages?.at(-1)?.content;
  const user = typeof userContent === 'string'
    ? userContent
    : String(userContent?.filter?.(item => item.type === 'text').map(item => item.text).join('\n') || '');
  if (system.includes('strict binary image auditor')) {
    const pieceIndexes = [...user.matchAll(/pieceIndex\s+(\d+)/g)].map(match => Number(match[1]));
    answer(res, { audits: pieceIndexes.map((pieceIndex, index) => ({ pieceIndex, reject: index === 0, reason: index === 0 ? 'mock visible person' : 'clean product cutout' })) }, body.model);
  } else if (system.includes('visual fashion editor')) {
    const pieceIndexes = [...new Set([...user.matchAll(/pieceIndex\s+(\d+)/g)].map(match => Number(match[1])))];
    answer(res, { selections: pieceIndexes.map(pieceIndex => ({ pieceIndex, candidateIndex: 0, confidence: 0.9, reason: 'clean cutout' })), boardNote: 'Mock live-piece curation.' }, body.model);
  } else if (system.includes('travel wardrobe editor')) {
    const days = Number(user.match(/"days":(\d+)/)?.[1] || 3);
    const palette = JSON.parse(user.match(/"palette":(\[[^\]]+\])/i)?.[1] || '[]');
    answer(res, outfitPlan(days, palette.length ? palette : undefined), body.model);
  } else if (system.includes('discovery stage')) {
    answer(res, { places: Array.from({ length: 24 }, (_, i) => ({ name: `Candidate ${i + 1}`, category: i % 3 ? 'activity' : 'meal', neighborhood: `Area ${i % 4}`, why: 'Current test evidence', businessSize: 'small', sourceUrl: 'https://example.com', checkedAt: '2026-07-16' })), researchNotes: ['mock web research'] }, body.model);
  } else if (system.includes('review-research stage')) {
    answer(res, { reviews: Array.from({ length: 24 }, (_, i) => ({ name: `Candidate ${i + 1}`, rating: 4.5, reviewCount: 100 + i, reviewSummary: 'Recent positive themes', reviewSourceUrl: 'https://example.com', sourceUrl: 'https://example.com', checkedAt: '2026-07-16', cautions: '' })) }, body.model);
  } else if (system.includes('selection stage')) {
    answer(res, { selected: Array.from({ length: 12 }, (_, i) => ({ name: `Candidate ${i + 1}`, category: i % 3 ? 'activity' : 'meal', day: (i % 3) + 1, priority: i + 1, selectionReason: 'Test fit' })) }, body.model);
  } else if (system.includes('final itinerary-presentation stage')) {
    const days = Number(user.match(/Trip: (\d+) day/)?.[1] || 3);
    const destination = user.match(/in "([^"]+)"/)?.[1] || 'test-city';
    if (presentationShouldFail && !user.includes('previous final JSON failed validation')) {
      presentationShouldFail = false;
      const malformed = finalBundle(days, destination);
      malformed.itinerary.days = malformed.itinerary.days.slice(0, Math.max(0, days - 1));
      answer(res, malformed, body.model);
    } else {
      answer(res, finalBundle(days, destination), body.model);
    }
  } else {
    const text = user.toLowerCase();
    const destination = text.match(/(?:to|in)\s+([a-z -]+)/)?.[1]?.split(/\s+(?:for|with|in)\b/)[0].trim().replace(/\s+/g, '-') || 'lisbon';
    const days = Number(text.match(/(\d+)\s*(?:day|night)/)?.[1] || 3);
    answer(res, {
      reply: 'I have the trip.',
      trip: { destination, days, travelers: 1, arrivalDate: null, season: 'autumn', primaryVibe: 'live-like-local' },
      profile: { dietary: { halal: false, kosher: false, vegan: text.includes('vegan'), vegetarian: false, glutenFree: false, allergies: [], other: '' }, accessibility: { stepFree: false, lowVision: false, lowHearing: false, seatingBreaks: false, notes: '' }, modesty: 'no-preference', medical: { medications: '', devices: '', reminderCadence: 'none' }, family: { childrenAges: [], babyOnBoard: false, notes: '' }, budget: 'mid', pace: 'balanced', avoid: [] },
      missing: [],
    }, body.model);
  }
}).listen(port, '127.0.0.1', () => console.log(`mock OpenRouter at http://127.0.0.1:${port}`));
