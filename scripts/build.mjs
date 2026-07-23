import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');

// Keep this an explicit allowlist. Cloudflare's Git-integrated Pages builds do
// not apply .assetsignore to the repository root in the same way as Wrangler's
// direct upload, so copying only browser assets is the safest release boundary.
export const PUBLIC_ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'privacy.html',
  'terms.html',
  'lib/trip-contract.mjs',
  '_headers',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(PUBLIC_ASSETS.map(async (asset) => {
  const destination = resolve(output, asset);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, asset), destination);
}));

console.log(`Built ${PUBLIC_ASSETS.length} public assets in ${output}`);
