import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCampaignEvent,
  emptyCampaignLedger,
  replayCampaignLedger,
  requestReservationNanoUsd,
  campaignBudgetStatus,
} from '../harness/domain/campaign-budget.mjs';

const reserve = (key, amount, sequence) => ({
  type: 'reserve',
  key,
  reservationNanoUsd: amount,
  requestHash: key,
  sequence,
});
const settle = (key, sequence, inputTokens, extra = {}) => ({
  type: 'settle',
  key,
  requestHash: key,
  rawHash: `raw-${key}`,
  sequence,
  usage: inputTokens === null ? null : { inputTokens, outputTokens: 100 },
  failed: false,
  providerModel: 'jev-frozen',
  ...extra,
});

test('global cap counts known usage and every unresolved reservation using integer arithmetic', () => {
  const events = [
    reserve('smoke:a', 1e9, 1),
    settle('smoke:a', 2, 1_000_000),
    reserve('matrix:b', 3e9, 3),
  ];
  const state = replayCampaignLedger(events).value;
  assert.equal(state.knownUsageNanoUsd, 42_000_000);
  assert.equal(state.heldReservationNanoUsd, 3e9);
  assert.equal(
    applyCampaignEvent(state, reserve('extensions:c', 959_000_000, 4)).error.code,
    'campaign_budget_exhausted',
  );
  assert.equal(applyCampaignEvent(state, reserve('extensions:c', 958_000_000, 4)).tag, 'ok');
  assert.equal(campaignBudgetStatus(state).committedUsd, 3.042);
  assert.equal(requestReservationNanoUsd(1000).value, 1256 * 42);
});

test('missing usage never releases a reservation and duplicate dispatch/settlement are rejected', () => {
  const state = replayCampaignLedger([reserve('a', 1234, 1), settle('a', 2, null)]).value;
  assert.equal(state.heldReservationNanoUsd, 1234);
  assert.equal(state.knownUsageNanoUsd, 0);
  assert.equal(
    applyCampaignEvent(state, reserve('a', 1234, 3)).error.code,
    'campaign_trial_already_dispatched',
  );
  assert.equal(
    applyCampaignEvent(state, settle('a', 3, 1)).error.code,
    'invalid_campaign_settlement',
  );
  assert.equal(
    applyCampaignEvent(emptyCampaignLedger(), reserve('a', 1234, 2)).error.code,
    'invalid_campaign_ledger_sequence',
  );
});

test('usage breach and provider version drift permanently pause future reservations', () => {
  const breached = replayCampaignLedger([reserve('a', 1, 1), settle('a', 2, 1)]).value;
  assert.equal(breached.haltedReason, 'usage_exceeds_reservation');
  assert.equal(breached.knownUsageNanoUsd, 42);
  assert.equal(applyCampaignEvent(breached, reserve('b', 10, 3)).error.code, 'campaign_halted');
  const drifted = replayCampaignLedger([
    reserve('a', 100, 1),
    settle('a', 2, 1),
    reserve('b', 100, 3),
    settle('b', 4, 1, { providerModel: 'jev-changed' }),
  ]).value;
  assert.equal(drifted.haltedReason, 'provider_model_drift');
});

test('three consecutive failures pause; success resets the failure count', () => {
  const events = [];
  for (const [index, failed] of [true, true, false, true, true, true].entries()) {
    events.push(reserve(String(index), 100, events.length + 1));
    events.push(settle(String(index), events.length + 1, null, { failed }));
  }
  const state = replayCampaignLedger(events).value;
  assert.equal(state.consecutiveFailures, 3);
  assert.equal(state.haltedReason, 'three_consecutive_failures');
  assert.equal(state.heldReservationNanoUsd, 600);
});
