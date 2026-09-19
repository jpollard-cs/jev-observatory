import { err, ok } from './result.mjs';

export const CAMPAIGN_BUDGET = Object.freeze({
  maximumUsd: 4,
  maximumNanoUsd: 4_000_000_000,
  inputUsdPerMillion: 0.042,
  outputUsdPerMillion: 0,
  inputNanoUsdPerToken: 42,
  reservationExtraBytes: 256,
});
const count = (value) => Number.isSafeInteger(value) && value >= 0;
export const nanoUsdToUsd = (amount) => amount / 1e9;

export function requestReservationNanoUsd(bytes) {
  if (!count(bytes)) return err('invalid_request_byte_count');
  const amount = (bytes + CAMPAIGN_BUDGET.reservationExtraBytes) * 42;
  return Number.isSafeInteger(amount) ? ok(amount) : err('invalid_request_reservation');
}

export function usageChargeNanoUsd(usage) {
  if (!usage) return ok(null);
  if (!count(usage.inputTokens) || !count(usage.outputTokens)) return err('invalid_campaign_usage');
  const amount = usage.inputTokens * 42;
  return Number.isSafeInteger(amount) ? ok(amount) : err('invalid_campaign_usage');
}

export function emptyCampaignLedger() {
  return {
    sequence: 0,
    reservations: {},
    knownUsageNanoUsd: 0,
    heldReservationNanoUsd: 0,
    providerModel: null,
    consecutiveFailures: 0,
    haltedReason: null,
  };
}

export function campaignBudgetStatus(state) {
  return {
    maximumUsd: 4,
    knownUsageUsd: nanoUsdToUsd(state.knownUsageNanoUsd),
    unresolvedReservationUsd: nanoUsdToUsd(state.heldReservationNanoUsd),
    committedUsd: nanoUsdToUsd(state.knownUsageNanoUsd + state.heldReservationNanoUsd),
    remainingUsd: nanoUsdToUsd(
      Math.max(0, 4e9 - state.knownUsageNanoUsd - state.heldReservationNanoUsd),
    ),
    dispatched: Object.keys(state.reservations).length,
    unresolved: Object.values(state.reservations).filter((entry) => entry.chargeNanoUsd === null)
      .length,
    haltedReason: state.haltedReason,
  };
}

/** Ledger events are immutable facts; a reservation is never reclaimed without recorded usage. */
export function applyCampaignEvent(state, event) {
  if (event?.sequence !== state.sequence + 1 || typeof event.key !== 'string')
    return err('invalid_campaign_ledger_sequence');
  const prior = state.reservations[event.key];
  if (event.type === 'reserve') {
    if (prior) return err('campaign_trial_already_dispatched');
    if (state.haltedReason)
      return err('campaign_halted', { context: { reason: state.haltedReason } });
    if (!count(event.reservationNanoUsd) || typeof event.requestHash !== 'string')
      return err('invalid_campaign_reservation');
    if (state.knownUsageNanoUsd + state.heldReservationNanoUsd + event.reservationNanoUsd > 4e9)
      return err('campaign_budget_exhausted');
    return ok({
      ...state,
      sequence: event.sequence,
      heldReservationNanoUsd: state.heldReservationNanoUsd + event.reservationNanoUsd,
      reservations: {
        ...state.reservations,
        [event.key]: { ...event, settled: false, chargeNanoUsd: null },
      },
    });
  }
  if (event.type !== 'settle' || !prior || prior.settled) return err('invalid_campaign_settlement');
  if (event.requestHash !== prior.requestHash || typeof event.rawHash !== 'string')
    return err('campaign_settlement_binding_mismatch');
  const charge = usageChargeNanoUsd(event.usage);
  if (charge.tag === 'error') return charge;
  if (typeof event.failed !== 'boolean') return err('invalid_campaign_failure_state');
  const reportedModel = typeof event.providerModel === 'string' ? event.providerModel : null;
  const drift = state.providerModel && reportedModel && state.providerModel !== reportedModel;
  const failures = event.failed ? state.consecutiveFailures + 1 : 0;
  const breach = charge.value !== null && charge.value > prior.reservationNanoUsd;
  return ok({
    ...state,
    sequence: event.sequence,
    providerModel: state.providerModel || reportedModel,
    consecutiveFailures: failures,
    haltedReason:
      state.haltedReason ||
      (drift
        ? 'provider_model_drift'
        : breach
          ? 'usage_exceeds_reservation'
          : failures >= 3
            ? 'three_consecutive_failures'
            : null),
    knownUsageNanoUsd: state.knownUsageNanoUsd + (charge.value ?? 0),
    heldReservationNanoUsd:
      state.heldReservationNanoUsd - (charge.value === null ? 0 : prior.reservationNanoUsd),
    reservations: {
      ...state.reservations,
      [event.key]: { ...prior, settled: true, chargeNanoUsd: charge.value, settlement: event },
    },
  });
}

export function replayCampaignLedger(events) {
  let state = emptyCampaignLedger();
  for (const event of events) {
    const next = applyCampaignEvent(state, event);
    if (next.tag === 'error') return next;
    state = next.value;
  }
  return ok(state);
}
