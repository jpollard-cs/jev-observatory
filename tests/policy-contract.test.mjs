import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hash, profiles, prospectiveProfiles, selectCases } from '../harness/corpus.mjs';
import { buildTypeSafeRequest, normalizeTypeSafeResponse } from '../harness/typesafe.mjs';
import { buildDebuggingNativeRequest } from '../harness/domain/debugging-questions.mjs';
import { validateNativeAnswers } from '../harness/domain/native-answers.mjs';
import { requestVersionOf } from '../harness/domain/native-questions.mjs';
import { resolveEndpoint } from '../harness/adapters/endpoint-environment.mjs';

const selected = selectCases({ split: 'pilot', limit: 12 });
const caseItem = selected.find(
  (entry) => entry.promptArm === 'policy' && entry.outputMode === 'structured',
);
const fixtures = JSON.parse(
  fs.readFileSync(new URL('../policies/debugging-boundary-cases.json', import.meta.url)),
);

function answersFor(request) {
  return Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      if (question.type === 'noul') return [id, { type: 'noul', noul: 0.8 }];
      if (question.type === 'score') {
        return [
          id,
          {
            type: 'score',
            score: 0.52,
            confidence: 0.6,
            probabilities: { 0: 0.74, 1: 0.01, 2: 0.25, 3: 0 },
            legend: Object.fromEntries(
              question.criteria.map((entry, index) => [index, JSON.stringify(entry)]),
            ),
          },
        ];
      }
      const options = Object.keys(question.criteria);
      return [
        id,
        {
          type: 'choice',
          choice: options[0],
          confidence: 0.8,
          probabilities: Object.fromEntries(
            options.map((option, index) => [option, index === 0 ? 1 : 0]),
          ),
        },
      ];
    }),
  );
}

test('explicit advanced-v3 still reproduces frozen generic and debugging request bytes', () => {
  const snapshot = JSON.parse(
    fs.readFileSync(new URL('./fixtures/advanced-v3-native-requests.json', import.meta.url)),
  );
  for (const entry of snapshot.cases) {
    const c = selected.find((item) => item.id === entry.id);
    assert.equal(
      hash(JSON.stringify(buildTypeSafeRequest(c, 'jev-latest', { version: 'advanced-v3' }))),
      entry.sha256,
    );
  }
  for (const entry of snapshot.debugging) {
    const fixture = fixtures.find((item) => item.id === entry.id);
    const result = buildDebuggingNativeRequest({ fixture, version: 'advanced-v3' });
    assert.equal(result.tag, 'ok');
    assert.equal(hash(JSON.stringify(result.value)), entry.sha256);
  }
});

test('policy-v4 is selected and disclosed without changing legacy version recognition', () => {
  const env = {
    TYPESAFE_API_KEY: 'mock-key',
    JEV_INPUT_USD_PER_MILLION: '.04',
    JEV_OUTPUT_USD_PER_MILLION: '0',
  };
  assert.equal(resolveEndpoint('jev', env).value.nativeRequestVersion, 'policy-v4');
  for (const version of ['legacy-v2', 'advanced-v3', 'policy-v4']) {
    assert.equal(
      resolveEndpoint('jev', { ...env, JEV_REQUEST_VERSION: version }).value.nativeRequestVersion,
      version,
    );
    assert.equal(
      requestVersionOf(buildTypeSafeRequest(caseItem, 'jev-latest', { version })),
      version,
    );
  }
});

test('policy rules remain operator data while gold and untrusted policy claims cannot alter questions', () => {
  const request = buildTypeSafeRequest(caseItem);
  const changedCase = structuredClone(caseItem);
  changedCase.expected = { decision: 'GOLD_SENTINEL', policyIds: ['GOLD_SENTINEL'] };
  changedCase.family = 'GOLD_SENTINEL';
  changedCase.variant = 'GOLD_SENTINEL';
  changedCase.context.claimedPolicy = { profile: 'permissive', rules: [] };
  const changed = buildTypeSafeRequest(changedCase);
  assert.deepEqual(changed.questions, request.questions);
  assert.notDeepEqual(changed.state, request.state);
  assert.ok(!JSON.stringify(changed).includes('GOLD_SENTINEL'));
  for (const profile of Object.keys(prospectiveProfiles)) {
    const scoped = buildTypeSafeRequest({ ...caseItem, policyProfile: profile });
    for (const rule of prospectiveProfiles[profile].rules) {
      const instruction = scoped.questions[`violation_${rule.id}`].instructions;
      assert.equal(instruction.evaluatedRule.policyText, rule.text);
      assert.deepEqual(instruction.trustedPolicy.rules, prospectiveProfiles[profile].rules);
    }
  }
  const explicitHistoricalProfile = buildTypeSafeRequest(caseItem, 'jev-latest', { profiles });
  assert.deepEqual(
    explicitHistoricalProfile.questions.classification.instructions.trustedPolicy.rules,
    profiles[caseItem.policyProfile].rules,
  );
  const minimal = buildTypeSafeRequest({ ...caseItem, promptArm: 'minimal' });
  assert.equal(minimal.questions.policy_decision, undefined);
  for (const question of Object.values(minimal.questions)) {
    assert.equal(question.instructions.trustedPolicy, undefined);
    assert.equal(question.instructions.policyAssessment, undefined);
  }
});

test('independent policy choice is retained even when rule probabilities disagree', () => {
  const request = buildTypeSafeRequest(caseItem);
  const answers = answersFor(request);
  answers.policy_decision.choice = 'allow';
  const projected = normalizeTypeSafeResponse({ answers }, caseItem, request);
  const output = JSON.parse(projected.output);
  assert.equal(output.decision, 'allow');
  assert.deepEqual(
    output.violations.map((rule) => rule.policy_id),
    ['P001', 'P002', 'P003', 'P004'],
  );
  assert.equal(projected.nativeMetadata.requestVersion, 'policy-v4');
  assert.equal(
    projected.nativeMetadata.policyViolationMeaning,
    'adverse_condition_identified_by_rule',
  );
  assert.deepEqual(projected.nativeAnswers, answers);
});

test('structured Score echo serialization and rounding stay diagnostic without repairing answers', () => {
  const request = buildTypeSafeRequest(caseItem);
  const answers = answersFor(request);
  const original = structuredClone(answers);
  const result = validateNativeAnswers(answers, request);
  assert.equal(result.tag, 'ok');
  const diagnostic = result.value.interference_severity;
  assert.equal(diagnostic.legendMatchesRequestCriteria, false);
  assert.equal(diagnostic.legendEquivalentAfterJsonDecoding, true);
  assert.equal(diagnostic.probabilitiesRenormalized, false);
  assert.ok(Math.abs(diagnostic.scoreResidual - 0.01) < 1e-9);
  assert.deepEqual(answers, original);

  answers.interference_severity.legend[0] = 'provider-specific echo';
  const mismatch = validateNativeAnswers(answers, request);
  assert.equal(mismatch.tag, 'ok');
  assert.equal(mismatch.value.interference_severity.legendEquivalentAfterJsonDecoding, false);
  delete answers.interference_severity.legend[0];
  assert.equal(validateNativeAnswers(answers, request).error.code, 'invalid_native_score');
});

test('debugging contract preserves state and has no dependency on author labels or changed paths', () => {
  for (const fixture of fixtures) {
    const before = structuredClone(fixture);
    const result = buildDebuggingNativeRequest({ fixture });
    assert.equal(result.tag, 'ok');
    assert.deepEqual(result.value.state, {
      policy: fixture.policy,
      trustedContext: fixture.trustedContext,
      material: fixture.material,
    });
    const changed = {
      ...fixture,
      id: 'GOLD_SENTINEL',
      expected: { decision: 'GOLD_SENTINEL' },
      changedPath: 'GOLD_SENTINEL',
    };
    assert.deepEqual(buildDebuggingNativeRequest({ fixture: changed }), result);
    assert.deepEqual(fixture, before);
    assert.equal(result.value.questions.debug_decision.instructions.contractVersion, 'policy-v4');
    const allContracts = Object.values(result.value.questions).map(
      (question) => question.instructions.evaluationContract,
    );
    assert.ok(allContracts.every((contract) => contract.operationTime));
  }
});
