import { err, ok } from './result.mjs';
import { nativeArm, requestVersionOf } from './native-questions.mjs';

const probability = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    object(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

function validateDistribution(answer, question, questionId) {
  const keys =
    question.type === 'choice'
      ? Object.keys(question.criteria)
      : question.criteria.map((_, index) => String(index));
  const invalid =
    !probability(answer.confidence) ||
    !object(answer.probabilities) ||
    Object.keys(answer.probabilities).length !== keys.length ||
    keys.some((key) => !probability(answer.probabilities[key]));
  if (invalid) return err('invalid_native_distribution', { context: { questionId } });

  const sum = Object.values(answer.probabilities).reduce((total, value) => total + value, 0);
  const diagnostic = {
    probabilitySum: sum,
    sumResidual: sum - 1,
    twoDecimalRoundingBound: keys.length * 0.005,
    probabilitiesRenormalized: false,
  };

  if (question.type === 'choice') {
    return keys.includes(answer.choice)
      ? ok(diagnostic)
      : err('invalid_native_choice', { context: { questionId } });
  }
  if (
    !Number.isFinite(answer.score) ||
    answer.score < 0 ||
    answer.score > keys.length - 1 ||
    !object(answer.legend) ||
    keys.some((key) => !Object.hasOwn(answer.legend, key))
  ) {
    return err('invalid_native_score', { context: { questionId } });
  }

  const legendMatches = keys.every(
    (key) => canonical(answer.legend[key]) === canonical(question.criteria[Number(key)]),
  );
  // Legacy string criteria retain their validation contract. Structured legend
  // serialization is unmeasured, so discrepancies are recorded as diagnostics.
  if (question.criteria.every((entry) => typeof entry === 'string') && !legendMatches) {
    return err('invalid_native_score', { context: { questionId } });
  }
  const mean = keys.reduce((total, key) => total + Number(key) * answer.probabilities[key], 0);
  return ok({
    ...diagnostic,
    reportedScore: answer.score,
    weightedScoreFromReportedProbabilities: mean,
    scoreResidual: answer.score - mean,
    scoreTwoDecimalRoundingBound:
      keys.reduce((total, key) => total + Number(key) * 0.005, 0) + 0.005,
    legendMatchesRequestCriteria: legendMatches,
  });
}

export function validateNativeAnswers(answers, request) {
  if (!object(answers)) return err('missing_native_answers');
  if (!object(request?.questions)) return err('invalid_native_question_map');
  const diagnostics = {};
  for (const [questionId, question] of Object.entries(request.questions)) {
    if (!['choice', 'noul', 'score'].includes(question?.type)) {
      return err('unsupported_native_question_type', { context: { questionId } });
    }
    const answer = answers[questionId];
    if (!answer || answer.type !== question.type) {
      return err('native_type_mismatch', { context: { questionId, expectedType: question.type } });
    }
    if (question.type === 'noul' && !probability(answer.noul)) {
      return err('invalid_native_noul', { context: { questionId } });
    }
    if (question.type !== 'noul') {
      const result = validateDistribution(answer, question, questionId);
      if (result.tag === 'error') return result;
      diagnostics[questionId] = result.value;
    }
  }
  return ok(diagnostics);
}

function projectAssessment(answers, caseItem, profile) {
  const value = {
    label: answers.classification.choice,
    attack_probability: answers.attack_probability.noul,
    poison_probability: answers.poison_probability.noul,
    uncertainty: 1 - answers.classification.confidence,
  };
  if (caseItem.outputMode !== 'structured') return value;
  value.decision = caseItem.promptArm === 'policy' ? answers.policy_decision.choice : 'review';
  value.violations =
    caseItem.promptArm === 'policy'
      ? profile.rules
          .filter((rule) => answers[`violation_${rule.id}`].noul >= 0.5)
          .map((rule) => ({ policy_id: rule.id, reason: rule.reason }))
      : [];
  value.judge_verdict = caseItem.task === 'judge' ? answers.judge_verdict.choice : null;
  return value;
}

/** Output assembly only: no input inspection, detection, repair, or rewriting. */
export function normalizeNativeAnswers({ data, caseItem, request, profiles }) {
  const validated = validateNativeAnswers(data?.answers, request);
  if (validated.tag === 'error') return validated;

  const answers = data.answers;
  const requestVersion = requestVersionOf(request);
  const metadata = {
    transport: 'typesafe_systemone',
    outputArm: nativeArm(caseItem.outputMode),
    nativeQuestionCount: Object.keys(request.questions).length,
    choiceConfidence: answers.classification.confidence,
    confidenceMeaning: 'distribution_concentration_not_correctness_probability',
    normalization: 'typed_answer_projection',
    requestVersion,
    adapterVersion:
      requestVersion === 'advanced-v3'
        ? 'native-v3-structured-entrytype'
        : 'native-v2-rounded-distribution-diagnostics',
    distributionDiagnostics: validated.value,
    reasonCodesDerivedFromPolicy: caseItem.outputMode === 'structured',
    policyViolationThreshold: caseItem.outputMode === 'structured' ? 0.5 : null,
    interferenceSeverity: answers.interference_severity || null,
  };
  const output =
    caseItem.outputMode === 'binary'
      ? answers.classification.choice
      : JSON.stringify(projectAssessment(answers, caseItem, profiles[caseItem.policyProfile]));
  return ok({ output, nativeMetadata: metadata, nativeAnswers: answers });
}
