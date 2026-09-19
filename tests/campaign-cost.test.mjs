import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanEvidenceSources,
  summarizeEvidence,
  estimateFromRatio,
} from '../harness/cost-planning.mjs';

test('campaign financial events deduplicate by trial, retaining every phase but only matrix in corpus ratios', () => {
  const base = {
    campaignId: 'frozen-campaign',
    model: 'jev',
    configuredModel: 'jev-latest',
    attempt: 1,
    status: 'ok',
    inputUtf8Bytes: 1000,
    usage: { inputTokens: 100, outputTokens: 10 },
  };
  const rows = [
    { ...base, runId: 'frozen:matrix', trialId: 'matrix:a', phase: 'matrix' },
    { ...base, runId: 'frozen:matrix', trialId: 'matrix:b', phase: 'matrix' },
    { ...base, runId: 'frozen:smoke', trialId: 'smoke:a', phase: 'smoke' },
    {
      ...base,
      runId: 'frozen:representation',
      trialId: 'representation:a',
      phase: 'representation',
      kind: 'campaign_representation',
    },
    {
      ...base,
      runId: 'frozen:extensions',
      trialId: 'extensions:a',
      phase: 'extensions',
      kind: 'campaign_extension',
    },
  ];
  const scan = scanEvidenceSources([
    {
      contents: rows.map(JSON.stringify).join('\n'),
      relative: 'private/raw.jsonl',
      modifiedAt: 'fixture',
      isDiagnostic: false,
    },
    {
      contents: JSON.stringify(rows[0]),
      relative: 'export/raw.jsonl',
      modifiedAt: 'fixture',
      isDiagnostic: false,
    },
  ]);
  assert.equal(scan.duplicates, 1);
  assert.equal(scan.rows.length, 5);
  assert.deepEqual(
    scan.rows.map((row) => row.category),
    ['corpus_run', 'corpus_run', 'special_pilot', 'diagnostic', 'extension'],
  );
  assert.equal(summarizeEvidence(scan.rows).inputTokensKnown, 500);
  const estimate = estimateFromRatio(scan.rows, {
    protocolVersion: 'policy-v4',
    requestUtf8Bytes: 10000,
  });
  assert.equal(estimate.eligibleCorpusRequests, 2);
  assert.equal(estimate.requiresNewRatioCalibration, true);
});
