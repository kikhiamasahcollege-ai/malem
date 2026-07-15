// Same-origin image proxy for outfit boards. Browsers and privacy extensions
// often block Pinterest/fashion-image hotlinks; this endpoint fetches only from
// a small allowlist and caches the result at Cloudflare's edge.
const ALLOWED_HOSTS = new Set([
  'i.pinimg.com',
  'loremflickr.com',
  'images.unsplash.com',
  'images.pexels.com',
]);

const isAllowedHost = (hostname) => ALLOWED_HOSTS.has(hostname)
  || /^ts[0-9]+\.mm\.bing\.net$/i.test(hostname)
  || /^tse[0-9]+\.mm\.bing\.net$/i.test(hostname)
  || hostname === 'th.bing.com';

export async function onRequestGet({ request }) {
  const raw = new URL(request.url).searchParams.get('url') || '';
  let target;
  try { target = new URL(raw); } catch { return new Response('Invalid image URL', { status: 400 }); }
  if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) {
    return new Response('Image host not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers: {
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; malem-outfit-board/1.0)',
      },
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
    if (!upstream.ok) return new Response('Upstream image failed', { status: upstream.status });
    const type = upstream.headers.get('content-type') || '';
    if (!type.toLowerCase().startsWith('image/')) return new Response('Upstream was not an image', { status: 415 });
    return new Response(upstream.body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return new Response(`Image fetch failed: ${error?.message || 'unknown'}`, { status: 502 });
  }
}
