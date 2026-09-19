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
