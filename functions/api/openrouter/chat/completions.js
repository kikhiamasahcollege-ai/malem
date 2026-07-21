import { allowedModel, headersFor, json, requireKey } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  if (!requireKey(env)) return json({ error: { message: 'OpenRouter is not configured.' } }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: 'Request body must be valid JSON.' } }, 400); }
  if (!allowedModel(body?.model) || !Array.isArray(body?.messages) || body.messages.length < 1 || body.messages.length > 12) {
    return json({ error: { message: 'An allowed model and messages are required.' } }, 400);
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
