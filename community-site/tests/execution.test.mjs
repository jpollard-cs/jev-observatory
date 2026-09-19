import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localStorage } from '../scripts/local-storage.mjs';
import { executionRepository } from '../src/hosted/repository.mjs';
import { executionService } from '../src/hosted/service.mjs';
import { executionApi } from '../src/hosted/http.mjs';
import { callJev } from '../src/hosted/provider.mjs';
import { rebuild, assess, sha } from '../src/hosted/core.mjs';
import { preset } from '../../workbench/src/policy.mjs';
import { defaultApplication } from '../../workbench/src/selection/application.mjs';
import { makeAdvisorPlan, adviceSummary } from '../../workbench/src/selection/advisor.mjs';
import { makePlan } from '../../workbench/src/planner.mjs';
import { makeReplayPlan } from '../../workbench/src/history/planner.mjs';
import { importReport } from '../../workbench/src/report.mjs';
import worker from '../dist/server/index.js';
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
async function fixture(t, infer = async (r) => mock(r)) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hosted-test-')),
    storage = await localStorage(dir),
    repo = executionRepository(storage.db);
  t.after(async () => {
    storage.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const service = executionService({ repo, blobs: storage.blobs, infer });
  value(await service.initialize(owner, { maximumUsd: 3, carriedPriorUsd: 1.450070202 }));
  const q = value(await service.prepare(owner, spec));
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
  const second = value(await service.prepare(owner, spec));
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
test('unknown cost is retained, no retry or subsequent run is allowed, and malformed model outputs do not score', async (t) => {
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
    'error',
  );
  assert.equal(calls, 1);
  const report = value(await service.detail(owner, q.id, true)).report;
  assert.equal(report.rows.length, 0);
  assert.equal(report.failures.length, 1);
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
  const previous = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = previous;
  });
  globalThis.fetch = async (url, opts) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(opts.redirect, 'error');
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
