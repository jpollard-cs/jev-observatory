import { err, ok } from '../domain/result.mjs';
import { normalizeNativeAnswers } from '../domain/native-answers.mjs';

function reportedUsage(data, native) {
  const inputTokens = native ? data.usage?.input_tokens : data.usage?.prompt_tokens;
  const outputTokens = native ? data.usage?.output_tokens : data.usage?.completion_tokens;
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

async function sendRequest({ endpoint, request, timeoutMs }, transport) {
  return transport.postJson({
    url: endpoint.url,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${endpoint.apiKey}` },
    body: request,
    timeoutMs,
  });
}

export async function evaluateNativeRequest(
  { endpoint, request, timeoutMs = 60000 },
  { transport },
) {
  if (
    endpoint.transport !== 'typesafe_systemone' ||
    !request?.questions ||
    !Object.hasOwn(request, 'state')
  ) {
    return err('invalid_native_request');
  }
  const sent = await sendRequest(
    { endpoint, request: { ...request, model: endpoint.model }, timeoutMs },
    transport,
  );
  if (sent.tag === 'error') return sent;

  const { data, latencyMs } = sent.value;
  if (!data || typeof data !== 'object')
    return err('invalid_provider_envelope', { context: { latencyMs } });
  return ok({
    answers: data.answers ?? null,
    providerModel: typeof data.model === 'string' ? data.model : endpoint.model,
    usage: reportedUsage(data, true),
    latencyMs,
  });
}

export async function evaluateAssessment(
  { endpoint, request, caseItem, timeoutMs = 60000 },
  { transport, profiles },
) {
  if (endpoint.transport === 'typesafe_systemone') {
    const received = await evaluateNativeRequest({ endpoint, request, timeoutMs }, { transport });
    if (received.tag === 'error') return received;
    const evidence = received.value;
    const projected = normalizeNativeAnswers({
      data: { answers: evidence.answers },
      caseItem,
      request,
      profiles,
    });
    const { answers, ...measurements } = evidence;
    if (projected.tag === 'error') {
      // HTTP succeeded: retain billable usage and raw answers even when typing failed.
      return ok({
        ...measurements,
        output: null,
        nativeAnswers: answers,
        nativeValidationError: projected.error.code,
        validationIssue: projected.error,
        finishReason: null,
      });
    }
    return ok({ ...measurements, ...projected.value, finishReason: null });
  }

  const received = await sendRequest({ endpoint, request, timeoutMs }, transport);
  if (received.tag === 'error') return received;
  const { data, latencyMs } = received.value;
  const choice = data?.choices?.[0];
  if (typeof choice?.message?.content !== 'string')
    return err('missing_text_content', { context: { latencyMs } });
  return ok({
    output: choice.message.content,
    finishReason: choice.finish_reason || null,
    usage: reportedUsage(data, false),
    providerModel: typeof data.model === 'string' ? data.model : endpoint.model,
    latencyMs,
  });
}
