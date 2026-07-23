import { allowedModel, headersFor, json, requireKey, withinRequestLimit } from '../_shared.js';

const MAX_REQUEST_BYTES = 160_000;
const MAX_MESSAGE_BYTES = 120_000;
const ALLOWED_SEARCH_ENGINES = new Set(['auto', 'native', 'exa', 'parallel', 'perplexity']);

const boundedInteger = (value, minimum, maximum, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
};

export const sanitizeTools = (tools) => {
  if (tools == null) return [];
  if (!Array.isArray(tools) || tools.length > 1) {
    throw Object.assign(new Error('Only one web-search tool is allowed.'), { status: 400 });
  }
  if (!tools.length) return [];
  const tool = tools[0];
  if (!tool || tool.type !== 'openrouter:web_search') {
    throw Object.assign(new Error('Only the OpenRouter web-search tool is allowed.'), { status: 400 });
  }
  const source = tool.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters)
    ? tool.parameters : {};
  const parameters = {};
  if (source.engine != null) {
    const engine = String(source.engine).toLowerCase();
    if (!ALLOWED_SEARCH_ENGINES.has(engine)) {
      throw Object.assign(new Error('That web-search engine is not allowed.'), { status: 400 });
    }
    parameters.engine = engine;
  }
  if (source.max_results != null) {
    parameters.max_results = boundedInteger(source.max_results, 1, 5, 5);
  }
  if (source.max_total_results != null) {
    parameters.max_total_results = boundedInteger(
      source.max_total_results,
      parameters.max_results || 1,
      15,
      15,
    );
  }
  if (source.max_characters != null) {
    parameters.max_characters = boundedInteger(source.max_characters, 500, 3_500, 3_500);
  }
  return [{
    type: 'openrouter:web_search',
    ...(Object.keys(parameters).length ? { parameters } : {}),
  }];
};

export async function onRequestPost({ request, env }) {
  if (!requireKey(env)) return json({ error: { message: 'OpenRouter is not configured.' } }, 503);
  if (!withinRequestLimit(request)) {
    return json({ error: { message: 'The planning request cap is active. Wait a few minutes and try again.' } }, 429);
  }
  let body;
  try {
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_REQUEST_BYTES) return json({ error: { message: 'Request body is too large.' } }, 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: { message: 'Request body is too large.' } }, 413);
    }
    body = JSON.parse(text);
  } catch { return json({ error: { message: 'Request body must be valid JSON.' } }, 400); }
  if (!allowedModel(body?.model) || !Array.isArray(body?.messages) || body.messages.length < 1 || body.messages.length > 12) {
    return json({ error: { message: 'An allowed model and messages are required.' } }, 400);
  }
  if (new TextEncoder().encode(JSON.stringify(body.messages)).byteLength > MAX_MESSAGE_BYTES) {
    return json({ error: { message: 'Planning context is too large.' } }, 413);
  }
  let tools;
  try { tools = sanitizeTools(body.tools); }
  catch (error) { return json({ error: { message: error.message } }, error.status || 400); }
  const upstreamBody = {
    model: body.model,
    messages: body.messages,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1024, 1), 16000),
    ...(tools.length ? { tools } : {}),
    ...(body.response_format?.type === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
    ...(Number.isFinite(Number(body.temperature)) ? { temperature: Math.min(Math.max(Number(body.temperature), 0), 1.5) } : {}),
    ...(Number.isInteger(body.seed) ? { seed: body.seed } : {}),
  };
  try {
    return await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: headersFor(request, env),
      body: JSON.stringify(upstreamBody),
    });
  } catch {
    return json({ error: { message: 'Could not reach OpenRouter.' } }, 502);
  }
}
