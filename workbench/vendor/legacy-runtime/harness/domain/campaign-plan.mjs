import { createHash } from 'node:crypto';
import { err, ok } from './result.mjs';
import { requestReservationNanoUsd } from './campaign-budget.mjs';

export const CAMPAIGN_PROTOCOL = 'jev-private-release-campaign-v1';
export const CAMPAIGN_NATIVE_VERSION = 'policy-v4';
export const CAMPAIGN_PHASES = ['smoke', 'representation', 'matrix', 'extensions'];
export const campaignHash = (text) => createHash('sha256').update(text).digest('hex');

export function freezeCampaignRequest(request) {
  if (!request?.model || !request.questions || !Object.hasOwn(request, 'state'))
    return err('invalid_campaign_request');
  const body = JSON.stringify(request);
  const bytes = Buffer.byteLength(body, 'utf8');
  const reservation = requestReservationNanoUsd(bytes);
  if (reservation.tag === 'error') return reservation;
  return ok({
    body,
    requestHash: campaignHash(body),
    requestBytes: bytes,
    reservationNanoUsd: reservation.value,
  });
}

/** Catalog keeps every factor and gold privately; only contexts are stored in frozen requests. */
export function campaignCaseMetadata(caseItem) {
  const { context, ...metadata } = caseItem;
  return structuredClone(metadata);
}

export function makeCampaignTrial({ phase, caseItem, fixture, frozen, contractVersion }) {
  if (!CAMPAIGN_PHASES.includes(phase) || Boolean(caseItem) === Boolean(fixture))
    return err('invalid_campaign_trial');
  const id = caseItem?.id || fixture.id;
  return ok({
    id: `${phase}:${id}`,
    sourceId: id,
    phase,
    kind: caseItem ? 'corpus' : 'extension',
    nativeRequestVersion: contractVersion,
    ...(caseItem
      ? { caseMetadata: campaignCaseMetadata(caseItem) }
      : { fixture: structuredClone(fixture) }),
    requestHash: frozen.requestHash,
    requestBytes: frozen.requestBytes,
    reservationNanoUsd: frozen.reservationNanoUsd,
  });
}

export function makeCampaignDiagnosticTrial({ diagnostic, frozen, contractVersion }) {
  if (!diagnostic?.id || Object.hasOwn(diagnostic, 'request'))
    return err('invalid_campaign_diagnostic');
  return ok({
    id: `representation:${diagnostic.id}`,
    sourceId: diagnostic.id,
    phase: 'representation',
    kind: 'diagnostic',
    diagnostic: structuredClone(diagnostic),
    nativeRequestVersion: contractVersion,
    requestHash: frozen.requestHash,
    requestBytes: frozen.requestBytes,
    reservationNanoUsd: frozen.reservationNanoUsd,
  });
}

export function campaignProgressStatus(plan, trials, ledger) {
  const phases = Object.fromEntries(
    CAMPAIGN_PHASES.map((phase) => {
      const selected = trials.filter((trial) => trial.phase === phase);
      const dispatched = selected
        .map((trial) => ledger.reservations[`${plan.campaignId}:${trial.id}`])
        .filter(Boolean);
      return [
        phase,
        {
          planned: selected.length,
          dispatched: dispatched.length,
          outcomesRecorded: dispatched.filter((entry) => entry.settled).length,
          interruptedUnknown: dispatched.filter((entry) => !entry.settled).length,
          usageUnknown: dispatched.filter((entry) => entry.chargeNanoUsd === null).length,
          queued: selected.length - dispatched.length,
        },
      ];
    }),
  );
  return {
    campaignId: plan.campaignId,
    catalogCases: plan.catalogCases,
    phases,
    queuedOtherSeeds: plan.queuedOtherSeeds,
    fullCatalogQueued: plan.queuedOtherSeeds + phases.matrix.queued,
    seedCoverage: plan.selection,
  };
}

export function verifyCampaignPreflight({ plan, trials, ledger, review }) {
  const digest = (value) =>
    typeof value === 'string' &&
    value.length === 64 &&
    [...value].every((character) => '0123456789abcdef'.includes(character));
  if (
    typeof plan.planHash !== 'string' ||
    review?.planHash !== plan.planHash ||
    review.status !== 'ready_for_development_run' ||
    review.decisionBy !== 'operator_review' ||
    !digest(review.representationReportHash) ||
    !digest(review.auditdocHash)
  )
    return err('campaign_preflight_review_missing_or_unbound');
  const progress = campaignProgressStatus(plan, trials, ledger);
  for (const phase of ['smoke', 'representation']) {
    if (
      progress.phases[phase].planned === 0 ||
      progress.phases[phase].outcomesRecorded !== progress.phases[phase].planned
    )
      return err('campaign_preflight_outcomes_incomplete', { context: { phase } });
  }
  return ok({ status: 'ready_for_development_run' });
}

export function verifyCampaignBody(trial, body, model) {
  if (
    campaignHash(body) !== trial.requestHash ||
    Buffer.byteLength(body, 'utf8') !== trial.requestBytes
  )
    return err('frozen_campaign_request_changed');
  const reservation = requestReservationNanoUsd(trial.requestBytes);
  if (reservation.tag === 'error' || reservation.value !== trial.reservationNanoUsd)
    return err('frozen_campaign_reservation_changed');
  try {
    const request = JSON.parse(body);
    if (request.model !== model) return err('frozen_campaign_model_mismatch');
    if (JSON.stringify(request) !== body) return err('frozen_campaign_request_noncanonical_wire');
    return ok(request);
  } catch {
    return err('invalid_frozen_campaign_json');
  }
}
