import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildExpiryDiagnosticPlan } from '../harness/domain/expiry-diagnostic.mjs';
import { buildDebuggingNativeRequest } from '../harness/domain/debugging-questions.mjs';

const fixtures = JSON.parse(fs.readFileSync(new URL('../policies/debugging-boundary-cases.json', import.meta.url)));
const requestFor = (id) => buildDebuggingNativeRequest({
  fixture: fixtures.find((entry) => entry.id === id),
  version: 'legacy-v2',
}).value;
const beforeRequest = requestFor('debug-expiry-a');
const boundaryRequest = requestFor('debug-expiry-b');
const planFor = (options = {}) => buildExpiryDiagnosticPlan({ beforeRequest, boundaryRequest, ...options });

test('diagnostic has 24 balanced conditions repeated twice in deterministic randomized blocks', () => {
  const { value: plan } = planFor();
  assert.equal(plan.trials.length, 48);
  assert.equal(new Set(plan.trials.map((trial) => trial.id)).size, 48);
  assert.equal(new Set(plan.trials.map((trial) => trial.conditionId)).size, 24);
  for (const repeat of [0, 1]) assert.equal(new Set(plan.trials.filter((trial) => trial.repeat === repeat).map((trial) => trial.conditionId)).size, 24);
  assert.deepEqual(planFor().value, plan);
  const changedSeed = planFor({ seed: 'different-frozen-seed' }).value;
  assert.notEqual(changedSeed.planHash, plan.planHash);
  assert.deepEqual(changedSeed.trials.map((trial) => trial.wireSha256).sort(), plan.trials.map((trial) => trial.wireSha256).sort());
});

test('original full-battery A/B arms preserve exact wire JSON and do not leak annotations', () => {
  const { value: plan } = planFor();
  const original = plan.trials.filter((trial) => trial.representation === 'original'
    && trial.rubric === 'original' && trial.questionScope === 'all');
  for (const trial of original) {
    if (trial.context === 'before') assert.equal(JSON.stringify(trial.request), JSON.stringify(beforeRequest));
    if (trial.context === 'at-boundary') assert.equal(JSON.stringify(trial.request), JSON.stringify(boundaryRequest));
    assert.deepEqual(Object.keys(trial.request), ['state', 'model', 'questions']);
    assert.ok(!Object.hasOwn(trial.request.state, 'expected'));
    assert.ok(!Object.hasOwn(trial.request, 'repeat'));
  }
  assert.equal(plan.contexts.find((entry) => entry.id === 'after-boundary').assessmentTime, '2026-09-16T14:00:01Z');
});

test('representation is lossless text wrapping; question removal preserves the exact decision object', () => {
  const trials = planFor({ repeats: 1 }).value.trials;
  for (const trial of trials.filter((entry) => entry.representation === 'structured' && entry.rubric === 'original' && entry.questionScope === 'all')) {
    for (const [id, question] of Object.entries(trial.request.questions)) {
      assert.equal(question.instructions.text, beforeRequest.questions[id].instructions);
      const criteria = Object.fromEntries(Object.entries(question.criteria).map(([key, value]) => [key, value.definition]));
      assert.deepEqual(criteria, beforeRequest.questions[id].criteria);
    }
  }
  for (const trial of trials.filter((entry) => entry.questionScope === 'decision-only')) {
    const full = trials.find((entry) => entry.questionScope === 'all' && entry.context === trial.context
      && entry.representation === trial.representation && entry.rubric === trial.rubric);
    assert.deepEqual(trial.request.questions, { debug_decision: full.request.questions.debug_decision });
    assert.deepEqual(trial.request.state, full.request.state);
  }
});

test('explicit-rubric clarifies every option without changing policy or state', () => {
  const trials = planFor({ repeats: 1 }).value.trials;
  for (const trial of trials.filter((entry) => entry.representation === 'original' && entry.rubric === 'explicit-rubric')) {
    const decision = trial.request.questions.debug_decision;
    assert.ok(decision.instructions.includes('as if performed at `trustedContext.time.assessmentTime`'));
    assert.ok(decision.instructions.includes('approved records a grant; it does not establish current validity'));
    assert.ok(Object.values(decision.criteria).every((value) => value.startsWith('At the assessment time')));
    assert.deepEqual(trial.request.state.policy, beforeRequest.state.policy);
    assert.deepEqual(Object.keys(decision.criteria), Object.keys(beforeRequest.questions.debug_decision.criteria));
  }
});

test('builder returns tagged errors for mismatched frozen sources and never mutates originals', () => {
  const changed = structuredClone(boundaryRequest);
  changed.state.material.proposedAction.operation = 'changed_operation';
  assert.equal(planFor({ boundaryRequest: changed }).error.code, 'archived_requests_differ_beyond_assessment_time');
  assert.equal(planFor({ repeats: 0 }).error.code, 'invalid_expiry_diagnostic_configuration');
  const beforeJson = JSON.stringify(beforeRequest);
  const plan = planFor().value;
  plan.trials[0].request.state.material.proposedAction.operation = 'mutation';
  assert.equal(JSON.stringify(beforeRequest), beforeJson);
});
