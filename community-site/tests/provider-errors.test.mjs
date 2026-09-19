import test from 'node:test';
import assert from 'node:assert/strict';
import { callJev } from '../src/hosted/provider.mjs';
import { canReviewAdvice, failureDescription } from '../src/workspace/hosted-evidence.js';
const key = 'synthetic-provider-error-test-key';
test('transport failures preserve their phase without persisting untrusted error text', async () => {
  for (const [fetchImpl, expected, phase] of [
    [
      async () => {
        throw Error(key);
      },
      'transport_error',
      'awaiting_response',
    ],
    [
      async () => {
        throw new DOMException(key, 'TimeoutError');
      },
      'timeout',
      'awaiting_response',
    ],
    [async () => new Response('broken ' + 'JSON'), 'invalid_provider_json', 'response_json'],
    [async () => new Response(null, { status: 204 }), 'empty_provider_response', 'response_body'],
    [async () => Response.json(null), 'invalid_provider_shape', 'response_json'],
    [
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(Error(key));
            },
          }),
        ),
      'response_read_failed',
      'response_body',
    ],
    [
      async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
      'provider_response_too_large',
      'response_body',
    ],
    [
      async () =>
        new Response(
          new ReadableStream({
            cancel() {
              throw Error(key);
            },
          }),
          { status: 403 },
        ),
      'http_403',
      'response_status',
    ],
  ]) {
    let calls = 0;
    const evidence = await callJev({}, key, {
      fetchImpl: async (...args) => {
        calls++;
        return fetchImpl(...args);
      },
    });
    assert.equal(evidence.response.error, expected);
    assert.equal(evidence.response.diagnostics.phase, phase);
    assert.equal(evidence.response.usage, null);
    assert.equal(calls, 1, 'Errors must not automatically retry paid requests');
    assert.ok(!JSON.stringify(evidence).includes(key));
  }
});
test('failed advisor reports are inspectable but cannot be offered as usable suggestions', () => {
  const report = {
    protocol: 'catalog-advisor-report/1',
    status: 'complete',
    rows: [{ valid: true }],
  };
  assert.equal(canReviewAdvice(report), true);
  assert.equal(canReviewAdvice({ ...report, status: 'stopped' }), false);
  assert.equal(canReviewAdvice({ ...report, rows: [] }), false);
  assert.equal(canReviewAdvice({ ...report, rows: [{ valid: false }] }), false);
  assert.equal(canReviewAdvice(null), false);
  assert.match(failureDescription('transport_or_invalid_response'), /older run/);
  assert.ok(!failureDescription(key).includes(key));
});
