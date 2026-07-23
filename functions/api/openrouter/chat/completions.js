import { allowedModel, headersFor, json, requireKey, withinRequestLimit } from '../_shared.js';

const MAX_REQUEST_BYTES = 160_000;
const MAX_MESSAGE_BYTES = 120_000;

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
  if (body.tools && (!Array.isArray(body.tools) || body.tools.length > 1
    || body.tools.some((tool) => tool?.type !== 'web_search'))) {
    return json({ error: { message: 'Only one web-search tool is allowed.' } }, 400);
  }
  const upstreamBody = {
    model: body.model,
    messages: body.messages,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1024, 1), 16000),
    ...(Array.isArray(body.tools) && body.tools.length ? { tools: body.tools } : {}),
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
