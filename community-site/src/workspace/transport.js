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
worker.onmessage = ({ data }) => {
  const call = pending.get(data.id);
  if (!call) return;
  pending.delete(data.id);
  data.ok ? call.resolve(data.value) : call.reject(Error(data.message));
};
worker.onerror = () => {
  for (const call of pending.values())
    call.reject(
      Error('The browser workspace stopped. Reload to reopen it; exported files remain unchanged.'),
    );
  pending.clear();
};
export function api(route, data) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, route, data });
  });
}
export function setToken() {}
