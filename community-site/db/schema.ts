import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const results = sqliteTable(
  'community_results',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    author: text('author').notNull(),
    policyName: text('policy_name').notNull(),
    policyHash: text('policy_hash').notNull(),
    title: text('title').notNull(),
    model: text('model').notNull(),
    suiteHash: text('suite_hash').notNull(),
    bundleHash: text('bundle_hash').notNull(),
    sourceRevision: text('source_revision').notNull(),
    objectKey: text('object_key').notNull(),
    bytes: integer('bytes').notNull(),
    total: integer('total').notNull(),
    completed: integer('completed').notNull(),
    incomplete: integer('incomplete').notNull(),
    exactMatches: integer('exact_matches').notNull(),
    visibility: text('visibility').notNull().default('private'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('community_results_visibility_created').on(table.visibility, table.createdAt),
    index('community_results_owner_created').on(table.owner, table.createdAt),
  ],
);

export const executionAccounts = sqliteTable('execution_accounts', {
  owner: text('owner').primaryKey(),
  maximumNano: integer('maximum_nano').notNull(),
  priorNano: integer('prior_nano').notNull(),
  createdAt: text('created_at').notNull(),
});
export const executionRuns = sqliteTable(
  'execution_runs',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    planHash: text('plan_hash').notNull(),
    status: text('status').notNull(),
    reason: text('reason'),
    objectKey: text('object_key').notNull(),
    preparedHash: text('prepared_hash').notNull(),
    requests: integer('requests').notNull(),
    reserveNano: integer('reserve_nano').notNull(),
    knownNano: integer('known_nano').notNull().default(0),
    heldNano: integer('held_nano').notNull().default(0),
    nextIndex: integer('next_index').notNull().default(0),
    inflight: integer('inflight'),
    inflightReserve: integer('inflight_reserve').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('execution_owner_created').on(t.owner, t.createdAt)],
);
