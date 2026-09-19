import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unwrap } from '../harness/domain/result.mjs';
import {
  applyRichEvent,
  emptyRichLedger,
  freezeRichPilotPlan,
  replayRichLedger,
  richHash,
  runRichPilot,
  verifyRichApproval,
  verifyRichPreflight,
} from '../harness/application/rich-pilot-run.mjs';
import {
  saveRichPilotPlan,
  loadRichPilotPlan,
  loadRichPilotRows,
  richDiskPorts,
  createRichInference,
} from '../scripts/rich-pilot.mjs';

function source() {
  return {
    protocolVersion: 'rich-template-pilot-v1',
    templateHash: 'a'.repeat(64),
    rows: Array.from({ length: 48 }, (_, i) => ({
      id: `case-${i}`,
      lineage: `lineage-${Math.floor(i / 3)}`,
      family: 'fixture',
      lengthTarget: 1024,
      expected: { attempt: false },
      metadata: { contextUtf16: 20 },
      request: {
        state: { policy: 'trusted guide', material: `case ${i}` },
        model: 'jev-latest',
        questions: {
          attempt: { type: 'noul', instructions: 'Is unauthorized redirection present?' },
        },
      },
    })),
  };
}
function response(extra = {}) {
  return {
    response: {
      status: 'ok',
      answers: { attempt: { type: 'noul', noul: 0.1 } },
      usage: { inputTokens: 12, outputTokens: 3 },
      latencyMs: 1,
      ...extra,
    },
    reportedProviderModel: 'jev-test-version',
  };
}
function memory(plan, bodies) {
  const events = [],
    raw = new Map(),
    rows = new Map(),
    unknown = new Map(),
    order = [];
  let calls = 0;
  const ports = {
    now: () => 'frozen-time',
    appendEvent: async (event) => {
      order.push(event.type);
      events.push(event);
    },
    readBody: (row) => bodies[row.requestHash],
    loadRaw: (row) => raw.get(row.id),
    writeRaw: async (row, evidence) => {
      order.push('raw');
      const rawHash = richHash(JSON.stringify(evidence));
      raw.set(row.id, { evidence, rawHash });
      return rawHash;
    },
    hasRow: (row) => rows.has(row.id),
    writeRow: async (row, value) => {
      order.push('row');
      rows.set(row.id, value);
    },
    writeUnknown: async (row, value) => unknown.set(row.id, value),
    infer: async () => {
      calls++;
      order.push('infer');
      return response();
    },
  };
  return {
    ports,
    events,
    raw,
    rows,
    unknown,
    order,
    get calls() {
      return calls;
    },
  };
}

test('new ledger enforces $3 global and $0.30 per stage without counting historical spending', () => {
  let ledger = emptyRichLedger();
  for (let i = 0; i < 10; i++)
    ledger = unwrap(
      applyRichEvent(ledger, {
        sequence: i + 1,
        type: 'reserve',
        key: `stage${i}:a`,
        stageId: `stage${i}`,
        requestHash: 'bound',
        reservationNanoUsd: 300_000_000,
      }),
    );
  assert.equal(ledger.heldNanoUsd, 3e9);
  assert.equal(
    applyRichEvent(ledger, {
      sequence: 11,
      type: 'reserve',
      key: 'new:a',
      stageId: 'new',
      requestHash: 'bound',
      reservationNanoUsd: 1,
    }).error.code,
    'rich_restart_budget_exhausted',
  );
  const one = unwrap(
    applyRichEvent(emptyRichLedger(), {
      sequence: 1,
      type: 'reserve',
      key: 'a',
      stageId: 'one',
      requestHash: 'bound',
      reservationNanoUsd: 299_999_999,
    }),
  );
  assert.equal(
    applyRichEvent(one, {
      sequence: 2,
      type: 'reserve',
      key: 'b',
      stageId: 'one',
      requestHash: 'bound',
      reservationNanoUsd: 2,
    }).error.code,
    'rich_stage_budget_exhausted',
  );
});

test('approval binds exact template, limits and independent review of frozen plan', () => {
  const { plan } = unwrap(freezeRichPilotPlan(source()));
  const approval = {
    status: 'approved_for_bounded_pilot',
    templateHash: plan.templateHash,
    protocolVersion: plan.protocolVersion,
    maximumRequests: 48,
    maximumStageCostUsd: 0.3,
    maximumRestartCostUsd: 3,
  };
  assert.equal(verifyRichApproval(plan, approval).tag, 'ok');
  assert.equal(verifyRichApproval(plan, { ...approval, templateHash: 'changed' }).tag, 'error');
  assert.equal(verifyRichApproval(plan, { ...approval, maximumRestartCostUsd: 4 }).tag, 'error');
  assert.equal(verifyRichPreflight(plan, null).tag, 'error');
  assert.equal(
    verifyRichPreflight(plan, {
      planHash: 'other',
      status: 'ready_for_bounded_pilot',
      decisionBy: 'operator_review',
    }).tag,
    'error',
  );
  assert.equal(
    verifyRichPreflight(plan, {
      planHash: plan.planHash,
      status: 'ready_for_bounded_pilot',
      decisionBy: 'operator_review',
    }).tag,
    'ok',
  );
});

test('reservation precedes dispatch and raw precedes row/settlement; limit resumes without repeats', async () => {
  const { plan, bodies } = unwrap(freezeRichPilotPlan(source()));
  const m = memory(plan, bodies);
  const first = unwrap(await runRichPilot({ plan, events: [], limit: 1 }, m.ports));
  assert.deepEqual(m.order, ['reserve', 'infer', 'raw', 'row', 'settle']);
  assert.equal(first.dispatchedNow, 1);
  assert.equal(first.reason, 'invocation_limit');
  const second = unwrap(await runRichPilot({ plan, events: m.events, limit: 1 }, m.ports));
  assert.equal(second.dispatchedNow, 1);
  assert.equal(second.dispatched, 2);
  assert.equal(m.calls, 2);
  assert.equal(unwrap(replayRichLedger(m.events)).knownNanoUsd, 24 * 42);
});

test('invalid native response halts immediately while preserving raw answers and billable usage', async () => {
  const { plan, bodies } = unwrap(freezeRichPilotPlan(source()));
  const m = memory(plan, bodies);
  m.ports.infer = async () => response({ answers: { attempt: { type: 'noul', noul: 1.2 } } });
  const result = unwrap(await runRichPilot({ plan, events: [] }, m.ports));
  assert.equal(result.dispatchedNow, 1);
  assert.equal(result.reason, 'preflight_response_failure');
  assert.equal(m.rows.get('case-0').answers.attempt.noul, 1.2);
  assert.equal(m.rows.get('case-0').parsed.valid, false);
  assert.equal(result.stageKnownUsageUsd, (12 * 42) / 1e9);
  m.ports.infer = () => assert.fail('failed pilot resumed dispatch');
  const resumed = unwrap(await runRichPilot({ plan, events: m.events }, m.ports));
  assert.equal(resumed.dispatchedNow, 0);
});

test('unknown interrupted dispatch is exported and never resent, with reservation retained', async () => {
  const { plan, bodies } = unwrap(freezeRichPilotPlan(source()));
  const m = memory(plan, bodies);
  const row = plan.rows[0];
  const event = {
    sequence: 1,
    type: 'reserve',
    key: `${plan.stageId}:${row.id}`,
    stageId: plan.stageId,
    id: row.id,
    requestHash: row.requestHash,
    reservationNanoUsd: row.reservationNanoUsd,
  };
  m.events.push(event);
  const result = unwrap(await runRichPilot({ plan, events: m.events, limit: 1 }, m.ports));
  assert.equal(m.unknown.get(row.id).status, 'unknown_interrupted_dispatch');
  assert.equal(m.rows.has(row.id), false);
  assert.equal(m.rows.has('case-1'), true);
  assert.equal(result.stageHeldUsd, row.reservationNanoUsd / 1e9);
  assert.equal(result.unknownDispatches, 1);
});

test('crash after raw save settles without repeating dispatch', async () => {
  const { plan, bodies } = unwrap(freezeRichPilotPlan(source()));
  const m = memory(plan, bodies);
  const normal = m.ports.writeRow;
  m.ports.writeRow = async () => {
    throw new Error('simulated_disk_interruption');
  };
  await assert.rejects(
    runRichPilot({ plan, events: [], limit: 1 }, m.ports),
    /simulated_disk_interruption/,
  );
  assert.equal(m.calls, 1);
  assert.equal(m.raw.size, 1);
  assert.equal(m.events.length, 1);
  m.ports.writeRow = normal;
  const result = unwrap(await runRichPilot({ plan, events: m.events, limit: 1 }, m.ports));
  assert.equal(result.recovered, 1);
  assert.equal(m.calls, 2);
  assert.equal(result.dispatched, 2);
});

test('missing usage is not zero cost and provider identity drift stops further dispatch', async () => {
  const { plan, bodies } = unwrap(freezeRichPilotPlan(source()));
  const m = memory(plan, bodies);
  m.ports.infer = async () => response({ usage: null });
  const missing = unwrap(await runRichPilot({ plan, events: [] }, m.ports));
  assert.equal(missing.reason, 'usage_unavailable');
  assert.equal(missing.stageKnownUsageUsd, 0);
  assert.ok(missing.stageHeldUsd > 0);
  const n = memory(plan, bodies);
  let i = 0;
  n.ports.infer = async () => ({
    ...response(),
    reportedProviderModel: ++i === 1 ? 'jev-first' : 'jev-second',
  });
  const drift = unwrap(await runRichPilot({ plan, events: [] }, n.ports));
  assert.equal(drift.dispatchedNow, 2);
  assert.equal(drift.reason, 'provider_model_drift');
});

test('changed frozen bodies cannot reserve or dispatch', async () => {
  const { plan, bodies } = unwrap(freezeRichPilotPlan(source()));
  const m = memory(plan, bodies);
  m.ports.readBody = () => '{}';
  assert.equal(
    (await runRichPilot({ plan, events: [] }, m.ports)).error.code,
    'rich_frozen_request_changed',
  );
  assert.equal(m.events.length, 0);
  assert.equal(m.calls, 0);
});

test('disk artifacts are immutable, raw results readable, and saved request hashes verified', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-pilot-test-'));
  try {
    const plan = saveRichPilotPlan(base, source());
    assert.equal(loadRichPilotPlan(base).planHash, plan.planHash);
    saveRichPilotPlan(base, source());
    const changed = source();
    changed.rows[0].expected.attempt = true;
    assert.throws(() => saveRichPilotPlan(base, changed), /already_exists_with_different_content/);
    const result = unwrap(
      await runRichPilot(
        { plan, events: [], limit: 1 },
        richDiskPorts(base, path.join(base, 'ledger'), {
          infer: async () => response(),
          pause: async () => {},
        }),
      ),
    );
    assert.equal(result.dispatchedNow, 1);
    const rows = loadRichPilotRows(base);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].requestHash, plan.rows[0].requestHash);
    assert.equal(rows[0].answers.attempt.noul, 0.1);
    assert.equal(rows[0].parsed.valid, true);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('HTTP mock retains invalid body without exposing request credentials in saved evidence', async () => {
  const endpoint = {
    transport: 'typesafe_systemone',
    model: 'jev-latest',
    url: 'https://example.invalid/systemone',
    apiKey: 'mock-secret',
  };
  const infer = await createRichInference(endpoint, {
    fetchImpl: async () => new Response('broken JSON', { status: 200 }),
  });
  const result = await infer(source().rows[0].request);
  assert.equal(result.response.status, 'error');
  assert.equal(result.response.error, 'invalid_provider_json');
  assert.equal(result.httpResponse.bodyText, 'broken JSON');
  assert.equal(JSON.stringify(result).includes('mock-secret'), false);
});
