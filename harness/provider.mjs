/** Compatibility composition root for existing CLI and promptfoo callers. */
import { structuredSchema, scoresSchema } from './schema.mjs';
import { profiles } from './corpus.mjs';
import { buildTypeSafeRequest } from './typesafe.mjs';
import { buildMessages } from './prompt.mjs';
import { unwrap } from './domain/result.mjs';
import { resolveEndpoint } from './adapters/endpoint-environment.mjs';
import { createHttpJsonTransport } from './adapters/http-json.mjs';
import { evaluateAssessment, evaluateNativeRequest } from './application/inference.mjs';

export function readEndpoint(name, environment = process.env) {
  return unwrap(resolveEndpoint(name, environment));
}

export function requestPayload(endpoint, caseItem, maxOutputTokens = 600) {
  if (endpoint.transport === 'typesafe_systemone') {
    return buildTypeSafeRequest(caseItem, endpoint.model, {
      version: endpoint.nativeRequestVersion,
    });
  }
  const request = {
    model: endpoint.model,
    messages: buildMessages(caseItem),
    [endpoint.tokenLimitField]: maxOutputTokens,
  };
  if (endpoint.constrainedOutput && caseItem.outputMode !== 'binary') {
    const schema =
      caseItem.outputMode === 'scores'
        ? scoresSchema
        : { ...structuredSchema, required: Object.keys(structuredSchema.properties) };
    request.response_format = {
      type: 'json_schema',
      json_schema: { name: 'assessment', strict: true, schema },
    };
  }
  return request;
}

export function reservationUsd(endpoint, request, outputTokenReservation) {
  const inputByteReservation = Buffer.byteLength(JSON.stringify(request), 'utf8') + 256;
  return (
    (inputByteReservation * endpoint.inputPrice + outputTokenReservation * endpoint.outputPrice) /
    1e6
  );
}

function legacyResponse(result) {
  if (result.tag === 'ok') return { status: 'ok', ...result.value };
  return {
    status: 'error',
    error: result.error.code,
    issue: result.error,
    latencyMs: result.error.context.latencyMs ?? null,
  };
}

export async function inferTypeSafeRequest({
  endpoint,
  request,
  timeoutMs = 60000,
  fetchImpl = fetch,
  transport,
}) {
  const result = await evaluateNativeRequest(
    { endpoint, request, timeoutMs },
    { transport: transport || createHttpJsonTransport({ fetchImpl }) },
  );
  return legacyResponse(result);
}

export async function infer({
  endpoint,
  messages,
  caseItem,
  maxOutputTokens = 600,
  timeoutMs = 60000,
  fetchImpl = fetch,
  transport,
}) {
  if (endpoint.transport === 'typesafe_systemone' && !caseItem) {
    return legacyResponse({
      tag: 'error',
      error: { code: 'native_case_required', retryable: false, context: {} },
    });
  }
  const request = caseItem
    ? requestPayload(endpoint, caseItem, maxOutputTokens)
    : {
        model: endpoint.model,
        messages,
        [endpoint.tokenLimitField]: maxOutputTokens,
      };
  const result = await evaluateAssessment(
    { endpoint, request, caseItem, timeoutMs },
    { transport: transport || createHttpJsonTransport({ fetchImpl }), profiles },
  );
  return legacyResponse(result);
}
