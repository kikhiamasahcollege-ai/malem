import { json } from './_shared.js';

export async function onRequestGet({ env }) {
  return json({ configured: Boolean(env.OPENROUTER_API_KEY) });
}
