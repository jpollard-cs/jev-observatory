import test from 'node:test';
import assert from 'node:assert/strict';
import { unwrap } from '../harness/domain/result.mjs';
import {
  applyRichEvent,
  freezeRichPilotPlan,
  replayRichLedger,
  richHash,
  richTransportResumeEvent,
  runRichPilot,
} from '../harness/application/rich-pilot-run.mjs';
import { main } from '../scripts/rich-pilot.mjs';

function packet() {
  return unwrap(freezeRichPilotPlan({
    templateHash: 'a'.repeat(64),
    protocolVersion: 'rich-template-pilot-v1',
    rows: Array.from({ length: 48 }, (_, index) => ({
      id: `case-${index}`,
      request: {
        model: 'jev-latest',
        state: { material: `record ${index}` },
        questions: { attempt: { type: 'noul', instructions: 'Is an attempt present?' } },
      },
    })),
  }));
}

const transportFailure = () => ({
  response: { status: 'error', error: 'transport_error', providerModel: null },
  reportedProviderModel: null,
  providerEnvelope: { tag: 'error', error: { code: 'transport_error' } },
  httpResponse: null,
});
const success = () => ({
  response: {
    status: 'ok',
    answers: { attempt: { type: 'noul', noul: 0.1 } },
    usage: { inputTokens: 12, outputTokens: 0 },
  },
  reportedProviderModel: 'jev-frozen-version',
});

async function failedRun(failure = transportFailure()) {
  const { plan, bodies } = packet();
  const events = [], raw = new Map(), rows = new Map(), order = [], called = [];
  const ports = {
    now: () => '2026-09-17T00:00:00Z',
    appendEvent: (event) => { events.push(event); order.push(event.type); },
    readBody: (row) => bodies[row.requestHash],
    loadRaw: (row) => raw.get(row.id) ?? null,
    writeRaw: (row, evidence) => {
      const rawHash = richHash(JSON.stringify(evidence));
      raw.set(row.id, { evidence, rawHash });
      return rawHash;
    },
    hasRow: (row) => rows.has(row.id),
    writeRow: (row, value) => rows.set(row.id, value),
    writeUnknown: () => assert.fail('No interrupted row is expected'),
    infer: (request) => { called.push(request.state.material); return failure; },
  };
  unwrap(await runRichPilot({ plan, events: [], limit: 1 }, ports));
  const first = plan.rows[0];
  const review = {
    status: 'approved_for_unattempted_rows_only',
    decisionBy: 'operator_review',
    planHash: plan.planHash,
    failedKey: `${plan.stageId}:${first.id}`,
    rawHash: raw.get(first.id).rawHash,
    reason: 'Reviewed a transport failure with no HTTP response. Continue unattempted rows only.',
  };
  ports.infer = (request) => { called.push(request.state.material); order.push('infer'); return success(); };
  return { plan, ports, events, raw, rows, order, called, review };
}

test('audited transport resume preserves failed evidence and held cost, and limit1 dispatches the next row', async () => {
  const m = await failedRun();
  const before = unwrap(replayRichLedger(m.events));
  const failedReservation = structuredClone(before.reservations[m.review.failedKey]);
  const rawBefore = JSON.stringify(m.raw.get('case-0'));
  const rowBefore = JSON.stringify(m.rows.get('case-0'));
  const priorEventBytes = JSON.stringify(m.events);
  m.order.length = 0;
  const resumed = unwrap(await runRichPilot({
    plan: m.plan, events: m.events, limit: 1, transportReview: m.review,
  }, m.ports));
  assert.equal(resumed.dispatchedNow, 1);
  assert.equal(resumed.dispatched, 2);
  assert.equal(resumed.reason, 'invocation_limit');
  assert.deepEqual(m.called, ['record 0', 'record 1']);
  assert.deepEqual(m.order, ['resume_after_transport_review', 'reserve', 'infer', 'settle']);
  assert.equal(JSON.stringify(m.events.slice(0, 2)), priorEventBytes);
  assert.equal(JSON.stringify(m.raw.get('case-0')), rawBefore);
  assert.equal(JSON.stringify(m.rows.get('case-0')), rowBefore);
  const after = unwrap(replayRichLedger(m.events));
  assert.deepEqual(after.reservations[m.review.failedKey], failedReservation);
  assert.equal(after.heldNanoUsd, before.heldNanoUsd);
  assert.equal(after.stages[m.plan.stageId].heldNanoUsd, before.heldNanoUsd);
  assert.equal(after.knownNanoUsd, 12 * 42);
  assert.equal(m.events[2].reviewHash, richHash(JSON.stringify(m.review)));
  const complete = unwrap(await runRichPilot({ plan: m.plan, events: m.events }, m.ports));
  assert.equal(complete.dispatched, 48);
  assert.equal(complete.dispatchedNow, 46);
  assert.equal(m.called.length, 48);
  assert.equal(new Set(m.called).size, 48);
  assert.equal(complete.stageHeldUsd, failedReservation.reservationNanoUsd / 1e9);
});

test('without explicit review, the same transport failure stays halted and cannot dispatch', async () => {
  const m = await failedRun();
  const result = unwrap(await runRichPilot({ plan: m.plan, events: m.events }, m.ports));
  assert.equal(result.dispatchedNow, 0);
  assert.equal(result.reason, 'preflight_response_failure');
  assert.equal(m.events.length, 2);
});

test('review is bound to status, operator, nonempty reason, exact plan, failed key and raw hash', async () => {
  const m = await failedRun();
  for (const patch of [
    { status: 'retry_approved' }, { decisionBy: 'automatic' }, { reason: '' },
    { planHash: 'f'.repeat(64) }, { failedKey: `${m.plan.stageId}:case-1` },
    { rawHash: 'f'.repeat(64) },
  ]) {
    const result = await runRichPilot({
      plan: m.plan, events: m.events, limit: 1, transportReview: { ...m.review, ...patch },
    }, m.ports);
    assert.equal(result.tag, 'error', JSON.stringify(patch));
    assert.equal(m.events.length, 2);
    assert.equal(m.called.length, 1);
  }
});

test('HTTP, schema, inference exceptions, missing HTTP evidence, usage and provider identity cannot be waived', async () => {
  const variants = [
    { httpResponse: { status: 500, bodyText: 'unavailable' } },
    { httpResponse: { status: 200, bodyText: '{}' } },
    { httpResponse: undefined },
    { response: { status: 'error', error: 'schema_error' } },
    { response: { status: 'error', error: 'rich_inference_exception' } },
    { response: { status: 'error', error: 'transport_error', usage: { inputTokens: 1, outputTokens: 0 } } },
    { response: { status: 'error', error: 'transport_error', providerModel: 'jev-version' } },
    { reportedProviderModel: 'jev-version' },
    { providerEnvelope: { tag: 'error', error: { code: 'invalid_response' } } },
  ];
  for (const patch of variants) {
    const m = await failedRun({ ...transportFailure(), ...patch });
    const result = await runRichPilot({
      plan: m.plan, events: m.events, limit: 1, transportReview: m.review,
    }, m.ports);
    assert.equal(result.tag, 'error', JSON.stringify(patch));
    assert.equal(m.events.length, 2);
    assert.equal(m.called.length, 1);
  }
});

test('ledger replay rejects altered proofs, other halt reasons and any budget/request-limit bypass', async () => {
  const m = await failedRun();
  const ledger = unwrap(replayRichLedger(m.events));
  const event = {
    ...unwrap(richTransportResumeEvent(m.plan, ledger, m.review, m.raw.get('case-0'))),
    sequence: ledger.sequence + 1,
  };
  for (const halt of ['provider_model_drift', 'usage_unavailable', 'usage_exceeds_reservation', 'provider_model_unavailable', null]) {
    const state = structuredClone(ledger);
    state.stages[m.plan.stageId].haltedReason = halt;
    assert.equal(applyRichEvent(state, event).tag, 'error', String(halt));
  }
  assert.equal(applyRichEvent({ ...ledger, haltedReason: 'usage_exceeds_reservation' }, event).tag, 'error');
  for (const patch of [
    { reviewHash: 'f'.repeat(64) }, { stageId: 'another-stage' }, { failedKey: 'another-key' },
    { rawHash: 'f'.repeat(64) }, { requestHash: 'f'.repeat(64) },
    { transportEvidence: { ...event.transportEvidence, httpResponse: { status: 200 } } },
  ]) assert.equal(applyRichEvent(ledger, { ...event, ...patch }).tag, 'error');
  const resumed = unwrap(applyRichEvent(ledger, event));
  assert.equal(resumed.stages[m.plan.stageId].dispatched, 1);
  assert.equal(resumed.heldNanoUsd, ledger.heldNanoUsd);
  const reserve = {
    sequence: resumed.sequence + 1, type: 'reserve', key: `${m.plan.stageId}:case-1`,
    stageId: m.plan.stageId, requestHash: m.plan.rows[1].requestHash, reservationNanoUsd: 1,
  };
  const atCount = structuredClone(resumed);
  atCount.stages[m.plan.stageId].dispatched = 48;
  assert.equal(applyRichEvent(atCount, reserve).error.code, 'rich_stage_request_limit');
  const atStageBudget = structuredClone(resumed);
  atStageBudget.stages[m.plan.stageId].heldNanoUsd = 300_000_000;
  assert.equal(applyRichEvent(atStageBudget, reserve).error.code, 'rich_stage_budget_exhausted');
  assert.equal(applyRichEvent({ ...resumed, heldNanoUsd: 3_000_000_000 }, reserve).error.code, 'rich_restart_budget_exhausted');
});

test('a consumed review cannot clear a later failure or be applied twice', async () => {
  const m = await failedRun();
  m.ports.infer = () => transportFailure();
  unwrap(await runRichPilot({ plan: m.plan, events: m.events, limit: 1, transportReview: m.review }, m.ports));
  const ledger = unwrap(replayRichLedger(m.events));
  assert.equal(ledger.stages[m.plan.stageId].haltedByKey, `${m.plan.stageId}:case-1`);
  const count = m.events.length;
  const result = await runRichPilot({ plan: m.plan, events: m.events, transportReview: m.review }, m.ports);
  assert.equal(result.tag, 'error');
  assert.equal(m.events.length, count);
});

test('transport review flag is unavailable for prepare or status modes', async () => {
  for (const mode of ['--prepare', '--status'])
    await assert.rejects(main([mode, '--resume-transport-after-review']), /rich_transport_resume_requires_live/);
});
