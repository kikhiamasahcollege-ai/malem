import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const table = (name) => ({ type: 'table', name });
const column = (name) => ({ type: 'column', name });
const definition = (name, includes) => ({ type: 'definition', name, includes });
const index = (name) => ({ type: 'index', name });

export const PRODUCTION_MIGRATIONS = [
  {
    id: '0003',
    file: 'migrations/0003_plan_foundation.sql',
    markers: [
      column('trips.plan_type'),
      column('trips.timezone'),
      column('trips.currency'),
      column('trips.ai_mode'),
      column('trips.module_config_json'),
      column('trips.completed_at'),
      definition('trip_members', 'planner'),
      definition('trip_members', 'participant'),
      table('plan_member_capabilities'),
      table('plan_activity'),
      table('plan_tasks'),
      column('plan_tasks.client_mutation_id'),
      table('plan_task_assignees'),
      table('plan_guests'),
      table('plan_rsvp_invites'),
      table('plan_date_polls'),
      column('plan_date_polls.locked_option_id'),
      table('plan_date_options'),
      table('plan_date_votes'),
      column('plan_date_votes.actor_key'),
    ],
    requirements: [
      index('idx_trip_members_user'),
      index('idx_plan_activity_trip'),
      index('idx_plan_tasks_trip'),
      index('idx_plan_tasks_mutation'),
      index('idx_plan_guests_trip'),
      index('idx_plan_rsvp_invites_trip'),
      index('idx_plan_date_polls_trip'),
      index('idx_plan_date_options_poll'),
    ],
    forbidden: [table('trip_members_v3')],
  },
  {
    id: '0004',
    file: 'migrations/0004_assets_wardrobe_packing.sql',
    markers: [
      table('assets'),
      table('wardrobe_items'),
      column('wardrobe_items.availability'),
      table('wardrobe_item_assets'),
      table('outfits'),
      table('outfit_items'),
      table('packing_templates'),
      table('packing_template_items'),
      table('plan_packing_sections'),
      table('plan_packing_items'),
      column('plan_packing_items.wardrobe_item_id'),
      column('plan_packing_items.outfit_id'),
      column('plan_packing_items.source_template_id'),
    ],
    requirements: [
      index('idx_assets_owner'),
      index('idx_assets_plan'),
      index('idx_wardrobe_items_user'),
      index('idx_outfits_user'),
      index('idx_packing_templates_user'),
      index('idx_packing_template_items_template'),
      index('idx_plan_packing_sections_plan'),
      index('idx_plan_packing_items_plan'),
      index('idx_plan_packing_source'),
      index('idx_plan_packing_mutation'),
    ],
    forbidden: [],
  },
  {
    id: '0005',
    file: 'migrations/0005_bookings_money.sql',
    markers: [
      table('plan_bookings'),
      column('plan_bookings.confirmation_ciphertext'),
      table('booking_assets'),
      table('plan_budgets'),
      table('plan_expenses'),
      column('plan_expenses.reporting_amount_minor'),
      table('expense_splits'),
      table('plan_settlements'),
      column('plan_settlements.payment_provider'),
      table('settlement_confirmations'),
    ],
    requirements: [
      index('idx_plan_bookings_plan'),
      index('idx_plan_bookings_mutation'),
      index('idx_plan_expenses_plan'),
      index('idx_plan_expenses_mutation'),
      index('idx_plan_settlements_plan'),
    ],
    forbidden: [],
  },
  {
    id: '0006',
    file: 'migrations/0006_connections_notifications.sql',
    markers: [
      table('user_connections'),
      column('user_connections.encrypted_tokens_json'),
      table('calendar_preferences'),
      table('external_event_links'),
      column('external_event_links.provider_event_id'),
      table('notification_rules'),
      table('notification_outbox'),
      column('notification_outbox.idempotency_key'),
    ],
    requirements: [
      index('idx_user_connections_user'),
      index('idx_external_event_links_plan'),
      index('idx_notification_rules_user'),
      index('idx_notification_outbox_due'),
    ],
    forbidden: [],
  },
  {
    id: '0007',
    file: 'migrations/0007_plan_invite_roles.sql',
    markers: [
      definition('trip_invites', 'planner'),
      definition('trip_invites', 'participant'),
    ],
    requirements: [
      index('idx_trip_invites_trip'),
      index('idx_trip_invites_expiry'),
    ],
    forbidden: [table('trip_invites_v3')],
  },
];

export const PRODUCTION_SCHEMA_COLUMN_TABLES = [...new Set(
  PRODUCTION_MIGRATIONS
    .flatMap((migration) => migration.markers)
    .filter((marker) => marker.type === 'column')
    .map((marker) => marker.name.split('.')[0]),
)].sort();

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

export const PRODUCTION_SCHEMA_OBJECT_QUERY = `
  SELECT type AS kind, name, sql
    FROM sqlite_schema
   WHERE type IN ('table', 'index');
`;

const buildColumnQuery = (tableNames) => tableNames
  .map((tableName) => `
      SELECT 'column' AS kind,
             ${sqlLiteral(`${tableName}.`)} || name AS name,
             '' AS sql
        FROM pragma_table_xinfo(${sqlLiteral(tableName)})`)
  .join('\n      UNION ALL');

export const PRODUCTION_SCHEMA_COLUMN_QUERIES = [];
for (let offset = 0; offset < PRODUCTION_SCHEMA_COLUMN_TABLES.length; offset += 8) {
  PRODUCTION_SCHEMA_COLUMN_QUERIES.push(buildColumnQuery(
    PRODUCTION_SCHEMA_COLUMN_TABLES.slice(offset, offset + 8),
  ));
}

const normalize = (value) => String(value ?? '').toLowerCase();

export const schemaStateFromRows = (rows) => {
  const state = {
    tables: new Map(),
    columns: new Set(),
    indexes: new Set(),
  };

  for (const row of rows) {
    if (row.kind === 'table') {
      state.tables.set(normalize(row.name), normalize(row.sql));
    } else if (row.kind === 'column') {
      state.columns.add(normalize(row.name));
    } else if (row.kind === 'index') {
      state.indexes.add(normalize(row.name));
    }
  }

  return state;
};

export const markerPresent = (state, marker) => {
  if (marker.type === 'table') {
    return state.tables.has(normalize(marker.name));
  }
  if (marker.type === 'column') {
    return state.columns.has(normalize(marker.name));
  }
  if (marker.type === 'index') {
    return state.indexes.has(normalize(marker.name));
  }
  if (marker.type === 'definition') {
    return (state.tables.get(normalize(marker.name)) || '')
      .includes(normalize(marker.includes));
  }
  throw new Error(`Unknown migration marker type: ${marker.type}`);
};

export const classifyMigration = (migration, state) => {
  const introduced = migration.markers || [];
  const requirements = migration.requirements || [];
  const forbidden = migration.forbidden || [];
  const introducedPresent = introduced.filter((marker) => markerPresent(state, marker)).length;
  const allRequirementsPresent = requirements.every((marker) => markerPresent(state, marker));
  const anyForbiddenPresent = forbidden.some((marker) => markerPresent(state, marker));

  if (introducedPresent === 0 && !anyForbiddenPresent) return 'pending';
  if (introducedPresent === introduced.length
    && allRequirementsPresent
    && !anyForbiddenPresent) return 'applied';
  return 'partial';
};

const productionConfirmed = process.argv.includes('--confirm-production');
const database = process.env.MALEM_D1_DATABASE || 'malem-db';
const pagesProject = process.env.MALEM_PAGES_PROJECT || 'malem';
const productionBranch = process.env.MALEM_PRODUCTION_BRANCH
  || 'claude/travel-profile-itinerary-7a08ju';
const productionUrl = (process.env.MALEM_PRODUCTION_URL || 'https://malemtravel.com')
  .replace(/\/+$/, '');
const wranglerExecutable = process.env.WRANGLER_BIN || 'npx';
const wranglerVersion = process.env.MALEM_WRANGLER_VERSION || '4.113.0';
const wranglerPrefix = process.env.WRANGLER_BIN
  ? []
  : ['--yes', `wrangler@${wranglerVersion}`];

const run = (command, args, { capture = false } = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${details ? `\n${details}` : ''}`);
  }
  return result.stdout || '';
};

const wrangler = (args, options) => run(
  wranglerExecutable,
  [...wranglerPrefix, ...args],
  options,
);

const flattenD1Rows = (payload) => {
  const statements = Array.isArray(payload) ? payload : [payload];
  const rows = [];
  for (const statement of statements) {
    if (statement?.success === false) {
      throw new Error(`D1 query failed: ${JSON.stringify(statement.error || statement.errors)}`);
    }
    if (Array.isArray(statement?.results)) rows.push(...statement.results);
    if (Array.isArray(statement?.result?.results)) rows.push(...statement.result.results);
  }
  return rows;
};

const queryD1 = (sql) => {
  const stdout = wrangler([
    'd1',
    'execute',
    database,
    '--remote',
    '--command',
    sql,
    '--json',
  ], { capture: true });
  try {
    return flattenD1Rows(JSON.parse(stdout));
  } catch (error) {
    throw new Error(`Could not parse D1 response: ${error.message}`);
  }
};

const readSchemaState = () => schemaStateFromRows([
  ...queryD1(PRODUCTION_SCHEMA_OBJECT_QUERY),
  ...PRODUCTION_SCHEMA_COLUMN_QUERIES.flatMap((sql) => queryD1(sql)),
]);

const protectedCounts = () => {
  const rows = queryD1(`
    SELECT 'trips' AS name, COUNT(*) AS row_count FROM trips
    UNION ALL
    SELECT 'trip_members', COUNT(*) FROM trip_members
    UNION ALL
    SELECT 'trip_invites', COUNT(*) FROM trip_invites;
  `);
  return Object.fromEntries(rows.map((row) => [row.name, String(row.row_count)]));
};

const protectedRecords = () => ({
  trips: queryD1('SELECT id FROM trips ORDER BY id;'),
  tripMembers: queryD1(`
    SELECT trip_id, user_id, role, invited_by, joined_at, updated_at
      FROM trip_members
     ORDER BY trip_id, user_id;
  `),
  tripInvites: queryD1(`
    SELECT id, token_hash, trip_id, role, invited_by, expires_at, max_uses,
           use_count, revoked_at, created_at, last_used_at
      FROM trip_invites
     ORDER BY id;
  `),
});

const protectedSnapshot = () => ({
  counts: protectedCounts(),
  records: protectedRecords(),
});

const assertProtectedCounts = (before, after) => {
  for (const name of ['trips', 'trip_members', 'trip_invites']) {
    if (before[name] !== after[name]) {
      throw new Error(
        `Protected row counts changed for ${name}: ${before[name]} → ${after[name]}`,
      );
    }
  }
};

const assertProtectedSnapshot = (before, after) => {
  assertProtectedCounts(before.counts, after.counts);
  for (const name of ['trips', 'tripMembers', 'tripInvites']) {
    if (JSON.stringify(before.records[name]) !== JSON.stringify(after.records[name])) {
      throw new Error(`Protected collaboration records changed for ${name}.`);
    }
  }
};

const assertBaseSchema = (state) => {
  for (const name of ['trips', 'trip_members', 'trip_invites']) {
    if (!markerPresent(state, table(name))) {
      throw new Error(`Refusing production write: required table ${name} is missing.`);
    }
  }
};

const assertForeignKeyIntegrity = (stage) => {
  const problems = queryD1('PRAGMA foreign_key_check;');
  if (problems.length) {
    throw new Error(
      `Production foreign-key verification failed ${stage}: ${JSON.stringify(problems)}`,
    );
  }
};

const assertMigrationSequence = (states) => {
  let encounteredPending = false;
  for (const { migration, state } of states) {
    if (state === 'partial') {
      throw new Error(
        `Refusing production write: migration ${migration.id} is partially applied.`,
      );
    }
    if (state === 'pending') encounteredPending = true;
    if (state === 'applied' && encounteredPending) {
      throw new Error(
        `Refusing production write: migration ${migration.id} is applied after a pending migration.`,
      );
    }
  }
};

const wait = (milliseconds) => new Promise((resolveWait) => {
  setTimeout(resolveWait, milliseconds);
});

const smokeTestProduction = async () => {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const signal = AbortSignal.timeout(10_000);
      const [home, client, api] = await Promise.all([
        fetch(`${productionUrl}/`, { redirect: 'follow', signal }),
        fetch(`${productionUrl}/v8-workspace.js`, { redirect: 'follow', signal }),
        fetch(`${productionUrl}/api/plans`, { redirect: 'manual', signal }),
      ]);
      const [homeText, clientText] = await Promise.all([home.text(), client.text()]);

      if (home.status !== 200) throw new Error(`homepage returned ${home.status}`);
      if (!homeText.includes('v8-workspace.js') || !homeText.includes('v8-workspace.css')) {
        throw new Error('homepage does not load the V8 planning studio');
      }
      if (client.status !== 200) throw new Error(`workspace client returned ${client.status}`);
      if (!clientText.includes('How do you want to start?')
        || !clientText.includes('Without AI')) {
        throw new Error('workspace client is not the expected V8 release');
      }
      if (api.status !== 401) {
        throw new Error(`unauthenticated /api/plans returned ${api.status}, expected 401`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 20) await wait(5_000);
    }
  }
  throw new Error(`Production smoke test failed: ${lastError?.message || 'unknown error'}`);
};

const printReleasePlan = () => {
  console.log('Malem production release plan (no production changes made)');
  console.log('1. Run the clean, repeatable release preflight.');
  console.log('2. Authenticate to Cloudflare and inspect migration state.');
  console.log('3. Apply only pending migrations 0003–0007; refuse partial state.');
  console.log('4. Verify protected row counts and foreign-key integrity.');
  console.log('5. Deploy the production branch and smoke-test malemtravel.com.');
  console.log('Re-run with --confirm-production only after explicit production approval.');
};

const release = async () => {
  if (!productionConfirmed) {
    printReleasePlan();
    return;
  }

  console.log('1/5 Run the clean release preflight');
  run(process.execPath, ['scripts/release-preflight.mjs', '--require-clean']);

  console.log('2/5 Authenticate and inspect the production database');
  wrangler(['whoami']);
  console.log('Recording the pre-migration D1 Time Travel recovery bookmark');
  wrangler(['d1', 'time-travel', 'info', database]);
  let schemaState = readSchemaState();
  assertBaseSchema(schemaState);
  const initialStates = PRODUCTION_MIGRATIONS.map((migration) => ({
    migration,
    state: classifyMigration(migration, schemaState),
  }));
  assertMigrationSequence(initialStates);
  assertForeignKeyIntegrity('before migration');
  const protectedBefore = protectedSnapshot();

  console.log('3/5 Apply pending production migrations');
  for (const { migration, state } of initialStates) {
    if (state === 'applied') {
      console.log(`Migration ${migration.id} already applied; skipping.`);
      continue;
    }
    console.log(`Applying migration ${migration.id}`);
    let migrationError;
    try {
      wrangler([
        'd1',
        'execute',
        database,
        '--remote',
        '--file',
        resolve(root, migration.file),
        '--yes',
      ]);
    } catch (error) {
      migrationError = error;
    }

    if (migration.id === '0003' || migration.id === '0007') {
      try {
        assertProtectedSnapshot(protectedBefore, protectedSnapshot());
      } catch (preservationError) {
        if (migrationError) {
          throw new Error(`${migrationError.message}\n${preservationError.message}`);
        }
        throw preservationError;
      }
    }
    if (migrationError) throw migrationError;

    schemaState = readSchemaState();
    const verifiedState = classifyMigration(migration, schemaState);
    if (verifiedState !== 'applied') {
      throw new Error(
        `Migration ${migration.id} verification returned ${verifiedState}.`,
      );
    }
  }

  console.log('4/5 Verify production data preservation and integrity');
  assertProtectedSnapshot(protectedBefore, protectedSnapshot());
  assertForeignKeyIntegrity('after migration');

  console.log('5/5 Deploy and smoke-test the production site');
  const commitHash = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim();
  wrangler([
    'pages',
    'deploy',
    'dist',
    '--project-name',
    pagesProject,
    '--branch',
    productionBranch,
    '--commit-hash',
    commitHash,
  ]);
  await smokeTestProduction();
  console.log(`Production release verified at ${productionUrl}.`);
};

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  release().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
