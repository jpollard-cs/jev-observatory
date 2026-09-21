import { sha } from '../../../workbench/src/util.mjs';
import { hostedBundle } from './sharing.mjs';
import core from '../../trust/admission-core-v2.json' with { type: 'json' };
import { verifySignedBundle } from '../receipts/verify.mjs';
import { canonical, sha256 } from '../domain/contracts.mjs';
import { ok, error, validId } from '../domain/contracts.mjs';
import { MAX_PARALLEL, DEFAULT_PARALLEL } from './limits.mjs';
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
  maxParallel: MAX_PARALLEL,
  defaultParallel: DEFAULT_PARALLEL,
  knownUsd: r.known_nano / 1e9,
  heldUsd: r.held_nano / 1e9,
  reservationUsd: r.reserve_nano / 1e9,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  retainedHolds: JSON.parse(r.retained_holds_json ?? '[]'),
});
export function executionService({
  repo,
  blobs,
  adapter,
  receipts = null,
  now = stamp,
  uuid = () => crypto.randomUUID(),
}) {
  async function load(run) {
    const stored = await blobs.get(run.object_key);
    if (!stored) throw Error('Missing immutable plan');
    const raw = await new Response(stored.body).text();
    if (sha(raw) !== run.prepared_hash) throw Error('Stored plan integrity failure');
    const p = JSON.parse(raw);
    if (p.attestation) {
      if (!receipts) throw Error('This run requires receipt verification');
      const { attestation, ...prepared } = p;
      if (attestation.runId !== run.id) throw Error('Signed plan belongs to another run');
      await receipts.verify('plan', { runId: run.id, prepared }, attestation.receipt);
    }
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
  async function observationAt(run, p, i) {
    const saved = await blobs.get(run.object_key + '/response/' + i);
    if (!saved) return null;
    const observation = JSON.parse(await new Response(saved.body).text());
    if (
      observation.evidence.requestHash !== p.jobs[i].requestHash ||
      observation.rawHash !== sha(JSON.stringify(observation.evidence) + '\n')
    )
      throw Error('Response integrity failure');
    if (p.attestation) {
      const { attestation, ...record } = observation;
      await receipts.verify(
        'observation',
        {
          runId: run.id,
          planHash: p.manifest.planHash,
          index: i,
          observation: record,
        },
        attestation,
      );
    }
    return observation;
  }
  async function evidence(run) {
    const p = await load(run),
      observations = [];
    for (let i = 0; i < run.next_index; i++) {
      const observation = await observationAt(run, p, i);
      if (!observation) throw Error('Missing response evidence');
      observations.push(observation);
    }
    return { p, observations };
  }
  async function report(run) {
    const { p, observations } = await evidence(run);
    return adapter.report(p, run, observations);
  }
  async function completion(run, p, observations, create = false) {
    if (!p.attestation) return null;
    const expected = {
      runId: run.id,
      planHash: run.plan_hash,
      status: run.status,
      reason: run.reason,
      planned: p.jobs.length,
      recorded: run.next_index,
      knownNano: run.known_nano,
      heldNano: run.held_nano,
      observationHashes: await Promise.all(observations.map((o) => sha256(canonical(o)))),
    };
    const key = run.object_key + '/completion';
    const stored = await blobs.get(key);
    if (stored) {
      const seal = JSON.parse(await new Response(stored.body).text());
      await receipts.verify('completion', seal.record, seal.receipt);
      if (canonical(seal.record) !== canonical(expected)) throw Error('Sealed run has changed');
      return seal;
    }
    if (!create) throw Error('Signed completion is unavailable; this run cannot be attested');
    const seal = { record: expected, receipt: await receipts.sign('completion', expected) };
    await blobs.put(key, JSON.stringify(seal));
    return seal;
  }
  async function sealTerminal(run) {
    if (!['complete', 'stopped'].includes(run.status) || run.inflight !== null) return;
    const { p, observations } = await evidence(run);
    await completion(run, p, observations, true);
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
      const bundle = await hostedBundle(
        p,
        run,
        observations,
        requests,
        adapter.report(p, run, observations),
        adapter.describe(p),
        p.attestation ? receipts : null,
        await completion(run, p, observations),
      );
      if (bundle.version === 3) {
        const checked = await verifySignedBundle(bundle, receipts.trust, core);
        if (checked.tag === 'error') return checked;
      }
      return ok(bundle);
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
      const bodies = [...new Map(p.jobs.map((j) => [j.requestHash, j.body])).entries()];
      const frozen = { ...p, jobs: p.jobs.map(({ body, request, receipt, ...j }) => j) };
      if (receipts) frozen.verificationCore = p.manifest.policy ? core : null;
      // Bind reuse to all frozen instructions, expectations, adapter and signing mode.
      const preparationKey = sha(canonical({ prepared: frozen, signed: !!receipts }));
      const describePrepared = async (run, prepared, reused = false) =>
        ok({
          ...publicRun(run),
          ...adapter.describe(prepared),
          execution: prepared.execution ?? adapter.legacyIdentity,
          account: await account(owner),
          protocol: prepared.manifest.protocol,
          mode: prepared.manifest.options?.mode ?? null,
          disclosure: adapter.disclosure,
          reused,
        });
      const pending = await repo.pending(owner, preparationKey);
      if (pending) return describePrepared(pending, await load(pending), true);
      const id = uuid(),
        objectKey = 'execution/' + owner + '/' + id;
      if (receipts) {
        const receipt = await receipts.sign('plan', { runId: id, prepared: frozen });
        frozen.attestation = { runId: id, receipt };
      }
      const raw = JSON.stringify(frozen);
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
          preparationKey,
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
        const concurrent = await repo.pending(owner, preparationKey);
        if (concurrent) return describePrepared(concurrent, await load(concurrent), true);
        if ((await repo.list(owner)).length < 100)
          return error(
            'preparation_changed',
            'Another preparation changed while saving. Refresh saved runs before preparing again.',
            409,
          );
        return error(
          'storage_limit',
          'The hosted account has reached its 100-plan limit. Export existing evidence; contact the operator for archival.',
        );
      }
      return describePrepared(await repo.get(id, owner), p);
    },
    async detail(owner, id, withReport = false) {
      const r = await repo.get(id, owner);
      if (!r) return error('not_found', 'Run not found.', 404);
      const p = await load(r);
      const blocker = r.status === 'ready' ? await repo.blocker(owner, id) : null;
      return ok({
        ...publicRun(r),
        startBlocker: blocker ? publicRun(blocker) : null,
        unresolvedHolds:
          r.status === 'ready'
            ? (await repo.list(owner))
                .filter((run) => run.status === 'stopped' && run.held_nano > 0)
                .map((run) => ({ id: run.id, heldNano: run.held_nano, updatedAt: run.updated_at }))
            : [],
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
        planHash: p.manifest.planHash,
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
      if (r.status === 'ready') await repo.start(id, owner, now());
      // Another authorization may have won since the initial read. Read this run
      // before diagnosing a blocker; starting reserves funds but never dispatches.
      const saved = await repo.get(id, owner);
      if (!saved) return error('not_found', 'Run not found.', 404);
      if (saved.status === 'running') return ok(publicRun(saved));
      if (saved.status !== 'ready')
        return error('run_closed', 'This run is already closed. Refresh its saved status.', 409);
      const blocked = await repo.blocker(owner, id);
      if (blocked)
        return error(
          'active_run',
          `Another saved run (${blocked.id.slice(0, 8)}) is active. Stop that run or continue it from saved runs. This request has not started.`,
          409,
        );
      return error(
        'insufficient_allowance',
        'This run exceeds your remaining local allowance. No model call was sent.',
        409,
      );
    },
    async step(owner, id, { index, apiKey, count = 1 }) {
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > MAX_PARALLEL ||
        !Number.isSafeInteger(index) ||
        index < 0
      )
        return error(
          'invalid_dispatch',
          `Dispatch 1–${MAX_PARALLEL} requests from the next saved index.`,
        );
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
      if (p.attestation) await receipts.ready();
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
          if (p.attestation)
            o.attestation = await receipts.sign('observation', {
              runId: id,
              planHash: p.manifest.planHash,
              index: index + offset,
              observation: o,
            });
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
      const finished = await repo.get(id, owner);
      await sealTerminal(finished);
      return ok(publicRun(finished));
    },
    async recover(owner, id) {
      const run = await repo.get(id, owner);
      if (!run) return error('not_found', 'Run not found.', 404);
      if (run.inflight === null) {
        await sealTerminal(run);
        return ok(publicRun(run));
      }
      const p = await load(run),
        count = run.inflight_count ?? 1,
        index = run.inflight;
      const observations = await Promise.all(
        Array.from({ length: count }, (_, n) => observationAt(run, p, index + n)),
      );
      if (observations.some((o) => !o))
        return error(
          'evidence_incomplete',
          'Some dispatched responses were not saved. Nothing was resent and the spending hold is unchanged. If the request has ended, provider billing must be reconciled before new paid runs can start.',
          409,
        );
      const outcomes = observations.map((o, n) => {
        const reserve = adapter.reservation(p.jobs[index + n]);
        const cost = adapter.cost(o);
        if (cost !== null && (!Number.isSafeInteger(cost) || cost < 0))
          throw Error('Invalid saved billing');
        if (o.evidence.dispatch?.batchStart !== index || o.evidence.dispatch?.batchSize !== count)
          throw Error('Saved response batch mismatch');
        return {
          reserve,
          cost: cost ?? 0,
          unknown: cost === null ? reserve : 0,
          reason:
            o.error ??
            (cost === null ? 'missing_usage' : cost > reserve ? 'reservation_exceeded' : null),
        };
      });
      const settlement = {
        count,
        reserve: outcomes.reduce((n, o) => n + o.reserve, 0),
        cost: outcomes.reduce((n, o) => n + o.cost, 0),
        unknown: outcomes.reduce((n, o) => n + o.unknown, 0),
        reason: outcomes.find((o) => o.reason)?.reason ?? null,
      };
      if (settlement.reserve !== run.inflight_reserve) throw Error('Saved reservation mismatch');
      // The same compare-and-swap as dispatch settlement prevents duplicate billing.
      await repo.settle(id, owner, index, settlement, now());
      const saved = await repo.get(id, owner);
      await sealTerminal(saved);
      return ok(publicRun(saved));
    },
    async cancelRuns(owner, { runIds } = {}) {
      if (
        !Array.isArray(runIds) ||
        runIds.length < 1 ||
        runIds.length > 100 ||
        !runIds.every(validId) ||
        new Set(runIds).size !== runIds.length
      )
        return error('invalid_cancellations', 'Select 1–100 distinct saved runs to cancel.');
      // One atomic transition prevents later batches, while retaining existing claims.
      // Explicit IDs exclude a new plan opened after the user reviewed this list.
      const stopped = await repo.cancelRuns(owner, runIds, now());
      const attestationPending = [];
      for (let i = 0; i < stopped.length; i += 8) {
        const batch = stopped.slice(i, i + 8);
        const seals = await Promise.allSettled(batch.map(sealTerminal));
        seals.forEach((result, n) => {
          if (result.status === 'rejected') attestationPending.push(batch[n].id);
        });
      }
      // A failed completion seal cannot undo cancellation or claim signed evidence exists.
      return ok({ cancelled: stopped.length, attestationPending, account: await account(owner) });
    },
    async stop(owner, id) {
      const r = await repo.get(id, owner);
      if (!r) return error('not_found', 'Run not found.', 404);
      await repo.stop(id, owner, now());
      const finished = await repo.get(id, owner);
      await sealTerminal(finished);
      return ok(publicRun(finished));
    },
  };
}
