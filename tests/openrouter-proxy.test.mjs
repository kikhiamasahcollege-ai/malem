import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, sanitizeTools } from '../functions/api/openrouter/chat/completions.js';

const canonicalTool = {
  type: 'openrouter:web_search',
  parameters: {
    engine: 'exa',
    max_results: 5,
    max_total_results: 15,
    max_characters: 3_500,
  },
};

const requestFor = (payload, ip) => new Request('https://malemtravel.com/api/openrouter/chat/completions', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'CF-Connecting-IP': ip,
  },
  body: JSON.stringify(payload),
});

const payloadFor = (tools) => ({
  model: 'google/gemini-3-flash-preview',
  messages: [
    { role: 'system', content: 'Return JSON.' },
    { role: 'user', content: 'Research Nashville and return JSON.' },
  ],
  max_tokens: 5_000,
  tools,
  response_format: { type: 'json_object' },
  temperature: 0.2,
});

test('the proxy accepts and forwards Safari’s canonical OpenRouter web-search request', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (_url, init) => {
    forwarded = JSON.parse(init.body);
    return Response.json({
      model: 'google/gemini-3-flash-preview',
      choices: [{ message: { content: '{"ok":true}' } }],
    });
  };
  try {
    const response = await onRequestPost({
      request: requestFor(payloadFor([canonicalTool]), '203.0.113.11'),
      env: {
        OPENROUTER_API_KEY: 'test-key',
        PUBLIC_BASE_URL: 'https://malemtravel.com',
        OPENROUTER_APP_TITLE: 'malem',
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(forwarded.tools, [canonicalTool]);
    assert.equal(forwarded.messages[1].content, 'Research Nashville and return JSON.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('web-search parameters are bounded and unapproved fields are stripped', () => {
  assert.deepEqual(sanitizeTools([{
    type: 'openrouter:web_search',
    parameters: {
      engine: 'EXA',
      max_results: 50,
      max_total_results: 500,
      max_characters: 50_000,
      include_domains: ['private.example'],
    },
  }]), [{
    type: 'openrouter:web_search',
    parameters: {
      engine: 'exa',
      max_results: 5,
      max_total_results: 15,
      max_characters: 3_500,
    },
  }]);
});

test('the proxy rejects legacy or unrelated client-supplied tools before upstream use', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };
  try {
    const response = await onRequestPost({
      request: requestFor(payloadFor([{ type: 'web_search' }]), '203.0.113.12'),
      env: { OPENROUTER_API_KEY: 'test-key' },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
    assert.match((await response.json()).error.message, /OpenRouter web-search tool/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
