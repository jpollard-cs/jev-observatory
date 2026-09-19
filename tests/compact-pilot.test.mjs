import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompactPilot } from '../scripts/compact-pilot.mjs';
import { compactPairedTransitions } from '../harness/domain/compact-pilot-report.mjs';
import { richHash, replayRichLedger, runRichPilot } from '../harness/application/rich-pilot-run.mjs';
import { richDiskPorts, saveRichPilotPlan, loadRichPilotRows } from '../scripts/rich-pilot.mjs';
import { buildRichPilotPlan } from '../harness/domain/rich-pilot-request.mjs';
import { buildRichRepairPlan } from '../harness/domain/rich-pilot-repair.mjs';
import { unwrap } from '../harness/domain/result.mjs';
import { writeCampaignFile } from '../scripts/campaign.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (file) => JSON.parse(fs.readFileSync(file));
function setup(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-compact48-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const d of ['harness', 'cases', 'policies', 'scripts', 'config'])
    fs.cpSync(path.join(root, d), path.join(temp, d), { recursive: true });
  fs.cpSync(path.join(seed, 'runs'), path.join(temp, 'runs'), { recursive: true });
  const api = createCompactPilot(temp, { pause: () => {} });
  const plan = api.prepare();
  const ledgerBase = path.join(temp, 'runs/rich-restart-budget-v1');
  const events = () => fs.readdirSync(ledgerBase).filter((n) => /^\d{10}\.json$/.test(n)).sort().map((n) => json(path.join(ledgerBase, n)));
  return { api, plan, temp, ledgerBase, events };
}
function answers(request) {
  return Object.fromEntries(Object.entries(request.questions).map(([id, q]) => {
    if (q.type === 'noul') return [id, { type: 'noul', noul: 0.1 }];
    const keys = q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
    return [id, { type: q.type, confidence: 1,
      probabilities: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 1 : 0])),
      ...(q.type === 'choice' ? { choice: keys[0] } : { score: 0,
        legend: Object.fromEntries(keys.map((k) => [k, q.criteria[Number(k)]])) }) }];
  }));
}
const simulated = (request, overrides = {}) => ({
  response: { status: 'ok', answers: answers(request), usage: { inputTokens: 100, outputTokens: 0 }, latencyMs: 2 },
  reportedProviderModel: 'jev-1.13.0', ...overrides,
});
const liveArgs = (plan) => ['--live', '--approve-plan', plan.planHash, '--max-requests', '48', '--max-cost-usd', '0.30'];

// Synthetic baseline/repair fixtures are generated offline. Tests never require private run data.
const seed = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-compact48-synthetic-baseline-'));
after(() => fs.rmSync(seed, { recursive: true, force: true }));
const seedOriginal = path.join(seed, 'runs/rich-template-pilot-v1');
const seedRepair = path.join(seed, 'runs/rich-template-pilot-repair-v1');
const seedLedger = path.join(seed, 'runs/rich-restart-budget-v1');
const seedEvents = () => fs.existsSync(seedLedger) ? fs.readdirSync(seedLedger).filter(n => n.endsWith('.json')).sort().map(n => json(path.join(seedLedger, n))) : [];
const seedSource = unwrap(buildRichPilotPlan({ templateText: fs.readFileSync(path.join(root, 'policies/prompt-injection-policy-template.md'), 'utf8') }));
const seedPlan = saveRichPilotPlan(seedOriginal, seedSource);
let seedCalls = 0;
unwrap(await runRichPilot({ plan: seedPlan, events: [], limit: 48 }, richDiskPorts(seedOriginal, seedLedger, {
  pause: () => {}, infer: async (request) => ++seedCalls === 48
    ? { response: { status: 'error', error: 'transport_error', usage: null }, reportedProviderModel: null,
        httpResponse: null, providerEnvelope: { tag: 'error', error: { code: 'transport_error' } } }
    : simulated(request),
})));
const failedSeedRow = seedPlan.rows.at(-1);
const repairedSeed = unwrap(buildRichRepairPlan({
  sourcePlan: seedPlan, sourceRows: loadRichPilotRows(seedOriginal),
  sourceRawBody: fs.readFileSync(path.join(seedOriginal, 'records', richHash(failedSeedRow.id), 'response.json'), 'utf8'),
  requestBody: fs.readFileSync(path.join(seedOriginal, 'requests', failedSeedRow.requestHash + '.json'), 'utf8'),
  ledger: unwrap(replayRichLedger(seedEvents())),
}));
writeCampaignFile(path.join(seedRepair, 'manifest.json'), JSON.stringify(repairedSeed.plan, null, 2) + '\n');
writeCampaignFile(path.join(seedRepair, 'requests', failedSeedRow.requestHash + '.json'), repairedSeed.requestBody);
unwrap(await runRichPilot({ plan: repairedSeed.plan, events: seedEvents(), limit: 1 },
  richDiskPorts(seedRepair, seedLedger, { pause: () => {}, infer: async (request) => simulated(request) })));


test('48-only plan changes the guide and no other request fields; fresh costs are not inherited from reference', (t) => {
  const w = setup(t), original = json(path.join(w.temp, 'runs/rich-template-pilot-v1/manifest.json'));
  assert.equal(w.plan.rows.length, 48);
  assert.equal(w.plan.templateUtf8, 17063);
  assert.equal(w.plan.plannedReservationNanoUsd, 119084616);
  assert.equal(Math.round(w.plan.costs.reservationUsd * 1e9), w.plan.plannedReservationNanoUsd);
  assert.equal(w.plan.baseline.originalPlanHash, original.planHash);
  for (let i = 0; i < 48; i++) {
    const row = w.plan.rows[i], ref = original.rows[i];
    assert.equal(row.id, ref.id);
    assert.deepEqual(row.expected, ref.expected);
    const a = json(path.join(w.temp, 'runs/rich-template-pilot-v1/requests', ref.requestHash + '.json'));
    const b = json(path.join(w.api.base, 'requests', row.requestHash + '.json'));
    assert.equal(b.state.priorAssessment, undefined);
    assert.equal(b.state.assessmentMode, undefined);
    assert.deepEqual(Object.keys(b.state).sort(), ['classifierGuide', 'material', 'policy', 'trustedContext']);
    a.state.classifierGuide = b.state.classifierGuide;
    assert.deepEqual(b, a);
  }
  assert.equal(w.api.prepare().planHash, w.plan.planHash);
});

test('offline report verifies historical repair, shows all 48 and the predeclared primary 45; no new answers', (t) => {
  const w = setup(t), r = w.api.writeReport();
  assert.equal(r.status, 'not_run');
  assert.equal(r.budget.dispatched, 0);
  assert.equal(r.budget.restartKnownUsageUsd, 0.0002016);
  assert.equal(r.budget.restartHeldUsd, failedSeedRow.reservationNanoUsd / 1e9);
  assert.equal(r.authoredLabelSensitivity.baseline.valid, 48);
  assert.equal(r.authoredLabelSensitivity.compact.valid, 0);
  assert.equal(r.primaryExcludingDisputedAcrostic.baseline.planned, 45);
  assert.equal(r.primaryExcludingDisputedAcrostic.compact.planned, 45);
  assert.equal(r.authoredLabelSensitivity.baseline.classification.attackDenominator, 24);
  assert.equal(r.primaryExcludingDisputedAcrostic.baseline.classification.attackDenominator, 21);
  assert.equal(r.rows.filter((r) => r.baseline.baselineOrigin === 'separate_transport_repair').length, 1);
  assert.match(fs.readFileSync(path.join(w.api.base, 'report.md'), 'utf8'), /No new Jev results/);
});

test('48 simulated responses support one-call resume, complete reports, and no duplicate dispatch', async (t) => {
  const w = setup(t); let calls = 0;
  const infer = async (request) => { calls++; return simulated(request); };
  await w.api.execute({ infer, limit: 1 });
  assert.equal(calls, 1);
  assert.equal(w.api.report().status, 'partial');
  await w.api.execute({ infer });
  assert.equal(calls, 48);
  await w.api.execute({ infer });
  assert.equal(calls, 48);
  const r = w.api.writeReport();
  assert.equal(r.status, 'complete');
  assert.equal(r.budget.dispatched, 48);
  assert.equal(r.budget.stageKnownUsageUsd, 0.0002016);
  assert.equal(r.budget.stageHeldUsd, 0);
  assert.equal(r.primaryExcludingDisputedAcrostic.transitions.classification.bothValid, 45);
  assert.equal(r.authoredLabelSensitivity.transitions.classification.bothValid, 48);
  assert.equal(r.authoredLabelSensitivity.compact.inputTokens.total, 4800);
});

test('failed response is retained; the second invocation cannot retry or spend again', async (t) => {
  const w = setup(t); let calls = 0;
  const infer = async () => { calls++; return { response: { status: 'error', error: 'transport_error', usage: null }, reportedProviderModel: null }; };
  await assert.rejects(w.api.execute({ infer }), /preflight_response_failure/);
  await assert.rejects(w.api.execute({ infer }), /preflight_response_failure/);
  assert.equal(calls, 1);
  const r = w.api.report();
  assert.equal(r.status, 'stopped');
  assert.equal(r.budget.stageKnownUsageUsd, 0);
  assert.equal(r.budget.stageHeldUsd, w.plan.rows[0].reservationNanoUsd / 1e9);
});

test('missing usage is not treated as a free successful run', async (t) => {
  const w = setup(t); let calls = 0;
  const infer = async (request) => { calls++; const r = simulated(request); r.response.usage = null; return r; };
  await assert.rejects(w.api.execute({ infer }), /usage_unavailable/);
  await assert.rejects(w.api.execute({ infer }), /usage_unavailable/);
  assert.equal(calls, 1);
  assert.ok(w.api.report().budget.stageHeldUsd > 0);
});

test('a first response from a different provider version stops comparison before a second call', async (t) => {
  const w = setup(t); let calls = 0;
  const infer = async (request) => { calls++; return simulated(request, { reportedProviderModel: 'unexpected-new-version' }); };
  await assert.rejects(w.api.execute({ infer }), /provider_differs_from_historical_baseline/);
  await assert.rejects(w.api.execute({ infer }), /provider_differs_from_historical_baseline/);
  assert.equal(calls, 1);
  assert.equal(w.api.report().status, 'stopped');
});

test('within-stage model drift stops after the changed response', async (t) => {
  const w = setup(t); let calls = 0;
  const infer = async (request) => simulated(request, { reportedProviderModel: ++calls === 1 ? 'jev-1.13.0' : 'different-version' });
  await assert.rejects(w.api.execute({ infer }), /provider_model_drift/);
  assert.equal(calls, 2);
});

test('an uncertain dispatch without saved response is held and never retried', async (t) => {
  const w = setup(t), row = w.plan.rows[0];
  const account = replayRichLedger(w.events()).value;
  richDiskPorts(w.api.base, w.ledgerBase).appendEvent({
    type: 'reserve', sequence: account.sequence + 1, key: `${w.plan.stageId}:${row.id}`,
    stageId: w.plan.stageId, id: row.id, requestHash: row.requestHash, reservationNanoUsd: row.reservationNanoUsd,
  });
  let calls = 0;
  await assert.rejects(w.api.execute({ infer: async (request) => { calls++; return simulated(request); } }), /uncertain_dispatch/);
  assert.equal(calls, 0);
  assert.equal(w.api.report().rows[0].status, 'unknown_dispatch');
});

test('a durably saved response is recovered without repeating its request', async (t) => {
  const w = setup(t), row = w.plan.rows[0], ports = richDiskPorts(w.api.base, w.ledgerBase);
  const account = replayRichLedger(w.events()).value, key = `${w.plan.stageId}:${row.id}`;
  ports.appendEvent({ type: 'reserve', sequence: account.sequence + 1, key,
    stageId: w.plan.stageId, id: row.id, requestHash: row.requestHash, reservationNanoUsd: row.reservationNanoUsd });
  const request = json(path.join(w.api.base, 'requests', row.requestHash + '.json'));
  ports.writeRaw(row, { key, requestHash: row.requestHash, ...simulated(request) });
  let calls = 0;
  await w.api.execute({ infer: async (r) => { calls++; assert.notDeepEqual(r, request); return simulated(r); }, limit: 1 });
  assert.equal(calls, 1);
  assert.equal(w.api.report().budget.dispatched, 2);
});

test('changed guide, changed wire body, and missing explicit caps cannot reach inference', async (t) => {
  const w = setup(t); let calls = 0;
  const infer = async (request) => { calls++; return simulated(request); };
  await assert.rejects(w.api.main(['--live']), /explicit_approval/);
  const f = path.join(w.api.base, 'requests', w.plan.rows[0].requestHash + '.json');
  const original = fs.readFileSync(f, 'utf8'); fs.appendFileSync(f, ' ');
  await assert.rejects(w.api.execute({ infer }), /frozen_request_changed/);
  fs.writeFileSync(f, original);
  fs.appendFileSync(path.join(w.temp, 'policies/classifier-guide-v3-compact.draft.json'), '\n');
  await assert.rejects(w.api.main(liveArgs(w.plan)), /sources_changed/);
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(path.join(w.api.base, 'approval.json')), false);
});

test('existing shared-budget reservations prevent a new stage even before credentials are loaded', async (t) => {
  const w = setup(t), ports = richDiskPorts(w.api.base, w.ledgerBase);
  for (let i = 0; i < 10; i++) {
    const account = replayRichLedger(w.events()).value;
    ports.appendEvent({ type: 'reserve', sequence: account.sequence + 1, key: `test-other-stage-${i}:call`,
      stageId: `test-other-stage-${i}`, id: 'call', requestHash: richHash(`test-${i}`), reservationNanoUsd: 290000000 });
  }
  await assert.rejects(w.api.main(liveArgs(w.plan)), /restart_budget_insufficient/);
  assert.equal(fs.existsSync(path.join(w.api.base, 'approval.json')), false);
});

test('changed historical raw evidence is rejected rather than silently compared', (t) => {
  const w = setup(t), row = w.plan.baseline.rows.find((r) => r.baselineOrigin === 'original');
  const file = path.join(w.temp, 'runs/rich-template-pilot-v1/records', richHash(row.id), 'response.json');
  fs.appendFileSync(file, ' ');
  assert.throws(() => w.api.report(), /evidence_binding_mismatch/);
});

test('benign abstention to benign is a corrected error, not a corrected false alarm', () => {
  const row = (choice) => ({ id: 'b', valid: true, family: 'example', expected: { classification: 'benign' },
    answers: { classification: { choice }, injection_present: { noul: 0.1 } } });
  const t = compactPairedTransitions([row('insufficient_evidence')], [row('benign')]).classification;
  assert.equal(t.correctedErrors, 1);
  assert.equal(t.correctedFalseAlarms, 0);
});

function isolatedEnv(t, values) {
  const keys = ['TYPESAFE_API_KEY', 'JEV_API_KEY', 'JEV_BASE_URL', 'JEV_INPUT_USD_PER_MILLION', 'JEV_OUTPUT_USD_PER_MILLION'];
  const prior = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, values);
  t.after(() => { for (const k of keys) { if (prior[k] === undefined) delete process.env[k]; else process.env[k] = prior[k]; } });
}

test('CLI uses default list prices only when absent and reaches an injected HTTP transport exactly once', async (t) => {
  const w = setup(t);
  isolatedEnv(t, { TYPESAFE_API_KEY: 'offline-test-key-not-a-real-credential' });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const request = JSON.parse(options.body);
    return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: answers(request),
      usage: { input_tokens: 100, output_tokens: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  await w.api.main([...liveArgs(w.plan), '--limit', '1']);
  assert.equal(calls, 1);
  assert.equal(w.api.report().budget.dispatched, 1);
  assert.equal(w.api.report().authoredLabelSensitivity.compact.valid, 1);
});

test('a configured price different from the plan is never silently overwritten', async (t) => {
  const w = setup(t);
  isolatedEnv(t, { TYPESAFE_API_KEY: 'offline-test-key-not-a-real-credential', JEV_INPUT_USD_PER_MILLION: '0.1' });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw Error('network_must_not_be_reached'); });
  await assert.rejects(w.api.main(liveArgs(w.plan)), /price_differs_from_plan/);
  assert.equal(calls, 0);
  assert.equal(w.api.report().budget.dispatched, 0);
  assert.equal(fs.existsSync(path.join(w.api.base, 'approval.json')), false);
});
