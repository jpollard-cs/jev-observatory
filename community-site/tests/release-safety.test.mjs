import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { localStorage } from '../scripts/local-storage.mjs';
import { writeLimits } from '../src/adapters/write-limits.mjs';
import { executionService } from '../src/hosted/service.mjs';
import { executionApi } from '../src/hosted/http.mjs';
import { communityService } from '../src/service.mjs';
import { api } from '../src/http.mjs';
import { makeCatalog, makeExample } from '../scripts/catalog.mjs';

test('dispatch settlement remains attached to the Worker lifetime after client disconnect', async () => {
  let finish, kept;
  const pending = new Promise((r) => (finish = r));
  const request = new Request(
    'https://observatory.test/api/execution/runs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/step',
    {
      method: 'POST',
      headers: {
        Origin: 'https://observatory.test',
        'Content-Type': 'application/json',
        'x-observatory-intent': 'write',
      },
      body: '{}',
    },
  );
  const result = executionApi(request, {
    actor: { id: 'alice' },
    service: { step: () => pending },
    keepAlive: (p) => (kept = p),
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(kept instanceof Promise);
  finish({ tag: 'ok', value: { status: 'complete' } });
  await kept;
  assert.equal((await result).status, 200);
});

test('preparation failures do not imply dispatch or a spending hold; dispatch failures remain uncertain', async () => {
  const deps = {
    actor: { id: 'alice' },
    service: {
      prepare() {
        throw Error('private internal details');
      },
      step() {
        throw Error('private internal details');
      },
    },
  };
  const request = (route) =>
    new Request('https://observatory.test/api/execution/' + route, {
      method: 'POST',
      headers: {
        Origin: 'https://observatory.test',
        'Content-Type': 'application/json',
        'x-observatory-intent': 'write',
      },
      body: '{}',
    });
  const preparation = await executionApi(request('prepare'), deps);
  assert.equal(preparation.status, 503);
  const p = await preparation.json();
  assert.equal(p.error, 'preparation_unavailable');
  assert.match(p.message, /No model call was sent/);
  assert.doesNotMatch(p.message, /hold|private internal/);
  const dispatch = await executionApi(
    request('runs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/step'),
    deps,
  );
  assert.equal(dispatch.status, 503);
  const d = await dispatch.json();
  assert.equal(d.error, 'execution_unavailable');
  assert.match(d.message, /spending hold/);
  assert.doesNotMatch(d.message, /No model call was sent|private internal/);
});

test('the evidence migration withdraws legacy uploads without deleting owner records', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const migration = async (name) =>
    fs.readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8');
  const first = (await fs.readdir(new URL('../drizzle/', import.meta.url))).find(
    (name) => name.startsWith('0000') && name.endsWith('.sql'),
  );
  db.exec(await migration(first));
  db.exec(`INSERT INTO community_results VALUES
    ('legacy', 'alice', 'Alice', 'Policy', 'hash', 'Title', 'model', 'suite', 'bundle',
     'revision', 'private/object', 100, 1, 1, 0, 1, 'public', '2026-09-20')`);
  db.exec(await migration('0004_round_mandroid.sql'));
  const row = db.prepare('SELECT * FROM community_results').get();
  assert.equal(row.visibility, 'private');
  assert.equal(row.evidence_kind, 'legacy-upload');
  assert.equal(row.source_run_id, null);
  assert.equal(row.owner, 'alice');
  assert.equal(row.object_key, 'private/object');
});

test('new-work limits are durable, isolate owners, and bound combined admission', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-limits-'));
  let storage = await localStorage(dir),
    time = 60000;
  t.after(async () => {
    storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const gate = () => writeLimits(storage.db, { now: () => time });
  const answers = await Promise.all(Array.from({ length: 20 }, () => gate()('prepare', 'alice')));
  assert.equal(answers.filter(Boolean).length, 10);
  storage.close();
  storage = await localStorage(dir);
  assert.equal(await gate()('prepare', 'alice'), false);
  assert.equal(await gate()('prepare', 'bob'), true);
  const others = await Promise.all(
    Array.from({ length: 80 }, (_, i) => gate()('prepare', 'owner-' + i)),
  );
  assert.equal(others.filter(Boolean).length, 49);
  time += 60000;
  assert.equal(await gate()('prepare', 'alice'), true);
  assert.equal(await gate()('unknown', 'alice'), false);
});
test('preparation migration preserves legacy duplicates while enforcing one new pending identity per owner', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const files = (await fs.readdir(new URL('../drizzle/', import.meta.url)))
    .filter((n) => n.endsWith('.sql'))
    .sort();
  for (const name of files.filter((n) => !n.startsWith('0005')))
    db.exec(await fs.readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
  const insert = db.prepare(
    `INSERT INTO execution_runs(id,owner,plan_hash,status,object_key,prepared_hash,requests,reserve_nano,created_at,updated_at) VALUES(?,'alice','same','ready',?,'hash',1,42,'now','now')`,
  );
  insert.run('one', 'object-one');
  insert.run('two', 'object-two');
  db.exec(
    await fs.readFile(
      new URL('../drizzle/' + files.find((n) => n.startsWith('0005')), import.meta.url),
      'utf8',
    ),
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM execution_runs').get().n, 2);
  assert.equal(
    db.prepare('SELECT preparation_key FROM execution_runs LIMIT 1').get().preparation_key,
    null,
  );
  db.exec(`UPDATE execution_runs SET preparation_key='same' WHERE id='one'`);
  assert.throws(
    () => db.exec(`UPDATE execution_runs SET preparation_key='same' WHERE id='two'`),
    /UNIQUE/,
  );
  db.exec(`UPDATE execution_runs SET status='stopped' WHERE id='one'`);
  db.exec(`UPDATE execution_runs SET preparation_key='same' WHERE id='two'`);
});

test('throttled work stops before parsing/compilation/storage; cancellation remains available', async () => {
  let touched = false,
    stopped = false;
  const request = (route, body = '{invalid') =>
    new Request('https://site.test' + route, {
      method: 'POST',
      headers: {
        origin: 'https://site.test',
        'content-type': 'application/json',
        'x-observatory-intent': 'write',
      },
      body,
    });
  const deps = {
    actor: { id: 'alice' },
    admitWrite: async () => false,
    service: {
      prepare() {
        touched = true;
      },
      upload() {
        touched = true;
      },
      stop() {
        stopped = true;
        return { tag: 'ok', value: {} };
      },
    },
  };
  assert.equal((await executionApi(request('/api/execution/prepare'), deps)).status, 429);
  assert.equal((await api(request('/api/community/results'), deps)).status, 429);
  assert.equal(touched, false);
  assert.equal(
    (
      await executionApi(
        request('/api/execution/runs/00000000-0000-0000-0000-000000000000/stop', '{}'),
        deps,
      )
    ).status,
    200,
  );
  assert.equal(stopped, true);
});

for (const outcome of ['absent', 'committed', 'unknown']) {
  test(`failed plan admission cleans only confirmed orphans: ${outcome}`, async () => {
    const stored = new Map();
    const blobs = { put: async (k, v) => stored.set(k, v), delete: async (k) => stored.delete(k) };
    const service = executionService({
      blobs,
      uuid: () => 'fixture',
      repo: {
        account: async () => ({ maximum_nano: 1e9, prior_nano: 0, known_nano: 0, held_nano: 0 }),
        pending: async () => null,
        create: async () => {
          throw Error('Insert acknowledgement lost');
        },
        get: async () => {
          if (outcome === 'unknown') throw Error('Read unavailable');
          return outcome === 'committed' ? { id: 'fixture' } : null;
        },
      },
      adapter: {
        identity: { id: 'fixture', version: 1 },
        compile: () => ({
          manifest: { planHash: 'fixture' },
          jobs: [{ requestHash: 'request', body: '{}' }],
          reserveNano: 1,
        }),
      },
    });
    await assert.rejects(() => service.prepare('alice', {}));
    assert.equal(stored.size, outcome === 'absent' ? 0 : 2);
  });
}

const example = makeExample(await makeCatalog());
test('bulk cancellation requires authenticated same-origin intent and stays available when new work is throttled', async () => {
  let owner, selected, kept;
  const service = {
    cancelRuns: async (who, body) => {
      owner = who;
      selected = body.runIds;
      return { tag: 'ok', value: { cancelled: 1 } };
    },
  };
  const ids = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'];
  const request = (origin = 'https://site.test') =>
    new Request('https://site.test/api/execution/runs/cancel', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-observatory-intent': 'write' },
      body: JSON.stringify({ runIds: ids }),
    });
  const deps = {
    service,
    actor: { id: 'alice' },
    admitWrite: async () => false,
    keepAlive: (p) => (kept = p),
  };
  assert.equal((await executionApi(request(), { ...deps, actor: null })).status, 401);
  assert.equal((await executionApi(request('https://stranger.test'), deps)).status, 403);
  assert.equal(owner, undefined);
  assert.equal((await executionApi(request(), deps)).status, 200);
  assert.equal(owner, 'alice');
  assert.deepEqual(selected, ids);
  await kept;
});
for (const outcome of ['absent', 'committed', 'unknown']) {
  test(`failed contribution admission preserves ambiguous committed data: ${outcome}`, async () => {
    const stored = new Map();
    const service = communityService({
      newId: () => 'fixture',
      evidence: {
        contribution: async () => ({
          tag: 'ok',
          value: {
            ...example,
            version: 2,
            provenance: {
              method: example.provenance.method,
              settings: {},
              sourceStamp: 'a'.repeat(64),
            },
          },
        }),
      },
      blobs: {
        put: async (k, v) => stored.set(k, v),
        delete: async (k) => stored.delete(k),
      },
      repo: {
        insert: async () => {
          throw Error('Insert acknowledgement lost');
        },
        get: async () => {
          if (outcome === 'unknown') throw Error('Read unavailable');
          return outcome === 'committed' ? { id: 'fixture' } : null;
        },
      },
    });
    await assert.rejects(() =>
      service.upload(
        {
          author: 'Fixture',
          reviewedForSharing: true,
          runId: '10000000-0000-4000-8000-000000000001',
        },
        { id: 'alice' },
      ),
    );
    assert.equal(stored.size, outcome === 'absent' ? 0 : 1);
  });
}

test('withdrawal stays available when public sharing is exhausted or admission storage fails', async () => {
  const id = '00000000-0000-0000-0000-000000000000';
  const request = (visibility) =>
    new Request('https://site.test/api/community/results/' + id, {
      method: 'PATCH',
      headers: {
        origin: 'https://site.test',
        'content-type': 'application/json',
        'x-observatory-intent': 'write',
      },
      body: JSON.stringify({ visibility }),
    });
  for (const unavailable of [false, true]) {
    const saved = [];
    const deps = {
      actor: { id: 'alice' },
      admitWrite: async () => {
        if (unavailable) throw Error('Database unavailable');
        return false;
      },
      service: {
        setVisibility: async (resultId, input, actor) => {
          saved.push({ resultId, input, actor });
          return { tag: 'ok', value: input };
        },
      },
    };
    assert.equal((await api(request('public'), deps)).status, unavailable ? 503 : 429);
    assert.equal(saved.length, 0);
    assert.equal((await api(request('private'), deps)).status, 200);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].input.visibility, 'private');
  }
});
