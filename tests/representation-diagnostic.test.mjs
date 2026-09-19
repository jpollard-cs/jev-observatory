import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  generateCases,
  prospectiveProfiles as profiles,
  trustedContext,
} from '../harness/corpus.mjs';
import { buildTypeSafeRequest } from '../harness/typesafe.mjs';
import { extensionFixtures } from '../cases/extension-fixtures.mjs';
import { buildRepresentationDiagnostics } from '../harness/domain/representation-diagnostic.mjs';
import { summarizeRepresentationDiagnostics } from '../harness/domain/representation-report.mjs';
import { unwrap } from '../harness/domain/result.mjs';

const fixtures = JSON.parse(
  fs.readFileSync(new URL('../policies/debugging-boundary-cases.json', import.meta.url)),
);
const plan = unwrap(
  buildRepresentationDiagnostics({
    cases: [
      ...generateCases({
        seedsPerFamily: 1,
        contextChars: [512],
        positions: ['start'],
        outputModes: ['structured'],
        promptArms: ['policy'],
      }),
    ],
    mainRequestBuilder: (caseItem, model) =>
      buildTypeSafeRequest(caseItem, model, { version: 'policy-v4', profiles, trustedContext }),
    integrityFixture: extensionFixtures().find(
      (fixture) => fixture.id === 'extension-dispatch-hours-changed',
    ),
    debuggingFixture: fixtures.find((fixture) => fixture.id === 'debug-expiry-b'),
  }),
);

const scenario = (id) => plan.diagnostics.filter((diagnostic) => diagnostic.scenarioId === id);
const base = (id) =>
  scenario(id).find(
    (diagnostic) =>
      diagnostic.factors.representation === 'structured' &&
      diagnostic.factors.battery === 'full' &&
      diagnostic.factors.choiceOrder === 'original',
  );
const decode = (entry, original) => (typeof original === 'string' ? entry : JSON.parse(entry));

function answerFor(question, expected) {
  if (question.type === 'noul') return { type: 'noul', noul: expected ? 1 : 0 };
  if (question.type === 'score')
    return {
      type: 'score',
      score: 0,
      confidence: 1,
      probabilities: Object.fromEntries(
        question.criteria.map((_, index) => [index, index === 0 ? 1 : 0]),
      ),
      legend: Object.fromEntries(question.criteria.map((entry, index) => [index, entry])),
    };
  return {
    type: 'choice',
    choice: expected,
    confidence: 1,
    probabilities: Object.fromEntries(
      Object.keys(question.criteria).map((key) => [key, key === expected ? 1 : 0]),
    ),
  };
}
const row = (trial) => ({
  id: trial.id,
  requestHash: trial.requestHash,
  request: trial.request,
  status: 'ok',
  parsed: { valid: true },
  providerModel: 'test-fixture-not-model-run',
  answers: Object.fromEntries(
    Object.entries(trial.request.questions).map(([id, question]) => [
      id,
      answerFor(question, trial.expected[id]),
    ]),
  ),
});

test('all eight scenarios have the complete fixed factorial with no metadata in inference', () => {
  assert.equal(plan.diagnostics.length, 64);
  assert.equal(new Set(plan.diagnostics.map((trial) => trial.id)).size, 64);
  assert.equal(new Set(plan.diagnostics.map((trial) => trial.requestHash)).size, 64);
  for (const id of new Set(plan.diagnostics.map((trial) => trial.scenarioId))) {
    const cells = scenario(id);
    assert.equal(cells.length, 8);
    assert.equal(new Set(cells.map((trial) => trial.stateHash)).size, 1);
    assert.equal(new Set(cells.map((trial) => trial.canonicalQuestionsHash)).size, 1);
    for (const trial of cells) {
      assert.deepEqual(Object.keys(trial.request).sort(), ['model', 'questions', 'state']);
      for (const forbidden of [
        'expected',
        'primaryExpected',
        'scenarioId',
        'sourceId',
        'provenance',
        'factors',
      ])
        assert.equal(Object.hasOwn(trial.request.state, forbidden), false);
      assert.equal(trial.primaryExpected, trial.expected[trial.primaryQuestionId]);
    }
  }
});

test('string EntryTypes round trip exactly, isolation preserves the primary, only Choice order reverses', () => {
  for (const trial of plan.diagnostics) {
    const original = base(trial.scenarioId).request;
    assert.deepEqual(trial.request.state, original.state);
    if (trial.factors.battery === 'primary_only')
      assert.deepEqual(Object.keys(trial.request.questions), [trial.primaryQuestionId]);
    for (const [id, question] of Object.entries(trial.request.questions)) {
      const reference = original.questions[id];
      assert.deepEqual(
        trial.factors.representation === 'lossless_string'
          ? decode(question.instructions, reference.instructions)
          : question.instructions,
        reference.instructions,
      );
      if (reference.type === 'score') {
        assert.deepEqual(
          question.criteria.map((entry, index) =>
            trial.factors.representation === 'lossless_string'
              ? decode(entry, reference.criteria[index])
              : entry,
          ),
          reference.criteria,
        );
      } else {
        const keys = Object.keys(reference.criteria);
        assert.deepEqual(
          Object.keys(question.criteria),
          reference.type === 'choice' && trial.factors.choiceOrder === 'reversed'
            ? [...keys].reverse()
            : keys,
        );
        for (const key of keys)
          assert.deepEqual(
            trial.factors.representation === 'lossless_string'
              ? decode(question.criteria[key], reference.criteria[key])
              : question.criteria[key],
            reference.criteria[key],
          );
      }
    }
  }
});

test('judge counterfactual changes only candidate answer; moderation pair changes only policy instructions', () => {
  const correct = structuredClone(base('injected-judge-correct').request);
  const incorrect = base('injected-judge-incorrect').request;
  correct.state.assessmentContext.candidateAnswer.answer = '29';
  assert.deepEqual(correct, incorrect);
  assert.equal(base('injected-judge-correct').primaryExpected, 'pass');
  assert.equal(base('injected-judge-incorrect').primaryExpected, 'fail');
  assert.deepEqual(
    base('quoted-insult-balanced').request.state,
    base('quoted-insult-strict').request.state,
  );
  assert.equal(base('quoted-insult-balanced').primaryExpected, 'allow');
  assert.equal(base('quoted-insult-strict').primaryExpected, 'block');
});

test('report preserves missing attempts and invalid auxiliary fields separately from valid primary', () => {
  const chosen = base('direct-injection');
  const measured = row(chosen);
  delete measured.answers.poison_probability;
  measured.parsed.valid = false;
  const report = unwrap(summarizeRepresentationDiagnostics(plan.diagnostics, [measured]));
  assert.equal(report.attempted, 1);
  assert.equal(report.notRun, 63);
  assert.equal(report.wholeResponseValid, 0);
  assert.equal(report.primaryQuestionValid, 1);
  const questions = report.scenarios.find(
    (entry) => entry.scenarioId === chosen.scenarioId,
  ).questions;
  assert.equal(questions.classification.exactMatches, 1);
  assert.equal(questions.poison_probability.unresolved, 1);
  assert.equal(questions.poison_probability.exactMatchRateAllAttempts, 0);
});

test('paired effects retain errors and show both improvement and regression without arm selection', () => {
  const cells = scenario('direct-injection');
  const rows = cells.map(row);
  const original = cells.find(
    (trial) =>
      trial.factors.representation === 'structured' &&
      trial.factors.battery === 'full' &&
      trial.factors.choiceOrder === 'original',
  );
  const reversedString = cells.find(
    (trial) =>
      trial.factors.representation === 'lossless_string' &&
      trial.factors.battery === 'full' &&
      trial.factors.choiceOrder === 'reversed',
  );
  const first = rows.find((entry) => entry.id === original.id);
  first.status = 'timeout';
  first.parsed = null;
  const worse = rows.find((entry) => entry.id === reversedString.id);
  worse.answers.classification = answerFor(
    reversedString.request.questions.classification,
    'benign',
  );
  const report = unwrap(summarizeRepresentationDiagnostics(plan.diagnostics, rows));
  const comparison = report.scenarios.find((entry) => entry.scenarioId === 'direct-injection')
    .questions.classification.comparisons.representation;
  assert.equal(comparison.plannedComparablePairs, 4);
  assert.equal(comparison.bothAttempted, 4);
  assert.equal(comparison.betterAllAttemptOutcomePairs, 1);
  assert.equal(comparison.worseAllAttemptOutcomePairs, 1);
  assert.equal(report.selectedProductionRepresentation, 'structured');
});

test('report refuses duplicate rows or requests different from frozen input', () => {
  const chosen = plan.diagnostics[0];
  const observed = row(chosen);
  assert.equal(
    summarizeRepresentationDiagnostics(plan.diagnostics, [observed, observed]).error.code,
    'duplicate_representation_row',
  );
  observed.requestHash = 'wrong';
  assert.equal(
    summarizeRepresentationDiagnostics(plan.diagnostics, [observed]).error.code,
    'representation_request_mismatch',
  );
});

test('prospective probability validation retains bounded rounding and rejects unusable distributions', () => {
  const chosen = base('direct-injection');
  const measured = row(chosen);
  measured.answers.classification.probabilities = { attack: 1, benign: 1, abstain: 1 };
  const invalid = unwrap(summarizeRepresentationDiagnostics(plan.diagnostics, [measured]));
  assert.equal(invalid.primaryQuestionValid, 0);
  assert.equal(invalid.validationVersion, 'bounded-rounding-v1');
  measured.answers.classification.probabilities = { attack: 0.98, benign: 0.01, abstain: 0 };
  const rounded = unwrap(summarizeRepresentationDiagnostics(plan.diagnostics, [measured]));
  assert.equal(rounded.primaryQuestionValid, 1);
});
