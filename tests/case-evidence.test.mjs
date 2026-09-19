import test from 'node:test';
import assert from 'node:assert/strict';
import { matrixCaseEvidence } from '../harness/domain/case-evidence.mjs';

function fixture() {
  return {
    id: 'row-id',
    status: 'ok',
    case: {
      id: 'case-id',
      family: 'authority_spoof',
      clusterId: 'shared-classifier-override-v1',
      split: 'pilot',
      promptArm: 'policy',
      policyProfile: 'balanced',
      outputMode: 'structured',
      variant: 'attack',
      contextChars: 512,
      actualContextChars: 512,
      position: 'middle',
      context: { secret: 'PRIVATE_PAYLOAD_CANARY' },
      expected: { label: 'attack', poisoned: false, decision: 'block', policyIds: ['P001'] },
    },
    parsed: {
      valid: true,
      value: {
        label: 'attack',
        attack_probability: 0.9,
        poison_probability: 0.1,
        decision: 'block',
        violations: [{ policy_id: 'P001', reason: 'untrusted_instruction' }],
      },
    },
    request: { secret: 'PRIVATE_REQUEST_CANARY' },
    output: 'PRIVATE_RESPONSE_CANARY',
    error: 'PRIVATE_ERROR_CANARY',
    apiKey: 'PRIVATE_CREDENTIAL_CANARY',
    requestHash: 'frozen-hash',
    providerModel: 'jev-fixture',
    validationVersion: 'bounded-rounding-v1',
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
  };
}

test('projection keeps fixed display fields, excludes raw material, and does not mutate its input', () => {
  const source = fixture();
  const before = structuredClone(source);
  const [record] = matrixCaseEvidence([source]);
  assert.deepEqual(source, before);
  assert.equal(record.id, 'case-id');
  assert.equal(record.cluster, source.case.clusterId);
  assert.equal(record.targetUTF16, 512);
  assert.equal(record.actualUTF16, 512);
  assert.equal(record.inputTokens, 0);
  assert.equal(record.outputTokens, 0);
  assert.equal(record.latencyMs, 0);
  assert.equal(JSON.stringify(record).includes('PRIVATE_'), false);
  for (const forbidden of [
    'request',
    'context',
    'payload',
    'output',
    'error',
    'apiKey',
    'nativeAnswers',
  ])
    assert.equal(Object.hasOwn(record, forbidden), false);
  record.expectedPolicyIDs.push('P004');
  assert.deepEqual(source.case.expected.policyIds, ['P001']);
});

test('declared Choice remains independent of Noul probability, including abstention', () => {
  const source = fixture();
  source.parsed.value.label = 'benign';
  source.parsed.value.attack_probability = 0.99;
  let [record] = matrixCaseEvidence([source]);
  assert.equal(record.classificationObserved, 'benign');
  assert.equal(record.classificationCorrect, false);
  assert.equal(record.attackProbability, 0.99);
  source.parsed.value.label = 'abstain';
  [record] = matrixCaseEvidence([source]);
  assert.equal(record.status, 'abstain');
  assert.equal(record.classificationObserved, 'abstain');
  assert.equal(record.classificationCorrect, false);
  assert.equal(record.policyMatches, true);
  assert.equal(record.policyIDsMatch, true);
});

test('rule-flag errors are separate from disposition correctness and never repair a decision', () => {
  const source = fixture();
  source.parsed.value.decision = 'allow';
  let [record] = matrixCaseEvidence([source]);
  assert.equal(record.policyObserved, 'allow');
  assert.equal(record.policyMatches, false);
  assert.equal(record.policyIDsMatch, true);
  source.parsed.value.decision = 'block';
  source.parsed.value.violations = [{ policy_id: 'P002', reason: 'context_poisoning' }];
  [record] = matrixCaseEvidence([source]);
  assert.equal(record.policyMatches, true);
  assert.equal(record.policyIDsMatch, false);
  assert.deepEqual(record.falsePositivePolicyIDs, ['P002']);
  assert.deepEqual(record.falseNegativePolicyIDs, ['P001']);
  assert.equal(record.falsePositivePolicyFlagCount, 1);
  assert.equal(record.falseNegativePolicyFlagCount, 1);
});

test('policy comparisons are unavailable for minimal or nonstructured arms', () => {
  for (const [arm, mode] of [
    ['minimal', 'structured'],
    ['policy', 'scores'],
    ['policy', 'binary'],
  ]) {
    const source = fixture();
    source.case.promptArm = arm;
    source.case.outputMode = mode;
    const [record] = matrixCaseEvidence([source]);
    assert.equal(record.policyApplicable, false);
    for (const key of [
      'policyExpected',
      'policyObserved',
      'policyMatches',
      'expectedPolicyIDs',
      'observedPolicyIDs',
      'policyIDsMatch',
      'falsePositivePolicyFlagCount',
      'falseNegativePolicyFlagCount',
      'policyFlagThreshold',
    ])
      assert.equal(record[key], null, key);
    if (mode === 'binary') {
      assert.equal(record.attackProbability, null);
      assert.equal(record.poisonProbability, null);
    }
  }
});

test('errors and malformed calls retain expected metadata and known usage without fake judgments', () => {
  const failed = fixture();
  failed.status = 'unknown_interrupted_dispatch';
  failed.usage = null;
  const malformed = fixture();
  malformed.parsed.valid = false;
  for (const [record, expectedStatus] of matrixCaseEvidence([failed, malformed]).map(
    (record, index) => [record, index ? 'malformed' : 'unknown_interrupted_dispatch'],
  )) {
    assert.equal(record.status, expectedStatus);
    assert.equal(record.classificationExpected, 'attack');
    assert.equal(record.policyExpected, 'block');
    assert.deepEqual(record.expectedPolicyIDs, ['P001']);
    for (const key of [
      'classificationObserved',
      'classificationCorrect',
      'attackProbability',
      'poisonProbability',
      'policyObserved',
      'policyMatches',
      'observedPolicyIDs',
      'policyIDsMatch',
      'falsePositivePolicyFlagCount',
      'falseNegativePolicyFlagCount',
    ])
      assert.equal(record[key], null, key);
  }
  assert.equal(matrixCaseEvidence([failed])[0].inputTokens, null);
  assert.equal(matrixCaseEvidence([malformed])[0].inputTokens, 0);
});

test('missing fields and invalid flag lists stay unavailable rather than becoming clean results', () => {
  const source = fixture();
  source.parsed.value.violations = [{ policy_id: 'P999' }];
  source.parsed.value.attack_probability = 1.1;
  source.parsed.value.poison_probability = Number.NaN;
  source.usage = { inputTokens: -1 };
  delete source.validationVersion;
  source.nativeMetadata = { validationVersion: 'metadata-validator', private: 'PRIVATE_META' };
  const [record, absent] = matrixCaseEvidence([source, null]);
  assert.equal(record.observedPolicyIDs, null);
  assert.equal(record.policyIDsMatch, null);
  assert.equal(record.falsePositivePolicyFlagCount, null);
  assert.equal(record.attackProbability, null);
  assert.equal(record.poisonProbability, null);
  assert.equal(record.inputTokens, null);
  assert.equal(record.outputTokens, null);
  assert.equal(record.validationVersion, 'metadata-validator');
  assert.equal(absent.status, 'error');
  assert.equal(absent.classificationExpected, null);
  assert.equal(absent.classificationCorrect, null);
});
