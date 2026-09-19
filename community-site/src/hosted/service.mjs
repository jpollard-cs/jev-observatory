import { sha } from '../../../workbench/src/util.mjs';
import { ok, error } from '../domain/contracts.mjs';
const stamp = () => new Date().toISOString();
const publicRun = (r) => ({
  id: r.id,
  planHash: r.plan_hash,
  status: r.status,
  reason: r.reason,
  requests: r.requests,
  completed: r.next_index,
  inflight: r.inflight,
  knownUsd: r.known_nano / 1e9,
  heldUsd: r.held_nano / 1e9,
  reservationUsd: r.reserve_nano / 1e9,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export function executionService({
  repo,
  blobs,
  adapter,
  now = stamp,
  uuid = () => crypto.randomUUID(),
}) {
  async function load(run) {
    const stored = await blobs.get(run.object_key);
    if (!stored) throw Error('Missing immutable plan');
    const raw = await new Response(stored.body).text();
    if (sha(raw) !== run.prepared_hash) throw Error('Stored plan integrity failure');
    const p = JSON.parse(raw);
    if (p.manifest.planHash !== run.plan_hash) throw Error('Stored plan identity failure');
    const identity = p.execution ?? adapter.legacyIdentity;
    if (
      !identity ||
      identity.id !== adapter.identity.id ||
      identity.version !== adapter.identity.version
    )
      throw Error('This run requires its original execution adapter version');
    return p;
  }
  async function requestBody(run, job) {
    const stored = await blobs.get(run.object_key + '/request/' + job.requestHash);
    if (!stored) throw Error('Missing frozen request');
    const body = await new Response(stored.body).text();
    if (sha(body) !== job.requestHash) throw Error('Frozen request integrity failure');
    return body;
  }
  async function report(run) {
    const p = await load(run),
      observations = [];
    for (let i = 0; i < run.next_index; i++) {
      const saved = await blobs.get(run.object_key + '/response/' + i);
      if (!saved) throw Error('Missing response evidence');
      const observation = JSON.parse(await new Response(saved.body).text());
      if (
        observation.evidence.requestHash !== p.jobs[i].requestHash ||
        observation.rawHash !== sha(JSON.stringify(observation.evidence) + '\n')
      )
        throw Error('Response integrity failure');
      observations.push(observation);
    }
    return adapter.report(p, run, observations);
  }
  const account = async (owner) => {
    const a = await repo.account(owner);
    return a
      ? {
          maximumUsd: a.maximum_nano / 1e9,
          carriedPriorUsd: a.prior_nano / 1e9,
          knownUsageUsd: a.known_nano / 1e9,
          heldUsd: a.held_nano / 1e9,
          availableUsd:
            Math.max(0, a.maximum_nano - a.prior_nano - a.known_nano - a.held_nano) / 1e9,
        }
      : null;
  };
  return {
    async session(owner) {
      return ok({
        signedIn: !!owner,
        account: owner ? await account(owner) : null,
        runs: owner ? (await repo.list(owner)).map(publicRun) : [],
      });
    },
    async initialize(owner, input) {
      const { maximumUsd, carriedPriorUsd } = input;
      if (
        !Number.isFinite(maximumUsd) ||
        maximumUsd <= 0 ||
        maximumUsd > 3 ||
        !Number.isFinite(carriedPriorUsd) ||
        carriedPriorUsd < 0 ||
        carriedPriorUsd >= maximumUsd
      )
        return error(
          'invalid_budget',
          'Choose a total allowance up to $3 and include any prior usage from the same budget.',
        );
      await repo.initialize(
        owner,
        Math.floor(maximumUsd * 1e9),
        Math.ceil(carriedPriorUsd * 1e9),
        now(),
      );
      return ok(await account(owner));
    },
    async prepare(owner, spec) {
      let p;
      try {
        p = adapter.compile(spec);
        p = { ...p, execution: adapter.identity };
      } catch (e) {
        return error('invalid_plan', e.message);
      }
      if (!(await account(owner)))
        return error('account_required', 'Initialize your persistent hosted allowance first.');
      const id = uuid(),
        objectKey = 'execution/' + owner + '/' + id;
      const bodies = [...new Map(p.jobs.map((j) => [j.requestHash, j.body])).entries()];
      const frozen = { ...p, jobs: p.jobs.map(({ body, request, receipt, ...j }) => j) },
        raw = JSON.stringify(frozen);
      // Store each immutable request separately; each dispatch reads only its own payload.
      const stored = [];
      try {
        for (let n = 0; n < bodies.length; n += 8)
          await Promise.allSettled(
            bodies.slice(n, n + 8).map(async ([hash, body]) => {
              const key = objectKey + '/request/' + hash;
              await blobs.put(key, body);
              stored.push(key);
            }),
          ).then((results) => {
            if (results.some((r) => r.status === 'rejected')) throw Error('Request storage failed');
          });
      } catch (cause) {
        await Promise.all(stored.map((key) => blobs.delete(key)));
        throw cause;
      }
      // Write first; if database admission fails the unpublished object is removed.
      try {
        await blobs.put(objectKey, raw);
      } catch (cause) {
        await Promise.all(stored.map((key) => blobs.delete(key)));
        throw cause;
      }
      const inserted = await repo.create({
        id,
        owner,
        objectKey,
        planHash: p.manifest.planHash,
        preparedHash: sha(raw),
        requests: p.jobs.length,
        reserveNano: p.reserveNano,
        now: now(),
      });
      if (!inserted) {
        await blobs.delete(objectKey);
        await Promise.all(stored.map((key) => blobs.delete(key)));
        return error(
          'storage_limit',
          'The hosted account has reached its 100-plan limit. Export existing evidence; contact the operator for archival.',
        );
      }
      return ok({
        ...publicRun(await repo.get(id, owner)),
        ...adapter.describe(p),
        execution: p.execution ?? adapter.legacyIdentity,
        account: await account(owner),
        protocol: p.manifest.protocol,
        mode: p.manifest.options?.mode ?? null,
        disclosure: adapter.disclosure,
      });
    },
    async detail(owner, id, withReport = false) {
      const r = await repo.get(id, owner);
      if (!r) return error('not_found', 'Run not found.', 404);
      const p = await load(r);
      return ok({
        ...publicRun(r),
        ...adapter.describe(p),
        execution: p.execution ?? adapter.legacyIdentity,
        disclosure: adapter.disclosure,
        account: await account(owner),
        ...(withReport ? { report: await report(r) } : {}),
      });
    },
    async request(owner, id, index) {
      const r = await repo.get(id, owner);
      if (!r) return error('not_found', 'Run not found.', 404);
      const p = await load(r);
      if (!Number.isSafeInteger(index) || index < 0 || index >= p.jobs.length)
        return error('invalid_index', 'Unknown request');
      const j = p.jobs[index];
      return ok({
        id: j.id,
        requestHash: j.requestHash,
        request: JSON.parse(await requestBody(r, j)),
        expected: j.expected ?? null,
      });
    },
    async start(owner, id, input) {
      const r = await repo.get(id, owner);
      if (!r) return error('not_found', 'Run not found.', 404);
      if (input.confirmPaid !== true || input.planHash !== r.plan_hash)
        return error(
          'confirmation_required',
          'Confirm this exact frozen plan before paid dispatch.',
        );
      if (r.status === 'running') return ok(publicRun(r)); // Idempotent authorization, never a new dispatch.
      if (!(await repo.start(id, owner, now())))
        return error(
          'allowance_or_active_run',
          'Cannot authorize: insufficient allowance, another active run, unresolved charges, or this run is already closed.',
          409,
        );
      return ok(publicRun(await repo.get(id, owner)));
    },
    async step(owner, id, { index, apiKey }) {
      if (
        typeof apiKey !== 'string' ||
        apiKey.length < 8 ||
        apiKey.length > 4096 ||
        /[\s\x00-\x1f]/.test(apiKey)
      )
        return error('invalid_key', 'Enter a valid provider API key.');
      const run = await repo.get(id, owner);
      if (!run) return error('not_found', 'Run not found.', 404);
      if (run.status !== 'running' || run.inflight !== null || index !== run.next_index)
        return error(
          'not_dispatchable',
          'No retry was sent. Refresh this run; an in-flight or uncertain request cannot be repeated.',
          409,
        );
      const p = await load(run),
        j = p.jobs[index];
      if (!j) throw Error('Request integrity failure');
      const body = await requestBody(run, j);
      const reserve = adapter.reservation(j);
      if (!(await repo.claim(id, owner, index, reserve, now())))
        return error(
          'already_claimed',
          'Another request owns this dispatch. No retry was sent.',
          409,
        );
      // The claim is durable BEFORE network I/O. A crash keeps it unresolved; never resend it.
      let e;
      try {
        e = await adapter.infer(JSON.parse(body), apiKey);
      } catch {
        e = {
          reportedProviderModel: null,
          response: { status: 'error', error: 'transport_exception', usage: null },
        };
      }
      if (JSON.stringify(e).includes(apiKey))
        e = {
          reportedProviderModel: null,
          response: { status: 'error', error: 'credential_echo_rejected', usage: null },
        };
      e = { ...e, jobId: j.id, requestHash: j.requestHash, receivedAt: now() };
      const o = adapter.assess({ ...j, body }, e, p);
      const cost = adapter.cost(o);
      if (cost !== null && (!Number.isSafeInteger(cost) || cost < 0))
        throw Error('Invalid adapter billing result; dispatch remains held');
      const reason = o.error ?? (cost > reserve ? 'reservation_exceeded' : null);
      await blobs.put(run.object_key + '/response/' + index, JSON.stringify(o));
      await repo.settle(id, owner, index, cost, reserve, reason, now());
      return ok(publicRun(await repo.get(id, owner)));
    },
    async stop(owner, id) {
      const r = await repo.get(id, owner);
      if (!r) return error('not_found', 'Run not found.', 404);
      await repo.stop(id, owner, now());
      return ok(publicRun(await repo.get(id, owner)));
    },
  };
}
