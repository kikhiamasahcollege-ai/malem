import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireClean = process.argv.includes('--require-clean');
const baselineRef = process.env.MALEM_BASELINE_REF
  || 'origin/claude/travel-profile-itinerary-7a08ju';

const run = (command, args, { input, quiet = false } = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    input,
    stdio: quiet ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${details ? `\n${details}` : ''}`);
  }
  return result.stdout || '';
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const testFiles = readdirSync(join(root, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/${name}`);

const migrationFiles = [
  'migrations/0003_plan_foundation.sql',
  'migrations/0004_assets_wardrobe_packing.sql',
  'migrations/0005_bookings_money.sql',
  'migrations/0006_connections_notifications.sql',
  'migrations/0007_plan_invite_roles.sql',
];

const requiredAssets = [
  'index.html',
  'styles.css',
  'app.js',
  'v8-workspace.js',
  'v8-workspace.css',
  'privacy.html',
  'terms.html',
  'lib/trip-contract.mjs',
];

const tempDirectory = mkdtempSync(join(tmpdir(), 'malem-release-preflight-'));

try {
  console.log('1/6 Build the production asset allowlist');
  run(process.execPath, ['scripts/build.mjs']);
  for (const asset of requiredAssets) {
    assert(existsSync(join(root, 'dist', asset)), `Missing built asset: ${asset}`);
  }
  assert(
    readFileSync(join(root, 'dist/index.html'), 'utf8').includes('v8-workspace.js'),
    'Production HTML does not load the integrated planning studio',
  );
  assert(
    readFileSync(join(root, 'dist/v8-workspace.js'), 'utf8').includes('How do you want to start?'),
    'Built planning studio is missing the AI/no-AI choice',
  );

  console.log('2/6 Parse every production JavaScript entry point');
  for (const file of [
    'app.js',
    'v8-workspace.js',
    'server.mjs',
    'lib/trip-contract.mjs',
    'lib/plan-contract.mjs',
    'lib/local-auth-service.mjs',
    'functions/api/[[route]].js',
  ]) run(process.execPath, ['--check', file]);

  console.log('3/6 Run the complete automated suite twice');
  for (let pass = 1; pass <= 2; pass += 1) {
    console.log(`Test pass ${pass}/2`);
    run(process.execPath, ['--test', '--test-reporter=spec', ...testFiles]);
  }

  console.log('4/6 Rehearse the additive V7 → V8 database migration');
  run('sqlite3', ['--version'], { quiet: true });
  const baselineSchema = run('git', ['show', `${baselineRef}:schema.sql`], { quiet: true });
  const migrationDatabase = join(tempDirectory, 'migration.sqlite');
  run('sqlite3', [migrationDatabase], { input: baselineSchema, quiet: true });
  for (const file of migrationFiles) {
    run('sqlite3', [migrationDatabase], {
      input: readFileSync(join(root, file), 'utf8'),
      quiet: true,
    });
  }
  const migratedTables = Number(run('sqlite3', [
    migrationDatabase,
    "PRAGMA foreign_key_check; SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('plan_tasks','plan_date_polls','wardrobe_items','packing_templates','plan_packing_items','plan_bookings','plan_budgets','plan_expenses','expense_splits','plan_settlements','user_connections','external_event_links','notification_outbox');",
  ], { quiet: true }).trim());
  assert(migratedTables === 13, `Expected 13 V8 persistence tables, found ${migratedTables}`);

  console.log('5/6 Validate the consolidated disaster-recovery schema');
  const consolidatedDatabase = join(tempDirectory, 'consolidated.sqlite');
  run('sqlite3', [consolidatedDatabase], {
    input: readFileSync(join(root, 'schema.sql'), 'utf8'),
    quiet: true,
  });
  const foreignKeyProblems = run('sqlite3', [
    consolidatedDatabase,
    'PRAGMA foreign_key_check;',
  ], { quiet: true }).trim();
  assert(!foreignKeyProblems, `Consolidated schema has foreign-key problems:\n${foreignKeyProblems}`);

  console.log('6/6 Check patch hygiene and release state');
  run('git', ['diff', '--check', 'HEAD'], { quiet: true });
  if (requireClean) {
    const status = run('git', ['status', '--porcelain'], { quiet: true }).trim();
    assert(!status, `Release worktree is not clean:\n${status}`);
  }

  console.log('Malem release preflight passed.');
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
