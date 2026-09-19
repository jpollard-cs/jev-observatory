/**
 * JsonTransport port (structural interface, no framework dependency).
 *
 * postJson({url, headers, body, timeoutMs}) -> Promise<Result<{
 *   data: unknown, latencyMs: number
 * }>>
 *
 * Transport errors expose safe codes, retryability and timing/status context.
 * The port never retries, logs secrets, interprets policies, or classifies state.
 */
export const JSON_TRANSPORT_PORT_VERSION = 1;
