import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { localStorage } from '../scripts/local-storage.mjs';
import { executionRepository } from '../src/hosted/repository.mjs';
import { executionService } from '../src/hosted/service.mjs';
import { jevExecutionAdapter } from '../src/hosted/jev-adapter.mjs';
import { communityService } from '../src/service.mjs';
import { repository } from '../src/adapters/d1.mjs';
import { testReceipts } from './fixtures/receipts.mjs';
import { mockProvider } from './fixtures/provider.mjs';
import { preset } from '../../workbench/src/policy.mjs';
import { makePlan } from '../../workbench/src/planner.mjs';
import { CATALOG, catalogHash } from '../../workbench/src/catalog.mjs';
import { sha } from '../../workbench/src/util.mjs';
import { verifySignedBundle } from '../src/receipts/verify.mjs';
import { receiptAuthority } from '../src/receipts/crypto.mjs';
import { canonical, sha256 } from '../src/domain/contracts.mjs';
import core from '../trust/admission-core-v1.json' with { type: 'json' };
const value = (r) => {
  assert.equal(r.tag, 'ok', JSON.stringify(r));
  return r.value;
};
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'signed-evidence-'));
  const storage = await localStorage(directory),
    repo = executionRepository(storage.db),
    receipts = await testReceipts();
  t.after(async () => {
    storage.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  let calls = 0;
  const service = executionService({
    repo,
    blobs: storage.blobs,
    receipts: receipts.authority,
    adapter: {
      ...jevExecutionAdapter,
      infer: async (r) => {
        calls++;
        const mock = mockProvider(r);
        return {
          reportedProviderModel: mock.model,
          response: {
            status: 'ok',
            answers: mock.answers,
            latencyMs: 4,
            usage: { inputTokens: 1234, outputTokens: 0 },
          },
        };
      },
    },
  });
  value(await service.initialize('alice', { maximumUsd: 3, carriedPriorUsd: 0 }));
  const policy = preset(),
    options = { tier: 'gold', maxUsd: 3, layouts: ['question', 'criteria'] };
  const p = makePlan(policy, options);
  const q = value(
    await service.prepare('alice', {
      route: 'prepare',
      input: { policy, options },
      planHash: p.manifest.planHash,
    }),
  );
  value(await service.start('alice', q.id, { planHash: q.planHash, confirmPaid: true }));
  return { directory, storage, repo, receipts, service, q, calls: () => calls };
}
test('the required core is pinned to the reviewed catalog and both classifier layouts', () => {
  assert.equal(core.catalogHash, catalogHash);
  assert.deepEqual(
    core.cases,
    CATALOG.map((c) => ({ id: c.id, hash: sha(c) })),
  );
  assert.deepEqual(core.layouts, ['question', 'criteria']);
  assert.equal(core.cases.length, 60);
});

test('saved signed batches recover a failed settlement without replay, alteration, or double billing', async (t) => {
  const f = await fixture(t);
  assert.equal(f.q.maxParallel, 16);
  assert.equal(f.q.defaultParallel, 8);
  const settle = f.repo.settle;
  f.repo.settle = async () => false;
  await assert.rejects(
    f.service.step('alice', f.q.id, { index: 0, count: 16, apiKey: 'mock-test-key' }),
    /settlement/,
  );
  f.repo.settle = settle;
  value(await f.service.stop('alice', f.q.id));
  const held = await f.repo.get(f.q.id, 'alice');
  const key = held.object_key + '/response/0';
  const original = await new Response((await f.storage.blobs.get(key)).body).text();
  const changed = JSON.parse(original);
  changed.evidence.response.usage.inputTokens = 0;
  changed.rawHash = sha(JSON.stringify(changed.evidence) + '\n');
  await f.storage.blobs.put(key, JSON.stringify(changed));
  await assert.rejects(f.service.recover('alice', f.q.id), /Signed content/);
  assert.equal((await f.repo.get(f.q.id, 'alice')).held_nano, held.held_nano);
  await f.storage.blobs.delete(key);
  assert.equal((await f.service.recover('alice', f.q.id)).error.code, 'evidence_incomplete');
  assert.equal((await f.service.recover('stranger', f.q.id)).error.code, 'not_found');
  await f.storage.blobs.put(key, original);
  const recovered = await Promise.all([
    f.service.recover('alice', f.q.id),
    f.service.recover('alice', f.q.id),
  ]);
  for (const result of recovered) {
    const r = value(result);
    assert.equal(r.completed, 16);
    assert.equal(r.status, 'stopped');
    assert.equal(r.inflight, null);
    assert.equal(r.heldUsd, 0);
    assert.equal(r.knownUsd, (16 * 1234 * 42) / 1e9);
  }
  value(await f.service.recover('alice', f.q.id));
  assert.equal(f.calls(), 16);
  value(
    await verifySignedBundle(
      value(await f.service.contribution('alice', f.q.id)),
      f.receipts.trust,
      core,
    ),
  );
});
test('live signed evidence survives export, requires pinned keys, preserves incomplete core and rejects tampering', async (t) => {
  const f = await fixture(t);
  value(await f.service.step('alice', f.q.id, { index: 0, count: 3, apiKey: 'mock-test-key' }));
  value(await f.service.stop('alice', f.q.id));
  const bundle = value(await f.service.contribution('alice', f.q.id));
  assert.equal(bundle.version, 3);
  assert.equal(f.calls(), 3, 'assembling signed evidence never reruns requests');
  const imported = JSON.parse(canonical(bundle));
  const verify = (b = imported, trust = f.receipts.trust, constraints = {}) =>
    verifySignedBundle(b, trust, core, constraints);
  const verified = value(await verify());
  assert.equal(verified.core.status, 'incomplete');
  assert.equal(verified.regressionVerdict, 'not_evaluated');
  assert.equal((await verify(imported, f.receipts.trust, { requireCore: true })).tag, 'error');
  assert.equal(
    (await verify(imported, f.receipts.trust, { policyHash: '0'.repeat(64) })).tag,
    'error',
  );
  assert.equal(
    (await verify(imported, f.receipts.trust, { evaluatorRevision: 'b'.repeat(40) })).tag,
    'error',
  );
  assert.equal(
    (await verify(imported, f.receipts.trust, { runId: crypto.randomUUID() })).tag,
    'error',
  );
  assert.equal((await verify(imported, f.receipts.trust, { maxAgeMs: -1 })).tag, 'error');
  for (const change of [
    (b) => {
      b.policy.document.name = 'forged';
    },
    (b) => {
      b.provenance.settings.observations[0].evidence.response.answers = {};
    },
    (b) => {
      b.suite.definition.cases[0].expected = {};
    },
    (b) => {
      b.observations.pop();
    },
    (b) => {
      b.attestation.signature = 'A'.repeat(86);
    },
    (b) => {
      b.attestation.keyId = 'untrusted';
    },
    (b) => {
      b.verification.core.status = 'complete';
    },
    (b) => {
      b.attestation.issuedAt = '2090-01-01T00:00:00.000Z';
    },
  ]) {
    const bad = structuredClone(imported);
    change(bad);
    assert.equal((await verify(bad)).tag, 'error');
  }
  const revoked = structuredClone(f.receipts.trust);
  revoked.keys[0].status = 'revoked';
  assert.equal((await verify(imported, revoked)).tag, 'error');
  const retired = structuredClone(f.receipts.trust);
  retired.keys[0].status = 'retired';
  value(await verify(imported, retired));
  await assert.rejects(
    receiptAuthority(f.receipts.secret, retired, 'a'.repeat(40)).sign('bundle', {}),
  );
  const attacker = await testReceipts();
  const forged = structuredClone(imported);
  delete forged.attestation;
  forged.attestation = await attacker.authority.sign('bundle', forged);
  assert.equal((await verify(forged)).tag, 'error');
  // Even a newly signed assembly cannot replace a response recorded at execution time.
  const replaced = structuredClone(imported);
  delete replaced.attestation;
  replaced.provenance.settings.observations[0].valid = false;
  replaced.attestation = await f.receipts.authority.sign('bundle', replaced);
  assert.equal((await verify(replaced)).tag, 'error');
  const swapped = structuredClone(imported);
  delete swapped.attestation;
  swapped.provenance.settings.observations.reverse();
  swapped.attestation = await f.receipts.authority.sign('bundle', swapped);
  assert.equal((await verify(swapped)).tag, 'error');
  const repo = repository(f.storage.db);
  const community = communityService({
    repo,
    blobs: f.storage.blobs,
    evidence: f.service,
    trust: f.receipts.trust,
  });
  const row = value(
    await community.upload(
      { runId: f.q.id, author: 'QA', reviewedForSharing: true },
      { id: 'alice' },
    ),
  );
  assert.equal(row.evidenceStatus, 'signed-run');
  value(await community.setVisibility(row.id, { visibility: 'public' }, { id: 'alice' }));
  value(await community.download(row.id, null));
  const saved = await repo.get(row.id);
  // Replacing a blob AND its database hash cannot bypass the public-key check.
  const altered = structuredClone(bundle);
  altered.title = 'invented';
  const wire = canonical(altered);
  await f.storage.blobs.put(saved.objectKey, wire);
  await f.storage.db
    .prepare('UPDATE community_results SET bundle_hash=? WHERE id=?')
    .bind(await sha256(wire), row.id)
    .run();
  assert.equal((await community.download(row.id, null)).tag, 'error');
  const run = await f.repo.get(f.q.id, 'alice');
  await f.storage.db
    .prepare('UPDATE execution_runs SET known_nano=known_nano+1 WHERE id=?')
    .bind(run.id)
    .run();
  await assert.rejects(f.service.contribution('alice', f.q.id), /Sealed run has changed/);
  await f.storage.db
    .prepare('UPDATE execution_runs SET known_nano=known_nano-1 WHERE id=?')
    .bind(run.id)
    .run();
  const object = await f.storage.blobs.get(run.object_key + '/response/0');
  const observation = JSON.parse(await new Response(object.body).text());
  observation.evidence.response.answers = {};
  observation.rawHash = sha(JSON.stringify(observation.evidence) + '\n');
  await f.storage.blobs.put(run.object_key + '/response/0', JSON.stringify(observation));
  await assert.rejects(f.service.contribution('alice', f.q.id), /changed/);
  const file = path.join(f.directory, 'untrusted.json');
  await fs.writeFile(file, canonical(imported));
  assert.throws(
    () =>
      execFileSync(process.execPath, ['scripts/verify-receipt.mjs', file], {
        cwd: new URL('..', import.meta.url),
        stdio: 'pipe',
      }),
    'CLI must not trust ephemeral test keys or keys carried by the bundle',
  );
});
test('misconfigured or expired keys fail readiness without provider dispatch', async () => {
  const configured = await testReceipts(),
    other = await testReceipts();
  const broken = JSON.parse(configured.secret);
  broken.jwk.d = JSON.parse(other.secret).jwk.d;
  await assert.rejects(
    receiptAuthority(JSON.stringify(broken), configured.trust, 'a'.repeat(40)).ready(),
  );
  await assert.rejects(receiptAuthority(null, configured.trust, 'a'.repeat(40)).ready());
  const expired = structuredClone(configured.trust);
  expired.keys[0].notAfter = '2020-02-01T00:00:00.000Z';
  await assert.rejects(receiptAuthority(configured.secret, expired, 'a'.repeat(40)).ready());
});
test('a fully executed frozen core verifies but never produces a no-regression verdict', async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < f.q.requests; index += 3)
    value(await f.service.step('alice', f.q.id, { index, count: 3, apiKey: 'mock-test-key' }));
  const bundle = value(await f.service.contribution('alice', f.q.id));
  const verified = value(
    await verifySignedBundle(bundle, f.receipts.trust, core, {
      requireCore: true,
      policyHash: bundle.policy.hash,
    }),
  );
  assert.equal(verified.core.requiredRequests, 120);
  assert.equal(verified.core.status, 'complete');
  assert.equal(verified.regressionVerdict, 'not_evaluated');
  assert.equal(f.calls(), 120);
  assert.ok(!canonical(bundle).includes('mock-test-key'));
  assert.ok(!canonical(bundle).includes(JSON.parse(f.receipts.secret).jwk.d));
});
