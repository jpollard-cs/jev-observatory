import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  summarizeQwenBaseline,
  summarizeEncodingDiagnostic,
} from '../harness/domain/followup-reports.mjs';
import { qwenHash, QWEN_MODEL, mapRichToQwen } from '../harness/domain/qwen-baseline.mjs';
import { buildRichPilotPlan } from '../harness/domain/rich-pilot-request.mjs';
import { buildEncodingDiagnostic } from '../harness/domain/encoding-diagnostic.mjs';
import { richPilotQueries } from '../harness/site-rich-pilot.mjs';
import { followupQueries } from '../harness/site-followups.mjs';

const root = new URL('../', import.meta.url);
const read = (file) => JSON.parse(fs.readFileSync(new URL(file, root), 'utf8'));
const templateText = fs.readFileSync(
  new URL('policies/prompt-injection-policy-template.md', root),
  'utf8',
);
const sourcePlan = buildRichPilotPlan({ templateText }).value;
const mapped = new Map(
  sourcePlan.rows.map((row) => [row.id, JSON.stringify(mapRichToQwen(row.request).value.request)]),
);
const plan = {
  ...sourcePlan,
  planHash: 'unit-test-plan',
  limitations: [],
  rows: sourcePlan.rows.map((row) => ({
    ...row,
    originalRequestHash: row.metadata.requestHash,
    requestHash: qwenHash(mapped.get(row.id)),
    inputTokens: 12000,
  })),
};
const jevCompletedCases = richPilotQueries(
  read('data/rich-pilot-report.json'),
  read('data/rich-pilot-repair-report.json'),
).rich_completed_cases;

function fixture() {
  const row = plan.rows[0];
  const expected = row.expected;
  const answers = {
    classification: expected.classification,
    injection_present: expected.injectionPresent,
    integrity: expected.integrity,
    poisoning_evidenced: expected.integrity === 'poisoned',
    policy_decision: expected.policyDecision,
    input_contract: expected.inputContract,
    interference_scope: 0,
  };
  const response = {
    model: QWEN_MODEL,
    choices: [
      { finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(answers) } },
    ],
    usage: {
      prompt_tokens: row.inputTokens,
      completion_tokens: 10,
      total_tokens: row.inputTokens + 10,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  };
  const exchange = {
    tag: 'ok',
    value: { httpStatus: 200, latencyMs: 1000, bodyText: JSON.stringify(response) },
  };
  const record = {
    planHash: plan.planHash,
    requestHash: row.requestHash,
    exchangeHash: qwenHash(exchange),
    answers: { classification: 'fabricated' },
  };
  const requestBody = mapped.get(row.id);
  return { plan, jevCompletedCases, evidence: { [row.id]: { exchange, record, requestBody } } };
}

test('partial comparisons recompute raw answers and keep unrun cases out of paired denominators', () => {
  const result = summarizeQwenBaseline(fixture());
  assert.equal(result.tag, 'ok');
  assert.equal(result.value.attempted, 1);
  assert.equal(result.value.valid, 1);
  assert.equal(result.value.rows.length, 48);
  assert.equal(result.value.status, 'partial');
  for (const question of result.value.perQuestion) {
    assert.equal(question.qwen.correct, 1);
    assert.equal(question.qwen.unavailable, 47);
    assert.equal(question.paired, 1);
  }
  const queries = followupQueries({ qwen: result.value });
  for (const question of queries.qwen_questions) {
    assert.equal(question.qwenRate, 1);
    assert.ok([0, 1].includes(question.jevRate));
  }
  const empty = summarizeQwenBaseline({ ...fixture(), evidence: {} }).value;
  assert.equal(followupQueries({ qwen: empty }).qwen_questions[0].qwenRate, null);
});

test('request, response and paired-gold mismatches fail closed', () => {
  const id = plan.rows[0].id;
  const modifiedRequest = fixture();
  modifiedRequest.evidence[id].requestBody += ' ';
  assert.equal(summarizeQwenBaseline(modifiedRequest).error.code, 'qwen_raw_binding_mismatch');
  const modifiedResponse = fixture();
  modifiedResponse.evidence[id].exchange.value.bodyText += ' ';
  assert.equal(summarizeQwenBaseline(modifiedResponse).error.code, 'qwen_raw_binding_mismatch');
  const modifiedGold = structuredClone(fixture());
  modifiedGold.plan.rows[0].expected.injectionPresent =
    !modifiedGold.plan.rows[0].expected.injectionPresent;
  assert.equal(summarizeQwenBaseline(modifiedGold).error.code, 'qwen_jev_gold_mismatch');
});

test('invalid generated output remains a failed attempt, never a repaired answer or missing case', () => {
  const input = fixture(),
    saved = input.evidence[plan.rows[0].id];
  const response = JSON.parse(saved.exchange.value.bodyText);
  response.choices[0].message.content = '```json\n' + response.choices[0].message.content + '\n```';
  saved.exchange.value.bodyText = JSON.stringify(response);
  saved.record.exchangeHash = qwenHash(saved.exchange);
  const result = summarizeQwenBaseline(input).value;
  assert.equal(result.attempted, 1);
  assert.equal(result.valid, 0);
  assert.equal(result.rows[0].status, 'schema_error');
  assert.equal(result.perQuestion[0].qwen.correct, 0);
  assert.equal(result.perQuestion[0].paired, 0);
});

test('encoding report verifies request identity before accepting native results', () => {
  const encodingPlan = buildEncodingDiagnostic({ templateText }).value.plan;
  const row = encodingPlan.rows[0];
  const result = summarizeEncodingDiagnostic({
    plan: encodingPlan,
    evidence: { [row.id]: { requestBody: '{}', raw: {}, rowRecord: {} } },
  });
  assert.equal(result.error.code, 'encoding_report_binding_mismatch');
  const empty = summarizeEncodingDiagnostic({ plan: encodingPlan, evidence: {} });
  assert.equal(empty.value.attempted, 0);
  assert.equal(empty.value.pairs.length, 16);
  assert.equal(empty.value.groups[0].classification.classification.accuracy, null);
});
