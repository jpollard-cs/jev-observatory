import { ok, err } from './result.mjs';

const MODEL_ALIASES = new Set(['jev', 'luna', 'terra']);
const SPLITS = new Set(['pilot', 'calibration', 'test']);

/** Validate an evaluation allocation without environment, file or network access. */
export function planEvaluation(options, cases, protocol) {
  const { models, split, limit, repeats, maxRequests, maxCostUsd } = options;
  const validModels =
    models.length > 0 &&
    models.every((model) => MODEL_ALIASES.has(model)) &&
    new Set(models).size === models.length;
  const validCounts =
    Number.isInteger(limit) &&
    limit >= 2 &&
    Number.isInteger(repeats) &&
    repeats >= 1 &&
    Number.isInteger(maxRequests) &&
    maxRequests >= 1;
  if (
    !validModels ||
    !SPLITS.has(split) ||
    !validCounts ||
    !Number.isFinite(maxCostUsd) ||
    maxCostUsd <= 0
  ) {
    return err('invalid_evaluation_options');
  }
  const requests = cases.length * models.length * repeats;
  if (requests > maxRequests) {
    return err('request_allocation_exceeded', { context: { requests, maxRequests } });
  }
  return ok({
    models,
    split,
    cases: cases.length,
    repeats,
    requests,
    maxRequests,
    maxCostUsd,
    protocolHash: protocol.protocolHash,
    caseIds: cases.map((item) => item.id),
  });
}

/** Rotation changes model order without changing case contents. */
export function* evaluationSchedule(cases, endpoints, repeats) {
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    for (let index = 0; index < cases.length; index += 1) {
      for (let offset = 0; offset < endpoints.length; offset += 1) {
        yield {
          repeat,
          caseItem: cases[index],
          endpoint: endpoints[(index + repeat + offset) % endpoints.length],
        };
      }
    }
  }
}

export function usageExceedsReservation(endpoint, usage, reservation, controlOutputLimit) {
  if (!usage) return false;
  const cost =
    (usage.inputTokens * endpoint.inputPrice + usage.outputTokens * endpoint.outputPrice) / 1e6;
  return (
    cost > reservation ||
    (endpoint.transport !== 'typesafe_systemone' && usage.outputTokens > controlOutputLimit)
  );
}
