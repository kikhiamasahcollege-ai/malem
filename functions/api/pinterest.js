// Server-side full-outfit image discovery. The endpoint is deliberately
// bounded: one request can make at most three upstream fetches and return at
// most twelve references. Positive results are cached at the edge and inside a
// warm isolate so upstream failures degrade to older results instead of causing
// a retry cascade.
const SEARCH_VERSION = 'full-look-v1';
const MAX_QUERY_LENGTH = 180;
const MAX_RESULTS = 12;
const MAX_UPSTREAM_FETCHES = 3;
const UPSTREAM_TIMEOUT_MS = 4500;
const FRESH_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_TTL_MS = 7 * FRESH_TTL_MS;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_SEARCHES_PER_WINDOW = 24;
const MAX_MEMORY_ENTRIES = 80;

const memoryCache = new Map();
const inFlight = new Map();
const rateBuckets = new Map();

const jsonResponse = (data, { ttl = 300, degraded = false, status = 200 } = {}) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': `public, max-age=${Math.min(ttl, 900)}, s-maxage=${ttl}, stale-while-revalidate=604800, stale-if-error=604800`,
      'X-Image-Pipeline': degraded ? 'degraded' : 'live',
      'X-Upstream-Request-Cap': String(MAX_UPSTREAM_FETCHES),
    },
  });

const normalizeQuery = (value) => String(value || '')
  .replace(/[\u0000-\u001f\u007f]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_QUERY_LENGTH)
  .toLowerCase();

const remember = (query, data) => {
  memoryCache.delete(query);
  memoryCache.set(query, { data, savedAt: Date.now() });
  while (memoryCache.size > MAX_MEMORY_ENTRIES) memoryCache.delete(memoryCache.keys().next().value);
};

const remembered = (query, maxAge = FRESH_TTL_MS) => {
  const entry = memoryCache.get(query);
  return entry && Date.now() - entry.savedAt <= maxAge ? entry.data : null;
};

const cacheStorage = () => {
  try { return globalThis.caches?.default || null; } catch { return null; }
};

const cacheKey = (request, query) => {
  const url = new URL(request.url);
  url.pathname = `/__malem-cache/${SEARCH_VERSION}/outfit-search`;
  url.search = `?q=${encodeURIComponent(query)}`;
  return new Request(url.toString(), { method: 'GET' });
};

const readEdgeCache = async (request, query) => {
  const storage = cacheStorage();
  if (!storage) return null;
  try { return (await storage.match(cacheKey(request, query))) || null; } catch { return null; }
};

const writeEdgeCache = async (request, query, response) => {
  const storage = cacheStorage();
  if (!storage) return;
  try { await storage.put(cacheKey(request, query), response.clone()); } catch {}
};

const withinRateLimit = (request) => {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return true;
  const now = Date.now();
  const current = rateBuckets.get(ip);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  if (rateBuckets.size > 500) {
    for (const [key, bucket] of rateBuckets) {
      if (now - bucket.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
  }
  return current.count <= MAX_SEARCHES_PER_WINDOW;
};

const boundedFetch = async (budget, target, init = {}) => {
  if (budget.remaining <= 0) throw new Error('Upstream request budget exhausted');
  budget.remaining -= 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(target, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const extractImages = (html) => {
  const normalized = String(html || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  const images = new Set();
  const patterns = [
    /https:\/\/i\.pinimg\.com\/[0-9]+x\/[a-z0-9/]+\.(?:jpg|jpeg|png|webp)/gi,
    /https:\/\/i\.pinimg\.com\/originals\/[a-z0-9/]+\.(?:jpg|jpeg|png|webp)/gi,
  ];
  for (const pattern of patterns) {
    for (const url of normalized.match(pattern) || []) {
      images.add(url.replace('/236x/', '/736x/').replace('/474x/', '/736x/').replace('/60x60_RS/', '/736x/'));
      if (images.size >= MAX_RESULTS) return [...images];
    }
  }
  return [...images];
};

const extractBingThumbnails = (html) => {
  const normalized = String(html || '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/');
  const images = new Set();
  for (const match of normalized.matchAll(/"turl":"(https?:\/\/[^"\\]+)"/gi)) {
    try {
      const url = new URL(match[1]);
      if (/^ts[0-9]+\.mm\.bing\.net$/i.test(url.hostname) || /^tse[0-9]+\.mm\.bing\.net$/i.test(url.hostname) || url.hostname === 'th.bing.com') {
        images.add(url.toString());
      }
    } catch {}
    if (images.size >= MAX_RESULTS) break;
  }
  return [...images];
};

const requestHeaders = {
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
};

const fetchWebImageCandidates = async (query, budget) => {
  const target = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&safeSearch=Strict&form=HDRSC3`;
  const response = await boundedFetch(budget, target, {
    headers: requestHeaders,
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });
  return response.ok ? extractBingThumbnails(await response.text()) : [];
};

const safeExternalUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; }
};

const fetchDuckDuckGoCandidates = async (query, budget) => {
  const headers = {
    'Accept-Language': 'en-US,en;q=0.8',
    'User-Agent': requestHeaders['User-Agent'],
  };
  const searchPage = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const pageResponse = await boundedFetch(budget, searchPage, {
    headers,
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });
  if (!pageResponse.ok) return [];
  const page = await pageResponse.text();
  const token = page.match(/vqd=[^0-9]*([0-9-]+)/i)?.[1];
  if (!token || budget.remaining <= 0) return [];
  const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token)}&f=,,,&p=1`;
  const response = await boundedFetch(budget, apiUrl, {
    headers: { ...headers, 'Accept': 'application/json', 'Referer': 'https://duckduckgo.com/' },
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });
  if (!response.ok) return [];
  const data = await response.json();
  // Require a whole-look signal. Generic garment words such as "dress",
  // "blouse", or "shoes" are intentionally not sufficient.
  const fashionWords = /outfit|lookbook|street style|style inspiration|what to wear|fashion week|attendee looks?|streetwear|resort wear|beachwear|modest fashion|travel style/i;
  const singularProduct = /isolated|product only|flat lay|white background|handbag only|shoe only/i;
  const travelNoise = /tour package|travel guide|hotel|itinerary|things to do|tripadvisor|booking\.com|guided tour/i;
  return (data.results || [])
    .filter(result => fashionWords.test(`${result.title || ''} ${result.url || ''}`) && !singularProduct.test(result.title || '') && !travelNoise.test(result.title || ''))
    .map(result => {
      const image = safeExternalUrl(result.thumbnail);
      let allowed = false;
      try {
        const host = new URL(image).hostname;
        allowed = /^ts[0-9]+\.mm\.bing\.net$/i.test(host) || /^tse[0-9]+\.mm\.bing\.net$/i.test(host) || host === 'th.bing.com';
      } catch {}
      return allowed ? { image, title: String(result.title || '').slice(0, 180), sourceUrl: safeExternalUrl(result.url) } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_RESULTS);
};

const discover = async (query) => {
  const budget = { remaining: MAX_UPSTREAM_FETCHES };
  const pinterestUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
  let pins = [];
  let source = 'none';

  try {
    const response = await boundedFetch(budget, pinterestUrl, {
      headers: requestHeaders,
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
    const pinterestImages = response.ok ? extractImages(await response.text()) : [];
    if (pinterestImages.length >= 4) {
      pins = pinterestImages.map(image => ({ image, title: query, sourceUrl: pinterestUrl }));
      source = 'pinterest';
    }
  } catch {}

  if (pins.length < 4 && budget.remaining > 0) {
    try {
      const duckPins = await fetchDuckDuckGoCandidates(query, budget);
      if (duckPins.length) {
        pins = duckPins;
        source = 'duckduckgo-image-search';
      }
    } catch {}
  }

  if (pins.length < 4 && budget.remaining > 0) {
    try {
      const bingPins = (await fetchWebImageCandidates(query, budget))
        .map(image => ({ image, title: query, sourceUrl: pinterestUrl }));
      if (bingPins.length) {
        pins = bingPins;
        source = 'web-image-search';
      }
    } catch {}
  }

  const seen = new Set();
  pins = pins.filter(pin => pin.image && !seen.has(pin.image) && seen.add(pin.image)).slice(0, MAX_RESULTS);
  return {
    images: pins.map(pin => pin.image),
    pins,
    query,
    source,
    degraded: pins.length === 0,
    upstreamRequests: MAX_UPSTREAM_FETCHES - budget.remaining,
  };
};

export async function onRequestGet({ request, waitUntil }) {
  const query = normalizeQuery(new URL(request.url).searchParams.get('q'));
  if (!query) return jsonResponse({ images: [], pins: [], degraded: true, reason: 'missing-query' }, { ttl: 300, degraded: true });

  const edgeHit = await readEdgeCache(request, query);
  if (edgeHit) return edgeHit;

  const memoryHit = remembered(query);
  if (memoryHit) return jsonResponse({ ...memoryHit, cache: 'memory' }, { ttl: 86400, degraded: Boolean(memoryHit.degraded) });

  if (!withinRateLimit(request)) {
    const stale = remembered(query, STALE_TTL_MS);
    return jsonResponse({
      ...(stale || { images: [], pins: [], query, source: 'none' }),
      degraded: true,
      reason: 'request-cap',
      cache: stale ? 'stale-memory' : 'miss',
    }, { ttl: 300, degraded: true });
  }

  let pending = inFlight.get(query);
  if (!pending) {
    pending = discover(query).finally(() => inFlight.delete(query));
    inFlight.set(query, pending);
  }

  try {
    const data = await pending;
    if (data.images.length) remember(query, data);
    const response = jsonResponse(data, { ttl: data.images.length ? 86400 : 300, degraded: data.degraded });
    if (data.images.length) {
      const write = writeEdgeCache(request, query, response);
      if (typeof waitUntil === 'function') waitUntil(write);
      else await write;
    }
    return response;
  } catch (error) {
    const stale = remembered(query, STALE_TTL_MS);
    return jsonResponse({
      ...(stale || { images: [], pins: [], query, source: 'none' }),
      degraded: true,
      reason: stale ? 'stale-upstream-fallback' : 'upstream-unavailable',
      error: String(error?.message || 'Image search failed').slice(0, 160),
    }, { ttl: 300, degraded: true });
  }
}

export const __test = { normalizeQuery, extractImages, extractBingThumbnails, MAX_RESULTS, MAX_UPSTREAM_FETCHES };
