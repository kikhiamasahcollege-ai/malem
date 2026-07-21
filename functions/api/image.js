// Same-origin fallback image proxy for outfit galleries. The browser tries the
// remote image directly first, so this function is used only when hotlinking is
// blocked. Edge caching, in-flight deduplication, size/time limits, and a
// lightweight placeholder keep failures from turning into retry storms.
const ALLOWED_HOSTS = new Set([
  'i.pinimg.com',
  'loremflickr.com',
  'images.unsplash.com',
  'images.pexels.com',
]);
const MAX_URL_LENGTH = 2048;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 2;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_PROXY_MISSES_PER_WINDOW = 60;

const inFlight = new Map();
const rateBuckets = new Map();

const isAllowedHost = (hostname) => ALLOWED_HOSTS.has(hostname)
  || /^ts[0-9]+\.mm\.bing\.net$/i.test(hostname)
  || /^tse[0-9]+\.mm\.bing\.net$/i.test(hostname)
  || hostname === 'th.bing.com';

const cacheStorage = () => {
  try { return globalThis.caches?.default || null; } catch { return null; }
};

const canonicalTarget = (url) => {
  const clean = new URL(url);
  clean.hash = '';
  return clean;
};

const cacheKey = (request, target) => {
  const url = new URL(request.url);
  url.pathname = '/__malem-cache/full-look-v1/image';
  url.search = `?url=${encodeURIComponent(target.toString())}`;
  return new Request(url.toString(), { method: 'GET' });
};

const readEdgeCache = async (request, target) => {
  const storage = cacheStorage();
  if (!storage) return null;
  try { return (await storage.match(cacheKey(request, target))) || null; } catch { return null; }
};

const writeEdgeCache = async (request, target, response) => {
  const storage = cacheStorage();
  if (!storage) return;
  try { await storage.put(cacheKey(request, target), response.clone()); } catch {}
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
  return current.count <= MAX_PROXY_MISSES_PER_WINDOW;
};

const placeholder = (reason = 'image-unavailable') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960" role="img" aria-label="Outfit reference unavailable"><rect width="720" height="960" fill="#e9dfcf"/><path d="M250 420h220M280 470h160M310 520h100" stroke="#9b8b77" stroke-width="12" stroke-linecap="round"/><text x="360" y="590" text-anchor="middle" fill="#6e6255" font-family="system-ui,sans-serif" font-size="24">Reference temporarily unavailable</text></svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff',
      'X-Image-Pipeline': 'degraded',
      'X-Image-Pipeline-Reason': reason,
    },
  });
};

const fetchOnce = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      redirect: 'manual',
      headers: {
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; malem-outfit-gallery/2.0)',
      },
      cf: { cacheEverything: true, cacheTtl: 2592000 },
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) throw new Error('image-too-large');
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const retrieveImage = async (initialTarget) => {
  let target = initialTarget;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const upstream = await fetchOnce(target);
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('redirect-failed');
      const redirected = canonicalTarget(new URL(location, target));
      if (redirected.protocol !== 'https:' || !isAllowedHost(redirected.hostname)) throw new Error('redirect-host-not-allowed');
      target = redirected;
      continue;
    }
    if (!upstream.ok) throw new Error(`upstream-${upstream.status}`);
    const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) throw new Error('upstream-not-image');
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) throw new Error('image-too-large');
    return { body, type };
  }
  throw new Error('redirect-failed');
};

const imageResponse = ({ body, type }) => new Response(body, {
  headers: {
    'Content-Type': type,
    'Content-Length': String(body.byteLength),
    'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800, stale-if-error=604800, immutable',
    'X-Content-Type-Options': 'nosniff',
    'X-Image-Pipeline': 'proxied',
  },
});

export async function onRequestGet({ request, waitUntil }) {
  const raw = new URL(request.url).searchParams.get('url') || '';
  if (!raw || raw.length > MAX_URL_LENGTH) return placeholder('invalid-url');

  let target;
  try { target = canonicalTarget(raw); } catch { return placeholder('invalid-url'); }
  if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) return placeholder('host-not-allowed');

  const edgeHit = await readEdgeCache(request, target);
  if (edgeHit) return edgeHit;
  if (!withinRateLimit(request)) return placeholder('request-cap');

  const key = target.toString();
  let pending = inFlight.get(key);
  if (!pending) {
    pending = retrieveImage(target).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }

  try {
    const image = await pending;
    const response = imageResponse(image);
    const write = writeEdgeCache(request, target, response);
    if (typeof waitUntil === 'function') waitUntil(write);
    else await write;
    return response;
  } catch (error) {
    const response = placeholder(String(error?.message || 'upstream-failed').slice(0, 80));
    const write = writeEdgeCache(request, target, response);
    if (typeof waitUntil === 'function') waitUntil(write);
    else await write;
    return response;
  }
}

export const __test = { isAllowedHost, canonicalTarget, MAX_IMAGE_BYTES, MAX_PROXY_MISSES_PER_WINDOW };
