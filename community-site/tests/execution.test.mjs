import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localStorage } from '../scripts/local-storage.mjs';
import { executionRepository } from '../src/hosted/repository.mjs';
import { executionService } from '../src/hosted/service.mjs';
import { executionApi } from '../src/hosted/http.mjs';
import { jevExecutionAdapter } from '../src/hosted/jev-adapter.mjs';
import { callJev } from '../src/hosted/provider.mjs';
import { rebuild, assess, sha } from '../src/hosted/core.mjs';
import { preset } from '../../workbench/src/policy.mjs';
import { defaultApplication } from '../../workbench/src/selection/application.mjs';
import { makeAdvisorPlan, adviceSummary } from '../../workbench/src/selection/advisor.mjs';
import { makePlan } from '../../workbench/src/planner.mjs';
import { makeReplayPlan } from '../../workbench/src/history/planner.mjs';
import { importReport } from '../../workbench/src/report.mjs';
import productionWorker, { createWorker } from '../dist/server/index.js';
import { testReceipts } from './fixtures/receipts.mjs';
const worker = productionWorker;
const owner = 'test-owner',
  key = 'test-only-never-a-real-key',
  policy = preset(),
  application = defaultApplication(policy);
const input = { policy, application };
const manifest = makeAdvisorPlan(policy, application, {
  mode: 'setup',
  maxUsd: 0.01,
  maxInputTokens: null,
}).manifest;
const spec = { route: 'setup/prepare', input, planHash: manifest.planHash };
function namedSpec(name) {
  const changed = { ...application, name };
  const plan = makeAdvisorPlan(policy, changed, {
    mode: 'setup',
    maxUsd: 0.01,
    maxInputTokens: null,
  });
  return {
    route: 'setup/prepare',
    input: { policy, application: changed },
    planHash: plan.manifest.planHash,
  };
}
function mock(request) {
  return {
    reportedProviderModel: 'jev-1.13.0',
    response: {
      status: 'ok',
      latencyMs: 4,
      usage: { inputTokens: 1234, outputTokens: 0 },
      answers: Object.fromEntries(
        Object.entries(request.questions).map(([id, q]) => {
          const options = Object.keys(q.criteria ?? {}),
            choice = options[0];
          return [
            id,
            q.type === 'noul'
              ? { type: 'noul', noul: 0.8 }
              : q.type === 'choice'
                ? {
                    type: 'choice',
                    choice,
                    confidence: 1,
                    probabilities: Object.fromEntries(
                      options.map((k) => [k, k === choice ? 1 : 0]),
                    ),
                  }
                : {
                    type: 'score',
                    score: 0,
                    confidence: 1,
                    legend: Object.fromEntries(options.map((k) => [k, q.criteria[Number(k)]])),
                    probabilities: Object.fromEntries(
                      options.map((k) => [k, k === choice ? 1 : 0]),
                    ),
                  },
          ];
        }),
      ),
    },
  };
}
const value = (r) => {
  assert.equal(r.tag, 'ok', JSON.stringify(r));
  return r.value;
};
async function fixture(t, infer = async (r) => mock(r), requestedSpec = spec) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hosted-test-')),
    storage = await localStorage(dir),
    repo = executionRepository(storage.db);
  t.after(async () => {
    storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const service = executionService({
    repo,
    blobs: storage.blobs,
    adapter: { ...jevExecutionAdapter, infer },
  });
  value(await service.initialize(owner, { maximumUsd: 3, carriedPriorUsd: 1.450070202 }));
  const q = value(await service.prepare(owner, requestedSpec));
  return { service, repo, storage, q };
}
test('paid setup preserves native request identity, advice report contract and durable private accounting', async (t) => {
  let calls = 0;
  const { service, q, storage } = await fixture(t, async (r, k) => {
    calls++;
    assert.equal(k, key);
    assert.equal(sha(JSON.stringify(r)), manifest.jobs[0].requestHash);
    assert.equal(r.expected, undefined);
    return mock(r);
  });
  assert.equal(calls, 0);
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  assert.equal(calls, 0);
  const done = value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  assert.equal(done.status, 'complete');
  assert.equal(calls, 1);
  assert.equal((await service.step(owner, q.id, { index: 0, apiKey: key })).tag, 'error');
  assert.equal(calls, 1);
  const result = value(await service.detail(owner, q.id, true));
  assert.equal(result.report.protocol, 'catalog-advisor-report/1');
  adviceSummary(result.report, { policy, application, mode: 'setup' });
  assert.equal(result.account.carriedPriorUsd, 1.450070202);
  assert.equal(result.account.heldUsd, 0);
  assert.equal(result.account.knownUsageUsd, (1234 * 42) / 1e9);
  assert.equal((await service.detail('stranger', q.id, true)).error.status, 404);
  value(await service.initialize(owner, { maximumUsd: 3, carriedPriorUsd: 0 }));
  assert.equal(value(await service.session(owner)).account.carriedPriorUsd, 1.450070202);
  const saved = await storage.blobs.get(
    (await executionRepository(storage.db).get(q.id, owner)).object_key + '/response/0',
  );
  assert.ok(!String(saved.body).includes(key));
});
test('preparation reuses identical pending plans under concurrency but preserves intentional reruns and owners', async (t) => {
  let calls = 0;
  const { service, repo, q } = await fixture(t, async (r) => {
    calls++;
    return mock(r);
  });
  assert.equal(value(await service.prepare(owner, spec)).id, q.id);
  const changed = namedSpec('Concurrent preparation');
  const contenders = (
    await Promise.all(Array.from({ length: 8 }, () => service.prepare(owner, changed)))
  ).map(value);
  assert.equal(new Set(contenders.map((r) => r.id)).size, 1);
  assert.equal(contenders.filter((r) => !r.reused).length, 1);
  assert.equal((await repo.list(owner)).length, 2);
  assert.notEqual(contenders[0].id, q.id);
  value(await service.initialize('another-owner', { maximumUsd: 3, carriedPriorUsd: 0 }));
  assert.notEqual(value(await service.prepare('another-owner', spec)).id, q.id);
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  assert.equal(value(await service.prepare(owner, spec)).id, q.id);
  assert.equal(calls, 0);
  value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  const rerun = value(await service.prepare(owner, spec));
  assert.notEqual(rerun.id, q.id);
  value(await service.stop(owner, rerun.id));
  assert.notEqual(value(await service.prepare(owner, spec)).id, rerun.id);
  assert.equal(calls, 1);
  assert.equal(value(await service.detail(owner, q.id)).status, 'complete');
});
test('overlapping authorization of the same replacement run is idempotent after bulk cancellation', async (t) => {
  let calls = 0;
  const { service, repo, q } = await fixture(t, async (r) => {
    calls++;
    return mock(r);
  });
  value(await service.cancelRuns(owner, { runIds: [q.id] }));
  const replacement = value(await service.prepare(owner, spec));
  const starts = await Promise.all(
    Array.from({ length: 8 }, () =>
      service.start(owner, replacement.id, {
        planHash: replacement.planHash,
        confirmPaid: true,
      }),
    ),
  );
  assert.ok(
    starts.every((r) => r.tag === 'ok'),
    JSON.stringify(starts),
  );
  assert.ok(starts.every((r) => r.value.id === replacement.id && r.value.status === 'running'));
  assert.equal(
    (await repo.account(owner)).held_nano,
    (await repo.get(replacement.id, owner)).reserve_nano,
  );
  assert.equal(calls, 0, 'authorization never dispatches a model request');
  const done = value(await service.step(owner, replacement.id, { index: 0, apiKey: key }));
  assert.equal(done.status, 'complete');
  assert.equal(calls, 1);
});
test('run review identifies a different blocker while closed runs and cancellation races retain their own status', async (t) => {
  const { service, repo, storage, q } = await fixture(t);
  const next = value(await service.prepare(owner, namedSpec('A different request')));
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  assert.equal(value(await service.detail(owner, q.id)).startBlocker, null);
  assert.equal(value(await service.detail(owner, next.id)).startBlocker.id, q.id);
  assert.equal(
    (await service.start(owner, next.id, { planHash: next.planHash, confirmPaid: true })).error
      .code,
    'active_run',
  );
  value(await service.stop(owner, next.id));
  assert.equal(
    (await service.start(owner, next.id, { planHash: next.planHash, confirmPaid: true })).error
      .code,
    'run_closed',
  );
  value(await service.stop(owner, q.id));
  const fresh = value(await service.prepare(owner, spec));
  const raced = executionService({
    repo: {
      ...repo,
      start: async (...args) => {
        const started = await repo.start(...args);
        await repo.stop(...args);
        return started;
      },
    },
    blobs: storage.blobs,
    adapter: jevExecutionAdapter,
  });
  assert.equal(
    (await raced.start(owner, fresh.id, { planHash: fresh.planHash, confirmPaid: true })).error
      .code,
    'run_closed',
  );
  assert.equal((await repo.account(owner)).held_nano, 0);
});
test('bulk cancellation is owner-bound and snapshot-bound; sent requests settle once and history remains', async (t) => {
  let enter,
    release,
    calls = 0;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  const { service, q } = await fixture(t, async (r) => {
    calls++;
    enter();
    await gate;
    return mock(r);
  });
  const ready = value(await service.prepare(owner, namedSpec('Never started')));
  value(await service.initialize('another-owner', { maximumUsd: 3, carriedPriorUsd: 0 }));
  const other = value(await service.prepare('another-owner', spec));
  const ids = [q.id, ready.id, other.id];
  const later = value(
    await service.prepare(owner, namedSpec('Prepared after the list was opened')),
  );
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  const flight = service.step(owner, q.id, { index: 0, apiKey: key });
  await entered;
  const cancelled = value(await service.cancelRuns(owner, { runIds: ids }));
  assert.equal(cancelled.cancelled, 2);
  assert.ok(cancelled.account.heldUsd > 0);
  assert.equal(value(await service.detail(owner, ready.id)).status, 'stopped');
  assert.equal(value(await service.detail(owner, later.id)).status, 'ready');
  assert.equal(value(await service.detail('another-owner', other.id)).status, 'ready');
  assert.equal(value(await service.cancelRuns(owner, { runIds: ids })).cancelled, 0);
  release();
  const settled = value(await flight);
  assert.equal(settled.status, 'stopped');
  assert.equal(settled.heldUsd, 0);
  assert.equal(settled.completed, 1);
  assert.equal(calls, 1);
  assert.equal((await service.step(owner, q.id, { index: 0, apiKey: key })).tag, 'error');
  value(await service.start(owner, later.id, { planHash: later.planHash, confirmPaid: true }));
  value(await service.step(owner, later.id, { index: 0, apiKey: key }));
  assert.equal(value(await service.cancelRuns(owner, { runIds: [later.id] })).cancelled, 0);
  assert.equal(value(await service.detail(owner, later.id)).status, 'complete');
  for (const runIds of [
    [],
    [q.id, q.id],
    ['invalid'],
    Array.from({ length: 101 }, () => crypto.randomUUID()),
  ]) {
    assert.equal((await service.cancelRuns(owner, { runIds })).error.code, 'invalid_cancellations');
  }
});
test('bulk cancellation preserves unresolved old spending holds', async (t) => {
  const { service, q } = await fixture(t, async () => {
    throw Error('provider outcome unknown');
  });
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  const failed = value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  const ready = value(await service.prepare(owner, spec));
  const result = value(await service.cancelRuns(owner, { runIds: [q.id, ready.id] }));
  assert.equal(result.cancelled, 1);
  assert.ok(failed.heldUsd > 0);
  assert.equal(result.account.heldUsd, failed.heldUsd);
  assert.equal(value(await service.detail(owner, q.id)).reason, failed.reason);
});
test('signed preparations reuse their original attestation and cancellation persists through seal failure', async (t) => {
  const { repo, storage } = await fixture(t);
  const { authority } = await testReceipts();
  const service = executionService({
    repo,
    blobs: storage.blobs,
    adapter: jevExecutionAdapter,
    receipts: authority,
  });
  const q = value(await service.prepare(owner, spec));
  assert.equal(value(await service.prepare(owner, spec)).id, q.id);
  const other = value(await service.prepare(owner, namedSpec('Second signed plan')));
  const originalPut = storage.blobs.put;
  const first = await repo.get(q.id, owner);
  storage.blobs.put = async (k, body) => {
    if (k === first.object_key + '/completion') throw Error('storage unavailable');
    return originalPut(k, body);
  };
  const result = value(await service.cancelRuns(owner, { runIds: [q.id, other.id] }));
  assert.equal(result.cancelled, 2);
  assert.deepEqual(result.attestationPending, [q.id]);
  assert.equal((await repo.get(q.id, owner)).status, 'stopped');
  assert.equal((await repo.get(other.id, owner)).status, 'stopped');
  const saved = await storage.blobs.get(
    (await repo.get(other.id, owner)).object_key + '/completion',
  );
  const seal = JSON.parse(await new Response(saved.body).text());
  await authority.verify('completion', seal.record, seal.receipt);
  assert.equal(seal.record.recorded, 0);
  assert.equal(seal.record.heldNano, 0);
});
test('concurrent dispatches and parallel runs cannot double-spend; cancellation preserves the in-flight hold', async (t) => {
  let release,
    entered,
    calls = 0;
  const ready = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  const { service, q } = await fixture(t, async (r) => {
    calls++;
    entered();
    await gate;
    return mock(r);
  });
  const second = value(await service.prepare(owner, namedSpec('Different plan')));
  const starts = await Promise.all([
    service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }),
    service.start(owner, second.id, { planHash: second.planHash, confirmPaid: true }),
  ]);
  assert.equal(starts.filter((x) => x.tag === 'ok').length, 1);
  const running = starts.find((x) => x.tag === 'ok').value,
    flight = service.step(owner, running.id, { index: 0, apiKey: key });
  await ready;
  assert.equal((await service.step(owner, running.id, { index: 0, apiKey: key })).tag, 'error');
  const stopped = value(await service.stop(owner, running.id));
  assert.equal(stopped.status, 'stopped');
  assert.ok(stopped.heldUsd > 0);
  release();
  const done = value(await flight);
  assert.equal(done.status, 'stopped');
  assert.equal(done.heldUsd, 0);
  assert.equal(calls, 1);
});
test('unknown cost is retained without blocking funded new work, and malformed outputs do not score', async (t) => {
  let calls = 0;
  const { service, q } = await fixture(t, async () => {
    calls++;
    throw Error('secret-sensitive-error');
  });
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  const done = value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  assert.equal(done.status, 'stopped');
  assert.equal(done.reason, 'transport_exception');
  assert.ok(done.heldUsd > 0);
  const next = value(await service.prepare(owner, spec));
  assert.equal(
    (await service.start(owner, next.id, { planHash: next.planHash, confirmPaid: true })).tag,
    'ok',
  );
  assert.equal(calls, 1);
  const report = value(await service.detail(owner, q.id, true)).report;
  assert.equal(report.rows.length, 0);
  assert.equal(report.failures.length, 1);
  assert.throws(
    () => adviceSummary(report, { policy, application, mode: 'setup' }),
    /failed advisor report/,
  );
  assert.ok(!JSON.stringify(report).includes('secret-sensitive-error'));
  const j = rebuild(spec).jobs[0],
    e = mock(JSON.parse(j.body));
  delete e.reportedProviderModel;
  assert.equal(assess(j, e, 'jev-1.13.0').error, 'model_version_changed');
  e.reportedProviderModel = 'jev-1.13.0';
  e.response.answers = {};
  assert.equal(assess(j, e, 'jev-1.13.0').valid, false);
});
test('tampered compiler plans and stored requests fail before transport; spending is checked atomically', async (t) => {
  let calls = 0;
  const { service, q, repo, storage } = await fixture(t, async (r) => {
    calls++;
    return mock(r);
  });
  assert.equal((await service.prepare(owner, { ...spec, planHash: '0'.repeat(64) })).tag, 'error');
  assert.equal(
    (await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: false })).tag,
    'error',
  );
  const poor = 'no-headroom';
  value(await service.initialize(poor, { maximumUsd: 1, carriedPriorUsd: 0.999999 }));
  const p = value(await service.prepare(poor, spec));
  assert.equal(
    (await service.start(poor, p.id, { planHash: p.planHash, confirmPaid: true })).tag,
    'error',
  );
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  await storage.blobs.put((await repo.get(q.id, owner)).object_key, '{}');
  await assert.rejects(service.step(owner, q.id, { index: 0, apiKey: key }), /integrity/);
  assert.equal(calls, 0);
});
test('admission and original suite reports import without turning missing observations into successes', async (t) => {
  const { service } = await fixture(t);
  for (const [route, input, m] of [
    [
      'prepare',
      { policy, options: { tier: 'bronze', maxUsd: 0.15 } },
      makePlan(policy, { tier: 'bronze', maxUsd: 0.15 }).manifest,
    ],
    [
      'original/prepare',
      { options: { preset: 'families', maxUsd: 0.15 } },
      makeReplayPlan({ preset: 'families', maxUsd: 0.15 }).manifest,
    ],
  ]) {
    const q = value(await service.prepare(owner, { route, input, planHash: m.planHash }));
    value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
    value(await service.step(owner, q.id, { index: 0, apiKey: key }));
    value(await service.stop(owner, q.id));
    const r = value(await service.detail(owner, q.id, true)).report,
      e = importReport(JSON.stringify(r));
    assert.equal(
      e.validCalls,
      1,
      JSON.stringify(
        Object.values(r.conditions)
          .flatMap((c) => c.rows)
          .filter((r) => r.error)
          .map((r) => r.error),
      ),
    );
    assert.equal(e.requestedCalls, q.requests);
    assert.ok(e.conditions.flatMap((c) => c.rows).some((r) => r.status === 'not_dispatched'));
    assert.equal(e.design.sourceStamp, m.sourceStamp);
  }
});
test('compiled hosted API authenticates owners, rejects cross-site writes and only sends allowlisted server-built requests', async (t) => {
  const { storage } = await fixture(t);
  const env = { DB: storage.db, BUCKET: storage.blobs };
  const signed = await testReceipts();
  const worker = createWorker({ receiptTrust: signed.trust, receiptsFor: () => signed.authority });
  const previous = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = previous;
  });
  globalThis.fetch = async (url, opts) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(opts.redirect, 'manual');
    const m = mock(JSON.parse(opts.body));
    return Response.json({
      model: m.reportedProviderModel,
      answers: m.response.answers,
      usage: { input_tokens: 1234, output_tokens: 0 },
    });
  };
  const request = (route, data, identity = owner, origin = 'https://site.test') =>
    new Request('https://site.test/api/execution/' + route, {
      method: data ? 'POST' : 'GET',
      headers: {
        ...(identity ? { 'oai-authenticated-user-id': identity } : {}),
        ...(data
          ? { 'content-type': 'application/json', 'x-observatory-intent': 'write', origin }
          : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  assert.equal((await worker.fetch(request('prepare', spec, null), env, {})).status, 401);
  assert.equal(
    (await worker.fetch(request('prepare', spec, owner, 'https://evil.test'), env, {})).status,
    403,
  );
  assert.equal((await productionWorker.fetch(request('prepare', spec), env, {})).status, 503);
  assert.equal(calls, 0, 'missing production signing key must fail before dispatch');
  const prepared = await worker.fetch(request('prepare', spec), env, {});
  assert.equal(prepared.status, 200);
  const q = await prepared.json();
  assert.equal(
    (await worker.fetch(request('runs/' + q.id, null, 'stranger'), env, {})).status,
    404,
  );
  await worker.fetch(
    request('runs/' + q.id + '/start', { planHash: q.planHash, confirmPaid: true }),
    env,
    {},
  );
  const done = await worker.fetch(
    request('runs/' + q.id + '/step', { index: 0, apiKey: key }),
    env,
    {},
  );
  assert.equal(done.status, 200);
  assert.equal((await done.json()).status, 'complete');
  assert.equal(calls, 1);
  const result = await worker.fetch(request('runs/' + q.id + '?report=1'), env, {});
  adviceSummary((await result.json()).report, { policy, application, mode: 'setup' });
});
test('provider failures, redirects and echoed credentials never leak body text or fabricate model identity', async () => {
  for (const data of [
    { answers: {}, usage: { input_tokens: 1, output_tokens: 0 } },
    { message: key },
  ]) {
    const e = await callJev({ state: 'x', questions: {} }, key, {
      fetchImpl: async () => Response.json(data),
    });
    assert.equal(e.reportedProviderModel, null);
    assert.ok(!JSON.stringify(e).includes(key));
  }
  const e = await callJev({}, key, { fetchImpl: async () => new Response(key, { status: 429 }) });
  assert.equal(e.response.error, 'http_429');
  assert.equal(e.response.usage, null);
  assert.ok(!JSON.stringify(e).includes(key));
});

test('execution port supports a different response contract and output-token billing, and pins adapter versions', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adapter-test-')),
    storage = await localStorage(dir),
    repo = executionRepository(storage.db);
  t.after(async () => {
    storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const body = JSON.stringify({
      model: 'test-local-model',
      messages: [{ role: 'user', content: 'Synthetic test only' }],
    }),
    requestHash = sha(body);
  const adapter = {
    identity: { id: 'test-json-model', version: 2 },
    compile: () => ({
      manifest: { planHash: 'test-plan' },
      jobs: [{ id: 'one', requestHash, body }],
      reserveNano: 1000,
    }),
    reservation: () => 1000,
    describe: () => ({ providerLabel: 'Test model', model: 'test-local-model', estimatedUsd: 0 }),
    infer: async (request) => {
      assert.equal(request.model, 'test-local-model');
      return {
        response: { output: { attack: false }, usage: { inputTokens: 10, outputTokens: 20 } },
      };
    },
    assess: (job, evidence) => ({
      valid: true,
      error: null,
      evidence,
      usage: evidence.response.usage,
      rawHash: sha(JSON.stringify(evidence) + '\n'),
    }),
    cost: (o) => o.usage.inputTokens * 2 + o.usage.outputTokens * 5,
    report: (p, run, observations) => ({
      execution: p.execution,
      cost: run.known_nano,
      observations,
    }),
  };
  const service = executionService({ repo, blobs: storage.blobs, adapter });
  value(await service.initialize(owner, { maximumUsd: 1, carriedPriorUsd: 0 }));
  const q = value(await service.prepare(owner, {}));
  assert.equal(q.model, 'test-local-model');
  value(await service.start(owner, q.id, { confirmPaid: true, planHash: 'test-plan' }));
  value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  const report = value(await service.detail(owner, q.id, true)).report;
  assert.equal(report.cost, 120);
  assert.equal(report.observations[0].evidence.response.output.attack, false);
  assert.deepEqual(report.execution, adapter.identity);
  const changed = executionService({
    repo,
    blobs: storage.blobs,
    adapter: { ...adapter, identity: { ...adapter.identity, version: 3 } },
  });
  await assert.rejects(changed.detail(owner, q.id), /original execution adapter version/);
});

test('anonymous visitors can browse and plan while private runs and contribution writes stay protected', async (t) => {
  const { storage, q } = await fixture(t),
    env = { DB: storage.db, BUCKET: storage.blobs };
  for (const route of [
    '/',
    '/workspace',
    '/community',
    '/api/community/catalog',
    '/api/community/results',
  ]) {
    const r = await worker.fetch(new Request('https://site.test' + route), env, {});
    assert.equal(r.status, 200, route);
    assert.equal(r.headers.get('location'), null, route);
  }
  const session = await (
    await worker.fetch(new Request('https://site.test/api/execution/session'), env, {})
  ).json();
  assert.deepEqual(session, { signedIn: false, account: null, runs: [] });
  assert.equal(
    (await worker.fetch(new Request('https://site.test/api/execution/runs/' + q.id), env, {}))
      .status,
    401,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request('https://site.test/api/community/results', {
          method: 'POST',
          headers: {
            origin: 'https://site.test',
            'content-type': 'application/json',
            'x-observatory-intent': 'write',
          },
          body: '{}',
        }),
        env,
        {},
      )
    ).status,
    401,
  );
});

const batchInput = { policy, options: { tier: 'bronze', maxUsd: 0.15, layouts: ['question'] } };
const batchManifest = makePlan(policy, batchInput.options).manifest;
const batchSpec = { route: 'prepare', input: batchInput, planHash: batchManifest.planHash };

test(
  'sixteen provider calls overlap in one atomic batch and reject an overlapping dispatch',
  { timeout: 10000 },
  async (t) => {
    let entered,
      release,
      calls = 0;
    const ready = new Promise((r) => (entered = r)),
      gate = new Promise((r) => (release = r));
    const input = { policy, options: { tier: 'gold', maxUsd: 3, layouts: ['question'] } };
    const plan = makePlan(policy, input.options).manifest;
    const { service, q } = await fixture(
      t,
      async (request) => {
        if (++calls === 16) entered();
        await gate;
        return mock(request);
      },
      { route: 'prepare', input, planHash: plan.planHash },
    );
    value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
    const pending = service.step(owner, q.id, { index: 0, count: 16, apiKey: key });
    await ready;
    assert.equal(value(await service.detail(owner, q.id)).inflightCount, 16);
    assert.equal(
      (await service.step(owner, q.id, { index: 0, count: 16, apiKey: key })).tag,
      'error',
    );
    release();
    const run = value(await pending);
    assert.equal(run.completed, 16);
    assert.equal(calls, 16);
    assert.equal(run.knownUsd, (16 * 1234 * 42) / 1e9);
  },
);

test(
  'bounded batches overlap, prevent duplicate claims, and settle in manifest order',
  { timeout: 15000 },
  async (t) => {
    const releases = [];
    let allEntered,
      calls = 0;
    const entered = new Promise((resolve) => {
      allEntered = resolve;
    });
    const { service, q } = await fixture(
      t,
      async (r) => {
        const n = calls++;
        if (n < 3)
          await new Promise((resolve) => {
            releases[n] = resolve;
            if (releases.length === 3) allEntered();
          });
        return mock(r);
      },
      batchSpec,
    );
    value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
    assert.equal(
      (await service.step(owner, q.id, { index: 0, count: 17, apiKey: key })).tag,
      'error',
    );
    assert.equal(calls, 0);
    const flight = service.step(owner, q.id, { index: 0, count: 3, apiKey: key });
    await entered;
    assert.equal(value(await service.detail(owner, q.id)).inflightCount, 3);
    assert.equal(
      (await service.step(owner, q.id, { index: 0, count: 3, apiKey: key })).tag,
      'error',
    );
    releases[2]();
    releases[0]();
    releases[1]();
    let run = value(await flight);
    assert.equal(run.completed, 3);
    assert.equal(run.knownUsd, (3 * 1234 * 42) / 1e9);
    while (run.status === 'running')
      run = value(await service.step(owner, q.id, { index: run.completed, count: 3, apiKey: key }));
    assert.equal(run.status, 'complete');
    assert.equal(run.completed, q.requests);
    assert.equal(calls, q.requests);
    assert.equal(run.heldUsd, 0);
    const report = value(await service.detail(owner, q.id, true)).report;
    assert.equal(report.dispatched, q.requests);
    assert.equal(report.validCalls, q.requests);
    const rows = Object.values(report.conditions).flatMap((c) => c.rows);
    assert.deepEqual(
      rows.map((r) => r.plannedRequestHash),
      batchManifest.jobs.map((j) => j.requestHash),
    );
    assert.deepEqual(rows[0].dispatch, { batchStart: 0, batchSize: 3 });
  },
);

test(
  'stop during a parallel batch waits for all calls and holds only unknown charges',
  { timeout: 10000 },
  async (t) => {
    let entered,
      release,
      calls = 0;
    const ready = new Promise((r) => {
        entered = r;
      }),
      gate = new Promise((r) => {
        release = r;
      });
    const { service, q, repo } = await fixture(
      t,
      async (r) => {
        const n = calls++;
        if (calls === 3) entered();
        await gate;
        return n === 1
          ? {
              reportedProviderModel: null,
              response: { status: 'error', error: 'rate_limited', usage: null },
            }
          : mock(r);
      },
      batchSpec,
    );
    value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
    const flight = service.step(owner, q.id, { index: 0, count: 3, apiKey: key });
    await ready;
    const row = await repo.get(q.id, owner);
    const stopped = value(await service.stop(owner, q.id));
    assert.equal(stopped.heldUsd, row.inflight_reserve / 1e9);
    const unresolved = value(await service.detail(owner, q.id, true)).report;
    assert.equal(unresolved.dispatched, 3);
    assert.equal(
      Object.values(unresolved.conditions)
        .flatMap((c) => c.rows)
        .filter((r) => r.status === 'uncertain_dispatch').length,
      3,
    );
    release();
    const done = value(await flight);
    assert.equal(done.status, 'stopped');
    assert.equal(done.completed, 3);
    assert.equal(done.knownUsd, (2 * 1234 * 42) / 1e9);
    assert.equal(done.heldUsd, (batchManifest.jobs[1].reservationInputTokens * 42) / 1e9);
    assert.equal(
      (await service.step(owner, q.id, { index: 3, count: 3, apiKey: key })).tag,
      'error',
    );
    assert.equal(calls, 3);
  },
);

test(
  'failed batch evidence persistence retains its claim and prohibits replay',
  { timeout: 10000 },
  async (t) => {
    let calls = 0;
    const { service, q, storage } = await fixture(
      t,
      async (r) => {
        calls++;
        return mock(r);
      },
      batchSpec,
    );
    value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
    const put = storage.blobs.put;
    storage.blobs.put = (path, body) =>
      path.endsWith('/response/1') ? Promise.reject(Error('storage failure')) : put(path, body);
    await assert.rejects(
      service.step(owner, q.id, { index: 0, count: 3, apiKey: key }),
      /Batch evidence/,
    );
    const run = value(await service.detail(owner, q.id));
    assert.equal(run.inflightCount, 3);
    assert.equal(run.completed, 0);
    assert.equal(run.heldUsd, run.reservationUsd);
    assert.equal(
      (await service.step(owner, q.id, { index: 0, count: 3, apiKey: key })).tag,
      'error',
    );
    assert.equal(calls, 3);
  },
);

test('one invalid parallel response stops subsequent batches while accounting for successful siblings', async (t) => {
  let calls = 0;
  const { service, q } = await fixture(
    t,
    async (r) =>
      ++calls === 2
        ? {
            reportedProviderModel: null,
            response: { status: 'error', error: 'rate_limited', usage: null },
          }
        : mock(r),
    batchSpec,
  );
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  const done = value(await service.step(owner, q.id, { index: 0, count: 3, apiKey: key }));
  assert.equal(done.status, 'stopped');
  assert.equal(done.reason, 'rate_limited');
  assert.equal(done.completed, 3);
  assert.equal(done.knownUsd, (2 * 1234 * 42) / 1e9);
  assert.equal(done.heldUsd, (batchManifest.jobs[1].reservationInputTokens * 42) / 1e9);
  assert.equal((await service.step(owner, q.id, { index: 3, count: 3, apiKey: key })).tag, 'error');
  assert.equal(calls, 3);
});

test('community sharing uses only owned saved evaluation records and retains the entire planned suite', async (t) => {
  const { communityService } = await import('../src/service.mjs');
  const { repository } = await import('../src/adapters/d1.mjs');
  const { canonical, sha256 } = await import('../src/domain/contracts.mjs');
  const { service, q, storage, repo } = await fixture(t, async (r) => mock(r), batchSpec);
  const contributions = communityService({
    repo: repository(storage.db),
    blobs: storage.blobs,
    evidence: service,
  });
  const actor = { id: owner },
    input = { author: 'Fixture', reviewedForSharing: true, runId: q.id };
  assert.equal(
    (await contributions.upload({ ...input, bundle: { observations: [] } }, actor)).error.code,
    'hosted_run_required',
  );
  assert.equal(
    (await contributions.upload({ ...input, evidenceStatus: 'verified' }, actor)).error.code,
    'hosted_run_required',
  );
  assert.equal((await contributions.upload(input, { id: 'stranger' })).error.status, 404);
  assert.equal((await contributions.upload(input, actor)).error.code, 'run_unsettled');
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  value(await service.step(owner, q.id, { index: 0, count: 3, apiKey: key }));
  value(await service.stop(owner, q.id));
  const list = value(await contributions.runs(actor));
  assert.equal(list.runs[0].id, q.id);
  const contribution = value(await contributions.upload(input, actor));
  assert.equal(contribution.evidenceStatus, 'host-observed');
  assert.equal(contribution.visibility, 'private');
  assert.equal(contribution.total, q.requests);
  assert.equal(contribution.completed, 3);
  assert.equal(contribution.incomplete, q.requests - 3);
  const data = value(await contributions.download(contribution.id, actor));
  const bundle = JSON.parse(data.body);
  assert.equal(bundle.version, 2);
  assert.equal(bundle.provenance.settings.manifest.planHash, q.planHash);
  assert.equal(bundle.provenance.settings.report.status, 'stopped');
  assert.equal(bundle.observations.filter((r) => r.status === 'not_run').length, q.requests - 3);
  assert.equal(bundle.suite.definition.cases.length, q.requests);
  assert.equal(bundle.policy.hash, await sha256(canonical(policy)));
  assert.deepEqual(
    bundle.suite.definition.cases.map((r) => r.requestHash),
    batchManifest.jobs.map((j) => j.requestHash),
  );
  assert.ok(!data.body.includes(key));
  value(await contributions.setVisibility(contribution.id, { visibility: 'public' }, actor));
  assert.equal((await contributions.download(contribution.id, null)).tag, 'ok');
  const row = await repo.get(q.id, owner);
  const original = JSON.parse(
    await new Response((await storage.blobs.get(row.object_key + '/response/0')).body).text(),
  );
  original.evidence.response.answers.policy_decision.choice = 'forged';
  await storage.blobs.put(row.object_key + '/response/0', JSON.stringify(original));
  await assert.rejects(() => contributions.upload(input, actor), /Response integrity/);
  const saved = await repository(storage.db).get(contribution.id);
  await storage.blobs.put(saved.objectKey, '{}');
  assert.equal(
    (await contributions.download(contribution.id, null)).error.code,
    'evidence_changed',
  );
  assert.equal(
    (await contributions.setVisibility(contribution.id, { visibility: 'public' }, actor)).error
      .code,
    'evidence_changed',
  );
  value(await contributions.setVisibility(contribution.id, { visibility: 'private' }, actor));
});

test('stopped holds are nonblocking budget reservations, captured from the ledger without client acknowledgements', async (t) => {
  let calls = 0;
  const { service, repo, q } = await fixture(t, async (r) => {
    if (++calls === 1) throw Error('unknown outcome');
    return mock(r);
  });
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  const old = await repo.get(q.id, owner);
  const next = value(await service.prepare(owner, spec));
  const detail = value(await service.detail(owner, next.id));
  assert.equal(detail.startBlocker, null);
  assert.deepEqual(detail.unresolvedHolds, [
    { id: old.id, heldNano: old.held_nano, updatedAt: old.updated_at },
  ]);
  assert.equal(
    (await service.start(owner, next.id, { planHash: next.planHash })).error.code,
    'confirmation_required',
  );
  value(await service.start(owner, next.id, { planHash: next.planHash, confirmPaid: true }));
  const funded = await repo.get(next.id, owner);
  assert.deepEqual(JSON.parse(funded.retained_holds_json), detail.unresolvedHolds);
  assert.equal((await repo.account(owner)).held_nano, old.held_nano + funded.reserve_nano);
  assert.deepEqual(await repo.get(q.id, owner), old);
  assert.equal(calls, 1, 'start never sends a provider request');
  value(
    await service.start(owner, next.id, {
      planHash: next.planHash,
      confirmPaid: true,
      retainedHolds: [],
    }),
  );
  assert.deepEqual(
    await repo.get(next.id, owner),
    funded,
    'an idempotent start cannot rewrite the ledger snapshot',
  );
  value(await service.step(owner, next.id, { index: 0, apiKey: key }));
  assert.equal((await repo.account(owner)).held_nano, old.held_nano);
  assert.equal(calls, 2);
  assert.deepEqual(await repo.get(q.id, owner), old);
  assert.equal((await service.step(owner, q.id, { index: 0, apiKey: key })).tag, 'error');
});

test('old holds still exhaust the allowance, client snapshots cannot bypass accounting, and owners stay isolated', async (t) => {
  const { service, repo, storage, q } = await fixture(t, async () => {
    throw Error('unknown');
  });
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  const next = value(await service.prepare(owner, spec));
  const old = await repo.get(q.id, owner),
    reserve = (await repo.get(next.id, owner)).reserve_nano;
  await storage.db
    .prepare('UPDATE execution_accounts SET maximum_nano=?,prior_nano=0 WHERE owner=?')
    .bind(old.held_nano + reserve - 1, owner)
    .run();
  assert.equal(
    (
      await service.start(owner, next.id, {
        planHash: next.planHash,
        confirmPaid: true,
        retainedHolds: [],
      })
    ).error.code,
    'insufficient_allowance',
  );
  assert.equal((await repo.get(next.id, owner)).held_nano, 0);
  value(await service.initialize('stranger', { maximumUsd: 3, carriedPriorUsd: 0 }));
  assert.equal((await service.detail('stranger', next.id)).error.code, 'not_found');
  const other = value(await service.prepare('stranger', spec));
  assert.deepEqual(value(await service.detail('stranger', other.id)).unresolvedHolds, []);
  const started = value(
    await service.start('stranger', other.id, {
      planHash: other.planHash,
      confirmPaid: true,
      retainedHolds: [{ id: old.id, heldNano: 999 }],
    }),
  );
  assert.deepEqual(
    started.retainedHolds,
    [],
    'audit metadata comes from this owner’s ledger, never client claims',
  );
});

test('multiple stopped holds do not lock execution, but simultaneous starts still admit only one active run', async (t) => {
  const { service, repo, q } = await fixture(t, async () => {
    throw Error('unknown');
  });
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  const a = value(await service.prepare(owner, namedSpec('A'))),
    b = value(await service.prepare(owner, namedSpec('B')));
  const starts = await Promise.all(
    [a, b].map((p) => service.start(owner, p.id, { planHash: p.planHash, confirmPaid: true })),
  );
  assert.equal(starts.filter((r) => r.tag === 'ok').length, 1);
  assert.equal(starts.find((r) => r.tag === 'error').error.code, 'active_run');
  const winner = starts[0].tag === 'ok' ? a : b,
    loser = winner === a ? b : a;
  assert.equal(value(await service.detail(owner, loser.id)).startBlocker.id, winner.id);
  value(await service.step(owner, winner.id, { index: 0, apiKey: key }));
  assert.equal(value(await service.detail(owner, loser.id)).startBlocker, null);
  const started = value(
    await service.start(owner, loser.id, { planHash: loser.planHash, confirmPaid: true }),
  );
  assert.equal(started.retainedHolds.length, 2);
  assert.equal(
    (await repo.account(owner)).held_nano,
    (await repo.get(q.id, owner)).held_nano +
      (await repo.get(winner.id, owner)).held_nano +
      (await repo.get(loser.id, owner)).reserve_nano,
  );
});

test('late settlement releases only the old hold while a separate authorized run stays funded', async (t) => {
  let entered, release;
  const ready = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  const { service, repo, q } = await fixture(t, async (r) => {
    entered();
    await gate;
    return mock(r);
  });
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  const flight = service.step(owner, q.id, { index: 0, apiKey: key });
  await ready;
  value(await service.stop(owner, q.id));
  const next = value(await service.prepare(owner, spec));
  assert.equal(value(await service.detail(owner, next.id)).startBlocker, null);
  value(await service.start(owner, next.id, { planHash: next.planHash, confirmPaid: true }));
  const funded = await repo.get(next.id, owner);
  release();
  value(await flight);
  assert.equal((await repo.get(q.id, owner)).held_nano, 0);
  assert.deepEqual(await repo.get(next.id, owner), funded);
  assert.equal((await repo.account(owner)).held_nano, funded.reserve_nano);
  assert.equal((await service.step(owner, q.id, { index: 0, apiKey: key })).tag, 'error');
});

test('new authorization preserves the stopped run’s signed evidence and completion unchanged', async (t) => {
  const { repo, storage } = await fixture(t);
  const { authority } = await testReceipts();
  const service = executionService({
    repo,
    blobs: storage.blobs,
    receipts: authority,
    adapter: {
      ...jevExecutionAdapter,
      infer: async () => {
        throw Error('unknown');
      },
    },
  });
  const q = value(await service.prepare(owner, namedSpec('Signed old hold')));
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  value(await service.step(owner, q.id, { index: 0, apiKey: key }));
  const original = await repo.get(q.id, owner),
    completionKey = original.object_key + '/completion';
  const before = await new Response((await storage.blobs.get(completionKey)).body).text();
  const next = value(await service.prepare(owner, namedSpec('New signed authorization')));
  value(await service.start(owner, next.id, { planHash: next.planHash, confirmPaid: true }));
  const after = await new Response((await storage.blobs.get(completionKey)).body).text();
  assert.equal(after, before);
  assert.deepEqual(await repo.get(q.id, owner), original);
  const seal = JSON.parse(after);
  await authority.verify('completion', seal.record, seal.receipt);
});

test('original browser options allow small sweeps with the catalog ceiling but reject oversized selected suites', () => {
  const small = makeReplayPlan({ preset: 'families', maxUsd: 1 }).manifest;
  assert.equal(small.options.maxCalls, 15184);
  const prepared = rebuild({
    route: 'original/prepare',
    input: { options: small.options },
    planHash: small.planHash,
  });
  assert.equal(prepared.jobs.length, 36);
  assert.deepEqual(prepared.manifest, small);
  const large = makeReplayPlan({
    preset: 'contexts',
    profiles: ['permissive', 'balanced'],
    maxUsd: 10,
  }).manifest;
  assert.ok(large.jobs.length > 480);
  assert.throws(
    () =>
      rebuild({
        route: 'original/prepare',
        input: { options: large.options },
        planHash: large.planHash,
      }),
    /1–480 requests/,
  );
});

test('resume skips recorded failures and retains uncertain charges without duplicate authorization', async (t) => {
  const sent = [];
  const { service, repo, q } = await fixture(
    t,
    async (request) => {
      sent.push(sha(JSON.stringify(request)));
      return sent.length === 1
        ? {
            reportedProviderModel: 'jev-1.13.0',
            response: { status: 'error', error: 'http_520', usage: null },
          }
        : mock(request);
    },
    batchSpec,
  );
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  const stopped = value(await service.step(owner, q.id, { index: 0, count: 1, apiKey: key }));
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.completed, 1);
  assert.ok(stopped.heldUsd > 0);
  assert.equal((await service.resume('another-owner', q.id, {})).error.code, 'not_found');
  assert.equal(
    (await service.resume(owner, q.id, { planHash: q.planHash, fromIndex: 0, confirmPaid: true }))
      .error.code,
    'confirmation_required',
  );
  const authorization = { planHash: q.planHash, fromIndex: 1, confirmPaid: true };
  const attempts = await Promise.all([
    service.resume(owner, q.id, authorization),
    service.resume(owner, q.id, authorization),
  ]);
  assert.equal(attempts.filter((x) => x.tag === 'ok').length, 1);
  const running = value(attempts.find((x) => x.tag === 'ok'));
  assert.equal(running.completed, 1);
  assert.equal(sent.length, 1);
  const next = value(await service.step(owner, q.id, { index: 1, count: 1, apiKey: key }));
  assert.equal(next.completed, 2);
  assert.equal(new Set(sent).size, 2);
  const again = value(await service.stop(owner, q.id));
  assert.equal(again.heldUsd, stopped.heldUsd);
  assert.equal(
    (await repo.get(q.id, owner)).retained_uncertain_nano,
    Math.round(stopped.heldUsd * 1e9),
  );
  const report = value(await service.detail(owner, q.id, true)).report;
  assert.equal(report.conditions.question.rows[0].error, 'http_520');
  assert.equal(report.conditions.question.rows[1].valid, true);
});

test('signed resume retains the original completion and seals the new snapshot separately', async (t) => {
  const { repo, storage } = await fixture(t);
  const { authority } = await testReceipts();
  const service = executionService({
    repo,
    blobs: storage.blobs,
    adapter: { ...jevExecutionAdapter, infer: async (r) => mock(r) },
    receipts: authority,
  });
  const q = value(await service.prepare(owner, batchSpec));
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  value(await service.step(owner, q.id, { index: 0, count: 1, apiKey: key }));
  value(await service.stop(owner, q.id));
  const row = await repo.get(q.id, owner),
    sealKey = row.object_key + '/completion';
  const original = await new Response((await storage.blobs.get(sealKey)).body).text();
  value(
    await service.resume(owner, q.id, { planHash: q.planHash, fromIndex: 1, confirmPaid: true }),
  );
  value(await service.step(owner, q.id, { index: 1, count: 1, apiKey: key }));
  value(await service.stop(owner, q.id));
  assert.equal(await new Response((await storage.blobs.get(sealKey)).body).text(), original);
  const next = JSON.parse(
    await new Response((await storage.blobs.get(sealKey + '/resume-1')).body).text(),
  );
  await authority.verify('completion', next.record, next.receipt);
  assert.equal(next.record.recorded, 2);
  value(await service.contribution(owner, q.id));
});

test('resume cannot bypass an unresolved dispatch or depleted account allowance', async (t) => {
  const { service, repo, q, storage } = await fixture(t, async (r) => mock(r), batchSpec);
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  assert.equal(await repo.claim(q.id, owner, 0, 1, 1, new Date().toISOString()), true);
  value(await service.stop(owner, q.id));
  assert.equal(
    (await service.resume(owner, q.id, { planHash: q.planHash, fromIndex: 0, confirmPaid: true }))
      .error.code,
    'not_resumable',
  );
  const other = value(await service.prepare(owner, batchSpec));
  value(await service.stop(owner, other.id));
  await storage.db
    .prepare('UPDATE execution_accounts SET maximum_nano=prior_nano WHERE owner=?')
    .bind(owner)
    .run();
  assert.equal(
    (
      await service.resume(owner, other.id, {
        planHash: other.planHash,
        fromIndex: 0,
        confirmPaid: true,
      })
    ).error.code,
    'resume_conflict',
  );
  assert.equal((await repo.get(other.id, owner)).status, 'stopped');
  assert.equal((await repo.get(q.id, owner)).inflight, 0);
});

test('repeated failed continuations accumulate reservations and bulk stop never clears prior holds', async (t) => {
  const { service, q, repo } = await fixture(
    t,
    async () => ({
      reportedProviderModel: 'jev-1.13.0',
      response: { status: 'error', error: 'http_520', usage: null },
    }),
    batchSpec,
  );
  value(await service.start(owner, q.id, { planHash: q.planHash, confirmPaid: true }));
  const first = value(await service.step(owner, q.id, { index: 0, count: 1, apiKey: key }));
  value(
    await service.resume(owner, q.id, { planHash: q.planHash, fromIndex: 1, confirmPaid: true }),
  );
  const second = value(await service.step(owner, q.id, { index: 1, count: 1, apiKey: key }));
  assert.ok(second.heldUsd > first.heldUsd);
  value(
    await service.resume(owner, q.id, { planHash: q.planHash, fromIndex: 2, confirmPaid: true }),
  );
  value(await service.cancelRuns(owner, { runIds: [q.id] }));
  const row = await repo.get(q.id, owner);
  assert.equal(row.next_index, 2);
  assert.equal(row.held_nano, Math.round(second.heldUsd * 1e9));
});
