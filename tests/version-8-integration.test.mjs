import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('planning studio is integrated into the existing authenticated shell and build', async () => {
  const [html, app, build] = await Promise.all([
    read('index.html'),
    read('app.js'),
    read('scripts/build.mjs'),
  ]);
  assert.match(html, /href="#\/plans"/);
  assert.match(html, /data-page="plans"/);
  assert.match(html, /v8-workspace\.js/);
  assert.match(app, /'plans'/);
  assert.match(app, /window\.MalemV8\?\.render/);
  assert.match(build, /v8-workspace\.js/);
  assert.match(build, /v8-workspace\.css/);
});

test('workspace client covers every promised integrated planning module', async () => {
  const client = await read('v8-workspace.js');
  for (const feature of [
    'What are you planning today?',
    'Plan a trip',
    'Plan an event',
    'Plan anything',
    'With AI',
    'Without AI',
    'Where are you going?',
    'Build it yourself',
    'Profile & connections',
    'Ask Malem',
    'My closet',
    'Packing & closet',
    'Wardrobe',
    'Miscellaneous',
    'Saved lists',
    'Visionary',
    'Bookings & ticket wallet',
    'Check out:',
    'One shared ledger',
    'Venmo, Zelle & Cash App',
    'Create date poll',
    'Export combined .ics',
    'Secure invitation link',
  ]) {
    assert.match(client, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('every static V8 control action is wired and obsolete manual-workspace language is absent', async () => {
  const client = await read('v8-workspace.js');
  const actions = [...client.matchAll(/data-action="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((action) => !action.includes('${'));

  assert.ok(actions.length > 30, 'expected the integrated studio control surface');
  for (const action of new Set(actions)) {
    assert.match(
      client,
      new RegExp(`action === '${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
      `missing click handler for data-action="${action}"`,
    );
  }

  assert.doesNotMatch(client, /manual workspace/i);
  assert.doesNotMatch(client, /start blank/i);
});

test('Plan V3 is exposed by local and Cloudflare APIs with compatibility routing', async () => {
  const [local, cloud, server] = await Promise.all([
    read('lib/local-auth-service.mjs'),
    read('functions/api/[[route]].js'),
    read('server.mjs'),
  ]);
  for (const source of [local, cloud]) {
    assert.match(source, /normalizePlanDocument/);
    assert.match(source, /applyPlanOperations/);
    assert.match(source, /workspace\.collection\.replace/);
    assert.match(source, /participant/);
  }
  assert.match(server, /plans\(\?:\\\/\.\*\)\?/);
});

test('database migrations cover plan, wardrobe, packing, booking, money, and connection records', async () => {
  const migrations = await Promise.all([
    'migrations/0003_plan_foundation.sql',
    'migrations/0004_assets_wardrobe_packing.sql',
    'migrations/0005_bookings_money.sql',
    'migrations/0006_connections_notifications.sql',
    'migrations/0007_plan_invite_roles.sql',
  ].map(read));
  const sql = migrations.join('\n');
  for (const table of [
    'plan_tasks',
    'plan_date_polls',
    'wardrobe_items',
    'packing_templates',
    'plan_packing_items',
    'plan_bookings',
    'plan_budgets',
    'plan_expenses',
    'expense_splits',
    'plan_settlements',
    'user_connections',
    'external_event_links',
    'notification_outbox',
  ]) assert.match(sql, new RegExp(`CREATE TABLE ${table}`));
  assert.match(sql, /participant/);
});
