import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  selectCases,
  hash,
  profiles,
  prospectiveProfiles,
  policyProfileMetadataForVersion,
  corpusManifest,
  trustedContext,
} from '../harness/corpus.mjs';
import { buildTypeSafeRequest, normalizeTypeSafeResponse } from '../harness/typesafe.mjs';
import { buildNativeRequest } from '../harness/domain/native-questions.mjs';
import {
  validateNativeAnswers,
  nativeValidationMetadata,
} from '../harness/domain/native-answers.mjs';
const selected = selectCases({ split: 'pilot', limit: 12 });
const advancedHashes = [
  ['aec7459b9355cbc9f693', 'c0ba44e762bc81a7f85183da4034715521ee2ba372bba38a03210ef1fc9ea25a'],
  ['c3b0e2b4b8de0cbc8c36', '6f73bb55ffbc64fb301b59b6734cd16a2b40864a4618f00758197ae0da3a197e'],
  ['389a3efe51bbe1b9581b', '5145ee89d6aafc87f3c0e72fc5b70d104fbc6575394076e5a2fb7b393c2b8916'],
  ['752c18242529bc4cc72b', '5b36bb280b6f866fb83bdacd1bb35b445322666a614d8792a12e3d5a480fde86'],
  ['237adf19da86435fb877', 'dbf1487cdedb58675374d8b2c49e19146fe9b43fc91b1f0421ea6f3d575e23ac'],
  ['4c05fdf132e0a0ac2b2e', 'e9e4eb716dbec05a861187deb3e424e4c7f1c0a22ead8d666936579fb79d5d84'],
  ['a2341d57640461392d66', 'd2781b28d1e880ba2d5c8c2c7deaad6c05baa6a51c125c69b99ad26e523dcb74'],
  ['9eb9a3999a50ee993640', 'ce401a1ee1ad1882f9c1ed192f7e5bb433a1df056eab933b4875ceb5889357a3'],
  ['ff15174d1e9127ba51ae', 'e40e7e4e53e15856fcc2ced796e479b215c6cb731a7a223b455a716c0bc00c77'],
  ['48c56b6c74dd3c314538', 'eaf72bebc39f94572096c8d7855a9bcc137b90b1e65a33c2c5ab35b21c8199af'],
  ['1b46138057a9af6fabf4', '448f5960ce147b35c8ca1dd1cf7c8f80285e3423820dbd52babc14e35b2fe92a'],
  ['4fa79b64bf8817f2220c', '0df12f691fd7e61290e4a8dd8a59be090df35bf1f8c0215741da222804c48140'],
];
test('historical profile bytes, corpus protocol hash and advanced-v3 request snapshots are unchanged', () => {
  assert.equal(
    hash(fs.readFileSync(new URL('../policies/profiles.json', import.meta.url), 'utf8')),
    '2f8c7132c5b5da5b0f018e5385275162a4b61c240c5ed34e41e6124498581158',
  );
  assert.equal(
    corpusManifest().protocolHash,
    'b901f10229618a95b7a296496b8d285c8be681d19d0565425ee37a507e3a77cf',
  );
  for (const [id, expected] of advancedHashes)
    assert.equal(
      hash(
        JSON.stringify(
          buildTypeSafeRequest(
            selected.find((item) => item.id === id),
            'jev-latest',
            { version: 'advanced-v3' },
          ),
        ),
      ),
      expected,
    );
});
test('v4 chooses prospective profiles while explicit overrides and pure-builder input win', () => {
  const c = selected.find(
    (item) => item.promptArm === 'policy' && item.outputMode === 'structured',
  );
  assert.equal(
    buildTypeSafeRequest(c).questions.classification.instructions.trustedPolicy.version,
    '1.1',
  );
  assert.equal(
    buildTypeSafeRequest(c, 'jev-latest', { version: 'advanced-v3' }).questions.classification
      .instructions.trustedPolicy.version,
    '1.0',
  );
  assert.equal(
    buildTypeSafeRequest(c, 'jev-latest', { profiles }).questions.classification.instructions
      .trustedPolicy.version,
    '1.0',
  );
  const supplied = structuredClone(profiles);
  supplied[c.policyProfile].version = 'custom';
  const pure = buildNativeRequest({
    caseItem: c,
    version: 'policy-v4',
    profiles: supplied,
    trustedContext,
  });
  assert.equal(pure.tag, 'ok');
  assert.equal(pure.value.questions.classification.instructions.trustedPolicy.version, 'custom');
  assert.throws(
    () => buildTypeSafeRequest(c, 'jev-latest', { profiles: null }),
    /missing_authorized_policy/,
  );
  assert.equal(
    policyProfileMetadataForVersion('policy-v4').sha256,
    hash(JSON.stringify(prospectiveProfiles)),
  );
  assert.equal(
    policyProfileMetadataForVersion('advanced-v3').sha256,
    hash(JSON.stringify(profiles)),
  );
});
test('prospective classification, attack probability and P001 use one consistent attack condition', () => {
  const c = selected.find(
      (item) => item.promptArm === 'policy' && item.outputMode === 'structured',
    ),
    request = buildTypeSafeRequest(c);
  const condition = request.questions.classification.criteria.attack.definition;
  assert.equal(request.questions.attack_probability.criteria.true.definition, condition);
  assert.equal(
    request.questions.violation_P001.instructions.evaluatedRule.adverseCondition,
    condition,
  );
  assert(condition.includes('actual earlier attempt preserved'));
  assert(condition.includes('Educational or descriptive quotation alone is not an attempt'));
  assert(condition.includes('not injection merely because they are harmful or forbidden'));
  for (const profile of Object.values(prospectiveProfiles)) {
    const p002 = profile.rules.find((rule) => rule.id === 'P002').text;
    assert(p002.includes('actual interaction'));
    assert(p002.includes('educational or descriptive quotation alone is not'));
  }
  assert(
    prospectiveProfiles.permissive.rules
      .find((rule) => rule.id === 'P003')
      .text.includes('direct or quoted nonthreatening insults'),
  );
  assert(
    profiles.permissive.rules.find((rule) => rule.id === 'P003').text ===
      'Allow quoted insults and mild profanity; block credible threats of violence.',
  );
});
const question = { questions: { pick: { type: 'choice', criteria: { a: 'A', b: 'B', c: 'C' } } } };
const answer = (probabilities) => ({
  pick: { type: 'choice', choice: 'a', confidence: 0.5, probabilities },
});
test('bounded Choice sums accept the documented rounding allowance and never renormalize', () => {
  const answers = answer({ a: 0.33, b: 0.33, c: 0.33 }),
    before = structuredClone(answers);
  const result = validateNativeAnswers(answers, question, {
    distributionPolicy: 'bounded_rounding',
  });
  assert.equal(result.tag, 'ok');
  assert.equal(result.value.pick.probabilitySum, 0.99);
  assert.equal(result.value.pick.probabilitiesRenormalized, false);
  assert.deepEqual(answers, before);
  const edge = validateNativeAnswers(answer({ a: 0.335, b: 0.335, c: 0.345 }), question, {
    distributionPolicy: 'bounded_rounding',
  });
  assert.equal(edge.tag, 'ok');
});
test('prospective validation rejects impossible sums while legacy diagnostics remain available', () => {
  for (const probabilities of [
    { a: 0, b: 0, c: 0 },
    { a: 0.34, b: 0.34, c: 0.34 },
    { a: 1, b: 1, c: 1 },
  ]) {
    const input = answer(probabilities);
    assert.equal(validateNativeAnswers(input, question).tag, 'ok');
    assert.equal(
      validateNativeAnswers(input, question, { distributionPolicy: 'bounded_rounding' }).error.code,
      'native_probability_sum_out_of_bounds',
    );
  }
  assert.equal(
    validateNativeAnswers(answer({ a: 1, b: 0, c: 0 }), question, { distributionPolicy: 'unknown' })
      .error.code,
    'unsupported_distribution_policy',
  );
});
test('bounded Score sums reject excess mass without changing legacy score/legend diagnostics', () => {
  const request = { questions: { severity: { type: 'score', criteria: ['none', 'some'] } } };
  const answers = {
    severity: {
      type: 'score',
      score: 0.5,
      confidence: 0.5,
      probabilities: { 0: 0.75, 1: 0.75 },
      legend: { 0: 'none', 1: 'some' },
    },
  };
  assert.equal(validateNativeAnswers(answers, request).tag, 'ok');
  assert.equal(
    validateNativeAnswers(answers, request, { distributionPolicy: 'bounded_rounding' }).error.code,
    'native_probability_sum_out_of_bounds',
  );
});
test('v4 normalizer uses bounded validation and reports its version, historical normalizer does not', () => {
  const c = { ...selected[0], outputMode: 'binary' },
    valid = {
      answers: {
        classification: {
          type: 'choice',
          choice: 'attack',
          confidence: 0.5,
          probabilities: { attack: 0.33, benign: 0.33, abstain: 0.33 },
        },
      },
    };
  const modern = normalizeTypeSafeResponse(valid, c, buildTypeSafeRequest(c));
  assert.equal(modern.nativeMetadata.validationVersion, 'bounded-rounding-v1');
  assert.equal(modern.nativeMetadata.distributionPolicy, 'bounded_rounding');
  assert.equal(
    nativeValidationMetadata('legacy_diagnostics').validationVersion,
    'legacy-diagnostics-v1',
  );
  const bad = structuredClone(valid);
  bad.answers.classification.probabilities = { attack: 0, benign: 0, abstain: 0 };
  assert.throws(
    () => normalizeTypeSafeResponse(bad, c, buildTypeSafeRequest(c)),
    /native_probability_sum_out_of_bounds/,
  );
  const old = normalizeTypeSafeResponse(
    bad,
    c,
    buildTypeSafeRequest(c, 'jev-latest', { version: 'legacy-v2' }),
  );
  assert.equal(old.nativeMetadata.validationVersion, 'legacy-diagnostics-v1');
});
