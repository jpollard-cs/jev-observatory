import test from 'node:test';
import assert from 'node:assert/strict';
import { sha } from '../../workbench/src/util.mjs';
import { packRequests, readFrozenRequest } from '../src/hosted/request-store.mjs';

test('392 frozen requests use bounded verified shards and one read per shard', async () => {
  const entries = Array.from({ length: 392 }, (_, i) => {
    const body = JSON.stringify({ id: i, prompt: 'test material '.repeat(1000) });
    return [sha(body), body];
  });
  const { descriptor, shards } = packRequests(entries);
  assert.ok(shards.length < 20, `${shards.length} shards for 392 requests`);
  assert.equal(Object.keys(descriptor.byRequest).length, 392);
  const run = { object_key: 'test-run' };
  const objects = new Map(
    shards.map(({ hash, body }) => [run.object_key + '/request-shard/' + hash, body]),
  );
  let reads = 0;
  const blobs = {
    get: async (key) => {
      reads++;
      return objects.has(key) ? { body: objects.get(key) } : null;
    },
  };
  const cache = new Map();
  const restored = await Promise.all(
    entries.map(([requestHash]) =>
      readFrozenRequest(blobs, run, { requestStorage: descriptor }, { requestHash }, cache),
    ),
  );
  assert.deepEqual(
    restored,
    entries.map(([, body]) => body),
  );
  assert.equal(reads, shards.length);
  const firstKey = run.object_key + '/request-shard/' + shards[0].hash;
  objects.set(firstKey, shards[0].body + 'tampered');
  await assert.rejects(
    readFrozenRequest(blobs, run, { requestStorage: descriptor }, { requestHash: entries[0][0] }),
    /integrity/,
  );
});

test('runs saved before request sharding retain their original frozen request path', async () => {
  const body = JSON.stringify({ prompt: 'existing run' });
  const requestHash = sha(body);
  const run = { object_key: 'old-run' };
  const restored = await readFrozenRequest(
    {
      get: async (key) => {
        assert.equal(key, run.object_key + '/request/' + requestHash);
        return { body };
      },
    },
    run,
    {},
    { requestHash },
  );
  assert.equal(restored, body);
});
