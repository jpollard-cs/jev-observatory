import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedRemote } from '../src/workspace/hosted-transport.js';

test('blocked authorization retains its specific cause and never retries', async () => {
  let calls = 0;
  await assert.rejects(
    hostedRemote(
      'runs/example/start',
      { confirmPaid: true },
      {
        fetchImpl: async () => {
          calls++;
          return Response.json(
            { error: 'unresolved_run', message: 'An earlier stopped run holds $0.00240.' },
            { status: 409 },
          );
        },
      },
    ),
    (e) => e.code === 'unresolved_run' && e.status === 409 && /0.00240/.test(e.message),
  );
  assert.equal(calls, 1);
});

test('a hanging hosted response ends with status-refresh guidance and no automatic replay', async () => {
  let calls = 0;
  await assert.rejects(
    hostedRemote(
      'runs/example/step',
      {},
      {
        timeoutMs: 10,
        fetchImpl: (_, { signal }) =>
          new Promise((resolve, reject) => {
            calls++;
            signal.addEventListener('abort', () => reject(Error('aborted')));
          }),
      },
    ),
    /Refresh saved status/,
  );
  assert.equal(calls, 1);
});
