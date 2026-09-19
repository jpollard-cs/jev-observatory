import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completedRichPilotQueries, richPilotQueries } from '../harness/site-rich-pilot.mjs';

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const original = read('rich-pilot-report.json');
const repair = read('rich-pilot-repair-report.json');

test('completed projection preserves original queries and inputs, with 48 cases and 49 attempts', () => {
  const before = JSON.stringify({ original, repair });
  const old = richPilotQueries(original);
  const queries = richPilotQueries(original, repair);
  for (const [name, rows] of Object.entries(old)) assert.deepEqual(queries[name], rows);
  assert.equal(JSON.stringify({ original, repair }), before);
  const summary = queries.rich_completed_summary[0];
  assert.equal(summary.attempted, 48);
  assert.equal(summary.valid, 48);
  assert.equal(summary.unresolved, 0);
  assert.equal(summary.transportErrors, 0);
  assert.equal(summary.totalAttempts, 49);
  assert.equal(summary.historicalUnavailableAttempts, 1);
  assert.equal(summary.unknownUsage, 1);
  assert.equal(summary.completedUsageMissing, 0);
  assert.equal(summary.knownCostUsd, 0.039605202);
  assert.equal(summary.heldUnknownReservationUsd, 0.00266469);
  const rows = queries.rich_completed_cases;
  assert.equal(rows.length, 48);
  assert.equal(rows.filter((row) => row.repaired).length, 1);
  const replaced = rows.find((row) => row.repaired);
  assert.equal(replaced.id, repair.source.originalCaseId);
  assert.equal(replaced.status, 'ok');
  assert.equal(replaced.choice, 'benign');
  assert.equal(replaced.noulProbability, 0.12);
  assert.equal(replaced.requestFailure, null);
  assert.equal(replaced.totalAttemptsForCase, 2);
  assert.equal(replaced.latencyMs, null);
  const short = queries.rich_completed_lengths.find((row) => row.length === 1024);
  assert.equal(short.valid, '16/16');
  assert.equal(short.choice, '14/16');
  assert.equal(short.latencyCount, 15);
  assert.ok(queries.rich_completed_questions.every((row) => row.unavailable === 0));
  assert.ok(queries.rich_completed_detection_errors.every((row) => row.unavailable === 0));
});

test('different request, plan, template, provider or original case cannot become a replacement', () => {
  for (const mutate of [
    (copy) => {
      copy.source.requestHash = '0'.repeat(64);
    },
    (copy) => {
      copy.source.planHash = '0'.repeat(64);
    },
    (copy) => {
      copy.templateHash = '0'.repeat(64);
    },
    (copy) => {
      copy.repairedCase.providerModel = 'different';
    },
    (copy) => {
      copy.source.originalCaseId = original.records.find((row) => row.wholeResponseValid).id;
    },
  ]) {
    const copy = structuredClone(repair);
    mutate(copy);
    assert.equal(completedRichPilotQueries(original, copy).tag, 'error');
    assert.throws(() => richPilotQueries(original, copy), /binding_mismatch/);
  }
});

test('failed, malformed, or gold-mismatched supplemental responses remain unselectable', () => {
  for (const mutate of [
    (copy) => {
      copy.status = 'supplemental_response_unavailable';
    },
    (copy) => {
      copy.repairedCase.questions.injection_present.rawTypedAnswer.noul = 2;
    },
    (copy) => {
      copy.repairedCase.questions.classification.expected = 'attack';
    },
    (copy) => {
      copy.repairedCase.supplementalUsage = null;
    },
  ]) {
    const copy = structuredClone(repair);
    mutate(copy);
    assert.equal(completedRichPilotQueries(original, copy).tag, 'error');
  }
});

test('valid incorrect repair is selected by availability and scored from native output, not stored correctness', () => {
  const copy = structuredClone(repair);
  copy.repairedCase.questions.classification.rawTypedAnswer.choice = 'attack';
  const queries = richPilotQueries(original, copy);
  const question = queries.rich_completed_questions.find((row) => row.id === 'classification');
  assert.equal(question.valid, 48);
  assert.equal(question.correct, 41);
  assert.equal(queries.rich_completed_cases.find((row) => row.repaired).choiceCorrect, false);
  assert.equal(queries.rich_completed_detection_errors[0].falsePositives, 1);
});
