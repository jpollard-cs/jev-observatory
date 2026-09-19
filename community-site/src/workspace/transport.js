const workerPath = '/workspace/engine.js';
const workerURL = globalThis.trustedTypes
  ? trustedTypes
      .createPolicy('workspace-worker', {
        createScriptURL(value) {
          if (value !== workerPath) throw Error('Unknown workspace engine');
          return value;
        },
      })
      .createScriptURL(workerPath)
  : workerPath;
const worker = new Worker(workerURL, { type: 'module' });
const pending = new Map();
let sequence = 0;
let failed = false;
worker.onmessage = ({ data }) => {
  const call = pending.get(data.id);
  if (!call) return;
  pending.delete(data.id);
  clearTimeout(call.timer);
  data.ok ? call.resolve(data.value) : call.reject(Error(data.message));
};
worker.onerror = () => {
  failed = true;
  for (const call of pending.values()) {
    clearTimeout(call.timer);
    call.reject(
      Error('The browser workspace stopped. Reload to reopen it; exported files remain unchanged.'),
    );
  }
  pending.clear();
};
export function api(route, data) {
  if (failed)
    return Promise.reject(
      Error(
        'The local planning engine is unavailable. Reload after saving your draft. No model call was sent.',
      ),
    );
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        Error(
          'Local preparation took too long. No model call was sent. Review your draft and try again.',
        ),
      );
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, route, data });
  });
}
export function setToken() {}
