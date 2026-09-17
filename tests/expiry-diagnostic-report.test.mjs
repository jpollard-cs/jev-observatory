import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readExpiryObservation,
  summarizeExpiryDiagnostic,
} from '../harness/domain/expiry-diagnostic-report.mjs';

function answers(choice = 'block', blockProbability = 0.7) {
  return {
    debug_decision: {
      type: 'choice',
      choice,
      confidence: 0.61,
      probabilities: {
        allow: 0,
        allow_with_audit: 1 - blockProbability,
        review: 0,
        block: blockProbability,
      },
    },
    reason_DBG_APPROVAL_EXPIRED: { type: 'noul', noul: 0.83 },
    reason_DBG_PRODUCTION_AUDIT: { type: 'noul', noul: 0.42 },
    audit_required: { type: 'noul', noul: 0.91 },
  };
}

function plan() {
  const trial = {
    id: 'first',
    conditionId: 'condition-a',
    repeat: 0,
    context: 'at-boundary',
    representation: 'original',
    rubric: 'original',
    questionScope: 'all',
    wireSha256: 'request-a',
    expected: { decision: 'block' },
  };
  return {
    planHash: 'frozen-plan',
    factors: {},
    limitations: ['fixture limitation'],
    trials: [
      trial,
      { ...trial, id: 'second', repeat: 1 },
      {
        ...trial,
        id: 'third',
        conditionId: 'condition-b',
        context: 'before',
        wireSha256: 'request-b',
        expected: { decision: 'allow_with_audit' },
      },
    ],
  };
}

test('projection retains independent native probabilities without promoting reason into decision', () => {
  const result = readExpiryObservation(answers('allow_with_audit', 0.04), 'all');
  assert.equal(result.tag, 'ok');
  assert.equal(result.value.decision, 'allow_with_audit');
  assert.equal(result.value.probabilities.block, 0.04);
  assert.equal(result.value.expiredProbability, 0.83);
  assert.equal(result.value.confidence, 0.61);
});

test('decision-only observations need no sibling answers and do not invent reason values', () => {
  const choiceOnly = { debug_decision: answers().debug_decision };
  const result = readExpiryObservation(choiceOnly, 'decision-only');
  assert.equal(result.tag, 'ok');
  assert.equal(result.value.expiredProbability, null);
  assert.equal(result.value.auditProbability, null);
  assert.equal(readExpiryObservation(choiceOnly, 'all').error.code, 'invalid_diagnostic_noul');
});

test('report computes per-condition probability summaries and exact decision counts', () => {
  const frozen = plan();
  const rows = [
    {
      ...frozen.trials[0],
      wireSha256: 'request-a',
      observation: readExpiryObservation(answers('block', 0.8), 'all'),
      usage: { inputTokens: 10, outputTokens: 2 },
    },
    {
      ...frozen.trials[1],
      wireSha256: 'request-a',
      observation: readExpiryObservation(answers('allow_with_audit', 0.2), 'all'),
      usage: { inputTokens: 12, outputTokens: 3 },
    },
  ];
  const result = summarizeExpiryDiagnostic(frozen, rows, { runId: 'fixture' });
  assert.equal(result.tag, 'ok');
  const report = result.value;
  const condition = report.conditions.find((entry) => entry.id === 'condition-a');
  assert.equal(report.status, 'measured_partial');
  assert.equal(report.attempted, 2);
  assert.deepEqual(condition.blockProbability, { mean: 0.5, min: 0.2, max: 0.8 });
  assert.equal(condition.matchingDecisions, 1);
  assert.deepEqual(condition.requestHashes, ['request-a']);
  assert.equal(report.usage.inputTokens, 22);
  assert.equal(report.usage.outputTokens, 5);
  const missing = report.conditions.find((entry) => entry.id === 'condition-b');
  assert.equal(missing.attempted, 0);
  assert.equal(missing.blockProbability, null);
});

test('transport errors and malformed observations remain attempted while metrics stay null', () => {
  const frozen = plan();
  const rows = [
    { ...frozen.trials[0], wireSha256: 'request-a', status: 'error', observation: null },
    {
      ...frozen.trials[1],
      wireSha256: 'request-a',
      status: 'ok',
      observation: readExpiryObservation({}, 'all'),
      usage: { inputTokens: 22, outputTokens: 5 },
    },
  ];
  const result = summarizeExpiryDiagnostic(frozen, rows, {});
  assert.equal(result.tag, 'ok');
  const report = result.value;
  const condition = report.conditions.find((entry) => entry.id === 'condition-a');
  assert.equal(report.attempted, 2);
  assert.equal(report.valid, 0);
  assert.equal(condition.attempted, 2);
  assert.equal(condition.valid, 0);
  assert.equal(condition.matchingDecisions, 0);
  assert.equal(condition.blockProbability, null);
  assert.equal(report.usage.requestsWithUsage, 1);
});

test('report rejects unknown, duplicate, or incorrectly bound observations', () => {
  const frozen = plan();
  const row = {
    ...frozen.trials[0],
    observation: readExpiryObservation(answers(), 'all'),
  };
  for (const [rows, code] of [
    [[{ ...row, id: 'bogus' }], 'unknown_diagnostic_trial'],
    [[row, { ...row }, { ...row }], 'duplicate_diagnostic_trial'],
    [[{ ...row, conditionId: 'condition-b' }], 'diagnostic_condition_mismatch'],
    [[{ ...row, wireSha256: 'different-request' }], 'diagnostic_request_hash_mismatch'],
    [[{ ...row, wireSha256: undefined }], 'diagnostic_request_hash_mismatch'],
  ]) {
    const result = summarizeExpiryDiagnostic(frozen, rows, {});
    assert.equal(result.tag, 'error');
    assert.equal(result.error.code, code);
    assert.equal(result.error.retryable, false);
    assert.equal(result.value, undefined);
  }
  const duplicatePlan = { ...frozen, trials: [frozen.trials[0], frozen.trials[0]] };
  assert.equal(
    summarizeExpiryDiagnostic(duplicatePlan, [], {}).error.code,
    'duplicate_diagnostic_plan_trial',
  );
});
