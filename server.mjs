/**
 * malem local server
 *
 * Serves the static app and proxies OpenRouter calls. Keep OPENROUTER_API_KEY
 * in this process environment; it is never sent to the browser.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestGet as searchFashionImages } from './functions/api/pinterest.js';
import { onRequestGet as proxyFashionImage } from './functions/api/image.js';
import { createLocalAuthService } from './lib/local-auth-service.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
// Node's built-in --env-file flag is not available in every runtime used for
// this prototype. Load a local .env when present without overwriting variables
// already supplied by the shell or deployment environment.
try {
  const source = await readFile(resolve(root, '.env'), 'utf8');
  source.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!match || process.env[match[1]] !== undefined) return;
    const value = match[2].replace(/^(['"])([\s\S]*)\1$/, '$2');
    process.env[match[1]] = value;
  });
} catch {}

const port = Number(process.env.PORT || 8000);
const openRouterKey = process.env.OPENROUTER_API_KEY || '';
const openRouterBaseUrl = (process.env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const appTitle = process.env.OPENROUTER_APP_TITLE || 'malem';
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const authService = await createLocalAuthService({
  dataFile: process.env.MALEM_DATA_FILE || resolve(root, '.malem-data', 'accounts.json'),
});
const ALLOWED_MODELS = new Set([
  'openai/gpt-5.6-luna',
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite',
  'openai/gpt-5.6-terra',
  'google/gemini-3.5-flash',
  // Kept as explicit fallbacks for saved settings from older builds.
  'openrouter/auto',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-4.1-mini',
  'qwen/qwen3-32b',
]);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const staticSecurityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://www.googleapis.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const sendJSON = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readRequestJSON = (req) => new Promise((resolveBody, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      reject(new Error('Request body is too large.'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { reject(new Error('Request body must be valid JSON.')); }
  });
  req.on('error', reject);
});

const openRouterHeaders = () => ({
  'Authorization': `Bearer ${openRouterKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': publicBaseUrl,
  'X-OpenRouter-Title': appTitle,
});

const requireConfigured = (res) => {
  if (openRouterKey) return true;
  sendJSON(res, 503, { error: { message: 'OpenRouter is not configured on the server. Add OPENROUTER_API_KEY to .env and restart server.mjs.' } });
  return false;
};

const validateModel = (model) => typeof model === 'string' && ALLOWED_MODELS.has(model);

const proxyOpenRouter = async (req, res) => {
  if (!requireConfigured(res)) return;
  let body;
  try { body = await readRequestJSON(req); }
  catch (error) { sendJSON(res, 400, { error: { message: error.message } }); return; }
  if (!validateModel(body?.model) || !Array.isArray(body?.messages)) {
    sendJSON(res, 400, { error: { message: 'An allowed model and messages are required.' } });
    return;
  }
  if (body.messages.length < 1 || body.messages.length > 12) {
    sendJSON(res, 400, { error: { message: 'model and messages are required.' } });
    return;
  }

  // Forward only the fields the app uses. Authentication and attribution stay
  // server-owned, so browser clients cannot read or replace the secret.
  const requestBody = {
    model: body.model,
    messages: body.messages,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1024, 1), 16000),
    ...(Array.isArray(body.tools) && body.tools.length ? { tools: body.tools } : {}),
    ...(body.response_format?.type === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
    ...(Number.isFinite(Number(body.temperature)) ? { temperature: Math.min(Math.max(Number(body.temperature), 0), 1.5) } : {}),
    ...(Number.isInteger(body.seed) ? { seed: body.seed } : {}),
  };
  try {
    const upstream = await fetch(`${openRouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: openRouterHeaders(),
      body: JSON.stringify(requestBody),
    });
    const responseBody = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(responseBody);
  } catch {
    sendJSON(res, 502, { error: { message: 'Could not reach OpenRouter. Check your network and try again.' } });
  }
};

const sendWebResponse = async (res, response) => {
  const headers = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
};

const serveStatic = async (pathname, res) => {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolve(root, `.${requestPath}`);
  if (!filePath.startsWith(`${root}/`) && filePath !== root) {
    sendJSON(res, 403, { error: 'Forbidden' });
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      ...staticSecurityHeaders,
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    });
    res.end(data);
  } catch {
    sendJSON(res, 404, { error: 'Not found' });
  }
};

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (/^\/api\/(?:health|community|signup|login|logout|account|me|state)\/?$/.test(url.pathname)) {
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method || 'GET') ? { body: req, duplex: 'half' } : {}),
    });
    await sendWebResponse(res, await authService.handle(request));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/openrouter/status') {
    sendJSON(res, 200, { configured: Boolean(openRouterKey) });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/openrouter/chat/completions') {
    await proxyOpenRouter(req, res);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/pinterest') {
    await sendWebResponse(res, await searchFashionImages({ request: new Request(url) }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/image') {
    await sendWebResponse(res, await proxyFashionImage({ request: new Request(url) }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJSON(res, 405, { error: 'Method not allowed' });
    return;
  }
  await serveStatic(url.pathname, res);
}).listen(port, () => {
  console.log(`malem is running at http://localhost:${port}`);
  console.log(openRouterKey ? 'OpenRouter proxy: configured' : 'OpenRouter proxy: set OPENROUTER_API_KEY to enable it');
});
