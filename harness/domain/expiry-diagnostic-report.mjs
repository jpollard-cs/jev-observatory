import { err, ok } from './result.mjs';

const decisions = ['allow', 'allow_with_audit', 'review', 'block'];
const probability = (v) => Number.isFinite(v) && v >= 0 && v <= 1;

export function readExpiryObservation(answers, scope) {
  const decision = answers?.debug_decision;
  if (
    decision?.type !== 'choice' ||
    !decisions.includes(decision.choice) ||
    !probability(decision.confidence) ||
    decisions.some((k) => !probability(decision.probabilities?.[k]))
  ) {
    return err('invalid_diagnostic_choice');
  }
  const observed = {
    decision: decision.choice,
    probabilities: decision.probabilities,
    confidence: decision.confidence,
    expiredProbability: null,
    productionAuditProbability: null,
    auditProbability: null,
  };
  if (scope !== 'decision-only') {
    for (const [field, id] of Object.entries({
      expiredProbability: 'reason_DBG_APPROVAL_EXPIRED',
      productionAuditProbability: 'reason_DBG_PRODUCTION_AUDIT',
      auditProbability: 'audit_required',
    })) {
      if (answers?.[id]?.type !== 'noul' || !probability(answers[id].noul))
        return err('invalid_diagnostic_noul');
      observed[field] = answers[id].noul;
    }
  }
  return ok(observed);
}

const summary = (values) =>
  values.length
    ? {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      }
    : null;

export function summarizeExpiryDiagnostic(plan, rows, metadata) {
  if (!Array.isArray(plan?.trials) || !Array.isArray(rows)) {
    return err('invalid_diagnostic_report_input');
  }
  const trialsById = new Map();
  const groups = new Map();
  for (const trial of plan.trials) {
    if (
      typeof trial?.id !== 'string' ||
      typeof trial.conditionId !== 'string' ||
      typeof trial.wireSha256 !== 'string' ||
      !trial.wireSha256
    ) {
      return err('invalid_diagnostic_plan_trial');
    }
    if (trialsById.has(trial.id)) {
      return err('duplicate_diagnostic_plan_trial', { context: { trialId: trial.id } });
    }
    trialsById.set(trial.id, trial);
    if (!groups.has(trial.conditionId)) groups.set(trial.conditionId, { trial, rows: [] });
  }
  const observedIds = new Set();
  for (const row of rows) {
    const trial = trialsById.get(row?.id);
    if (!trial) return err('unknown_diagnostic_trial');
    const context = { trialId: trial.id };
    if (observedIds.has(trial.id)) return err('duplicate_diagnostic_trial', { context });
    if (row.conditionId !== trial.conditionId) {
      return err('diagnostic_condition_mismatch', { context });
    }
    if (row.wireSha256 !== trial.wireSha256) {
      return err('diagnostic_request_hash_mismatch', { context });
    }
    observedIds.add(trial.id);
    groups.get(trial.conditionId).rows.push(row);
  }
  const conditions = [...groups.values()]
    .map(({ trial, rows: observations }) => {
      const valid = observations
        .filter((r) => r.observation?.tag === 'ok')
        .map((r) => r.observation.value);
      return {
        id: trial.conditionId,
        context: trial.context,
        representation: trial.representation,
        rubric: trial.rubric,
        questionScope: trial.questionScope,
        expected: trial.expected.decision,
        attempted: observations.length,
        valid: valid.length,
        matchingDecisions: valid.filter((r) => r.decision === trial.expected.decision).length,
        choices: valid.map((r) => r.decision).join(' / '),
        blockProbability: summary(valid.map((r) => r.probabilities.block)),
        optionProbabilities: Object.fromEntries(
          decisions.map((k) => [k, summary(valid.map((r) => r.probabilities[k]))]),
        ),
        expiredProbability: summary(valid.map((r) => r.expiredProbability).filter(probability)),
        auditProbability: summary(valid.map((r) => r.auditProbability).filter(probability)),
        productionAuditProbability: summary(
          valid.map((r) => r.productionAuditProbability).filter(probability),
        ),
        requestHashes: [...new Set(observations.map((r) => r.wireSha256))],
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return ok({
    schemaVersion: 1,
    kind: 'expiry_specification_sensitivity',
    ...metadata,
    status: rows.length === plan.trials.length ? 'measured' : 'measured_partial',
    planHash: plan.planHash,
    planned: plan.trials.length,
    attempted: rows.length,
    valid: rows.filter((r) => r.observation?.tag === 'ok').length,
    evidenceStage: 'post_observation_development_diagnostic',
    independentScenarioLineages: 1,
    repeatsAreIndependentScenarios: false,
    factors: plan.factors,
    conditions,
    usage: {
      requestsWithUsage: rows.filter((r) => r.usage).length,
      inputTokens: rows.reduce((n, r) => n + (r.usage?.inputTokens ?? 0), 0),
      outputTokens: rows.reduce((n, r) => n + (r.usage?.outputTokens ?? 0), 0),
    },
    limitations: plan.limitations,
  });
}
