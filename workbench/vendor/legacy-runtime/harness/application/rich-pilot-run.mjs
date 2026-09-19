import { createHash } from 'node:crypto';
import { ok, err } from '../domain/result.mjs';
import { validateNativeAnswers, nativeValidationMetadata } from '../domain/native-answers.mjs';

export const RICH_LIMITS = Object.freeze({
  restartNanoUsd: 3_000_000_000,
  stageNanoUsd: 300_000_000,
  maximumRequests: 48,
  inputNanoUsdPerToken: 42,
  outputNanoUsdPerToken: 0,
  overheadTokens: 256,
});
export const richHash = (value) => createHash('sha256').update(value).digest('hex');
const count = (value) => Number.isSafeInteger(value) && value >= 0;

export function freezeRichPilotPlan(source) {
  if (
    !source?.templateHash ||
    !source.protocolVersion ||
    !Array.isArray(source.rows) ||
    source.rows.length !== RICH_LIMITS.maximumRequests ||
    new Set(source.rows.map((row) => row.id)).size !== source.rows.length
  )
    return err('invalid_rich_pilot_plan');
  const bodies = {};
  const rows = [];
  for (const row of source.rows) {
    if (
      typeof row.id !== 'string' ||
      !row.request?.model ||
      !row.request.questions ||
      !Object.hasOwn(row.request, 'state')
    )
      return err('invalid_rich_pilot_request');
    const body = JSON.stringify(row.request);
    const requestHash = richHash(body);
    const requestBytes = Buffer.byteLength(body, 'utf8');
    const reservationNanoUsd =
      (requestBytes + RICH_LIMITS.overheadTokens) * RICH_LIMITS.inputNanoUsdPerToken;
    if (!Number.isSafeInteger(reservationNanoUsd)) return err('invalid_rich_pilot_reservation');
    bodies[requestHash] = body;
    const { request, ...metadata } = row;
    rows.push({ ...metadata, requestHash, requestBytes, reservationNanoUsd });
  }
  const models = new Set(source.rows.map((row) => row.request.model));
  if (models.size !== 1) return err('rich_pilot_model_mismatch');
  const { rows: _rows, ...metadata } = source;
  const core = {
    ...metadata,
    model: [...models][0],
    rows,
    limits: RICH_LIMITS,
    validation: nativeValidationMetadata('bounded_rounding'),
    plannedReservationNanoUsd: rows.reduce((sum, row) => sum + row.reservationNanoUsd, 0),
  };
  if (core.plannedReservationNanoUsd > RICH_LIMITS.stageNanoUsd)
    return err('rich_pilot_plan_exceeds_stage_budget', {
      context: { plannedReservationUsd: core.plannedReservationNanoUsd / 1e9 },
    });
  const planHash = richHash(JSON.stringify(core));
  return ok({ plan: { ...core, planHash, stageId: `rich-${planHash.slice(0, 24)}` }, bodies });
}

export function verifyRichRequest(row, body, model) {
  if (
    richHash(body) !== row.requestHash ||
    Buffer.byteLength(body, 'utf8') !== row.requestBytes ||
    (row.requestBytes + 256) * 42 !== row.reservationNanoUsd
  )
    return err('rich_frozen_request_changed');
  try {
    const request = JSON.parse(body);
    return request.model === model && JSON.stringify(request) === body
      ? ok(request)
      : err('rich_frozen_model_or_wire_changed');
  } catch {
    return err('invalid_rich_frozen_json');
  }
}

export function verifyRichApproval(plan, approval) {
  return approval?.status === 'approved_for_bounded_pilot' &&
    approval.templateHash === plan.templateHash &&
    approval.protocolVersion === plan.protocolVersion &&
    approval.maximumRequests === 48 &&
    approval.maximumStageCostUsd === 0.3 &&
    approval.maximumRestartCostUsd === 3
    ? ok(null)
    : err('rich_pilot_approval_missing_or_unbound');
}

export function verifyRichPreflight(plan, review) {
  return review?.planHash === plan.planHash &&
    review.status === 'ready_for_bounded_pilot' &&
    review.decisionBy === 'operator_review'
    ? ok(null)
    : err('rich_preflight_review_missing_or_unbound');
}

/** Only a bound, observed transport failure can be reviewed; missing evidence is not proof. */
export function richTransportResumeEvent(plan, ledger, review, saved) {
  const prior = ledger.reservations[review?.failedKey];
  const row = plan.rows.find((entry) => `${plan.stageId}:${entry.id}` === review?.failedKey);
  const evidence = saved?.evidence;
  if (
    !row || !prior || prior.requestHash !== row.requestHash ||
    review?.planHash !== plan.planHash ||
    saved?.rawHash !== review?.rawHash ||
    evidence?.key !== review?.failedKey || evidence?.requestHash !== row.requestHash ||
    evidence?.response?.status !== 'error' || evidence.response.error !== 'transport_error' ||
    evidence.httpResponse !== null || evidence.reportedProviderModel !== null ||
    evidence.response.providerModel != null || evidence.response.usage != null ||
    evidence.providerEnvelope?.tag !== 'error' ||
    evidence.providerEnvelope.error?.code !== 'transport_error'
  ) return err('rich_transport_review_evidence_rejected');
  const event = {
    type: 'resume_after_transport_review',
    key: review.failedKey,
    failedKey: review.failedKey,
    stageId: plan.stageId,
    planHash: plan.planHash,
    requestHash: row.requestHash,
    rawHash: saved.rawHash,
    review,
    reviewHash: richHash(JSON.stringify(review)),
    transportEvidence: {
      status: evidence.response.status,
      error: evidence.response.error,
      httpResponse: null,
      usage: null,
      providerModel: null,
      providerEnvelopeError: evidence.providerEnvelope.error.code,
    },
  };
  const checked = applyRichEvent(ledger, { ...event, sequence: ledger.sequence + 1 });
  return checked.tag === 'error' ? checked : ok(event);
}

export function emptyRichLedger() {
  return {
    sequence: 0,
    knownNanoUsd: 0,
    heldNanoUsd: 0,
    reservations: {},
    stages: {},
    haltedReason: null,
  };
}

export function applyRichEvent(state, event) {
  if (event?.sequence !== state.sequence + 1 || typeof event.key !== 'string')
    return err('invalid_rich_ledger_sequence');
  const prior = state.reservations[event.key];
  if (event.type === 'resume_after_transport_review') {
    const stage = state.stages[event.stageId];
    const review = event.review;
    const proof = event.transportEvidence;
    if (
      state.haltedReason || !stage || stage.haltedReason !== 'preflight_response_failure' ||
      stage.haltedByKey !== event.key || stage.transportResumeKeys?.includes(event.key) ||
      !prior?.settled || prior.stageId !== event.stageId || prior.chargeNanoUsd !== null ||
      prior.settlement.failed !== true || prior.settlement.usage !== null ||
      prior.settlement.providerModel !== null || prior.settlement.rawHash !== event.rawHash ||
      event.requestHash !== prior.requestHash || event.failedKey !== event.key ||
      typeof event.planHash !== 'string' || !/^[a-f0-9]{64}$/.test(event.planHash) ||
      event.stageId !== `rich-${event.planHash.slice(0, 24)}` ||
      review?.status !== 'approved_for_unattempted_rows_only' ||
      review.decisionBy !== 'operator_review' || review.planHash !== event.planHash ||
      review.failedKey !== event.key || review.rawHash !== event.rawHash ||
      typeof review.reason !== 'string' || !review.reason.trim() ||
      event.reviewHash !== richHash(JSON.stringify(review)) ||
      proof?.status !== 'error' || proof.error !== 'transport_error' ||
      proof.httpResponse !== null || proof.usage !== null || proof.providerModel !== null ||
      proof.providerEnvelopeError !== 'transport_error'
    ) return err('rich_transport_resume_rejected');
    return ok({
      ...state,
      sequence: event.sequence,
      stages: {
        ...state.stages,
        [event.stageId]: {
          ...stage,
          haltedReason: null,
          haltedByKey: null,
          transportResumeKeys: [...(stage.transportResumeKeys || []), event.key],
        },
      },
    });
  }
  if (event.type === 'reserve') {
    const stage = state.stages[event.stageId] || {
      knownNanoUsd: 0,
      heldNanoUsd: 0,
      dispatched: 0,
      providerModel: null,
      haltedReason: null,
    };
    if (prior) return err('rich_trial_already_dispatched');
    if (state.haltedReason || stage.haltedReason) return err('rich_stage_halted');
    if (!count(event.reservationNanoUsd) || !event.requestHash || !event.stageId)
      return err('invalid_rich_reservation');
    if (
      state.knownNanoUsd + state.heldNanoUsd + event.reservationNanoUsd >
      RICH_LIMITS.restartNanoUsd
    )
      return err('rich_restart_budget_exhausted');
    if (
      stage.knownNanoUsd + stage.heldNanoUsd + event.reservationNanoUsd >
      RICH_LIMITS.stageNanoUsd
    )
      return err('rich_stage_budget_exhausted');
    if (stage.dispatched >= RICH_LIMITS.maximumRequests) return err('rich_stage_request_limit');
    return ok({
      ...state,
      sequence: event.sequence,
      heldNanoUsd: state.heldNanoUsd + event.reservationNanoUsd,
      stages: {
        ...state.stages,
        [event.stageId]: {
          ...stage,
          heldNanoUsd: stage.heldNanoUsd + event.reservationNanoUsd,
          dispatched: stage.dispatched + 1,
        },
      },
      reservations: {
        ...state.reservations,
        [event.key]: { ...event, settled: false, chargeNanoUsd: null },
      },
    });
  }
  if (
    event.type !== 'settle' ||
    !prior ||
    prior.settled ||
    event.requestHash !== prior.requestHash ||
    !event.rawHash ||
    typeof event.failed !== 'boolean'
  )
    return err('invalid_rich_settlement');
  const stage = state.stages[prior.stageId];
  const validUsage =
    count(event.usage?.inputTokens) &&
    count(event.usage?.outputTokens) &&
    Number.isSafeInteger(event.usage.inputTokens * 42);
  const charge = validUsage ? event.usage.inputTokens * 42 : null;
  const released = charge === null ? 0 : prior.reservationNanoUsd;
  const providerModel = typeof event.providerModel === 'string' ? event.providerModel : null;
  const drift = stage.providerModel && providerModel && stage.providerModel !== providerModel;
  const breach = charge !== null && charge > prior.reservationNanoUsd;
  const halt =
    stage.haltedReason ||
    (breach
      ? 'usage_exceeds_reservation'
      : drift
        ? 'provider_model_drift'
        : event.failed
          ? 'preflight_response_failure'
          : !validUsage
            ? 'usage_unavailable'
            : !providerModel
              ? 'provider_model_unavailable'
              : null);
  return ok({
    ...state,
    sequence: event.sequence,
    knownNanoUsd: state.knownNanoUsd + (charge ?? 0),
    heldNanoUsd: state.heldNanoUsd - released,
    haltedReason: state.haltedReason || (breach ? 'usage_exceeds_reservation' : null),
    stages: {
      ...state.stages,
      [prior.stageId]: {
        ...stage,
        knownNanoUsd: stage.knownNanoUsd + (charge ?? 0),
        heldNanoUsd: stage.heldNanoUsd - released,
        providerModel: stage.providerModel || providerModel,
        haltedReason: halt,
        haltedByKey: stage.haltedReason ? stage.haltedByKey : halt ? event.key : null,
      },
    },
    reservations: {
      ...state.reservations,
      [event.key]: { ...prior, settled: true, chargeNanoUsd: charge, settlement: event },
    },
  });
}

export function replayRichLedger(events) {
  let state = emptyRichLedger();
  for (const event of events) {
    const applied = applyRichEvent(state, event);
    if (applied.tag === 'error') return applied;
    state = applied.value;
  }
  return ok(state);
}

export function richBudgetStatus(ledger, stageId) {
  const stage = ledger.stages[stageId] || {
    knownNanoUsd: 0,
    heldNanoUsd: 0,
    dispatched: 0,
    haltedReason: null,
  };
  return {
    restartMaximumUsd: 3,
    restartKnownUsageUsd: ledger.knownNanoUsd / 1e9,
    restartHeldUsd: ledger.heldNanoUsd / 1e9,
    stageMaximumUsd: 0.3,
    stageKnownUsageUsd: stage.knownNanoUsd / 1e9,
    stageHeldUsd: stage.heldNanoUsd / 1e9,
    dispatched: stage.dispatched,
    haltedReason: ledger.haltedReason || stage.haltedReason,
  };
}

export function projectRichRecord(plan, row, request, evidence) {
  const response = evidence.response;
  const validation =
    response.status === 'ok'
      ? validateNativeAnswers(response.answers, request, { distributionPolicy: 'bounded_rounding' })
      : null;
  return {
    kind: plan.recordKind ?? 'rich_template_pilot',
    runId: plan.stageId,
    id: row.id,
    protocolVersion: plan.protocolVersion,
    templateHash: plan.templateHash,
    planHash: plan.planHash,
    requestHash: row.requestHash,
    request,
    lineage: row.lineage,
    family: row.family,
    lengthTarget: row.lengthTarget,
    expected: row.expected,
    metadata: row.metadata,
    ...response,
    providerModel: evidence.reportedProviderModel ?? null,
    answers: response.answers ?? null,
    usage: response.usage ?? null,
    validation: plan.validation,
    parsed:
      validation?.tag === 'ok'
        ? { valid: true, diagnostics: validation.value }
        : { valid: false, error: validation?.error.code ?? response.error ?? response.status },
  };
}

/** Single-dispatch use case. Boundary supplies exclusive lock and durable, immutable writes. */
export async function runRichPilot({ plan, events, limit = 48, transportReview = null }, ports) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 48)
    return err('invalid_rich_invocation_limit');
  const replay = replayRichLedger(events);
  if (replay.tag === 'error') return replay;
  let ledger = replay.value,
    dispatchedNow = 0,
    recovered = 0;
  async function commit(event) {
    const complete = { ...event, sequence: ledger.sequence + 1 };
    const applied = applyRichEvent(ledger, complete);
    if (applied.tag === 'error') return applied;
    await ports.appendEvent(complete);
    ledger = applied.value;
    return ok(null);
  }
  async function finish(row, request, evidence, rawHash) {
    const projected = projectRichRecord(plan, row, request, evidence);
    await ports.writeRow(row, projected);
    const key = `${plan.stageId}:${row.id}`;
    if (!ledger.reservations[key].settled) {
      const settled = await commit({
        type: 'settle',
        key,
        requestHash: row.requestHash,
        rawHash,
        usage: evidence.response.usage ?? null,
        providerModel: evidence.reportedProviderModel ?? null,
        failed: projected.parsed.valid !== true,
        recordedAt: ports.now(),
      });
      if (settled.tag === 'error') return settled;
    }
    ports.progress?.({
      id: row.id,
      status: projected.status,
      valid: projected.parsed.valid,
      ...richBudgetStatus(ledger, plan.stageId),
    });
    return ok(null);
  }
  // Recover saved responses first. A reservation without raw evidence is never retried.
  for (const row of plan.rows) {
    const key = `${plan.stageId}:${row.id}`,
      prior = ledger.reservations[key];
    if (!prior) continue;
    if (prior.requestHash !== row.requestHash) return err('rich_resume_request_mismatch');
    const saved = await ports.loadRaw(row);
    if (!saved) {
      if (prior.settled) return err('rich_settled_raw_missing');
      const checked = verifyRichRequest(row, await ports.readBody(row), plan.model);
      if (checked.tag === 'error') return checked;
      await ports.writeUnknown(row, {
        ...projectRichRecord(plan, row, checked.value, {
          response: { status: 'unknown_interrupted_dispatch' },
        }),
        recordOrigin: 'derived_dispatch_tombstone',
        mayHaveReachedProvider: true,
        reservationRetained: true,
      });
      continue;
    }
    if (
      saved.evidence.key !== key ||
      saved.evidence.requestHash !== row.requestHash ||
      (prior.settled && saved.rawHash !== prior.settlement.rawHash)
    )
      return err('rich_saved_response_binding_mismatch');
    if (!prior.settled || !(await ports.hasRow(row))) {
      const checked = verifyRichRequest(row, await ports.readBody(row), plan.model);
      if (checked.tag === 'error') return checked;
      const finished = await finish(row, checked.value, saved.evidence, saved.rawHash);
      if (finished.tag === 'error') return finished;
      recovered++;
    }
  }
  // Review changes the halt only. The failed row, reservation and dispatch count stay intact.
  if (transportReview !== null) {
    const failedRow = plan.rows.find(
      (row) => `${plan.stageId}:${row.id}` === transportReview.failedKey,
    );
    const saved = failedRow ? await ports.loadRaw(failedRow) : null;
    const resumed = richTransportResumeEvent(plan, ledger, transportReview, saved);
    if (resumed.tag === 'error') return resumed;
    const committed = await commit({ ...resumed.value, recordedAt: ports.now() });
    if (committed.tag === 'error') return committed;
  }
  let stopReason = null;
  for (const row of plan.rows) {
    const key = `${plan.stageId}:${row.id}`;
    if (ledger.reservations[key]) continue;
    const status = richBudgetStatus(ledger, plan.stageId);
    if (status.haltedReason) {
      stopReason = status.haltedReason;
      break;
    }
    if (dispatchedNow >= limit) {
      stopReason = 'invocation_limit';
      break;
    }
    const checked = verifyRichRequest(row, await ports.readBody(row), plan.model);
    if (checked.tag === 'error') return checked;
    const reserved = await commit({
      type: 'reserve',
      key,
      stageId: plan.stageId,
      id: row.id,
      requestHash: row.requestHash,
      reservationNanoUsd: row.reservationNanoUsd,
      recordedAt: ports.now(),
    });
    if (reserved.tag === 'error') {
      stopReason = reserved.error.code;
      break;
    }
    dispatchedNow++;
    let received;
    try {
      received = await ports.infer(checked.value);
    } catch {
      received = {
        response: { status: 'error', error: 'rich_inference_exception', usage: null },
        reportedProviderModel: null,
      };
    }
    const evidence = { key, requestHash: row.requestHash, receivedAt: ports.now(), ...received };
    const rawHash = await ports.writeRaw(row, evidence);
    const finished = await finish(row, checked.value, evidence, rawHash);
    if (finished.tag === 'error') return finished;
    if (dispatchedNow < limit) await ports.pause?.();
  }
  const budget = richBudgetStatus(ledger, plan.stageId);
  const unknown = Object.values(ledger.reservations).filter(
    (r) => r.stageId === plan.stageId && !r.settled,
  ).length;
  return ok({
    status:
      stopReason || budget.haltedReason
        ? 'paused'
        : unknown
          ? 'complete_with_unknown_dispatches'
          : 'complete',
    reason: stopReason || budget.haltedReason,
    dispatchedNow,
    recovered,
    unknownDispatches: unknown,
    ...budget,
  });
}
