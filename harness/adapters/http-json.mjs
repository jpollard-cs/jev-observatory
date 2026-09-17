import { err, ok } from '../domain/result.mjs';

export function createHttpJsonTransport({
  fetchImpl = fetch,
  now = () => performance.now(),
  timeoutSignal = (milliseconds) => AbortSignal.timeout(milliseconds),
} = {}) {
  return {
    async postJson({ url, headers, body, timeoutMs }) {
      const started = now();
      const context = () => ({ latencyMs: now() - started });
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: timeoutSignal(timeoutMs),
        });
        if (!response.ok) {
          return err(`http_${response.status}`, {
            retryable: response.status === 429 || response.status >= 500,
            context: { ...context(), httpStatus: response.status },
          });
        }
        try {
          return ok({ data: await response.json(), ...context() });
        } catch {
          return err('invalid_provider_json', { context: context() });
        }
      } catch (error) {
        return err(error.name === 'TimeoutError' ? 'timeout' : 'transport_error', {
          retryable: true,
          context: context(),
        });
      }
    },
  };
}
