import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildRichPilotPlan } from '../harness/domain/rich-pilot-request.mjs';
import {
  compactSource,
  priorAnswersResult,
  COMPACT_PROTOCOL,
} from '../harness/domain/compact-experiment.mjs';
import { richHash } from '../harness/application/rich-pilot-run.mjs';
import { unwrap } from '../harness/domain/result.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const reference = unwrap(
  buildRichPilotPlan({ templateText: read('policies/prompt-injection-policy-template.md') }),
);
const guide = JSON.parse(read('policies/classifier-guide-v3-compact.draft.json'));
const mode = JSON.parse(read('policies/classifier-second-pass-v1.draft.json'));
function answers(request) {
  return Object.fromEntries(
    Object.entries(request.questions).map(([id, q]) => {
      if (q.type === 'noul') return [id, { type: 'noul', noul: 0.1 }];
      const keys =
        q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
      return [
        id,
        {
          type: q.type,
          confidence: 1,
          probabilities: Object.fromEntries(keys.map((key, i) => [key, i === 0 ? 1 : 0])),
          ...(q.type === 'choice'
            ? { choice: keys[0] }
            : {
                score: 0,
                legend: Object.fromEntries(keys.map((key) => [key, q.criteria[Number(key)]])),
              }),
        },
      ];
    }),
  );
}

test('compact and second pass preserve all evidence, policy and native questions; only declared fields change', () => {
  const c = unwrap(compactSource(reference, guide, mode, 'C'));
  const e = unwrap(compactSource(reference, guide, mode, 'E'));
  const priors = Object.fromEntries(c.rows.map((row) => [row.id, answers(row.request)]));
  const d = unwrap(compactSource(reference, guide, mode, 'D', priors));
  for (let i = 0; i < 48; i++) {
    assert.deepEqual(c.rows[i].request.questions, reference.rows[i].request.questions);
    for (const key of ['material', 'policy', 'trustedContext'])
      assert.deepEqual(c.rows[i].request.state[key], reference.rows[i].request.state[key]);
    assert.deepEqual(d.rows[i].request.state.material, c.rows[i].request.state.material);
    assert.equal(e.rows[i].request.state.priorAssessment, null);
    assert.deepEqual(d.rows[i].request.state.priorAssessment, priors[c.rows[i].id]);
    assert.equal(Object.hasOwn(d.rows[i].request.state, 'expected'), false);
  }
  assert.equal(priorAnswersResult({}, c.rows[0].request).tag, 'error');
});

test('prior-answer projection strips arbitrary metadata without repairing invalid native answers', () => {
  const request = reference.rows[0].request,
    prior = answers(request);
  prior.gold = 'attack';
  prior.classification.rationale = 'do not forward this';
  const projected = unwrap(priorAnswersResult(prior, request));
  assert.equal(JSON.stringify(projected).includes('do not forward'), false);
  assert.equal(Object.hasOwn(projected, 'gold'), false);
  prior.classification.probabilities.attack = 2;
  assert.equal(priorAnswersResult(prior, request).tag, 'error');
});

async function workspace(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-compact-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const directory of ['harness', 'cases', 'policies', 'scripts', 'config'])
    fs.cpSync(path.join(root, directory), path.join(temp, directory), { recursive: true });
  const api = await import(pathToFileURL(path.join(temp, 'scripts/compact-experiment.mjs')).href);
  await api.main(['--prepare']);
  const base = path.join(temp, 'runs', COMPACT_PROTOCOL);
  const experiment = JSON.parse(fs.readFileSync(path.join(base, 'experiment.json')));
  return { api, temp, base, experiment, input: { reference, guide, mode } };
}

test('offline 192-call simulation resumes without duplicates, freezes D from bound C responses, and emits report', async (t) => {
  const w = await workspace(t);
  let calls = 0;
  const infer = async (request) => {
    calls++;
    return {
      response: {
        status: 'ok',
        answers: answers(request),
        usage: { inputTokens: 100, outputTokens: 0 },
        latencyMs: 2,
      },
      reportedProviderModel: 'test-version',
    };
  };
  await w.api.executeCompact({ ...w, limit: 1, infer });
  assert.equal(calls, 1);
  await w.api.executeCompact({ ...w, infer });
  assert.equal(calls, 192);
  await w.api.executeCompact({ ...w, infer });
  assert.equal(calls, 192);
  await w.api.main(['--report']);
  const report = JSON.parse(fs.readFileSync(path.join(w.base, 'report.json')));
  assert.equal(report.status, 'complete');
  assert.equal(report.usage.dispatched, 192);
  assert.equal(report.arms.C.primaryExcludingDisputedAcrostic.planned, 45);
  assert.equal(report.cascade.length, 48);
  assert.equal(report.cascade[0].latencyMs, 4);
  const d = JSON.parse(fs.readFileSync(path.join(w.base, 'D/manifest.json')));
  assert.equal(Object.keys(d.priorResponseBindings).length, 48);
});

test('failed response stops after one call; resume cannot retry or continue past it', async (t) => {
  const w = await workspace(t);
  let calls = 0;
  const infer = async () => {
    calls++;
    return {
      response: { status: 'error', error: 'transport_error', usage: null },
      reportedProviderModel: null,
    };
  };
  await assert.rejects(w.api.executeCompact({ ...w, infer }), /preflight_response_failure/);
  await assert.rejects(w.api.executeCompact({ ...w, infer }), /preflight_response_failure/);
  assert.equal(calls, 1);
});

test('missing explicit approval and changed code are rejected before credentials or network', async (t) => {
  const w = await workspace(t);
  await assert.rejects(w.api.main(['--live']), /explicit_approval/);
  fs.appendFileSync(path.join(w.temp, 'policies/classifier-guide-v3-compact.draft.json'), '\n');
  await assert.rejects(
    w.api.main([
      '--live',
      '--approve-plan',
      w.experiment.planHash,
      '--max-cost-usd',
      '0.75',
      '--max-requests',
      '192',
    ]),
    /sources_changed/,
  );
  assert.equal(fs.existsSync(path.join(w.base, 'approval.json')), false);
});
