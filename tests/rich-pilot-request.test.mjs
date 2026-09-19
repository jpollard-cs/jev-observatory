import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildRichPilotPlan,
  extractRichTemplate,
  padRichMaterial,
  RICH_TEMPLATE_HASH,
} from '../harness/domain/rich-pilot-request.mjs';
import { richPilotFixtures } from '../cases/rich-pilot-fixtures.mjs';

const templateText = fs.readFileSync(
  new URL('../policies/prompt-injection-policy-template.md', import.meta.url),
  'utf8',
);

test('approval binds the entire guide, not operator notes or a summarized replacement', () => {
  assert.equal(extractRichTemplate(templateText).tag, 'ok');
  assert.equal(
    extractRichTemplate(templateText.replace('### 4.2 Ciphers', '### 4.2 Secret ciphers')).error
      .code,
    'rich_template_approval_hash_mismatch',
  );
  assert.equal(extractRichTemplate(templateText + '\n# Model-facing template begins').tag, 'error');
  assert.equal(
    extractRichTemplate(templateText.replace('Operator notes —', 'Operator guidance —')).tag,
    'ok',
  );
});

test('every request includes the unchanged rich guide once and excludes fixture answer metadata', () => {
  const result = buildRichPilotPlan({ templateText });
  assert.equal(result.tag, 'ok');
  const plan = result.value;
  const body = extractRichTemplate(templateText).value;
  assert.equal(plan.templateHash, RICH_TEMPLATE_HASH);
  assert.equal(plan.rows.length, 48);
  for (const row of plan.rows) {
    const requestText = JSON.stringify(row.request);
    assert.equal(row.request.state.classifierGuide, body);
    assert.equal(requestText.split(JSON.stringify(body)).length - 1, 1);
    assert.deepEqual(Object.keys(row.request.state).sort(), [
      'classifierGuide',
      'material',
      'policy',
      'trustedContext',
    ]);
    assert.equal(requestText.includes(row.id), false);
    assert.equal(requestText.includes(row.metadata.rationale), false);
    assert.equal(requestText.includes('Operator review record'), false);
    assert.equal(Object.hasOwn(row.request.state, 'expected'), false);
  }
});

test('length comparisons preserve each actual fixture, source context, operation and questions', () => {
  const plan = buildRichPilotPlan({ templateText }).value;
  for (const fixture of richPilotFixtures()) {
    const rows = plan.rows.filter((row) => row.metadata.fixtureId === fixture.id);
    assert.equal(rows.length, 3);
    for (const row of rows) {
      const { contextBefore, contextAfter, ...actual } = row.request.state.material;
      assert.deepEqual(actual, fixture.material);
      assert.equal(JSON.stringify(row.request.state.material).length, row.lengthTarget);
      assert.ok(Math.abs(contextBefore.length - contextAfter.length) <= 1);
      assert.deepEqual(row.request.state.trustedContext, rows[0].request.state.trustedContext);
      assert.deepEqual(row.request.questions, rows[0].request.questions);
    }
  }
});

test('plan is repeatable, leaves fixtures unchanged and reserves complete request sizes', () => {
  const before = richPilotFixtures();
  const first = buildRichPilotPlan({ templateText }).value;
  assert.deepEqual(buildRichPilotPlan({ templateText }).value, first);
  assert.deepEqual(richPilotFixtures(), before);
  assert.equal(
    first.costs.serializedBytes,
    first.rows.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.request)), 0),
  );
  assert.ok(first.costs.reservationUsd < 0.3);
  assert.equal(first.rows[0].lengthTarget, 1024);
  assert.equal(first.rows[0].expected.classification, 'benign');
});

test('a material object cannot silently overwrite padding fields or be truncated to fit', () => {
  assert.equal(padRichMaterial({ contextBefore: 'tampered' }, 1024).tag, 'error');
  assert.equal(
    padRichMaterial({ text: 'x'.repeat(2000) }, 1024).error.code,
    'rich_material_exceeds_length_target',
  );
});
