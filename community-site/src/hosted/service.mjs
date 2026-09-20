import { sha } from '../../../workbench/src/util.mjs';
import { hostedBundle } from './sharing.mjs';
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
  inflightCount: r.inflight === null ? 0 : (r.inflight_count ?? 1),
  maxParallel: 3,
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
  async function evidence(run) {
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
    return { p, observations };
  }
  async function report(run) {
    const { p, observations } = await evidence(run);
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
    async contributionRuns(owner) {
      const runs = (await repo.list(owner)).filter(
        (r) =>
          ['complete', 'stopped'].includes(r.status) && r.inflight === null && r.next_index > 0,
      );
      const eligible = [];
      for (const run of runs) {
        const p = await load(run);
        if (p.manifest.policy && p.manifest.protocol === 'policy-workbench-v1')
          eligible.push({ ...publicRun(run), policyName: p.manifest.policy.name });
      }
      return ok({ runs: eligible });
    },
    async contribution(owner, id) {
      const run = await repo.get(id, owner);
      if (!run) return error('not_found', 'This saved run is unavailable.', 404);
      if (
        !['complete', 'stopped'].includes(run.status) ||
        run.inflight !== null ||
        run.next_index === 0
      )
        return error(
          'run_unsettled',
          'Finish or stop the run and resolve in-flight requests before sharing.',
        );
      const { p, observations } = await evidence(run);
      if (!p.manifest.policy || p.manifest.protocol !== 'policy-workbench-v1')
        return error(
          'not_evaluation',
          'Share a policy evaluation run; setup advice and historical replay use different evidence contracts.',
        );
      if (p.jobs.reduce((n, j) => n + (j.wireBytes ?? j.requestBytes ?? 0), 0) > 4 * 1024 * 1024)
        return error(
          'bundle_too_large',
          'This complete run exceeds the sharing limit. Export it for repository review; do not remove cases to make it fit.',
          413,
        );
      const requests = [];
      for (let i = 0; i < p.jobs.length; i += 8)
        requests.push(
          ...(await Promise.all(p.jobs.slice(i, i + 8).map((j) => requestBody(run, j)))),
        );
      return ok(
        await hostedBundle(
          p,
          run,
          observations,
          requests,
          adapter.report(p, run, observations),
          adapter.describe(p),
        ),
      );
    },
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
      let inserted;
      try {
        inserted = await repo.create({
          id,
          owner,
          objectKey,
          planHash: p.manifest.planHash,
          preparedHash: sha(raw),
          requests: p.jobs.length,
          reserveNano: p.reserveNano,
          now: now(),
        });
      } catch (cause) {
        // A timeout may follow a committed insert. Only delete when a read
        // confirms no run owns these immutable blobs; uncertain storage stays private.
        const admitted = await repo.get(id, owner);
        if (!admitted) await Promise.all([objectKey, ...stored].map((key) => blobs.delete(key)));
        throw cause;
      }
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
    async step(owner, id, { index, apiKey, count = 1 }) {
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 3 ||
        !Number.isSafeInteger(index) ||
        index < 0
      )
        return error('invalid_dispatch', 'Dispatch 1–3 requests from the next saved index.');
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
        jobs = p.jobs.slice(index, index + count);
      if (!jobs.length) throw Error('Request integrity failure');
      // Verify every body before claiming or sending any request in this batch.
      const bodies = await Promise.all(jobs.map((j) => requestBody(run, j)));
      const reservations = jobs.map((j) => adapter.reservation(j));
      const reserve = reservations.reduce((n, r) => n + r, 0);
      if (!(await repo.claim(id, owner, index, reserve, jobs.length, now())))
        return error(
          'already_claimed',
          'Another request owns this dispatch. No retry was sent.',
          409,
        );
      // A single atomic claim owns the entire bounded batch, including after a crash.
      // Await every response write before settling; failures keep the whole hold unresolved.
      const outcomes = await Promise.allSettled(
        jobs.map(async (j, offset) => {
          const body = bodies[offset];
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
          e = {
            ...e,
            jobId: j.id,
            requestHash: j.requestHash,
            receivedAt: now(),
            dispatch: { batchStart: index, batchSize: jobs.length },
          };
          const o = adapter.assess({ ...j, body }, e, p),
            cost = adapter.cost(o);
          if (cost !== null && (!Number.isSafeInteger(cost) || cost < 0))
            throw Error('Invalid adapter billing result; dispatch remains held');
          const reason =
            o.error ??
            (cost === null
              ? 'missing_usage'
              : cost > reservations[offset]
                ? 'reservation_exceeded'
                : null);
          await blobs.put(run.object_key + '/response/' + (index + offset), JSON.stringify(o));
          return { cost: cost ?? 0, unknown: cost === null ? reservations[offset] : 0, reason };
        }),
      );
      if (outcomes.some((o) => o.status === 'rejected'))
        throw Error('Batch evidence could not be confirmed; dispatch remains held');
      const settled = outcomes.map((o) => o.value);
      const receipt = {
        cost: settled.reduce((n, o) => n + o.cost, 0),
        unknown: settled.reduce((n, o) => n + o.unknown, 0),
        reason: settled.find((o) => o.reason)?.reason ?? null,
        reserve,
        count: jobs.length,
      };
      if (!(await repo.settle(id, owner, index, receipt, now())))
        throw Error('Batch settlement could not be confirmed; do not retry');
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
