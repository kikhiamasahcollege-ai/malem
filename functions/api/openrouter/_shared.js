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
