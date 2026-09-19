import test from 'node:test';
import assert from 'node:assert/strict';

test('planner failure rejects pending and future work instead of leaving a spinner forever', async () => {
  let worker;
  const previous = globalThis.Worker;
  globalThis.Worker = class {
    sent = [];
    constructor() {
      worker = this;
    }
    postMessage(value) {
      this.sent.push(value);
    }
  };
  try {
    const { api } = await import('../src/workspace/transport.js?failure-test');
    const first = api('setup/prepare', {});
    const second = api('selection/prepare', {});
    const failures = Promise.all([
      assert.rejects(first, /workspace stopped/),
      assert.rejects(second, /workspace stopped/),
    ]);
    worker.onerror();
    await failures;
    await assert.rejects(api('setup/prepare', {}), /unavailable/);
    assert.equal(worker.sent.length, 2, 'failed worker must not receive another request');
  } finally {
    globalThis.Worker = previous;
  }
});

test('out-of-order planner responses remain bound to their initiating requests', async () => {
  let worker;
  const previous = globalThis.Worker;
  globalThis.Worker = class {
    sent = [];
    constructor() {
      worker = this;
    }
    postMessage(value) {
      this.sent.push(value);
    }
  };
  try {
    const { api } = await import('../src/workspace/transport.js?ordering-test');
    const first = api('setup/prepare', {}),
      second = api('selection/plan', {});
    worker.onmessage({ data: { id: worker.sent[1].id, ok: true, value: 'coverage' } });
    worker.onmessage({ data: { id: worker.sent[0].id, ok: true, value: 'policy' } });
    assert.deepEqual(await Promise.all([first, second]), ['policy', 'coverage']);
  } finally {
    globalThis.Worker = previous;
  }
});
