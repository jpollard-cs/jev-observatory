/** A serializable boundary result. Error contexts contain codes/IDs, never payloads or keys. */
export const ok = (value) => ({ tag: 'ok', value });

export const err = (code, { retryable = false, context = {} } = {}) => ({
  tag: 'error',
  error: { code, retryable, context },
});

export function unwrap(result) {
  if (result.tag === 'ok') return result.value;
  const error = new Error(result.error.code);
  error.details = result.error;
  throw error;
}
