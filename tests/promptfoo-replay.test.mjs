import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import FrozenOutputReplayProvider from '../harness/promptfoo-replay-provider.mjs';
import {
  buildReplayPacket,
  replayMetrics,
  isolatedReplayEnvironment,
  prepareReplay,
} from '../scripts/promptfoo-replay.mjs';
import { replayScopes, scoreReplayScope } from '../harness/promptfoo-replay-assertion.mjs';

const caseItem = {
  id: 'fixture',
  family: 'fixture',
  outputMode: 'structured',
  promptArm: 'policy',
  policyProfile: 'balanced',
  task: 'classification',
  expected: { label: 'attack', decision: 'block', policyIds: ['P001'] },
};
const output = JSON.stringify({
  label: 'abstain',
  attack_probability: 0.5,
  poison_probability: 0.1,
  uncertainty: 0.4,
  decision: 'block',
  violations: [{ policy_id: 'P001', reason: 'untrusted_instruction' }],
  judge_verdict: null,
});
const row = (id, extra = {}) => ({
  runId: 'frozen',
  trialId: id,
  requestHash: 'recorded-request-hash',
  case: { ...caseItem, id },
  status: 'ok',
  output,
  ...extra,
});

test('replay provider returns frozen outputs and original errors without an inference path', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-replay-test-'));
  try {
    const packet = buildReplayPacket([
      row('a'),
      row('b', { status: 'error', error: 'timeout', output: null }),
      row('c', { output: null }),
    ]);
    const body = JSON.stringify(packet);
    const packetPath = path.join(directory, 'packet.json');
    fs.writeFileSync(packetPath, body);
    const provider = new FrozenOutputReplayProvider({
      config: { packetPath, packetHash: createHash('sha256').update(body).digest('hex') },
    });
    const savedFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail('replay attempted inference');
    try {
      const success = await provider.callApi('unused', {
        vars: { replayId: packet.records[0].id },
      });
      assert.equal(success.output, output);
      assert.equal(success.metadata.newModelCalls, 0);
      assert.equal(success.cost, 0);
      assert.equal(
        (await provider.callApi('unused', { vars: { replayId: packet.records[1].id } })).error,
        'timeout',
      );
      assert.equal(
        (await provider.callApi('unused', { vars: { replayId: packet.records[2].id } })).output,
        null,
      );
    } finally {
      globalThis.fetch = savedFetch;
    }
    fs.appendFileSync(packetPath, ' ');
    assert.throws(
      () => new FrozenOutputReplayProvider({ config: { packetPath, packetHash: 'original' } }),
      /replay_packet_hash_mismatch/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('scoped checks do not use classification abstention to hide a correct policy judgment', () => {
  const reasons = { P001: 'untrusted_instruction' };
  assert.equal(scoreReplayScope(output, caseItem, 'classification', reasons).pass, false);
  assert.equal(scoreReplayScope(output, caseItem, 'policy_decision', reasons).pass, true);
  assert.equal(scoreReplayScope(output, caseItem, 'policy_reason_codes', reasons).pass, true);
  assert.deepEqual(replayScopes({ ...caseItem, promptArm: 'minimal' }), [
    'format',
    'classification',
  ]);
  assert.deepEqual(replayScopes({ ...caseItem, outputMode: 'scores' }), [
    'format',
    'classification',
  ]);
  assert.ok(replayScopes({ ...caseItem, task: 'judge' }).includes('judge_verdict'));
});

test('all-attempt replay denominators retain source errors and malformed outputs', () => {
  const packet = buildReplayPacket([
    row('a'),
    row('b', { status: 'error', error: 'timeout' }),
    row('c', { output: 'malformed' }),
  ]);
  const policy = replayMetrics(packet).find((metric) => metric.scope === 'policy_decision');
  assert.equal(policy.eligibleAttempts, 3);
  assert.equal(policy.originalProviderErrors, 1);
  assert.equal(policy.passed, 1);
  assert.equal(policy.allAttemptPassRate, 1 / 3);
});

test('isolated config carries no credentials, remote providers, grader calls or adaptive plugins', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-replay-config-'));
  try {
    const environment = isolatedReplayEnvironment(directory, {
      PATH: '/mock/path',
      TYPESAFE_API_KEY: 'secret',
      OPENAI_API_KEY: 'secret',
      NODE_OPTIONS: '--import credentials',
      HTTP_PROXY: 'secret',
    });
    assert.equal(environment.TYPESAFE_API_KEY, undefined);
    assert.equal(environment.OPENAI_API_KEY, undefined);
    assert.equal(environment.NODE_OPTIONS, undefined);
    assert.equal(environment.HTTP_PROXY, undefined);
    assert.equal(environment.PROMPTFOO_DISABLE_REMOTE_GENERATION, 'true');
    prepareReplay(directory, buildReplayPacket([row('a')]));
    const config = JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8'));
    assert.equal(config.providers.length, 1);
    assert.ok(config.providers[0].id.endsWith('/harness/promptfoo-replay-provider.mjs'));
    assert.ok(config.tests[0].assert.every((assertion) => assertion.type === 'javascript'));
    assert.equal(config.redteam, undefined);
    assert.equal(config.sharing, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
