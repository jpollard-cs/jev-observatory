import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../harness/application/evaluate.mjs';
import { planEvaluation } from '../harness/domain/evaluation-plan.mjs';

const cases = [{ id: 'a', outputMode: 'binary' }, { id: 'b', outputMode: 'binary' }];
const endpoint = { alias: 'jev', model: 'test-only', transport: 'typesafe_systemone', inputPrice: 1, outputPrice: 0 };
const options = { models: ['jev'], split: 'pilot', limit: 2, repeats: 1, maxRequests: 2, maxCostUsd: 0.05 };
const plan = planEvaluation(options, cases, { protocolHash: 'frozen' }).value;
const specification = { plan, cases, endpoints: [endpoint], design: { maxOutputTokens: 10, timeoutMs: 10 }, runId: 'test', trustedContextHash: 'trusted' };

function boundary(response, reservation = 0.01) {
  const events = [];
  return { events, ports: {
    prepareRequest: (_endpoint, item) => ({ state: { id: item.id } }), reserve: () => reservation,
    infer: async () => { events.push('infer'); return response; },
    parseOutput: output => ({ valid: output === 'benign', value: { label: output } }),
    hash: () => 'request-hash', byteLength: text => text.length, now: () => 'fixed-time',
    startRun: () => events.push('start'), record: row => events.push(row), progress: () => {},
  } };
}

test('over-budget allocation makes no model or storage calls', async () => {
  const { events, ports } = boundary({ status: 'ok', output: 'benign' }, 0.03);
  const result = await evaluate(specification, ports);
  assert.equal(result.error.code, 'cost_allocation_exceeded');
  assert.deepEqual(events, []);
});

test('provider failures remain recorded and are never automatically retried', async () => {
  const { events, ports } = boundary({ status: 'error', error: 'http_503' });
  const result = await evaluate(specification, ports);
  assert.equal(result.tag, 'ok');
  assert.equal(events.filter(event => event === 'infer').length, 2);
  const records = events.filter(event => typeof event === 'object');
  assert.equal(records.length, 2);
  assert.ok(records.every(record => record.status === 'error' && record.parsed === null));
  assert.deepEqual(records.map(record => record.request.state.id), ['a', 'b']);
});

test('usage breach is persisted before stopping further requests', async () => {
  const { events, ports } = boundary({ status: 'ok', output: 'benign', usage: { inputTokens: 20000, outputTokens: 4000 } });
  const result = await evaluate(specification, ports);
  assert.equal(result.error.code, 'provider_usage_exceeded_reservation');
  assert.equal(events.filter(event => event === 'infer').length, 1);
  assert.equal(events.filter(event => typeof event === 'object').length, 1);
});

test('request caps and invalid limits are rejected as domain results', () => {
  assert.equal(planEvaluation({ ...options, maxRequests: 1 }, cases, {}).error.code, 'request_allocation_exceeded');
  assert.equal(planEvaluation({ ...options, limit: NaN }, cases, {}).error.code, 'invalid_evaluation_options');
});
