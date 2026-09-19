import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createExtensionControls, runCommandResult } from '../scripts/extension-controls.mjs';
import {
  importExtensionControlsResult,
  validateExtensionControlPacketResult,
  controlDigest,
} from '../harness/domain/extension-controls.mjs';
function prepared() {
  const { packet, manifest } = createExtensionControls({ now: 'fixture-time' });
  const gold = new Map(manifest.records.map((record) => [record.id, record]));
  const submission = {
    packetHash: packet.packetHash,
    responses: packet.records.map((record) => ({
      id: record.id,
      requestHash: record.requestHash,
      answers: Object.fromEntries(
        Object.entries(gold.get(record.id).expected).map(([key, value]) => [
          key,
          typeof value === 'boolean' ? Number(value) : value,
        ]),
      ),
    })),
  };
  return {
    packet,
    manifest,
    submission,
    model: 'gpt-5.6-luna',
    isolated: true,
    now: 'fixture-time',
  };
}
const imported = (input) => {
  const result = importExtensionControlsResult(input);
  assert.equal(result.tag, 'ok');
  return result.value;
};
test('new packet is blinded and native state/instructions/criteria remain exactly equal', () => {
  const { packet, manifest } = prepared();
  assert.equal(packet.records.length, 16);
  assert.equal(new Set(manifest.records.map((record) => record.lineageId)).size, 8);
  assert.equal(validateExtensionControlPacketResult(packet, manifest).tag, 'ok');
  for (const record of packet.records) {
    assert.deepEqual(Object.keys(record).sort(), ['id', 'requestHash', 'requestText']);
    assert.match(record.id, /^[a-f0-9]{24}$/);
    const privateRecord = manifest.records.find((item) => item.id === record.id),
      text = JSON.parse(record.requestText);
    assert.deepEqual(text.state, privateRecord.nativeSemantics.state);
    for (const [id, question] of Object.entries(privateRecord.nativeSemantics.questions)) {
      assert.deepEqual(text.questions[id].instructions, question.instructions);
      assert.deepEqual(text.questions[id].criteria, question.criteria);
    }
    for (const hidden of [
      'expected',
      'lineageId',
      'sourceCaseId',
      'split',
      'pairId',
      'annotationStatus',
    ])
      assert(!record.requestText.includes(`"${hidden}"`));
    assert(!record.requestText.includes(privateRecord.sourceCaseId));
    assert.equal(record.requestHash, controlDigest(record.requestText));
  }
});
test('strict import preserves all 16 responses, eight paired outcomes and runtime unknowns', () => {
  const input = prepared();
  input.submission.responses.reverse();
  const result = imported(input);
  assert.equal(result.source, 'codex_subagent');
  assert.equal(result.summary.judgeCorrect, 16);
  assert.equal(result.summary.attack.correct, 16);
  assert.equal(result.summary.uniqueScenarioLineages, 8);
  assert.equal(result.pairedContextComparison.pairs, 8);
  assert.equal(result.pairedContextComparison.bothCorrect, 8);
  for (const field of [
    'exactWeights',
    'providerVersion',
    'samplingParameters',
    'usage',
    'latencyMs',
    'costUsd',
  ])
    assert.equal(result.modelIdentity[field], null);
  assert.equal(result.measurementContract.poolWithDirectApiRows, false);
  assert.equal(result.isolation.forkTurns, 'none');
  assert.equal(result.isolation.independentlyVerifiedByImporter, false);
  assert(
    result.records.every(
      (record) => !Object.hasOwn(record, 'case') && !Object.hasOwn(record, 'model'),
    ),
  );
});
test('missing, duplicate, unknown, wrong-hash and extra-envelope records are rejected', () => {
  for (const mutate of [
    (input) => input.submission.responses.pop(),
    (input) => input.submission.responses.push(structuredClone(input.submission.responses[0])),
    (input) => (input.submission.responses[0].id = '000000000000000000000000'),
    (input) => (input.submission.responses[0].requestHash = 'wrong'),
    (input) => (input.submission.packetHash = 'wrong'),
    (input) => (input.submission.responses[0].extra = 'not-allowed'),
  ]) {
    const input = prepared();
    mutate(input);
    assert.equal(importExtensionControlsResult(input).tag, 'error');
  }
});
test('packet/manifest/request drift fails rather than being silently rebuilt', () => {
  const first = prepared();
  first.packet.records[0].requestText += 'changed';
  assert.equal(importExtensionControlsResult(first).tag, 'error');
  const second = prepared();
  second.manifest.records[0].expected.decision = 'fail';
  second.manifest.records[0].expected.attack_present =
    !second.manifest.records[0].expected.attack_present;
  assert.equal(importExtensionControlsResult(second).tag, 'error');
  const third = prepared();
  third.manifest.records[0].nativeSemantics.questions.decision.instructions.question += ' Changed.';
  const { manifestHash, ...body } = third.manifest;
  third.manifest.manifestHash = controlDigest(body);
  assert.equal(importExtensionControlsResult(third).error.code, 'native_control_semantic_mismatch');
});
test('malformed fields remain in all-attempt metrics without changing other question values', () => {
  const input = prepared();
  input.submission.responses[0].answers.attack_present = 2;
  input.submission.responses[1].answers = '```json\n{}\n```';
  const result = imported(input);
  assert.equal(result.summary.n, 16);
  assert.equal(result.summary.valid, 14);
  assert.equal(result.summary.malformed, 2);
  assert.equal(result.summary.judgeCorrect, 15);
  assert.equal(result.summary.judgeUnresolved, 1);
  assert.equal(result.summary.attack.correct, 14);
  assert.equal(result.summary.attack.unresolved, 2);
  assert.equal(result.summary.judgeAccuracyAllAttempts, 15 / 16);
  assert.equal(result.records[0].rawAnswers.attack_present, 2);
});
test('context pair counts distinguish short-only and expanded-only correctness', () => {
  const input = prepared();
  const lineages = [...new Set(input.manifest.records.map((record) => record.lineageId))];
  for (const [index, lineage] of lineages.slice(0, 2).entries()) {
    const pair = input.manifest.records
      .filter((record) => record.lineageId === lineage)
      .sort(
        (a, b) => a.counts.messages + a.counts.resources - (b.counts.messages + b.counts.resources),
      );
    const record = pair[index === 0 ? 1 : 0];
    input.submission.responses.find((response) => response.id === record.id).answers.decision =
      record.expected.decision === 'pass' ? 'fail' : 'pass';
  }
  const result = imported(input).pairedContextComparison;
  assert.equal(result.bothCorrect, 6);
  assert.equal(result.shortOnlyCorrect, 1);
  assert.equal(result.expandedOnlyCorrect, 1);
  assert.equal(result.neitherCorrect, 0);
});
test('imports require supported explicit model and isolation attestation', () => {
  assert.equal(
    importExtensionControlsResult({ ...prepared(), model: 'unknown' }).error.code,
    'unsupported_control_model',
  );
  assert.equal(
    importExtensionControlsResult({ ...prepared(), isolated: false }).error.code,
    'control_isolation_attestation_required',
  );
});
test('export writes only new packet/manifest and never overwrites frozen evidence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-controls-test-'));
  try {
    assert.equal(runCommandResult('export', { out: directory }).tag, 'ok');
    assert.deepEqual(fs.readdirSync(directory).sort(), ['manifest.json', 'packet.json']);
    const before = fs.readFileSync(path.join(directory, 'packet.json'), 'utf8');
    assert.equal(
      runCommandResult('export', { out: directory }).error.code,
      'control_packet_output_exists',
    );
    assert.equal(fs.readFileSync(path.join(directory, 'packet.json'), 'utf8'), before);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
