import test from 'node:test';
import assert from 'node:assert/strict';
import { runCampaignPhase } from '../harness/application/campaign-run.mjs';
import { freezeCampaignRequest } from '../harness/domain/campaign-plan.mjs';

const request = {
  state: { text: 'inert' },
  model: 'fixture',
  questions: { q: { type: 'noul', instructions: 'Is this inert?' } },
};
const frozen = freezeCampaignRequest(request).value;
const plan = { campaignId: 'campaign-test', model: 'fixture' };
const trial = (id) => ({
  id,
  phase: 'smoke',
  requestHash: frozen.requestHash,
  requestBytes: frozen.requestBytes,
  reservationNanoUsd: frozen.reservationNanoUsd,
});

function boundary(responses = []) {
  const events = [],
    raw = new Map(),
    rows = new Map(),
    unknown = new Map(),
    order = [];
  let calls = 0;
  const ports = {
    now: () => 'fixed',
    readBody: () => frozen.body,
    appendEvent: (event) => {
      events.push(event);
      order.push(event.type);
    },
    loadRaw: (item) => raw.get(item.id),
    hasRow: (item) => rows.has(item.id),
    writeUnknownRow: (item, row) => unknown.set(item.id, row),
    writeRaw: (item, evidence) => {
      order.push('raw');
      const saved = { evidence, rawHash: `raw:${item.id}` };
      raw.set(item.id, saved);
      return saved.rawHash;
    },
    project: ({ evidence }) => ({
      ...evidence.response,
      parsed:
        evidence.response.status === 'ok' ? { valid: evidence.response.valid !== false } : null,
    }),
    writeRow: (item, row) => {
      order.push('row');
      rows.set(item.id, row);
    },
    infer: async () => {
      order.push('infer');
      return (
        responses[calls++] || {
          response: { status: 'ok', usage: { inputTokens: 10, outputTokens: 1 } },
          reportedProviderModel: 'jev-fixed',
        }
      );
    },
  };
  return { events, raw, rows, unknown, order, ports, calls: () => calls };
}

test('dispatch is durably reserved before sending and raw precedes settlement', async () => {
  const b = boundary();
  const result = await runCampaignPhase(
    { plan, trials: [trial('a')], phase: 'smoke', events: b.events },
    b.ports,
  );
  assert.equal(result.value.status, 'phase_complete');
  assert.deepEqual(b.order, ['reserve', 'infer', 'raw', 'row', 'settle']);
});

test('unknown interrupted dispatch is exported, never resent, and remains fully reserved', async () => {
  const b = boundary();
  b.events.push({
    type: 'reserve',
    key: 'campaign-test:a',
    trialId: 'a',
    sequence: 1,
    requestHash: frozen.requestHash,
    reservationNanoUsd: frozen.reservationNanoUsd,
  });
  const result = await runCampaignPhase(
    { plan, trials: [trial('a')], phase: 'smoke', events: b.events },
    b.ports,
  );
  assert.equal(b.calls(), 0);
  assert.equal(result.value.skipped, 1);
  assert.equal(b.unknown.get('a').status, 'unknown_interrupted_dispatch');
  assert.equal(b.unknown.get('a').recordOrigin, 'derived_dispatch_tombstone');
  assert.equal(result.value.budget.unresolvedReservationUsd, frozen.reservationNanoUsd / 1e9);
});

test('crash after raw persistence resumes projection and settlement without a duplicate call', async () => {
  const b = boundary();
  const normalWrite = b.ports.writeRow;
  b.ports.writeRow = () => {
    throw new Error('simulated storage crash');
  };
  await assert.rejects(
    runCampaignPhase({ plan, trials: [trial('a')], phase: 'smoke', events: b.events }, b.ports),
  );
  assert.equal(b.events.length, 1);
  assert.equal(b.raw.size, 1);
  b.ports.writeRow = normalWrite;
  const result = await runCampaignPhase(
    { plan, trials: [trial('a')], phase: 'smoke', events: b.events },
    b.ports,
  );
  assert.equal(result.value.recovered, 1);
  assert.equal(b.calls(), 1);
  assert.equal(b.events.at(-1).type, 'settle');
  assert.equal(result.value.budget.knownUsageUsd, 420 / 1e9);
});

test('three schema failures stop dispatch while retaining billable usage and remaining tests', async () => {
  const b = boundary(
    Array.from({ length: 4 }, () => ({
      response: { status: 'ok', valid: false, usage: { inputTokens: 10, outputTokens: 1 } },
      reportedProviderModel: 'jev-fixed',
    })),
  );
  const trials = ['a', 'b', 'c', 'd'].map(trial);
  const result = await runCampaignPhase(
    { plan, trials, phase: 'smoke', events: b.events },
    b.ports,
  );
  assert.equal(result.value.reason, 'three_consecutive_failures');
  assert.equal(b.calls(), 3);
  assert.equal(b.rows.size, 3);
  assert.equal(trials.length, 4);
  assert.equal(result.value.budget.knownUsageUsd, 1260 / 1e9);
});

test('frozen request mismatch prevents reservation and any model call', async () => {
  const b = boundary();
  b.ports.readBody = () => frozen.body + ' ';
  const result = await runCampaignPhase(
    { plan, trials: [trial('a')], phase: 'smoke', events: b.events },
    b.ports,
  );
  assert.equal(result.error.code, 'frozen_campaign_request_changed');
  assert.equal(b.calls(), 0);
  assert.equal(b.events.length, 0);
});

test('a tampered financial reservation cannot bypass the frozen request byte allowance', async () => {
  const b = boundary();
  const result = await runCampaignPhase(
    { plan, trials: [{ ...trial('a'), reservationNanoUsd: 0 }], phase: 'smoke', events: b.events },
    b.ports,
  );
  assert.equal(result.error.code, 'frozen_campaign_reservation_changed');
  assert.equal(b.calls(), 0);
  assert.equal(b.events.length, 0);
});
