import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutfitIntent,
  buildPersonalizedQueries,
  deriveOutfitMoments,
  feedbackEventWeight,
  matchExplanation,
  normalizeStyleDNA,
} from '../lib/outfit-personalization.mjs';

test('Style DNA is bounded, deduplicated, and limited to supported controlled values', () => {
  const style = normalizeStyleDNA({
    completed: true,
    source: 'pinterest-assisted',
    archetypes: ['minimal', 'MINIMAL', 'invented'],
    silhouettes: ['tailored', 'unsupported'],
    palettes: ['earthy'],
    footwear: ['loafers'],
    avoid: ['neon', 'neon'],
    closetStaples: ['black blazer', 'white sneakers'],
    intensity: 500,
    practicality: -10,
  });
  assert.deepEqual(style.archetypes, ['minimal']);
  assert.deepEqual(style.silhouettes, ['tailored']);
  assert.deepEqual(style.avoid, ['neon']);
  assert.equal(style.intensity, 100);
  assert.equal(style.practicality, 0);
  assert.equal(style.source, 'pinterest-assisted');
});

test('itinerary days become named morning, afternoon, and evening outfit moments', () => {
  const moment = deriveOutfitMoments({
    theme: 'Art and dinner',
    blocks: [
      { time: '09:30', title: 'Neighborhood walking tour', kind: 'activity' },
      { time: '14:00', title: 'Design museum', kind: 'sight' },
      { time: '19:30', title: 'Rooftop dinner reservation', kind: 'meal' },
    ],
  }, { summary: 'Cool with light rain' });
  assert.deepEqual(moment.moments.map((entry) => entry.period), ['morning', 'afternoon', 'evening']);
  assert.ok(moment.requirements.includes('city walking'));
  assert.ok(moment.requirements.includes('smart evening'));
  assert.equal(moment.walkingLevel, 'medium');
  assert.deepEqual(moment.transitions, ['morning → afternoon', 'afternoon → evening']);
});

test('retrieval queries combine the actual moment with Style DNA instead of a generic destination search', () => {
  const moment = deriveOutfitMoments({
    blocks: [
      { time: '10:00', title: 'Cathedral visit', kind: 'sight' },
      { time: '19:00', title: 'Opera', kind: 'activity' },
    ],
  });
  const queries = buildPersonalizedQueries({
    location: 'Italy Milan',
    season: 'autumn',
    audience: "women's",
    modest: 'modest',
    look: { name: 'Tailored transition', vibeWords: ['refined'] },
    moment,
    styleDNA: {
      archetypes: ['minimal'],
      silhouettes: ['tailored'],
      palettes: ['earthy'],
      footwear: ['loafers'],
    },
  });
  assert.equal(queries.length, 3);
  assert.match(queries.join(' '), /coverage required/);
  assert.match(queries.join(' '), /smart evening/);
  assert.match(queries.join(' '), /minimal/);
  assert.match(queries.join(' '), /tailored silhouette/);
  assert.match(queries.join(' '), /loafers/);
});

test('outfit intent and explanations keep taste and itinerary evidence visible', () => {
  const moment = {
    requirements: ['city walking', 'smart evening'],
    walkingLevel: 'medium',
    moments: [{ label: 'Museum', requirements: ['city walking'] }],
  };
  const profile = {
    styleDNA: {
      archetypes: ['vintage'],
      silhouettes: ['fluid'],
      palettes: ['jewel-tone'],
    },
  };
  const intent = buildOutfitIntent({
    destination: 'Paris',
    season: 'spring',
    look: { name: 'Gallery to dinner', pieces: [{ item: 'midi skirt' }] },
    moment,
    profile,
  });
  assert.match(intent, /vintage/);
  assert.match(intent, /city walking/);
  assert.match(intent, /midi skirt/);
  assert.match(matchExplanation({ candidate: {}, moment, styleDNA: profile.styleDNA }), /vintage taste/);
  assert.match(matchExplanation({ candidate: {}, moment, styleDNA: profile.styleDNA }), /medium walking day/);
});

test('specific negative feedback carries more weight than an unexplained rejection', () => {
  assert.ok(feedbackEventWeight('dislike', 'wrong_activity') < feedbackEventWeight('dislike'));
  assert.ok(feedbackEventWeight('love') > feedbackEventWeight('save'));
  assert.equal(feedbackEventWeight('open'), 1.25);
});
