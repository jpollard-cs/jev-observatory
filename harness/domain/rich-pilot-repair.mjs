import { ok, err } from './result.mjs';
import { validateNativeAnswers } from './native-answers.mjs';
import { RICH_LIMITS, richHash, verifyRichRequest } from '../application/rich-pilot-run.mjs';

export const REPAIR_PROTOCOL = 'rich-template-pilot-repair-v1';
export const REPAIR_LIMITS = Object.freeze({
  maximumRequests: 1,
  maximumStageCostUsd: 0.01,
  maximumRestartCostUsd: 3,
});

/** Only the single recorded pre-response failure in the completed rich pilot is eligible. */
export function buildRichRepairPlan({
  sourcePlan,
  sourceRows,
  sourceRawBody,
  requestBody,
  ledger,
}) {
  if (
    sourcePlan?.protocolVersion !== 'rich-template-pilot-v1' ||
    sourcePlan.rows?.length !== 48 ||
    sourceRows?.length !== 48
  )
    return err('repair_requires_completed_original_rich_packet');
  const failures = sourceRows.filter((row) => row.status !== 'ok');
  if (failures.length !== 1) return err('repair_requires_exactly_one_original_transport_failure');
  const failed = failures[0],
    trial = sourcePlan.rows.find((row) => row.id === failed.id);
  if (
    !trial ||
    failed.requestHash !== trial.requestHash ||
    failed.planHash !== sourcePlan.planHash ||
    failed.error !== 'transport_error' ||
    failed.usage != null
  )
    return err('repair_source_row_not_eligible');
  const checked = verifyRichRequest(trial, requestBody, sourcePlan.model);
  if (checked.tag === 'error') return checked;
  let evidence;
  try {
    evidence = JSON.parse(sourceRawBody);
  } catch {
    return err('repair_source_raw_invalid');
  }
  const sourceKey = `${sourcePlan.stageId}:${trial.id}`,
    sourceRawHash = richHash(sourceRawBody),
    prior = ledger.reservations[sourceKey];
  if (
    !prior?.settled ||
    prior.requestHash !== trial.requestHash ||
    prior.settlement.rawHash !== sourceRawHash ||
    prior.settlement.failed !== true ||
    prior.chargeNanoUsd !== null ||
    evidence.key !== sourceKey ||
    evidence.requestHash !== trial.requestHash ||
    evidence.response?.status !== 'error' ||
    evidence.response.error !== 'transport_error' ||
    evidence.response.usage != null ||
    evidence.httpResponse !== null ||
    evidence.reportedProviderModel !== null ||
    evidence.providerEnvelope?.error?.code !== 'transport_error'
  )
    return err('repair_source_evidence_or_ledger_mismatch');
  if (trial.reservationNanoUsd > REPAIR_LIMITS.maximumStageCostUsd * 1e9)
    return err('repair_reservation_exceeds_cap');
  const providerModels = [
    ...new Set(sourceRows.filter((row) => row.status === 'ok').map((row) => row.providerModel)),
  ];
  if (providerModels.length !== 1 || typeof providerModels[0] !== 'string')
    return err('repair_original_model_identity_ambiguous');
  const source = {
    protocolVersion: sourcePlan.protocolVersion,
    planHash: sourcePlan.planHash,
    stageId: sourcePlan.stageId,
    originalCaseId: trial.id,
    requestHash: trial.requestHash,
    rawHash: sourceRawHash,
    key: sourceKey,
    originalAttempts: 48,
    originalAvailableResponses: 47,
    reportedProviderModel: providerModels[0],
    originalReservationRetained: true,
  };
  const core = {
    protocolVersion: REPAIR_PROTOCOL,
    requestProtocolVersion: sourcePlan.protocolVersion,
    templateHash: sourcePlan.templateHash,
    model: sourcePlan.model,
    source,
    limits: RICH_LIMITS,
    repairLimits: REPAIR_LIMITS,
    validation: sourcePlan.validation,
    rows: [
      { ...structuredClone(trial), metadata: { ...trial.metadata, supplementalRepair: source } },
    ],
    plannedReservationNanoUsd: trial.reservationNanoUsd,
    interpretation:
      'One explicitly authorized supplemental attempt; original failure and held reservation remain. Request body, guide, material, questions and gold are unchanged.',
  };
  const planHash = richHash(JSON.stringify(core));
  return ok({ plan: { ...core, planHash, stageId: `rich-${planHash.slice(0, 24)}` }, requestBody });
}

export function verifyRichRepairReview(plan, review) {
  return plan.protocolVersion === REPAIR_PROTOCOL &&
    plan.rows.length === 1 &&
    review?.status === 'approved_for_one_transport_repair' &&
    review.decisionBy === 'operator_review' &&
    review.planHash === plan.planHash &&
    review.sourcePlanHash === plan.source.planHash &&
    review.requestHash === plan.source.requestHash &&
    review.maximumRequests === 1 &&
    review.maximumStageCostUsd === 0.01 &&
    review.maximumRestartCostUsd === 3
    ? ok(null)
    : err('repair_review_missing_or_unbound');
}

/** Three explicitly distinct views; the original report is input, never modified or relabeled. */
export function summarizeRichRepair({ plan, originalReport, repairRow, request }) {
  if (
    plan.protocolVersion !== REPAIR_PROTOCOL ||
    plan.source.planHash !== originalReport.planHash ||
    originalReport.overall.attempted !== 48 ||
    originalReport.overall.wholeResponseValid !== 47 ||
    richHash(JSON.stringify(request)) !== plan.source.requestHash
  )
    return err('repair_report_source_mismatch');
  if (
    repairRow &&
    (repairRow.id !== plan.source.originalCaseId ||
      repairRow.planHash !== plan.planHash ||
      repairRow.requestHash !== plan.source.requestHash ||
      !repairRow.request ||
      richHash(JSON.stringify(repairRow.request)) !== plan.source.requestHash)
  )
    return err('repair_report_row_mismatch');
  const source = originalReport.records.find((row) => row.id === plan.source.originalCaseId);
  if (!source || source.wholeResponseValid || source.requestFailure?.category !== 'transport_error')
    return err('repair_report_source_not_unavailable');
  const sameProvider =
    !repairRow ||
    repairRow.status !== 'ok' ||
    repairRow.providerModel === plan.source.reportedProviderModel;
  const observations = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      const answer = repairRow?.answers?.[id];
      const validation =
        repairRow?.status === 'ok'
          ? validateNativeAnswers(
              { [id]: answer },
              { questions: { [id]: question } },
              { distributionPolicy: 'bounded_rounding' },
            )
          : null;
      const valid = validation?.tag === 'ok';
      const prediction = !valid
        ? null
        : question.type === 'choice'
          ? answer.choice
          : question.type === 'noul'
            ? answer.noul >= 0.5
            : answer.score;
      const scored = id !== 'interference_scope';
      return [
        id,
        {
          valid,
          scored,
          expected: source.expected[id] ?? null,
          prediction,
          correct: valid && scored ? prediction === source.expected[id] : null,
          rawTypedAnswer: answer ?? null,
          error: validation?.error?.code ?? repairRow?.error ?? null,
        },
      ];
    }),
  );
  const valid = !!repairRow && Object.values(observations).every((q) => q.valid);
  const attempts = 48 + Number(!!repairRow);
  const questions = Object.fromEntries(
    Object.entries(originalReport.overall.questions)
      .filter(([, q]) => q.scored)
      .map(([id, original]) => {
        const extra = Number(sameProvider && observations[id].valid && observations[id].correct),
          available = Number(sameProvider && observations[id].valid);
        return [
          id,
          {
            original: {
              correct: original.correct,
              attempted: original.attempted,
              valid: original.valid,
              allAttemptAccuracy: original.allAttemptAccuracy,
            },
            supplemental: { ...observations[id], providerCompatible: sameProvider },
            allAttempts: {
              correct: original.correct + extra,
              attempted: attempts,
              valid: original.valid + available,
              accuracy: (original.correct + extra) / attempts,
            },
            explicitCaseCompletion: sameProvider
              ? {
                  correct: original.correct + extra,
                  cases: 48,
                  valid: original.valid + available,
                  accuracy: (original.correct + extra) / 48,
                }
              : null,
          },
        ];
      }),
  );
  return ok({
    schemaVersion: 1,
    kind: 'rich_pilot_transport_repair_report',
    protocolVersion: REPAIR_PROTOCOL,
    repairPlanHash: plan.planHash,
    source: plan.source,
    templateHash: plan.templateHash,
    status: !repairRow
      ? 'not_run'
      : !sameProvider
        ? 'provider_model_changed'
        : valid
          ? 'supplemental_response_available'
          : 'supplemental_response_unavailable',
    original: {
      attempted: 48,
      validResponses: 47,
      reportPlanHash: originalReport.planHash,
      unchanged: true,
    },
    allAttempts: {
      attempted: attempts,
      validResponses: 47 + Number(valid),
      unavailableAttempts: attempts - 47 - Number(valid),
    },
    explicitCaseCompletion: sameProvider
      ? {
          cases: 48,
          available: 47 + Number(valid),
          unavailable: 1 - Number(valid),
          selection:
            'Original first attempt for47 available cases; explicitly authorized supplemental attempt only for the one pre-response transport failure. Selection never depends on answer correctness.',
        }
      : null,
    repairedCase: {
      id: source.id,
      attempts: 1 + Number(!!repairRow),
      availableResponses: Number(valid),
      originalStatus: 'transport_error',
      supplementalStatus: repairRow?.status ?? 'not_run',
      originalReservationStillHeldUsd: plan.plannedReservationNanoUsd / 1e9,
      providerModel: repairRow?.providerModel ?? null,
      providerMatchesOriginal: sameProvider,
      supplementalUsage: repairRow?.usage ?? null,
      questions: observations,
    },
    questions,
    limitations: [
      'The original48-attempt result remains primary and unchanged. A completed-case view is separately selected supplemental evidence, not a rewrite of the original run.',
      'The first unknown charge remains reserved; a successful repair does not prove the original request was free.',
      'Noul threshold remains fixed at >=0.5; native Choice remains selected Choice. Score remains unscored. No gold, prompt or threshold is changed.',
      'A provider-model mismatch prevents the completed-case comparison. All raw attempts remain visible.',
    ],
  });
}
