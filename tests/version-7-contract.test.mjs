import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('client identity uses the server API and contains no browser password database', async () => {
  const app = await read('../app.js');
  assert.match(app, /request\('signup'/);
  assert.match(app, /request\('login'/);
  assert.match(app, /request\('logout'/);
  assert.match(app, /request\('me'/);
  assert.match(app, /await auth\.init\(\)/);
  assert.doesNotMatch(app, /store\.accounts/);
  assert.doesNotMatch(app, /store\.session/);
  assert.doesNotMatch(app, /hash:\s*hash\(password\)/);
});

test('client sync contract covers every customer-owned state collection', async () => {
  const app = await read('../app.js');
  for (const field of ['profile', 'trips', 'activeTrip', 'group', 'journal']) {
    assert.match(app, new RegExp(`${field}:`));
  }
  assert.match(app, /request\('state'/);
  assert.match(app, /method:\s*'PUT'/);
  assert.match(app, /store\.cloud\.hydrate/);
  assert.match(app, /malem:sync-error/);
});

test('degraded mode keeps trip planning and destination panels functional', async () => {
  const app = await read('../app.js');
  assert.doesNotMatch(app, /live itinerary server is not connected, so I did not create a template fallback/i);
  assert.match(app, /mode:\s*'degraded'/);
  assert.match(app, /engine\.buildItinerary\(result\.trip, merged\)/);
  assert.match(app, /engine\.buildPacking\(fallbackPacking, merged\)/);
  assert.match(app, /General fallback — verify locally/);
  assert.match(app, /Independent neighborhood café/);
  assert.doesNotMatch(app, /new RegExp\('\^\(\[a-z\]\[a-z \.\\\\\\'-\]\{1,48\}\?\)'/);
  assert.match(app, /type: 'packing\.replace'/);
  assert.match(app, /Saved on this device\. Malem will retry/);
  assert.match(app, /const selectedMix = new Set\(ctx\.mix/);
  assert.match(app, /data-itin-action="duplicate"/);
  assert.match(app, /data-pack-action="move-section-up"/);
  assert.match(app, /Check current price/);
  assert.match(app, /Discard the unsaved changes in this editor/);
});

test('OpenRouter proxy caps request frequency, body size, and tool surface', async () => {
  const [shared, proxy, app] = await Promise.all([
    read('../functions/api/openrouter/_shared.js'),
    read('../functions/api/openrouter/chat/completions.js'),
    read('../app.js'),
  ]);
  assert.match(shared, /MAX_REQUESTS_PER_WINDOW = 18/);
  assert.match(proxy, /MAX_REQUEST_BYTES = 160_000/);
  assert.match(proxy, /MAX_MESSAGE_BYTES = 120_000/);
  assert.match(proxy, /tool\.type !== 'openrouter:web_search'/);
  assert.match(proxy, /max_total_results/);
  assert.match(app, /type: 'openrouter:web_search'/);
  assert.match(proxy, /planning request cap/i);
});

test('production markup requires release-grade passwords and has no nested labels', async () => {
  const html = await read('../index.html');
  assert.match(html, /minlength="8"/);
  assert.match(html, /maxlength="128"/);
  assert.doesNotMatch(html, /Prototype accounts live in this browser/i);
  assert.doesNotMatch(html, /<label[^>]*>\s*<label/i);
  assert.match(html, /id="global-status" role="status"/);
});

test('new accounts complete a synced profile survey before trip planning', async () => {
  const [html, app] = await Promise.all([
    read('../index.html'),
    read('../app.js'),
  ]);
  assert.match(html, /id="screen-onboarding"/);
  assert.match(html, /Tell Malem how you travel/);
  assert.match(html, /id="onboarding-profile-host"/);
  assert.match(html, /Save preferences &amp; start planning|id="save-profile"/);
  assert.match(app, /onboardingCompleted:\s*false/);
  assert.match(app, /needsOnboarding/);
  assert.match(app, /isSignup \? '#\/onboarding' : '#\/chat'/);
  assert.match(app, /onboardingCompleted:\s*completesOnboarding/);
  assert.match(app, /await auth\.flush\(\)/);
  assert.match(app, /showProfileOnboarding\(\)/);
});

test('local and Cloudflare servers expose the complete identity/state contract', async () => {
  const [local, cloudflare, schema] = await Promise.all([
    read('../server.mjs'),
    read('../functions/api/[[route]].js'),
    read('../schema.sql'),
  ]);
  for (const endpoint of ['signup', 'login', 'logout', 'account', 'me', 'state', 'community']) {
    assert.match(local, new RegExp(endpoint));
    assert.match(cloudflare, new RegExp(`segment === '${endpoint}'`));
  }
  assert.match(schema, /token_hash TEXT PRIMARY KEY/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_state/);
  assert.match(schema, /public_json TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(cloudflare, /s-maxage=300/);
  assert.match(cloudflare, /SELECT u\.name AS author, s\.public_json/);
});

test('deployment excludes secrets, development data, and test-only files from static assets', async () => {
  const [ignored, build, wrangler] = await Promise.all([
    read('../.assetsignore'),
    read('../scripts/build.mjs'),
    read('../wrangler.toml'),
  ]);
  for (const path of ['.env', '.malem-data/', 'server.mjs', 'lib/local-auth-service.mjs', 'lib/place-service.mjs', 'migrations/', 'tests/', 'docs/', 'schema.sql']) {
    assert.match(ignored, new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    assert.doesNotMatch(build, new RegExp(`['"]${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
  }
  for (const asset of ['index.html', 'styles.css', 'app.js', 'privacy.html', 'terms.html', 'lib/trip-contract.mjs', '_headers']) {
    assert.match(build, new RegExp(`'${asset.replace('.', '\\.')}'`));
  }
  assert.match(wrangler, /pages_build_output_dir = "dist"/);
});

test('deployment applies browser security headers', async () => {
  const headers = await read('../_headers');
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(self\)/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /X-Frame-Options: DENY/);
});
