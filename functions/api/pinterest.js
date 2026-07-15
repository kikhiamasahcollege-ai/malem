// Server-side Pinterest image discovery for outfit inspiration. Keeping this in
// a Pages Function avoids browser CORS failures. The UI still has a keyless
// photo fallback if Pinterest changes its public HTML.
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
      if (images.size >= 30) return [...images];
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
    if (images.size >= 36) break;
  }
  return [...images];
};

const fetchWebImageCandidates = async (query) => {
  const target = `https://www.bing.com/images/search?q=${encodeURIComponent(`${query} fashion outfit`)}&safeSearch=Strict&form=HDRSC3`;
  const response = await fetch(target, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    },
    cf: { cacheEverything: true, cacheTtl: 3600 },
  });
  return response.ok ? extractBingThumbnails(await response.text()) : [];
};

const safeExternalUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; }
};

const fetchDuckDuckGoCandidates = async (query) => {
  const headers = {
    'Accept-Language': 'en-US,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  };
  const searchPage = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const pageResponse = await fetch(searchPage, { headers, cf: { cacheEverything: true, cacheTtl: 3600 } });
  if (!pageResponse.ok) return [];
  const page = await pageResponse.text();
  const token = page.match(/vqd=[^0-9]*([0-9-]+)/i)?.[1];
  if (!token) return [];
  const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token)}&f=,,,&p=1`;
  const response = await fetch(apiUrl, {
    headers: { ...headers, 'Accept': 'application/json', 'Referer': 'https://duckduckgo.com/' },
    cf: { cacheEverything: true, cacheTtl: 3600 },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results || []).map(result => {
    const image = safeExternalUrl(result.thumbnail);
    let allowed = false;
    try {
      const host = new URL(image).hostname;
      allowed = /^ts[0-9]+\.mm\.bing\.net$/i.test(host) || /^tse[0-9]+\.mm\.bing\.net$/i.test(host) || host === 'th.bing.com';
    } catch {}
    return allowed ? { image, title: String(result.title || '').slice(0, 180), sourceUrl: safeExternalUrl(result.url) } : null;
  }).filter(Boolean).slice(0, 40);
};

export async function onRequestGet({ request }) {
  const query = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 240);
  if (!query) return Response.json({ images: [] });
  const target = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
  try {
    const response = await fetch(target, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      },
      cf: { cacheEverything: true, cacheTtl: 3600 },
    });
    const pinterestImages = response.ok ? extractImages(await response.text()) : [];
    // Pinterest currently serves its logo instead of result data to many
    // server-side requests. Use a public, safe-search image result pool when
    // that happens so the local recommender still has real outfit candidates.
    let pins;
    let source;
    if (pinterestImages.length >= 6) {
      pins = pinterestImages.map(image => ({ image, title: query, sourceUrl: target })); source = 'pinterest';
    } else {
      const duckPins = await fetchDuckDuckGoCandidates(query);
      if (duckPins.length >= 6) {
        pins = duckPins; source = 'duckduckgo-image-search';
      } else {
        pins = (await fetchWebImageCandidates(query)).map(image => ({ image, title: query, sourceUrl: '' })); source = 'web-image-search';
      }
    }
    return Response.json({ images: pins.map(pin => pin.image), pins, query, source }, {
      headers: { 'Cache-Control': 'public, max-age=900, s-maxage=3600' },
    });
  } catch (error) {
    return Response.json({ images: [], error: error?.message || 'Pinterest fetch failed' }, { status: 502 });
  }
}
