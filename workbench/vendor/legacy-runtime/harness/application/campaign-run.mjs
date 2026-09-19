import { err, ok } from '../domain/result.mjs';
import {
  applyCampaignEvent,
  campaignBudgetStatus,
  replayCampaignLedger,
} from '../domain/campaign-budget.mjs';
import { CAMPAIGN_PHASES, verifyCampaignBody } from '../domain/campaign-plan.mjs';

/**
 * Sequential application use case. The boundary owns the global lock and durable writes.
 * A persisted reservation is a dispatch tombstone, even if the process died before sending.
 */
export async function runCampaignPhase(
  { plan, trials, phase, events, maxRequests = Infinity },
  ports,
) {
  if (
    !CAMPAIGN_PHASES.includes(phase) ||
    !(maxRequests === Infinity || (Number.isSafeInteger(maxRequests) && maxRequests > 0))
  )
    return err('invalid_campaign_phase');
  const replay = replayCampaignLedger(events);
  if (replay.tag === 'error') return replay;
  let ledger = replay.value;
  let dispatchedNow = 0;
  let recovered = 0;
  let skipped = 0;

  async function commit(event) {
    const next = applyCampaignEvent(ledger, { ...event, sequence: ledger.sequence + 1 });
    if (next.tag === 'error') return next;
    await ports.appendEvent({ ...event, sequence: ledger.sequence + 1 });
    ledger = next.value;
    return ok(null);
  }

  async function finish(trial, request, evidence, rawHash) {
    const key = `${plan.campaignId}:${trial.id}`;
    const row = await ports.project({ plan, trial, request, evidence });
    await ports.writeRow(trial, row);
    if (!ledger.reservations[key].settled) {
      const settlement = await commit({
        type: 'settle',
        key,
        requestHash: trial.requestHash,
        rawHash,
        usage: evidence.response.usage ?? null,
        providerModel: evidence.reportedProviderModel ?? null,
        failed: row.status !== 'ok' || row.parsed?.valid !== true,
        recordedAt: ports.now(),
      });
      if (settlement.tag === 'error') return settlement;
    }
    ports.progress?.({
      phase: trial.phase,
      trialId: trial.id,
      status: row.status,
      valid: row.parsed?.valid ?? false,
      ...campaignBudgetStatus(ledger),
    });
    return ok(null);
  }

  // A crash after response persistence is settled without another model call.
  // A crash without a persisted response remains unknown and keeps its full reservation.
  for (const trial of trials) {
    const key = `${plan.campaignId}:${trial.id}`;
    const prior = ledger.reservations[key];
    if (!prior) continue;
    if (prior.requestHash !== trial.requestHash) return err('campaign_resume_plan_mismatch');
    const saved = await ports.loadRaw(trial);
    if (!saved) {
      if (prior.settled) return err('settled_campaign_raw_missing');
      const verified = verifyCampaignBody(trial, await ports.readBody(trial), plan.model);
      if (verified.tag === 'error') return verified;
      const row = await ports.project({
        plan,
        trial,
        request: verified.value,
        evidence: { response: { status: 'unknown_interrupted_dispatch', usage: null } },
      });
      await ports.writeUnknownRow(trial, {
        ...row,
        parsed: null,
        recordOrigin: 'derived_dispatch_tombstone',
        mayHaveReachedProvider: true,
        reservationRetained: true,
      });
      continue;
    }
    if (saved.evidence.key !== key || saved.evidence.requestHash !== trial.requestHash)
      return err('campaign_raw_binding_mismatch');
    if (prior.settled && prior.settlement.rawHash !== saved.rawHash)
      return err('campaign_raw_hash_mismatch');
    if (!prior.settled || !(await ports.hasRow(trial))) {
      const verified = verifyCampaignBody(trial, await ports.readBody(trial), plan.model);
      if (verified.tag === 'error') return verified;
      const completed = await finish(trial, verified.value, saved.evidence, saved.rawHash);
      if (completed.tag === 'error') return completed;
      recovered++;
    }
  }

  for (const trial of trials.filter((entry) => entry.phase === phase)) {
    const key = `${plan.campaignId}:${trial.id}`;
    if (ledger.reservations[key]) {
      skipped++;
      continue;
    }
    if (ledger.haltedReason)
      return ok({
        status: 'paused',
        reason: ledger.haltedReason,
        dispatchedNow,
        recovered,
        skipped,
        budget: campaignBudgetStatus(ledger),
      });
    if (dispatchedNow >= maxRequests)
      return ok({
        status: 'paused',
        reason: 'invocation_request_limit',
        dispatchedNow,
        recovered,
        skipped,
        budget: campaignBudgetStatus(ledger),
      });
    const verified = verifyCampaignBody(trial, await ports.readBody(trial), plan.model);
    if (verified.tag === 'error') return verified;
    const reserved = await commit({
      type: 'reserve',
      key,
      campaignId: plan.campaignId,
      trialId: trial.id,
      phase,
      requestHash: trial.requestHash,
      reservationNanoUsd: trial.reservationNanoUsd,
      recordedAt: ports.now(),
    });
    if (reserved.tag === 'error') {
      if (reserved.error.code === 'campaign_budget_exhausted')
        return ok({
          status: 'paused',
          reason: 'campaign_budget_exhausted',
          dispatchedNow,
          recovered,
          skipped,
          budget: campaignBudgetStatus(ledger),
        });
      return reserved;
    }
    dispatchedNow++;
    let received;
    try {
      received = await ports.infer(verified.value);
    } catch {
      received = {
        response: { status: 'error', error: 'campaign_inference_exception', usage: null },
        reportedProviderModel: null,
      };
    }
    const evidence = { key, requestHash: trial.requestHash, receivedAt: ports.now(), ...received };
    // Raw envelope/usage is durable before schema interpretation or financial settlement.
    const rawHash = await ports.writeRaw(trial, evidence);
    const completed = await finish(trial, verified.value, evidence, rawHash);
    if (completed.tag === 'error') return completed;
  }
  const unknownDispatches = trials.filter(
    (trial) =>
      trial.phase === phase &&
      ledger.reservations[`${plan.campaignId}:${trial.id}`]?.settled === false,
  ).length;
  return ok({
    status: ledger.haltedReason
      ? 'paused'
      : unknownDispatches
        ? 'phase_complete_with_unknown_dispatches'
        : 'phase_complete',
    reason: ledger.haltedReason,
    dispatchedNow,
    recovered,
    skipped,
    unknownDispatches,
    budget: campaignBudgetStatus(ledger),
  });
}
