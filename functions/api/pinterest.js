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
    if (!response.ok) return Response.json({ images: [], error: `Pinterest HTTP ${response.status}` }, { status: 502 });
    return Response.json({ images: extractImages(await response.text()), query }, {
      headers: { 'Cache-Control': 'public, max-age=900, s-maxage=3600' },
    });
  } catch (error) {
    return Response.json({ images: [], error: error?.message || 'Pinterest fetch failed' }, { status: 502 });
  }
}
