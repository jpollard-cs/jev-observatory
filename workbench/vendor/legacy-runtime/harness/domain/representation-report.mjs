import { err, ok } from './result.mjs';
import { nativeValidationMetadata, validateNativeAnswers } from './native-answers.mjs';
import {
  REPRESENTATION_FACTORS,
  REPRESENTATION_PROTOCOL,
  representationHash,
} from './representation-diagnostic.mjs';

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function questionObservation(trial, row, id) {
  const question = trial.request.questions[id];
  const expected = trial.expected[id];
  if (!row)
    return { questionId: id, type: question.type, expected, status: 'not_run', valid: false };
  if (row.status !== 'ok')
    return { questionId: id, type: question.type, expected, status: row.status, valid: false };
  const answers = row.answers ?? row.nativeAnswers;
  const validated = validateNativeAnswers(
    { [id]: answers?.[id] },
    { questions: { [id]: question } },
    { distributionPolicy: 'bounded_rounding' },
  );
  if (validated.tag === 'error')
    return {
      questionId: id,
      type: question.type,
      expected,
      status: 'malformed',
      valid: false,
      error: validated.error.code,
    };
  const answer = answers[id];
  const hasGold = Object.hasOwn(trial.expected, id);
  const value =
    question.type === 'choice'
      ? answer.choice
      : question.type === 'noul'
        ? answer.noul
        : answer.score;
  const prediction = question.type === 'noul' ? value >= 0.5 : value;
  const probabilityAssignedToGold = !hasGold
    ? null
    : question.type === 'choice'
      ? answer.probabilities[expected]
      : question.type === 'noul'
        ? expected
          ? value
          : 1 - value
        : null;
  return {
    questionId: id,
    type: question.type,
    expected,
    status: 'valid',
    valid: true,
    value,
    prediction,
    correct: hasGold ? prediction === expected : null,
    probabilityAssignedToGold,
    probabilities: answer.probabilities ?? null,
    confidence: answer.confidence ?? null,
    squaredError: question.type === 'noul' && hasGold ? (value - Number(expected)) ** 2 : null,
    diagnostics: validated.value[id] ?? null,
  };
}

function comparePair(left, right, questionId) {
  const a = left.questions[questionId],
    b = right.questions[questionId];
  const bothAttempted = left.attempted && right.attempted;
  const bothValid = a.valid && b.valid;
  const hasGold = a.correct !== null && a.expected !== undefined;
  const allAttemptCorrectnessDelta =
    bothAttempted && hasGold ? Number(b.valid && b.correct) - Number(a.valid && a.correct) : null;
  return {
    leftId: left.id,
    rightId: right.id,
    leftStatus: a.status,
    rightStatus: b.status,
    bothAttempted,
    bothValid,
    leftValue: a.valid ? a.value : null,
    rightValue: b.valid ? b.value : null,
    categoricalChanged: bothValid && a.type !== 'score' ? a.prediction !== b.prediction : null,
    valueDelta: bothValid && a.type !== 'choice' ? b.value - a.value : null,
    validAnswerCorrectnessDelta:
      bothValid && hasGold ? Number(b.correct) - Number(a.correct) : null,
    allAttemptCorrectnessDelta,
    probabilityAssignedToGoldDelta:
      bothValid && hasGold && a.probabilityAssignedToGold !== null
        ? b.probabilityAssignedToGold - a.probabilityAssignedToGold
        : null,
  };
}

/** Report the frozen cells as pairs. Never select an arm, refit a threshold, or pool unlike questions. */
export function summarizeRepresentationDiagnostics(planned, rows, metadata = {}) {
  if (!Array.isArray(planned) || !Array.isArray(rows))
    return err('invalid_representation_report_input');
  const plan = new Map();
  for (const trial of planned) {
    if (
      !trial?.id ||
      plan.has(trial.id) ||
      trial.protocol !== REPRESENTATION_PROTOCOL ||
      representationHash(trial.request) !== trial.requestHash ||
      !trial.request.questions[trial.primaryQuestionId] ||
      trial.expected[trial.primaryQuestionId] !== trial.primaryExpected
    )
      return err('invalid_representation_plan');
    plan.set(trial.id, trial);
  }
  const observed = new Map();
  for (const row of rows) {
    const trial = plan.get(row?.id);
    if (!trial) return err('unknown_representation_row');
    if (observed.has(row.id)) return err('duplicate_representation_row');
    if (
      row.requestHash !== trial.requestHash ||
      (row.request && representationHash(row.request) !== trial.requestHash)
    )
      return err('representation_request_mismatch');
    observed.set(row.id, row);
  }
  const records = [...plan.values()].map((trial) => {
    const row = observed.get(trial.id);
    const questions = Object.fromEntries(
      Object.keys(trial.request.questions).map((id) => [id, questionObservation(trial, row, id)]),
    );
    return {
      id: trial.id,
      scenarioId: trial.scenarioId,
      factors: trial.factors,
      primaryQuestionId: trial.primaryQuestionId,
      primaryExpected: trial.primaryExpected,
      attempted: Boolean(row),
      status: row?.status ?? 'not_run',
      wholeResponseValid: row?.status === 'ok' && row?.parsed?.valid === true,
      providerModel: row?.providerModel ?? null,
      requestHash: trial.requestHash,
      stateHash: trial.stateHash,
      provenance: trial.provenance,
      questions,
    };
  });
  const scenarios = [...new Set(records.map((record) => record.scenarioId))].map((scenarioId) => {
    const cells = records.filter((record) => record.scenarioId === scenarioId);
    const questionIds = [...new Set(cells.flatMap((record) => Object.keys(record.questions)))];
    const questions = Object.fromEntries(
      questionIds.map((questionId) => {
        const eligible = cells.filter((record) => record.questions[questionId]);
        const attempted = eligible.filter((record) => record.attempted);
        const valid = eligible.filter((record) => record.questions[questionId].valid);
        const correct = valid.filter(
          (record) => record.questions[questionId].correct === true,
        ).length;
        const hasGold = eligible[0].questions[questionId].expected !== undefined;
        const comparisons = Object.fromEntries(
          Object.entries(REPRESENTATION_FACTORS).map(([axis, [leftValue, rightValue]]) => {
            const otherAxes = Object.keys(REPRESENTATION_FACTORS).filter((key) => key !== axis);
            const pairs = [];
            for (const left of eligible.filter((record) => record.factors[axis] === leftValue)) {
              const right = eligible.find(
                (record) =>
                  record.factors[axis] === rightValue &&
                  otherAxes.every((key) => record.factors[key] === left.factors[key]),
              );
              if (right) pairs.push(comparePair(left, right, questionId));
            }
            const complete = pairs.filter((pair) => pair.bothValid);
            return [
              axis,
              {
                direction: `${rightValue} minus ${leftValue}`,
                plannedComparablePairs: pairs.length,
                bothAttempted: pairs.filter((pair) => pair.bothAttempted).length,
                bothValid: complete.length,
                categoricalChangesAmongBothValid: complete.filter((pair) => pair.categoricalChanged)
                  .length,
                betterAllAttemptOutcomePairs: pairs.filter(
                  (pair) => pair.allAttemptCorrectnessDelta > 0,
                ).length,
                worseAllAttemptOutcomePairs: pairs.filter(
                  (pair) => pair.allAttemptCorrectnessDelta < 0,
                ).length,
                meanAllAttemptCorrectnessDelta: mean(
                  pairs
                    .map((pair) => pair.allAttemptCorrectnessDelta)
                    .filter((value) => value !== null),
                ),
                meanProbabilityAssignedToGoldDelta: mean(
                  pairs
                    .map((pair) => pair.probabilityAssignedToGoldDelta)
                    .filter((value) => value !== null),
                ),
                pairs,
              },
            ];
          }),
        );
        return [
          questionId,
          {
            type: eligible[0].questions[questionId].type,
            expected: eligible[0].questions[questionId].expected ?? null,
            planned: eligible.length,
            attempted: attempted.length,
            valid: valid.length,
            unresolved: attempted.length - valid.length,
            notRun: eligible.length - attempted.length,
            exactMatches: hasGold ? correct : null,
            exactMatchRateAllAttempts:
              hasGold && attempted.length ? correct / attempted.length : null,
            meanBrierAmongValid: mean(
              valid
                .map((record) => record.questions[questionId].squaredError)
                .filter((value) => value !== null),
            ),
            comparisons,
          },
        ];
      }),
    );
    return {
      scenarioId,
      primaryQuestionId: cells[0].primaryQuestionId,
      primaryExpected: cells[0].primaryExpected,
      provenance: cells[0].provenance,
      questions,
    };
  });
  return ok({
    schemaVersion: 1,
    ...metadata,
    ...nativeValidationMetadata('bounded_rounding'),
    protocol: REPRESENTATION_PROTOCOL,
    status:
      rows.length === 0
        ? 'not_run'
        : rows.length === planned.length
          ? 'measured'
          : 'measured_partial',
    selectedProductionRepresentation: 'structured',
    planned: planned.length,
    attempted: rows.length,
    notRun: planned.length - rows.length,
    wholeResponseValid: records.filter((record) => record.wholeResponseValid).length,
    primaryQuestionValid: records.filter(
      (record) => record.questions[record.primaryQuestionId].valid,
    ).length,
    thresholds: { noul: 0.5, fitted: false },
    confidenceMeaning: 'distribution_concentration_not_correctness_probability',
    inference: 'descriptive_case_bound_no_confidence_intervals_no_best_arm_selection',
    scenarios,
    records,
  });
}
