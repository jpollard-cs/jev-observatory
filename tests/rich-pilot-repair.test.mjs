import test from 'node:test';
import assert from 'node:assert/strict';
import { unwrap } from '../harness/domain/result.mjs';
import {
  buildRichRepairPlan,
  verifyRichRepairReview,
  summarizeRichRepair,
} from '../harness/domain/rich-pilot-repair.mjs';
import {
  richHash,
  replayRichLedger,
  runRichPilot,
} from '../harness/application/rich-pilot-run.mjs';

function fixture() {
  const request = {
    model: 'jev-latest',
    state: { material: 'same frozen material' },
    questions: { injection_present: { type: 'noul', instructions: 'Is an attempt present?' } },
  };
  const requestBody = JSON.stringify(request),
    requestHash = richHash(requestBody),
    requestBytes = Buffer.byteLength(requestBody);
  const trial = {
    id: 'failed-case',
    requestHash,
    requestBytes,
    reservationNanoUsd: (requestBytes + 256) * 42,
    expected: { injectionPresent: false },
    metadata: { fixtureId: 'case' },
  };
  const sourcePlan = {
    protocolVersion: 'rich-template-pilot-v1',
    templateHash: 'a'.repeat(64),
    planHash: 'b'.repeat(64),
    stageId: 'source-stage',
    model: 'jev-latest',
    validation: {},
    rows: [trial, ...Array.from({ length: 47 }, (_, i) => ({ ...trial, id: `okay-${i}` }))],
  };
  const sourceRows = sourcePlan.rows.map((r, i) => ({
    ...r,
    planHash: sourcePlan.planHash,
    status: i ? 'ok' : 'error',
    error: i ? null : 'transport_error',
    usage: i ? { inputTokens: 1, outputTokens: 1 } : null,
    providerModel: i ? 'jev-known' : null,
  }));
  const evidence = {
    key: 'source-stage:failed-case',
    requestHash,
    response: { status: 'error', error: 'transport_error', usage: null },
    httpResponse: null,
    reportedProviderModel: null,
    providerEnvelope: { tag: 'error', error: { code: 'transport_error' } },
  };
  const sourceRawBody = JSON.stringify(evidence) + '\n',
    rawHash = richHash(sourceRawBody);
  const events = [
    {
      sequence: 1,
      type: 'reserve',
      key: evidence.key,
      stageId: 'source-stage',
      requestHash,
      reservationNanoUsd: trial.reservationNanoUsd,
    },
    {
      sequence: 2,
      type: 'settle',
      key: evidence.key,
      requestHash,
      rawHash,
      usage: null,
      providerModel: null,
      failed: true,
    },
  ];
  const input = {
    sourcePlan,
    sourceRows,
    sourceRawBody,
    requestBody,
    ledger: unwrap(replayRichLedger(events)),
  };
  return { input, request, events, trial, frozen: unwrap(buildRichRepairPlan(input)) };
}

test('repair freezes only the failed exact body, separate identity and original held reservation', () => {
  const { input, frozen, trial } = fixture();
  assert.equal(frozen.requestBody, input.requestBody);
  assert.equal(frozen.plan.rows.length, 1);
  assert.equal(frozen.plan.rows[0].requestHash, trial.requestHash);
  assert.notEqual(frozen.plan.stageId, input.sourcePlan.stageId);
  assert.equal(frozen.plan.repairLimits.maximumRequests, 1);
  assert.equal(frozen.plan.repairLimits.maximumStageCostUsd, 0.01);
  assert.equal(input.ledger.heldNanoUsd, trial.reservationNanoUsd);
});
test('successful/ambiguous failures, modified wire body and unbound source ledger are rejected', () => {
  for (const edit of [
    (x) => (x.sourceRows[0].status = 'ok'),
    (x) => (x.sourceRows[1].status = 'error'),
    (x) => (x.requestBody += ' '),
    (x) => (x.ledger.reservations['source-stage:failed-case'].settlement.rawHash = 'changed'),
    (x) => (x.sourceRawBody = x.sourceRawBody.replace('"httpResponse":null', '"httpResponse":{}')),
  ]) {
    const { input } = fixture();
    edit(input);
    assert.equal(buildRichRepairPlan(input).tag, 'error');
  }
});
test('live review binds source, repair, exact request and one-call budget', () => {
  const {
    frozen: { plan },
  } = fixture();
  const review = {
    status: 'approved_for_one_transport_repair',
    decisionBy: 'operator_review',
    planHash: plan.planHash,
    sourcePlanHash: plan.source.planHash,
    requestHash: plan.source.requestHash,
    maximumRequests: 1,
    maximumStageCostUsd: 0.01,
    maximumRestartCostUsd: 3,
  };
  assert.equal(verifyRichRepairReview(plan, review).tag, 'ok');
  assert.equal(verifyRichRepairReview(plan, { ...review, maximumRequests: 2 }).tag, 'error');
  assert.equal(verifyRichRepairReview(plan, { ...review, sourcePlanHash: 'changed' }).tag, 'error');
});
test('one supplemental dispatch appends same ledger, preserves original events, and cannot repeat', async () => {
  const { events, frozen, trial } = fixture(),
    savedOriginal = JSON.stringify(events),
    raw = new Map(),
    rows = new Map();
  let calls = 0;
  const ports = {
    now: () => 'now',
    appendEvent: (e) => events.push(e),
    readBody: () => frozen.requestBody,
    loadRaw: (r) => raw.get(r.id),
    hasRow: (r) => rows.has(r.id),
    writeRow: (r, row) => rows.set(r.id, row),
    writeUnknown: () => {},
    writeRaw: (r, e) => {
      const rawHash = richHash(JSON.stringify(e));
      raw.set(r.id, { evidence: e, rawHash });
      return rawHash;
    },
    infer: async () => {
      calls++;
      return {
        response: {
          status: 'ok',
          answers: { injection_present: { type: 'noul', noul: 0.1 } },
          usage: { inputTokens: 20, outputTokens: 1 },
        },
        reportedProviderModel: 'jev-known',
      };
    },
  };
  const first = unwrap(
    await runRichPilot({ plan: frozen.plan, events: [...events], limit: 1 }, ports),
  );
  assert.equal(first.dispatchedNow, 1);
  assert.equal(JSON.stringify(events.slice(0, 2)), savedOriginal);
  assert.equal(first.restartHeldUsd, trial.reservationNanoUsd / 1e9);
  const second = unwrap(
    await runRichPilot({ plan: frozen.plan, events: [...events], limit: 1 }, ports),
  );
  assert.equal(second.dispatchedNow, 0);
  assert.equal(calls, 1);
});
test('supplemental views retain 49 attempts and select the unavailable case irrespective of correctness', () => {
  const {
    frozen: { plan },
    request,
  } = fixture();
  const originalReport = {
    planHash: plan.source.planHash,
    overall: {
      attempted: 48,
      wholeResponseValid: 47,
      questions: {
        injection_present: {
          scored: true,
          correct: 40,
          valid: 47,
          attempted: 48,
          allAttemptAccuracy: 40 / 48,
        },
      },
    },
    records: [
      {
        id: 'failed-case',
        wholeResponseValid: false,
        requestFailure: { category: 'transport_error' },
        expected: { injection_present: false },
      },
    ],
  };
  const repairRow = {
    id: 'failed-case',
    planHash: plan.planHash,
    requestHash: plan.source.requestHash,
    request,
    status: 'ok',
    providerModel: 'jev-known',
    answers: { injection_present: { type: 'noul', noul: 0.9 } },
    usage: { inputTokens: 20, outputTokens: 1 },
  };
  const before = JSON.stringify(originalReport);
  const report = unwrap(summarizeRichRepair({ plan, originalReport, repairRow, request }));
  assert.equal(report.original.attempted, 48);
  assert.equal(report.original.validResponses, 47);
  assert.equal(report.allAttempts.attempted, 49);
  assert.equal(report.allAttempts.validResponses, 48);
  assert.equal(report.explicitCaseCompletion.available, 48);
  assert.equal(report.repairedCase.attempts, 2);
  assert.equal(report.questions.injection_present.explicitCaseCompletion.correct, 40);
  assert.equal(report.questions.injection_present.allAttempts.accuracy, 40 / 49);
  assert.equal(JSON.stringify(originalReport), before);
  const mismatch = unwrap(
    summarizeRichRepair({
      plan,
      originalReport,
      repairRow: { ...repairRow, providerModel: 'changed' },
      request,
    }),
  );
  assert.equal(mismatch.status, 'provider_model_changed');
  assert.equal(mismatch.explicitCaseCompletion, null);
});
