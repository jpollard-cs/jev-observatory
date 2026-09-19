import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function localStorage(directory) {
  await fs.mkdir(path.join(directory, 'blobs'), { recursive: true });
  const sqlite = new DatabaseSync(path.join(directory, 'community.sqlite'));
  sqlite.exec('CREATE TABLE IF NOT EXISTS _community_migrations (name TEXT PRIMARY KEY)');
  for (const name of (await fs.readdir(new URL('../drizzle/', import.meta.url)))
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    if (!sqlite.prepare('SELECT name FROM _community_migrations WHERE name=?').get(name)) {
      sqlite.exec('BEGIN');
      try {
        sqlite.exec(await fs.readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
        sqlite.prepare('INSERT INTO _community_migrations(name) VALUES(?)').run(name);
        sqlite.exec('COMMIT');
      } catch (cause) {
        sqlite.exec('ROLLBACK');
        throw cause;
      }
    }
  }
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
            first: async () => sqlite.prepare(sql).get(...args) ?? null,
            run: async () => ({
              meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
            }),
          };
        },
      };
    },
  };
  const filename = (key) => path.join(directory, 'blobs', Buffer.from(key).toString('hex'));
  const blobs = {
    put: async (key, text) => fs.writeFile(filename(key), text),
    get: async (key) => {
      try {
        return { body: await fs.readFile(filename(key)) };
      } catch (cause) {
        if (cause.code === 'ENOENT') return null;
        throw cause;
      }
    },
    delete: async (key) => fs.rm(filename(key), { force: true }),
  };
  return { db, blobs, close: () => sqlite.close() };
}
