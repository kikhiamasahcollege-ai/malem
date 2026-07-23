import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { onRequest } from '../functions/_middleware.js';

test('custom-domain middleware redirects only the stable production Pages hostname', async () => {
  const next = async () => new Response('next', { status: 200 });

  let response = await onRequest({
    request: new Request('https://malem.pages.dev/invite/example?from=sms'),
    env: { PUBLIC_BASE_URL: 'https://malemtravel.com' },
    next,
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://malemtravel.com/invite/example?from=sms');

  response = await onRequest({
    request: new Request('https://www.malemtravel.com/#/itinerary'),
    env: { PUBLIC_BASE_URL: 'https://malemtravel.com' },
    next,
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://malemtravel.com/');

  response = await onRequest({
    request: new Request('https://6522b1e.malem.pages.dev/api/health'),
    env: { PUBLIC_BASE_URL: 'https://malemtravel.com' },
    next,
  });
  assert.equal(response.status, 200);

  response = await onRequest({
    request: new Request('https://untrusted.example/api/health'),
    env: { PUBLIC_BASE_URL: 'https://malemtravel.com' },
    next,
  });
  assert.equal(response.status, 200);

  response = await onRequest({
    request: new Request('https://malem.pages.dev/api/health'),
    env: {},
    next,
  });
  assert.equal(response.status, 200);

  response = await onRequest({
    request: new Request('https://malem.pages.dev/api/health'),
    env: { PUBLIC_BASE_URL: 'javascript:alert(1)' },
    next,
  });
  assert.equal(response.status, 200);
});

test('client publishes origin-aware canonical and Open Graph metadata', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /<link rel="canonical" id="canonical-url"/);
  assert.match(html, /<meta property="og:url" id="og-url"/);
  assert.match(app, /const canonical = `\$\{location\.origin\}\$\{location\.pathname \|\| '\/'\}`/);
  assert.match(app, /updateCanonicalMetadata\(\);\s*\n\s*applyTheme\(\)/);
});
