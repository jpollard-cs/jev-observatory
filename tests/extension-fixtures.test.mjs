import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extensionFixtures,
  EXTENSION_DESIGN,
  EXTENSION_PROTOCOL,
} from '../cases/extension-fixtures.mjs';
import {
  buildExtensionRequestResult,
  INTEGRITY_DECISIONS,
} from '../harness/domain/extension-questions.mjs';

test('extension has frozen authored coverage and never splits a related lineage', () => {
  const fixtures = extensionFixtures();
  assert.equal(fixtures.length, 64);
  assert.equal(new Set(fixtures.map((f) => f.id)).size, 64);
  assert.equal(new Set(fixtures.map((f) => f.lineageId)).size, 26);
  assert.deepEqual(
    Object.fromEntries(
      ['integrity', 'judge', 'moderation', 'scope'].map((suite) => [
        suite,
        fixtures.filter((f) => f.suite === suite).length,
      ]),
    ),
    { integrity: 24, judge: 16, moderation: 16, scope: 8 },
  );
  for (const lineage of new Set(fixtures.map((f) => f.lineageId)))
    assert.equal(
      new Set(fixtures.filter((f) => f.lineageId === lineage).map((f) => f.split)).size,
      1,
    );
  for (const split of ['calibration', 'test'])
    assert.deepEqual(
      [
        ...new Set(
          fixtures
            .filter((f) => f.split === split && f.suite === 'integrity')
            .map((f) => f.expected.decision),
        ),
      ].sort(),
      [...INTEGRITY_DECISIONS].sort(),
    );
  assert.equal(EXTENSION_DESIGN.labelsReviewedByIndependentHuman, false);
  assert.equal(EXTENSION_PROTOCOL, 'release-extension-v1');
});

test('builder excludes gold, filenames, split and lineage annotations; is pure', () => {
  for (const fixture of extensionFixtures()) {
    const original = JSON.stringify(fixture);
    const result = buildExtensionRequestResult({ fixture });
    assert.equal(result.tag, 'ok');
    assert.deepEqual(Object.keys(result.value), ['state', 'model', 'questions']);
    assert.deepEqual(Object.keys(result.value.state), ['policy', 'trustedContext', 'material']);
    const altered = {
      ...fixture,
      id: 'LEAK_SENTINEL',
      split: 'LEAK_SENTINEL',
      expected: { marker: 'LEAK_SENTINEL' },
      annotationRationale: 'LEAK_SENTINEL',
    };
    assert.deepEqual(buildExtensionRequestResult({ fixture: altered }), result);
    assert(!JSON.stringify(result.value).includes('LEAK_SENTINEL'));
    assert.deepEqual(
      Object.keys(result.value.questions).sort(),
      Object.keys(fixture.expected).sort(),
    );
    for (const [id, question] of Object.entries(result.value.questions)) {
      assert.equal(typeof question.instructions, 'object');
      if (question.type === 'choice')
        assert(Object.hasOwn(question.criteria, fixture.expected[id]));
      else {
        assert.equal(question.type, 'noul');
        assert.equal(typeof fixture.expected[id], 'boolean');
      }
      assert(
        Object.values(question.criteria).every((entry) => typeof entry.definition === 'string'),
      );
    }
    result.value.state.material.messages[0].content = 'mutation';
    assert.equal(JSON.stringify(fixture), original);
  }
  assert.equal(buildExtensionRequestResult().tag, 'error');
  assert.equal(buildExtensionRequestResult({ fixture: { suite: 'unknown' } }).tag, 'error');
});

test('judge context-count pairs retain task, answer, correctness and injection exactly', () => {
  const fixtures = extensionFixtures().filter((f) => f.suite === 'judge');
  for (const lineage of new Set(fixtures.map((f) => f.lineageId))) {
    const [short, expanded] = fixtures.filter((f) => f.lineageId === lineage);
    assert.deepEqual(short.expected, expanded.expected);
    assert.deepEqual(short.context.material.candidate, expanded.context.material.candidate);
    assert.equal(short.context.material.task, expanded.context.material.task);
    assert.deepEqual(short.context.material.resources[0], expanded.context.material.resources[0]);
    assert.deepEqual(short.context.material.messages[0], expanded.context.material.messages[0]);
    assert(
      expanded.counts.messages > short.counts.messages ||
        expanded.counts.resources > short.counts.resources,
    );
  }
  assert.equal(fixtures.filter((f) => f.expected.decision === 'pass').length, 8);
  assert.equal(fixtures.filter((f) => f.expected.attack_present).length, 8);
  assert.deepEqual(
    [...new Set(fixtures.map((f) => f.counts.messages))].sort((a, b) => a - b),
    [1, 4, 16],
  );
  assert.deepEqual(
    [...new Set(fixtures.map((f) => f.counts.resources))].sort((a, b) => a - b),
    [1, 4, 16],
  );
});

test('unknown integrity does not become a claim of latent cleanliness or poison', () => {
  const fixtures = extensionFixtures().filter((f) => f.suite === 'integrity');
  for (const f of fixtures.filter((f) => f.expected.decision === 'insufficient_evidence')) {
    assert.equal(f.expected.poisoning_evidenced, false);
    assert.equal(f.expected.reason, 'INT_INSUFFICIENT_EVIDENCE');
    assert.equal(f.context.trustedContext.evidenceCoverage, 'partial');
  }
  assert.equal(fixtures.filter((f) => f.expected.poisoning_evidenced).length, 6);
  assert.equal(fixtures.filter((f) => f.expected.reason === 'INT_ADOPTED_INSTRUCTION').length, 3);
  assert.equal(fixtures.filter((f) => f.expected.reason === 'INT_TAMPERED_RESOURCE').length, 3);
});

test('scope counterfactuals change exactly one trusted leaf, preserving material', () => {
  const flatten = (x, prefix = '') =>
    Object.entries(x).flatMap(([k, v]) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? flatten(v, `${prefix}${k}.`)
        : [[`${prefix}${k}`, JSON.stringify(v)]],
    );
  const fixtures = extensionFixtures().filter((f) => f.suite === 'scope');
  for (const lineage of new Set(fixtures.map((f) => f.lineageId))) {
    const [a, b] = fixtures.filter((f) => f.lineageId === lineage);
    assert.deepEqual(a.context.material, b.context.material);
    const left = new Map(flatten(a.context.trustedContext)),
      right = new Map(flatten(b.context.trustedContext));
    assert.equal([...left].filter(([k, v]) => right.get(k) !== v).length, 1);
    assert.equal(a.expected.audit_required, false);
    assert.equal(b.expected.audit_required, true);
  }
});
