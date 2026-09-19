import { ENDPOINT } from './core.mjs';
// No SDK retries, redirects, arbitrary endpoint, request logging or raw error echo.
export async function callJev(
  request,
  apiKey,
  { fetchImpl = fetch, now = () => performance.now() } = {},
) {
  const began = now();
  try {
    const r = await fetchImpl(ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      await r.body?.cancel();
      return {
        reportedProviderModel: null,
        response: {
          status: 'error',
          error: `http_${r.status}`,
          usage: null,
          latencyMs: now() - began,
        },
      };
    }
    const reader = r.body.getReader(),
      chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw Error('oversized');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const x of chunks) {
      bytes.set(x, offset);
      offset += x.length;
    }
    const raw = new TextDecoder().decode(bytes);
    // Never persist an echoed bearer credential, even from a malformed provider response.
    if (raw.includes(apiKey)) throw Error('credential_echo');
    const data = JSON.parse(raw);
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
    return {
      reportedProviderModel: null,
      response: {
        status: 'error',
        error: e.name === 'TimeoutError' ? 'timeout' : 'transport_or_invalid_response',
        usage: null,
        latencyMs: now() - began,
      },
    };
  }
}
