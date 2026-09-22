import { sha } from '../../../workbench/src/util.mjs';

const SHARD_BYTES = 512 * 1024;
const bytes = (value) => new TextEncoder().encode(value).length;

// Keep the signed plan small while requiring only a few bounded object writes.
export function packRequests(entries) {
  const byRequest = {};
  const shards = [];
  let pending = [];
  let size = 2; // JSON object braces.
  const flush = () => {
    if (!pending.length) return;
    const body = JSON.stringify(Object.fromEntries(pending));
    const hash = sha(body);
    for (const [requestHash] of pending) byRequest[requestHash] = hash;
    shards.push({ hash, body });
    pending = [];
    size = 2;
  };
  for (const [hash, body] of entries) {
    if (sha(body) !== hash) throw Error('Request integrity failure');
    const itemBytes = bytes(JSON.stringify(hash) + ':' + JSON.stringify(body));
    if (pending.length && size + 1 + itemBytes > SHARD_BYTES) flush();
    size += (pending.length ? 1 : 0) + itemBytes;
    pending.push([hash, body]);
  }
  flush();
  return { descriptor: { format: 'request-shards-v1', byRequest }, shards };
}

export async function readFrozenRequest(blobs, run, prepared, job, cache = new Map()) {
  const descriptor = prepared.requestStorage;
  if (!descriptor) {
    // Existing saved runs keep their original individually stored requests.
    const stored = await blobs.get(run.object_key + '/request/' + job.requestHash);
    if (!stored) throw Error('Missing frozen request');
    const body = await new Response(stored.body).text();
    if (sha(body) !== job.requestHash) throw Error('Frozen request integrity failure');
    return body;
  }
  if (descriptor.format !== 'request-shards-v1') throw Error('Unknown request storage format');
  const shardHash = descriptor.byRequest?.[job.requestHash];
  if (!shardHash) throw Error('Missing frozen request index');
  if (!cache.has(shardHash)) {
    cache.set(
      shardHash,
      (async () => {
        const stored = await blobs.get(run.object_key + '/request-shard/' + shardHash);
        if (!stored) throw Error('Missing frozen request shard');
        const raw = await new Response(stored.body).text();
        if (sha(raw) !== shardHash) throw Error('Frozen request shard integrity failure');
        return JSON.parse(raw);
      })(),
    );
  }
  const shard = await cache.get(shardHash);
  const body = shard[job.requestHash];
  if (typeof body !== 'string' || sha(body) !== job.requestHash)
    throw Error('Frozen request integrity failure');
  return body;
}
