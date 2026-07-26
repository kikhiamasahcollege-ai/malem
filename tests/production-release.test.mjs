import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_MIGRATIONS,
  PRODUCTION_SCHEMA_COLUMN_QUERY,
  PRODUCTION_SCHEMA_OBJECT_QUERY,
  PRODUCTION_SCHEMA_TABLES,
  classifyMigration,
  markerPresent,
  schemaStateFromRows,
} from '../scripts/production-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselineRef = process.env.MALEM_BASELINE_REF
  || 'origin/claude/travel-profile-itinerary-7a08ju';

const run = (command, args, { input } = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    input,
  });
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join('\n'),
  );
  return result.stdout || '';
};

const queryRows = (database, sql) => JSON.parse(run('sqlite3', [
  '-json',
  database,
  sql,
]));

const schemaRows = (database) => [
  ...queryRows(database, PRODUCTION_SCHEMA_OBJECT_QUERY),
  ...queryRows(database, PRODUCTION_SCHEMA_COLUMN_QUERY),
];

const rowsForMarkers = (markers) => {
  const rows = [];
  const definitions = new Map();

  for (const marker of markers) {
    if (marker.type === 'column') {
      rows.push({ kind: 'column', name: marker.name, sql: '' });
    } else if (marker.type === 'index') {
      rows.push({ kind: 'index', name: marker.name, sql: '' });
    } else if (marker.type === 'definition') {
      const includes = definitions.get(marker.name) || [];
      includes.push(marker.includes);
      definitions.set(marker.name, includes);
    } else {
      rows.push({
        kind: 'table',
        name: marker.name,
        sql: `CREATE TABLE ${marker.name} (id TEXT)`,
      });
    }
  }

  for (const [name, includes] of definitions) {
    rows.push({
      kind: 'table',
      name,
      sql: `CREATE TABLE ${name} (role CHECK (role IN ('${includes.join("','")}')))`,
    });
  }

  return rows;
};

test('migration state detection distinguishes pending, partial, and applied schemas', () => {
  const emptyState = schemaStateFromRows([]);

  for (const migration of PRODUCTION_MIGRATIONS) {
    assert.equal(classifyMigration(migration, emptyState), 'pending');

    const completeRows = rowsForMarkers([
      ...migration.markers,
      ...migration.requirements,
    ]);
    const completeState = schemaStateFromRows(completeRows);
    assert.equal(classifyMigration(migration, completeState), 'applied');

    if (migration.markers.length > 1) {
      const partialState = schemaStateFromRows(rowsForMarkers([migration.markers[0]]));
      assert.equal(classifyMigration(migration, partialState), 'partial');
    }
  }
});

test('failed table swaps and missing trailing indexes are always partial', () => {
  const inviteMigration = PRODUCTION_MIGRATIONS.at(-1);
  const v7State = schemaStateFromRows(rowsForMarkers([
    { type: 'table', name: 'trip_invites' },
    ...inviteMigration.requirements,
  ]));
  assert.equal(classifyMigration(inviteMigration, v7State), 'pending');

  const missingIndexes = schemaStateFromRows(rowsForMarkers(inviteMigration.markers));
  assert.equal(classifyMigration(inviteMigration, missingIndexes), 'partial');

  const interruptedSwap = schemaStateFromRows(rowsForMarkers([
    { type: 'table', name: 'trip_invites' },
    { type: 'table', name: 'trip_invites_v3' },
    ...inviteMigration.requirements,
  ]));
  assert.equal(classifyMigration(inviteMigration, interruptedSwap), 'partial');
});

test('actual V7 and V8 SQLite schemas classify as a complete migration sequence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'malem-production-release-test-'));
  const baselineDatabase = join(directory, 'v7.sqlite');
  const migratedDatabase = join(directory, 'v8.sqlite');

  try {
    const baselineSchema = run('git', ['show', `${baselineRef}:schema.sql`]);
    run('sqlite3', [baselineDatabase], { input: baselineSchema });
    run('sqlite3', [migratedDatabase], { input: baselineSchema });

    const baselineState = schemaStateFromRows(schemaRows(baselineDatabase));
    assert.deepEqual(
      PRODUCTION_MIGRATIONS.map((migration) => classifyMigration(migration, baselineState)),
      ['pending', 'pending', 'pending', 'pending', 'pending'],
    );

    for (const migration of PRODUCTION_MIGRATIONS) {
      run('sqlite3', [migratedDatabase], {
        input: readFileSync(new URL(`../${migration.file}`, import.meta.url), 'utf8'),
      });
    }
    const migratedState = schemaStateFromRows(schemaRows(migratedDatabase));
    assert.deepEqual(
      PRODUCTION_MIGRATIONS.map((migration) => classifyMigration(migration, migratedState)),
      ['applied', 'applied', 'applied', 'applied', 'applied'],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production schema inspection uses D1-authorized constant pragmas', () => {
  assert.match(PRODUCTION_SCHEMA_OBJECT_QUERY, /sqlite_schema/);
  assert.doesNotMatch(PRODUCTION_SCHEMA_OBJECT_QUERY, /sqlite_master/);
  assert.doesNotMatch(PRODUCTION_SCHEMA_COLUMN_QUERY, /pragma_table_info\(m\.name\)/);
  for (const tableName of ['trips', 'trip_members', 'trip_invites_v3']) {
    assert.ok(PRODUCTION_SCHEMA_TABLES.includes(tableName));
    assert.match(PRODUCTION_SCHEMA_COLUMN_QUERY, new RegExp(`pragma_table_xinfo\\('${tableName}'\\)`));
  }
});

test('schema markers are case-insensitive and inspect table definitions', () => {
  const state = schemaStateFromRows([
    { kind: 'table', name: 'TRIP_INVITES', sql: 'CREATE TABLE trip_invites (role PARTICIPANT)' },
    { kind: 'column', name: 'TRIPS.PLAN_TYPE', sql: '' },
  ]);

  assert.equal(markerPresent(state, { type: 'table', name: 'trip_invites' }), true);
  assert.equal(markerPresent(state, { type: 'column', name: 'trips.plan_type' }), true);
  assert.equal(
    markerPresent(state, {
      type: 'definition',
      name: 'trip_invites',
      includes: 'participant',
    }),
    true,
  );
});

test('production migration manifest is ordered, unique, and points to guarded SQL files', async () => {
  assert.deepEqual(
    PRODUCTION_MIGRATIONS.map((migration) => migration.id),
    ['0003', '0004', '0005', '0006', '0007'],
  );
  assert.equal(
    new Set(PRODUCTION_MIGRATIONS.map((migration) => migration.file)).size,
    PRODUCTION_MIGRATIONS.length,
  );

  for (const migration of PRODUCTION_MIGRATIONS) {
    const sql = await readFile(new URL(`../${migration.file}`, import.meta.url), 'utf8');
    assert.match(sql, /PRAGMA foreign_keys = ON/);
  }
});

test('default production release invocation is an inert, explicit dry run', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/production-release.mjs'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        WRANGLER_BIN: '/definitely/not/a/real/wrangler',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no production changes made/i);
  assert.match(result.stdout, /--confirm-production/);
});
