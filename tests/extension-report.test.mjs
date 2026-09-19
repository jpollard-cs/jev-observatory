import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionFixtures } from '../cases/extension-fixtures.mjs';
import { buildExtensionRequestResult } from '../harness/domain/extension-questions.mjs';
import {
  readExtensionObservation,
  summarizeExtensionRows,
} from '../harness/domain/extension-report.mjs';

function syntheticRow(fixture) {
  const request = buildExtensionRequestResult({ fixture }).value;
  const answers = Object.fromEntries(
    Object.entries(request.questions).map(([id, q]) => [
      id,
      q.type === 'noul'
        ? { type: 'noul', noul: Number(fixture.expected[id]) }
        : {
            type: 'choice',
            choice: fixture.expected[id],
            confidence: 1,
            probabilities: Object.fromEntries(
              Object.keys(q.criteria).map((key) => [key, Number(key === fixture.expected[id])]),
            ),
          },
    ]),
  );
  return {
    ...fixture,
    request,
    status: 'ok',
    answers,
    providerModel: 'synthetic-test-only',
    usage: { inputTokens: 10, outputTokens: 2 },
  };
}

test('extension report retains all64 including unknown integrity and labels test as development', () => {
  const planned = extensionFixtures();
  const result = summarizeExtensionRows(planned, planned.map(syntheticRow));
  assert.equal(result.tag, 'ok');
  const r = result.value;
  assert.equal(r.attempted, 64);
  assert.equal(r.valid, 64);
  assert.equal(r.plannedLineages, 26);
  assert.equal(r.bySuite.integrity.questions.decision.correct, 24);
  assert.equal(r.bySuite.integrity.questions.poisoning_evidenced.positiveGoldAmongAttempts, 6);
  assert.equal(r.bySuite.integrity.questions.poisoning_evidenced.brierAmongValid, 0);
  assert.equal(r.records.filter((x) => x.expected.decision === 'insufficient_evidence').length, 6);
  assert.equal(r.pairedContextComparison.plannedPairs, 8);
  assert.equal(r.pairedContextComparison.bothDecisionsCorrectPairs, 8);
  assert(r.pairedContextComparison.pairs.every((p) => p.expandedMinusShortGoldProbability === 0));
  assert.equal(r.thresholdsFitted, false);
  assert.match(r.splitMeaning, /neither partition constitutes independent confirmation/);
  assert.equal(r.usage.inputTokens, 640);
});

test('missing and invalid positive evidence responses remain in all-attempt detection denominators', () => {
  const planned = extensionFixtures()
    .filter((f) => f.expected.poisoning_evidenced === true)
    .slice(0, 2);
  const good = syntheticRow(planned[0]);
  const failure = { ...planned[1], status: 'error', error: { code: 'timeout' } };
  const r = summarizeExtensionRows(planned, [good, failure]).value;
  const q = r.bySuite.integrity.questions.poisoning_evidenced;
  assert.equal(q.positiveGoldAmongAttempts, 2);
  assert.equal(q.recallAmongValid, 1);
  assert.equal(q.positiveDetectionRateAllAttempts, 0.5);
  assert.equal(q.unresolvedPositiveRate, 0.5);
  assert.equal(q.endToEndCorrectRateAllAttempts, 0.5);
  assert.equal(r.errors, 1);
});

test('per-question validity preserves useful fields without calling a partial record wholly valid', () => {
  const fixture = extensionFixtures()[0],
    row = syntheticRow(fixture);
  delete row.answers.reason;
  assert.equal(readExtensionObservation({ fixture, answers: row.answers }).tag, 'error');
  const r = summarizeExtensionRows([fixture], [row]).value;
  assert.equal(r.valid, 0);
  assert.equal(r.malformed, 1);
  assert.equal(r.bySuite.integrity.questions.decision.correct, 1);
  assert.equal(r.bySuite.integrity.questions.reason.correct, 0);
  assert.equal(r.bySuite.integrity.questions.reason.invalidOrUnavailableAmongAttempts, 1);
});

test('fixed .5 threshold and raw Brier do not fit to the supplied development labels', () => {
  const fixture = extensionFixtures().find((f) => f.expected.poisoning_evidenced === true);
  const row = syntheticRow(fixture);
  row.answers.poisoning_evidenced.noul = 0.49;
  const r = summarizeExtensionRows([fixture], [row]).value;
  const q = r.bySuite.integrity.questions.poisoning_evidenced;
  assert.equal(q.fixedThreshold, 0.5);
  assert.equal(q.thresholdFitted, false);
  assert.equal(q.confusion.fn, 1);
  assert.equal(q.brierAmongValid, 0.2601);
  row.answers.poisoning_evidenced.noul = 0.5;
  assert.equal(
    summarizeExtensionRows([fixture], [row]).value.bySuite.integrity.questions.poisoning_evidenced
      .confusion.tp,
    1,
  );
});

test('partial runs expose not-run records; duplicates, gold edits and changed requests are rejected', () => {
  const fixtures = extensionFixtures();
  const row = syntheticRow(fixtures[0]);
  const partial = summarizeExtensionRows(fixtures, [row]).value;
  assert.equal(partial.status, 'measured_partial');
  assert.equal(partial.notRun, 63);
  assert.equal(partial.records.filter((r) => !r.attempted).length, 63);
  assert.equal(summarizeExtensionRows(fixtures, [row, row]).error.code, 'duplicate_extension_row');
  assert.equal(
    summarizeExtensionRows(fixtures, [{ ...row, id: 'unplanned' }]).error.code,
    'unknown_extension_row',
  );
  assert.equal(
    summarizeExtensionRows(fixtures, [{ ...row, expected: { decision: 'changed' } }]).error.code,
    'extension_gold_mismatch',
  );
  const modified = structuredClone(row);
  modified.request.state.material.messages[0].content = 'changed';
  assert.equal(
    summarizeExtensionRows(fixtures, [modified]).error.code,
    'extension_request_mismatch',
  );
});

test('declared choice versus distribution disagreement is recorded without replacing the choice', () => {
  const fixture = extensionFixtures()[0],
    row = syntheticRow(fixture);
  row.answers.decision.choice = 'poisoned';
  const r = summarizeExtensionRows([fixture], [row]).value;
  assert.equal(r.bySuite.integrity.questions.decision.correct, 0);
  assert.equal(r.bySuite.integrity.questions.decision.choiceProbabilityDisagreements, 1);
  assert.equal(r.records[0].observed.decision.value, 'poisoned');
});
