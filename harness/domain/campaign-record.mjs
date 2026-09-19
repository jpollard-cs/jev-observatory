import { normalizeNativeAnswers, validateNativeAnswers } from './native-answers.mjs';
import { parseOutput } from '../schema.mjs';

/** Private record projection. Raw observations and billable usage always survive schema errors. */
export function projectCampaignRecord({ plan, trial, request, evidence, profiles }) {
  const response = evidence.response;
  const shared = {
    runId: `${plan.campaignId}:${trial.phase}`,
    campaignId: plan.campaignId,
    id: trial.sourceId,
    trialId: trial.id,
    phase: trial.phase,
    model: 'jev',
    configuredModel: plan.model,
    source: `direct_api_campaign_${trial.phase}`,
    transport: 'typesafe_systemone',
    constrainedOutput: true,
    nativeRequestVersion: trial.nativeRequestVersion,
    protocolHash: plan.protocolHash,
    trustedContextHash: plan.trustedContextHash,
    policyProfiles: plan.policyProfiles,
    policyProfileVersion: plan.policyProfiles?.version,
    policyProfileHash: plan.policyProfiles?.sha256,
    policyProfileFile: plan.policyProfiles?.file,
    validation: plan.validation,
    validationVersion: plan.validation?.validationVersion,
    repeat: 0,
    attempt: 1,
    request,
    requestHash: trial.requestHash,
    inputChars: JSON.stringify(request).length,
    inputUtf8Bytes: trial.requestBytes,
    ...response,
    nativeAnswers: response.answers ?? null,
  };
  if (trial.kind === 'extension' || trial.kind === 'diagnostic') {
    const valid =
      response.status === 'ok'
        ? validateNativeAnswers(response.answers, request, {
            distributionPolicy: 'bounded_rounding',
          })
        : null;
    return {
      ...shared,
      kind: trial.kind === 'extension' ? 'campaign_extension' : 'campaign_representation',
      ...(trial.kind === 'extension'
        ? { fixture: trial.fixture, expected: trial.fixture.expected }
        : { diagnostic: trial.diagnostic, expected: trial.diagnostic.expected }),
      answers: response.answers ?? null,
      parsed:
        valid?.tag === 'ok'
          ? { valid: true }
          : { valid: false, error: valid?.error.code ?? response.error },
    };
  }
  const caseItem = { ...trial.caseMetadata, context: request.state.assessmentContext };
  const base = { ...shared, case: caseItem };
  if (response.status !== 'ok') return { ...base, parsed: null };
  const frozenPolicy = request.questions.classification.instructions?.trustedPolicy;
  const frozenProfiles = frozenPolicy ? { [caseItem.policyProfile]: frozenPolicy } : profiles;
  const projected = normalizeNativeAnswers({
    data: { answers: response.answers },
    caseItem,
    request,
    profiles: frozenProfiles,
  });
  if (projected.tag === 'error') {
    return {
      ...base,
      output: null,
      nativeValidationError: projected.error.code,
      validationIssue: projected.error,
      parsed: { valid: false, error: projected.error.code },
    };
  }
  return {
    ...base,
    ...projected.value,
    parsed: parseOutput(projected.value.output, caseItem.outputMode),
  };
}
