// A tab-local credential port. Public status contains no credential or fingerprint.
export function createCredentialSession({
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
  ttlMs = 30 * 60 * 1000,
} = {}) {
  let key = '',
    expiresAt = 0,
    timer;
  const listeners = new Set();
  const notify = () => {
    for (const listener of listeners) listener({ ready: Boolean(key), expiresAt });
  };
  function forget() {
    if (timer !== undefined) cancel(timer);
    key = '';
    expiresAt = 0;
    timer = undefined;
    notify();
  }
  function status() {
    if (key && now() >= expiresAt) forget();
    return { ready: Boolean(key), expiresAt };
  }
  return Object.freeze({
    connect(value) {
      if (typeof value !== 'string' || value.trim().length < 8 || value.trim().length > 4096)
        throw Error(
          'Enter a valid API key format. It is checked with the provider only when you authorize a request.',
        );
      if (timer !== undefined) cancel(timer);
      key = value.trim();
      expiresAt = now() + ttlMs;
      timer = schedule(forget, ttlMs);
      timer?.unref?.();
      notify();
      return status();
    },
    status,
    forget,
    use(send) {
      if (!status().ready) throw Error('Add your Jev key to this tab session before running.');
      return send(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
