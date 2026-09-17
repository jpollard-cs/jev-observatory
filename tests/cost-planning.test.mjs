import test from 'node:test';
import assert from 'node:assert/strict';
import { err } from '../harness/domain/result.mjs';
import { validatePanelResult } from '../harness/agent-panel-domain.mjs';
import {
  planRequestCasesResult,
  scanEvidenceSources,
  summarizeEvidence,
  estimateFromRatio,
} from '../harness/cost-planning.mjs';

test('panel and cost domain errors use the shared tagged Result contract', () => {
  assert.deepEqual(validatePanelResult(null, null), err('invalid_packet'));
  assert.deepEqual(
    planRequestCasesResult({ protocolVersion: 'unsupported' }),
    err('unsupported_protocol'),
  );
  const planned = planRequestCasesResult({
    model: 'fixture',
    protocolVersion: 'legacy-v2',
    manifest: { protocolHash: 'fixture', templateLineages: 1, evidenceStage: 'test' },
    plannedRequests: [
      {
        caseItem: {
          id: 'a',
          family: 'fixture',
          split: 'pilot',
          variant: 'benign',
          outputMode: 'binary',
          promptArm: 'minimal',
          contextChars: 10,
        },
        request: { state: 'synthetic', questions: { q: { type: 'choice' } } },
      },
    ],
  });
  assert.equal(planned.tag, 'ok');
  assert.equal(Object.hasOwn(planned, 'ok'), false);
  assert.equal(planned.value.cells, 1);
});

test('expiry diagnostics count toward spending but cannot calibrate corpus token/byte ratios', () => {
  const corpus = {
    runId: 'unit-test',
    model: 'jev',
    attempt: 1,
    status: 'ok',
    inputUtf8Bytes: 1000,
    usage: { inputTokens: 100, outputTokens: 1 },
    case: { outputMode: 'binary', promptArm: 'minimal', contextChars: 512 },
  };
  const diagnostic = {
    ...corpus,
    attempt: 2,
    kind: 'expiry_diagnostic',
    usage: { inputTokens: 9000, outputTokens: 2 },
  };
  const scan = scanEvidenceSources([
    {
      contents: [corpus, diagnostic].map(JSON.stringify).join('\n'),
      relative: 'fixture/raw.jsonl',
      modifiedAt: 'fixture',
      isDiagnostic: false,
    },
  ]);
  assert.deepEqual(
    scan.rows.map((row) => row.category),
    ['corpus_run', 'diagnostic'],
  );
  const accounting = summarizeEvidence(scan.rows);
  assert.equal(accounting.recordedRequests, 2);
  assert.equal(accounting.inputTokensKnown, 9100);
  const estimate = estimateFromRatio(scan.rows, {
    protocolVersion: 'advanced-v3',
    requestUtf8Bytes: 10000,
  });
  assert.equal(estimate.eligibleCorpusRequests, 1);
  assert.equal(estimate.diagnosticAndSpecialRequestsExcludedFromRatio, 1);
  assert.equal(estimate.inputTokensPerRequestByte, 0.1);
  assert.equal(estimate.estimatedFullRunInputTokens, 1000);
});
