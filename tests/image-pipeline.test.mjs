import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as searchOutfits, __test as searchInternals } from '../functions/api/pinterest.js';
import { onRequestGet as proxyImage, __test as imageInternals } from '../functions/api/image.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const pinterestHTML = (count = 8) => Array.from(
  { length: count },
  (_, index) => `https://i.pinimg.com/736x/aa/bb/${String(index).padStart(2, '0')}.jpg`,
).join(' ');

test('outfit search normalizes queries and caps extracted results', () => {
  assert.equal(
    searchInternals.normalizeQuery('  Italy   Milan BEACH Outfit Inspiration  '),
    'italy milan beach outfit inspiration',
  );
  assert.equal(searchInternals.extractImages(pinterestHTML(30)).length, searchInternals.MAX_RESULTS);
});

test('outfit search coalesces identical in-flight work', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 15));
    return new Response(pinterestHTML(7), { status: 200 });
  };
  const request = new Request('https://malem.test/api/pinterest?q=italy%20milan%20city%20full%20outfit%20inspiration');
  const [first, second] = await Promise.all([
    searchOutfits({ request }),
    searchOutfits({ request }),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(calls, 1);
  assert.equal((await first.json()).pins.length, 7);
});

test('one search never exceeds its upstream request budget', async () => {
  let calls = 0;
  globalThis.fetch = async url => {
    calls += 1;
    if (String(url).includes('duckduckgo.com/?')) return new Response('<html>no token</html>', { status: 200 });
    return new Response('', { status: 503 });
  };
  const request = new Request('https://malem.test/api/pinterest?q=unique%20coastal%20full%20outfit%20lookbook');
  const response = await searchOutfits({ request });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.degraded, true);
  assert.ok(calls <= searchInternals.MAX_UPSTREAM_FETCHES);
  assert.equal(response.headers.get('x-upstream-request-cap'), String(searchInternals.MAX_UPSTREAM_FETCHES));
});

test('image proxy blocks unapproved hosts without fetching them', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(); };
  const response = await proxyImage({
    request: new Request('https://malem.test/api/image?url=https%3A%2F%2Fevil.example%2Fimage.jpg'),
  });
  assert.equal(calls, 0);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
  assert.equal(response.headers.get('x-image-pipeline'), 'degraded');
});

test('image proxy deduplicates an allowed image and enforces the byte cap', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 15));
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/webp', 'content-length': '4' },
    });
  };
  const request = new Request('https://malem.test/api/image?url=https%3A%2F%2Fi.pinimg.com%2F736x%2Funique-test.webp');
  const [first, second] = await Promise.all([proxyImage({ request }), proxyImage({ request })]);
  assert.equal(calls, 1);
  assert.equal(first.headers.get('content-type'), 'image/webp');
  assert.equal(second.headers.get('content-type'), 'image/webp');
  assert.equal((await first.arrayBuffer()).byteLength, 4);

  globalThis.fetch = async () => new Response('', {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(imageInternals.MAX_IMAGE_BYTES + 1),
    },
  });
  const oversized = await proxyImage({
    request: new Request('https://malem.test/api/image?url=https%3A%2F%2Fi.pinimg.com%2F736x%2Foversized-test.jpg'),
  });
  assert.match(oversized.headers.get('content-type'), /image\/svg\+xml/);
  assert.equal(oversized.headers.get('x-image-pipeline-reason'), 'image-too-large');
});

test('client retrieval uses full-look queries and direct-image-first fallback', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(source, /full outfit inspiration/);
  assert.match(source, /beach resort/);
  assert.match(source, /Italy|locationLabel/);
  assert.match(source, /data-proxy-src/);
  assert.match(source, /data-board-direction="you"/);
  assert.match(source, /outfitReferenceRank/);
  assert.match(source, /data-live-feedback-reason/);
  assert.match(source, /styleDNAKeywords/);
  assert.doesNotMatch(source, /retrieveCandidates\(piece/);
  assert.doesNotMatch(source, /pinterest\.searchPins\(`\$\{audience\} fashion accessories/);
});
