import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localStorage } from '../scripts/local-storage.mjs';
import { repository } from '../src/adapters/d1.mjs';
import { communityService } from '../src/service.mjs';
import { api } from '../src/http.mjs';
import { canonical, sha256, validateBundle } from '../src/domain/contracts.mjs';
import { makeCatalog, makeExample } from '../scripts/catalog.mjs';
const catalog = await makeCatalog(),
  example = makeExample(catalog),
  alice = { id: 'alice' },
  bob = { id: 'bob' };
const runId = '10000000-0000-4000-8000-000000000001';
const hosted = (bundle) => ({
  ...bundle,
  version: 2,
  provenance: {
    method: bundle.provenance.method,
    settings: bundle.provenance.settings,
    sourceStamp: 'a'.repeat(64),
  },
});
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jev-community-'));
  let storage = await localStorage(directory);
  t.after(async () => {
    storage.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const source = { bundle: hosted(example) };
  const evidence = { contribution: async () => ({ tag: 'ok', value: source.bundle }) };
  const service = () =>
    communityService({ repo: repository(storage.db), blobs: storage.blobs, evidence });
  return {
    directory,
    source,
    get storage() {
      return storage;
    },
    service: service(),
    async restart() {
      storage.close();
      storage = await localStorage(directory);
      this.service = service();
    },
  };
}
function call(
  f,
  path = '',
  {
    actor = null,
    method = 'GET',
    body,
    origin = 'https://observatory.test',
    intent = 'write',
  } = {},
) {
  const headers =
    method === 'GET'
      ? {}
      : { 'Content-Type': 'application/json', Origin: origin, 'X-Observatory-Intent': intent };
  return api(
    new Request('https://observatory.test/api/community/' + path, {
      method,
      headers,
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
    { service: f.service, actor, catalog, example },
  );
}
const uploadBody = () => ({ author: 'Test contributor', reviewedForSharing: true, runId });
test('persistent evidence is private until shared, readable across users without sign-in, portable, and revocable', async (t) => {
  const f = await fixture(t);
  const uploaded = await (
    await call(f, 'results', { actor: alice, method: 'POST', body: uploadBody(example) })
  ).json();
  assert.equal(uploaded.visibility, 'private');
  assert.equal(uploaded.evidenceStatus, 'host-observed');
  assert.equal(uploaded.total, 1);
  assert.equal(uploaded.incomplete, 1);
  assert.equal(uploaded.exactMatches, 0);
  assert.equal('owner' in uploaded, false);
  assert.equal('objectKey' in uploaded, false);
  const id = uploaded.id;
  for (const actor of [null, bob])
    for (const suffix of ['', '/download'])
      assert.equal((await call(f, 'results/' + id + suffix, { actor })).status, 404);
  assert.equal(
    (
      await call(f, 'results/' + id, {
        actor: bob,
        method: 'PATCH',
        body: { visibility: 'public' },
      })
    ).status,
    404,
  );
  assert.equal((await call(f, 'results/' + id, { actor: bob, method: 'DELETE' })).status, 404);
  assert.equal(
    (
      await call(f, 'results/' + id, {
        actor: alice,
        method: 'PATCH',
        body: { visibility: 'public' },
      })
    ).status,
    200,
  );
  await f.restart();
  for (const actor of [null, bob]) {
    const list = await (await call(f, 'results', { actor })).json();
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].owned, false);
    const response = await call(f, 'results/' + id + '/download', { actor });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment/);
    const text = await response.text();
    assert.equal(await sha256(text), uploaded.bundleHash);
    assert.deepEqual(JSON.parse(text), hosted(example));
  }
  assert.equal((await call(f, 'results?mine=1')).status, 401);
  assert.equal((await (await call(f, 'results?mine=1', { actor: bob })).json()).items.length, 0);
  await call(f, 'results/' + id, {
    actor: alice,
    method: 'PATCH',
    body: { visibility: 'private' },
  });
  assert.equal((await call(f, 'results/' + id + '/download')).status, 404);
  assert.equal((await call(f, 'results/' + id, { actor: alice, method: 'DELETE' })).status, 200);
  assert.equal((await call(f, 'results/' + id, { actor: alice })).status, 404);
});
test('API rejects anonymous writes, cross-origin requests, malformed data and forged verification', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await call(f, 'results', { method: 'POST', body: uploadBody(example) })).status,
    401,
  );
  assert.equal(
    (
      await call(f, 'results', {
        actor: alice,
        method: 'POST',
        origin: 'https://evil.test',
        body: uploadBody(example),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(f, 'results', {
        actor: alice,
        method: 'POST',
        intent: '',
        body: uploadBody(example),
      })
    ).status,
    403,
  );
  assert.equal(
    (await call(f, 'results', { actor: alice, method: 'POST', body: '{bad' })).status,
    400,
  );
  assert.equal(
    (
      await call(f, 'results', {
        actor: alice,
        method: 'POST',
        body: { ...uploadBody(), bundle: example, evidenceStatus: 'verified' },
      })
    ).status,
    400,
  );
  assert.equal((await call(f, 'results?offset=-1')).status, 400);
  const big = 'x'.repeat(4 * 1024 * 1024 + 4096);
  assert.equal((await call(f, 'results', { actor: alice, method: 'POST', body: big })).status, 413);
});
test('bundles reject changed policy hashes, dropped cases, duplicate observations and deep JSON', async () => {
  assert.equal((await validateBundle(example)).tag, 'ok');
  const changed = structuredClone(example);
  changed.policy.document.name = 'changed';
  assert.equal((await validateBundle(changed)).error.code, 'policy_mismatch');
  const missing = structuredClone(example);
  missing.observations = [];
  assert.equal((await validateBundle(missing)).error.code, 'incomplete_coverage');
  const duplicate = structuredClone(example);
  duplicate.suite.definition.cases.push({ ...duplicate.suite.definition.cases[0], id: 'second' });
  duplicate.observations.push(duplicate.observations[0]);
  assert.equal((await validateBundle(duplicate)).error.code, 'invalid_observation');
  const deep = structuredClone(example);
  let item = deep.suite.definition;
  for (let i = 0; i < 40; i++) {
    item.next = {};
    item = item.next;
  }
  assert.equal((await validateBundle(deep)).error.code, 'invalid_structure');
});
test('storage derives counts from every declared case and does not claim detection accuracy', async (t) => {
  const f = await fixture(t),
    bundle = structuredClone(example);
  bundle.suite.definition.cases = [
    { id: 'a', expected: 'attack' },
    { id: 'b', expected: 'benign' },
    { id: 'c', expected: 'attack' },
    { id: 'd', expected: 'benign' },
  ];
  bundle.observations = [
    { id: 'a', status: 'ok', observed: 'attack' },
    { id: 'b', status: 'ok', observed: 'attack' },
    { id: 'c', status: 'error', errorCode: 'transport_error' },
    { id: 'd', status: 'not_run' },
  ];
  f.source.bundle = hosted(bundle);
  const row = await f.service.upload(uploadBody(), alice);
  assert.equal(row.tag, 'ok');
  assert.deepEqual(
    [row.value.total, row.value.completed, row.value.incomplete, row.value.exactMatches],
    [4, 2, 2, 1],
  );
  assert.equal('accuracy' in row.value, false);
});
test('atomic per-owner quota rejects parallel overflow and cleans rejected objects', async (t) => {
  const f = await fixture(t);
  const outcomes = await Promise.all(
    Array.from({ length: 202 }, () => f.service.upload(uploadBody(example), alice)),
  );
  assert.equal(outcomes.filter((x) => x.tag === 'ok').length, 200);
  assert.equal(outcomes.filter((x) => x.error?.code === 'quota_exceeded').length, 2);
  assert.equal((await fs.readdir(path.join(f.directory, 'blobs'))).length, 200);
  assert.equal((await f.service.upload(uploadBody(example), bob)).tag, 'ok');
});
test('catalog profiles match the canonical workbench policies and policy IDs', async () => {
  const { policyId } = await import('../../workbench/src/policy.mjs');
  for (const profile of catalog.profiles) {
    const source = JSON.parse(
      await fs.readFile(new URL('../../' + profile.sourcePath, import.meta.url), 'utf8'),
    );
    assert.deepEqual(profile.document, source);
    assert.equal(profile.hash, policyId(source));
  }
  assert.deepEqual(
    catalog.components
      .filter((x) => x.mandatory)
      .map((x) => x.id)
      .sort(),
    ['authority', 'uncertainty'],
  );
});
test('compiled worker preserves legacy source and routes public archive reads to the workspace', async () => {
  const worker = (await import('../dist/server/index.js')).default;
  const source = await fs.readFile(new URL('../legacy/observatory-worker.mjs', import.meta.url));
  const provenance = JSON.parse(
    await fs.readFile(new URL('../legacy/provenance.json', import.meta.url), 'utf8'),
  );
  assert.equal(await sha256(source), provenance.sha256);
  const home = await worker.fetch(new Request('https://site.test/community'), {}, {});
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Better boundaries/);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  const library = await worker.fetch(
    new Request('https://site.test/api/community/catalog'),
    {},
    {},
  );
  assert.equal(library.status, 200);
  assert.equal((await library.json()).profiles.length, 3);
  for (const query of ['', '?tab=policy']) {
    const actual = await worker.fetch(new Request('https://site.test/observatory' + query), {}, {});
    assert.equal(actual.status, 302);
    assert.equal(
      actual.headers.get('Location'),
      'https://redteam-observatory.wizard.chatgpt.site/workspace#overview',
    );
  }
});

test('legacy uploads cannot be enumerated, downloaded publicly or republished even with a public flag', async (t) => {
  const f = await fixture(t);
  const row = (await f.service.upload(uploadBody(), alice)).value;
  await f.storage.db
    .prepare(
      "UPDATE community_results SET evidence_kind='legacy-upload',visibility='public' WHERE id=?",
    )
    .bind(row.id)
    .run();
  assert.equal((await f.service.list(null, false)).value.items.length, 0);
  assert.equal((await f.service.get(row.id, null)).error.status, 404);
  assert.equal((await f.service.download(row.id, bob)).error.status, 404);
  assert.equal(
    (await f.service.setVisibility(row.id, { visibility: 'public' }, alice)).error.code,
    'hosted_run_required',
  );
  assert.equal((await f.service.download(row.id, alice)).tag, 'ok');
  assert.equal((await f.service.remove(row.id, alice)).tag, 'ok');
});
