import { ENDPOINT } from './jev-contract.mjs';
// No SDK retries, redirects, arbitrary endpoint, request logging or raw error echo.
export async function callJev(
  request,
  apiKey,
  { fetchImpl = fetch, now = () => performance.now() } = {},
) {
  const began = now();
  let phase = 'request_setup',
    httpStatus = null,
    receivedBytes = 0;
  const failure = (error) => ({
    reportedProviderModel: null,
    response: {
      status: 'error',
      error,
      usage: null,
      latencyMs: now() - began,
      diagnostics: { phase, httpStatus, receivedBytes },
    },
  });
  try {
    const options = {
      method: 'POST',
      // workerd rejects redirect: 'error' before dispatch. Manual mode also
      // prevents credentials reaching a redirect destination; reject 3xx below.
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60000),
    };
    phase = 'awaiting_response';
    const r = await fetchImpl(ENDPOINT, options);
    httpStatus = r.status;
    phase = 'response_status';
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      return failure(r.status >= 300 && r.status < 400 ? 'redirect_blocked' : `http_${r.status}`);
    }
    phase = 'response_body';
    if (!r.body) return failure('empty_provider_response');
    const reader = r.body.getReader(),
      chunks = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > 2 * 1024 * 1024) {
        await reader.cancel().catch(() => {});
        return failure('provider_response_too_large');
      }
      chunks.push(value);
    }
    if (!receivedBytes) return failure('empty_provider_response');
    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const x of chunks) {
      bytes.set(x, offset);
      offset += x.length;
    }
    const raw = new TextDecoder().decode(bytes);
    // Never persist an echoed bearer credential, even from a malformed provider response.
    if (raw.includes(apiKey)) return failure('credential_echo_rejected');
    phase = 'response_json';
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return failure('invalid_provider_shape');
    return {
      reportedProviderModel: typeof data.model === 'string' ? data.model : null,
      response: {
        status: 'ok',
        answers: data.answers ?? null,
        usage: {
          inputTokens: data.usage?.input_tokens ?? null,
          outputTokens: data.usage?.output_tokens ?? null,
        },
        latencyMs: now() - began,
      },
    };
  } catch (e) {
    // Only fixed codes and numeric transport metadata enter saved evidence.
    // Exception messages and provider bodies can contain credentials or payloads.
    return failure(
      e?.name === 'TimeoutError'
        ? 'timeout'
        : {
            request_setup: 'request_setup_failed',
            awaiting_response: 'transport_error',
            response_status: 'invalid_http_response',
            response_body: 'response_read_failed',
            response_json: 'invalid_provider_json',
          }[phase],
    );
  }
}
