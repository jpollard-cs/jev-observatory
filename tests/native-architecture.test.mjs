import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectCases, hash, profiles, prospectiveProfiles, trustedContext } from '../harness/corpus.mjs';
import { buildTypeSafeRequest } from '../harness/typesafe.mjs';
import { buildNativeRequest } from '../harness/domain/native-questions.mjs';
import { buildDebuggingNativeRequest } from '../harness/domain/debugging-questions.mjs';
import { validateNativeAnswers } from '../harness/domain/native-answers.mjs';
import { createHttpJsonTransport } from '../harness/adapters/http-json.mjs';
import { resolveEndpoint } from '../harness/adapters/endpoint-environment.mjs';
import { evaluateNativeRequest } from '../harness/application/inference.mjs';
import { err } from '../harness/domain/result.mjs';

const snapshots = JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-native-requests.json', import.meta.url)));
const selected = selectCases({ split: 'pilot', limit: 12 });

test('both explicit legacy builders reproduce every pre-refactor request byte hash', () => {
  for (const snapshot of snapshots.cases) {
    const caseItem = selected.find((entry) => entry.id === snapshot.id);
    assert.ok(caseItem);
    for (const version of ['legacy-v1', 'legacy-v2']) {
      const request = buildTypeSafeRequest(caseItem, 'jev-latest', { version });
      assert.equal(hash(JSON.stringify(request)), snapshot.sha256);
    }
  }
});

test('default EntryType questions keep policy/context structured and state free of annotations', () => {
  const caseItem = selected.find((entry) => entry.promptArm === 'policy' && entry.outputMode === 'structured');
  const request = buildTypeSafeRequest(caseItem);
  assert.equal(typeof request.questions.classification.instructions, 'object');
  assert.deepEqual(request.questions.classification.instructions.authorizedContext, trustedContext);
  assert.deepEqual(request.questions.classification.instructions.trustedPolicy.rules, prospectiveProfiles[caseItem.policyProfile].rules);
  assert.equal(typeof request.questions.classification.criteria.attack, 'object');
  assert.equal(typeof request.questions.attack_probability.criteria.true, 'object');
  assert.equal(typeof request.questions.interference_severity.criteria[0], 'object');
  assert.deepEqual(request.state, { task: caseItem.task, assessmentContext: caseItem.context });
  const changedGold = { ...caseItem, expected: { forbidden: 'GOLD_LEAK_SENTINEL' } };
  assert.deepEqual(buildTypeSafeRequest(changedGold), request);
  assert.notEqual(hash(JSON.stringify(request)), hash(JSON.stringify(buildTypeSafeRequest(caseItem, 'jev-latest', { version: 'legacy-v2' }))));
});

test('pure builders return tagged errors and cannot mutate supplied context', () => {
  const caseItem = selected[0];
  const result = buildNativeRequest({ caseItem, profiles, trustedContext, version: 'unknown' });
  assert.equal(result.tag, 'error');
  assert.equal(result.error.code, 'unsupported_native_request_version');
  const request = buildTypeSafeRequest(caseItem);
  request.state.assessmentContext.resources.push({ text: 'mutation' });
  assert.notDeepEqual(request.state.assessmentContext, caseItem.context);
});

test('transport injects network/time, makes one attempt, and never reads unsafe HTTP error bodies', async () => {
  let calls = 0;
  const transport = createHttpJsonTransport({
    now: () => 100,
    timeoutSignal: () => undefined,
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 429, json: () => { throw new Error('must not read secret body'); } };
    },
  });
  const result = await transport.postJson({ url: 'https://example.invalid', headers: {}, body: {}, timeoutMs: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(result, err('http_429', { retryable: true, context: { latencyMs: 0, httpStatus: 429 } }));
});

test('application depends only on transport port and propagates safe tagged failures', async () => {
  const failure = err('timeout', { retryable: true, context: { latencyMs: 15 } });
  const result = await evaluateNativeRequest({
    endpoint: { transport: 'typesafe_systemone', model: 'fixture', url: 'https://example.invalid', apiKey: 'secret' },
    request: { state: {}, questions: {} },
  }, { transport: { postJson: async () => failure } });
  assert.deepEqual(result, failure);
  const invalid = resolveEndpoint('jev', { TYPESAFE_API_KEY: 'SECRET_SENTINEL' });
  assert.equal(invalid.tag, 'error');
  assert.ok(!JSON.stringify(invalid).includes('SECRET_SENTINEL'));
});

test('native validator errors identify only question ID and safe type metadata', () => {
  const request = buildTypeSafeRequest(selected[0]);
  const result = validateNativeAnswers({ classification: { type: 'noul', noul: 0.5 } }, request);
  assert.equal(result.tag, 'error');
  assert.deepEqual(result.error.context, { questionId: 'classification', expectedType: 'choice' });
});

test('debugging advanced builder is pure and excludes evaluation metadata', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../policies/debugging-boundary-cases.json', import.meta.url)))[0];
  const result = buildDebuggingNativeRequest({ fixture });
  assert.equal(result.tag, 'ok');
  assert.deepEqual(Object.keys(result.value.state), ['policy', 'trustedContext', 'material']);
  assert.equal(typeof result.value.questions.debug_decision.instructions, 'object');
  assert.equal(result.value.questions.reason_DBG_DISPOSITION_AUDIT, undefined);
});
