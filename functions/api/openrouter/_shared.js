const ALLOWED_MODELS = new Set([
  'openai/gpt-5.6-luna',
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite',
  'openai/gpt-5.6-terra',
  'google/gemini-3.5-flash',
  'openrouter/auto',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-4.1-mini',
  'qwen/qwen3-32b',
]);
const rateBuckets = new Map();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 18;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const allowedModel = (model) => typeof model === 'string' && ALLOWED_MODELS.has(model);

export const headersFor = (request, env) => ({
  Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': env.PUBLIC_BASE_URL || new URL(request.url).origin,
  'X-OpenRouter-Title': env.OPENROUTER_APP_TITLE || 'malem',
});

export const requireKey = (env) => Boolean(env.OPENROUTER_API_KEY);

export const withinRequestLimit = (request) => {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
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
  return current.count <= MAX_REQUESTS_PER_WINDOW;
};

export const __test = { RATE_WINDOW_MS, MAX_REQUESTS_PER_WINDOW };
