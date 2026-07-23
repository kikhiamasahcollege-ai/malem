import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverPlaces } from '../lib/place-service.mjs';

test('Google place discovery caps upstream searches and options per step', async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    const query = JSON.parse(options.body).textQuery;
    return new Response(JSON.stringify({
      places: Array.from({ length: 8 }, (_, index) => ({
        id: `${calls}-${index}`,
        displayName: { text: `${query} ${index}` },
        formattedAddress: `${index} Test Street`,
        location: { latitude: 45 + (index / 100), longitude: 9 + (index / 100) },
        primaryType: 'point_of_interest',
        rating: 4.2,
        userRatingCount: 40 + index,
        googleMapsUri: `https://maps.google.com/?q=${calls}-${index}`,
        websiteUri: `https://example.com/${calls}-${index}`,
        businessStatus: 'OPERATIONAL',
      })),
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await discoverPlaces({
    destination: 'Milan, Italy',
    context: { hours: 4, startingLocation: 'Brera' },
    googleApiKey: 'test-key',
    fetchImpl,
  });

  assert.equal(calls, 6);
  assert.equal(result.upstreamCalls, 6);
  assert.equal(result.provider, 'google-places');
  assert.equal(result.degraded, false);
  assert.equal(result.session.plans.length, 3);
  result.session.plans.forEach((plan) => plan.steps.forEach((step) => {
    assert.ok(step.options.length >= 1 && step.options.length <= 4);
    step.options.forEach((option) => {
      assert.match(option.directionsUrl, /^https:\/\/www\.google\.com\/maps\/dir\//);
      assert.match(option.sourceUrl, /^https:\/\/maps\.google\.com/);
    });
  }));
});

test('place discovery degrades to useful Maps searches without an upstream key', async () => {
  const result = await discoverPlaces({
    destination: 'Lisbon, Portugal',
    context: { hours: 2, weather: 'rain', startingLocation: 'Alfama' },
    fetchImpl: async () => { throw new Error('must not fetch'); },
  });

  assert.equal(result.provider, 'degraded');
  assert.equal(result.degraded, true);
  assert.equal(result.upstreamCalls, 0);
  result.session.plans.forEach((plan) => plan.steps.forEach((step) => {
    assert.equal(step.options.length, 1);
    assert.match(step.options[0].sourceUrl, /^https:\/\/www\.google\.com\/maps\/search\//);
    assert.match(step.options[0].description, /temporarily unavailable/i);
  }));
});
