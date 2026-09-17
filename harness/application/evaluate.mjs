import { ok, err } from '../domain/result.mjs';
import { evaluationSchedule, usageExceedsReservation } from '../domain/evaluation-plan.mjs';

/**
 * Application use case. Effects enter through ports supplied by the CLI.
 * Expected budget/provider outcomes are values; storage faults reach the composition boundary.
 * No retries, detector assistance, hidden rewrites, or repair of model answers.
 */
export async function evaluate(
  { plan, cases, endpoints, design, runId, trustedContextHash },
  ports,
) {
  // Reserve the whole allocation without retaining thousands of serialized long contexts.
  let totalReservation = 0;
  for (const trial of evaluationSchedule(cases, endpoints, plan.repeats)) {
    const request = ports.prepareRequest(trial.endpoint, trial.caseItem, design.maxOutputTokens);
    totalReservation += ports.reserve(trial.endpoint, request, design.maxOutputTokens);
  }
  if (totalReservation > plan.maxCostUsd) {
    return err('cost_allocation_exceeded', {
      context: { reservationUsd: totalReservation, maximumUsd: plan.maxCostUsd },
    });
  }
  await ports.startRun({
    ...plan,
    runId,
    startedAt: ports.now(),
    costReservationUsd: totalReservation,
    authorizedPolicyContextHash: trustedContextHash,
    controlMaxOutputTokens: design.maxOutputTokens,
    nativeOutputTokenLimit: null,
    nativeOutputReservationTokens: design.maxOutputTokens,
    models: endpoints.map(
      ({
        alias,
        model,
        transport,
        constrainedOutput,
        inputPrice,
        outputPrice,
        nativeRequestVersion,
      }) => ({
        alias,
        model,
        transport,
        constrainedOutput,
        inputPrice,
        outputPrice,
        nativeRequestVersion,
      }),
    ),
    budgetCaveat:
      'Byte-based reservations are planning allowances, not provider billing guarantees. Native TypeSafe has no documented output-token cap. Provider account limits are required for a hard monetary ceiling.',
  });
  let attempted = 0;
  let reserved = 0;
  for (const { endpoint, caseItem, repeat } of evaluationSchedule(cases, endpoints, plan.repeats)) {
    const request = ports.prepareRequest(endpoint, caseItem, design.maxOutputTokens);
    const reservation = ports.reserve(endpoint, request, design.maxOutputTokens);
    if (attempted >= plan.maxRequests || reserved + reservation > plan.maxCostUsd) {
      return err('live_allocation_exhausted', { context: { attempted, reservedUsd: reserved } });
    }
    attempted += 1;
    reserved += reservation;
    const response = await ports.infer({
      endpoint,
      caseItem,
      outputMode: caseItem.outputMode,
      maxOutputTokens: design.maxOutputTokens,
      timeoutMs: design.timeoutMs,
    });
    const parsed =
      response.status === 'ok' ? ports.parseOutput(response.output, caseItem.outputMode) : null;
    const serializedRequest = JSON.stringify(request);
    const record = {
      runId,
      model: endpoint.alias,
      configuredModel: endpoint.model,
      transport: endpoint.transport,
      nativeRequestVersion: endpoint.nativeRequestVersion ?? null,
      constrainedOutput: endpoint.constrainedOutput,
      repeat,
      attempt: attempted,
      case: caseItem,
      request,
      inputChars: serializedRequest.length,
      inputUtf8Bytes: ports.byteLength(serializedRequest),
      requestHash: ports.hash(serializedRequest),
      ...response,
      parsed,
    };
    // Persist every outcome before checking usage or stopping the run.
    await ports.record(record);
    ports.progress({
      attempt: attempted,
      total: plan.requests,
      model: endpoint.alias,
      caseId: caseItem.id,
      status: response.status,
      valid: parsed?.valid ?? false,
    });
    if (usageExceedsReservation(endpoint, response.usage, reservation, design.maxOutputTokens)) {
      return err('provider_usage_exceeded_reservation', {
        context: { attempted, caseId: caseItem.id },
      });
    }
  }
  return ok({ attempted, reservedUsd: reserved, runId });
}
