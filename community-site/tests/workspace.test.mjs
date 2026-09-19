import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { preset } from '../../workbench/src/policy.mjs';
import { CATALOG } from '../../workbench/src/catalog.mjs';
import { compileCase } from '../../workbench/src/compiler.mjs';
import { defaultApplication } from '../../workbench/src/selection/application.mjs';
import { makeAssistedPlan } from '../../workbench/src/selection/planner.mjs';
import { makeReplayPlan } from '../../workbench/src/history/planner.mjs';
import { loadPrepared } from '../../workbench/src/storage.mjs';
import { evidenceLibrary, loadEvidence } from '../../workbench/src/evidence-library.mjs';
import worker from '../dist/server/index.js';
import { dispatch } from '../dist/workspace/engine.js';
const body = async (response) => {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return response.headers.get('content-encoding') === 'gzip' ? gunzipSync(bytes) : bytes;
};
// Test the compiled browser runtime, reading only the same allowlisted static assets it gets on the site.
globalThis.fetch = async (url) => {
  assert.ok(String(url).startsWith('/workspace/data/'));
  const response = await worker.fetch(new Request('https://site.test' + url), {}, {});
  return new Response(await body(response), { status: response.status });
};
test('landing explains the workflow while workspace and community remain accessible', async () => {
  const landing = await worker.fetch(new Request('https://site.test/'), {}, {});
  assert.match(await landing.text(), /Where does data/);
  const home = await worker.fetch(new Request('https://site.test/workspace'), {}, {});
  assert.match(new TextDecoder().decode(await body(home)), /workspace\/app.js/);
  assert.match(home.headers.get('content-security-policy'), /worker-src 'self'/);
  assert.match(home.headers.get('content-security-policy'), /require-trusted-types-for 'script'/);
  const community = await worker.fetch(new Request('https://site.test/community'), {}, {});
  assert.match(await community.text(), /href="\/workspace">Workspace/);
});
test('browser compiler preserves exact native requests and authored expectations across contracts', async () => {
  for (const mode of ['strict', 'contextual', 'inspection'])
    for (const layout of ['criteria', 'question']) {
      const policy = preset(mode),
        item = CATALOG.find((x) => x.id === 'base64-override-authorized-format');
      const browser = await dispatch('compile', { policy, caseId: item.id, layout });
      const native = compileCase(policy, item, layout);
      assert.deepEqual(browser.request, native.request);
      assert.deepEqual(browser.receipt, native.receipt);
    }
});
test('browser planning and exported request bundles match the executable local plan', async (t) => {
  const policy = preset(),
    application = defaultApplication(policy),
    options = { tier: 'bronze', maxUsd: 1 };
  const native = makeAssistedPlan(policy, application, options);
  const frozen = await dispatch('selection/freeze', { policy, application, options });
  assert.deepEqual(frozen.manifest, native.manifest);
  const exported = await dispatch('workspace/export', { planHash: frozen.planHash });
  const files = unzipSync(exported.bytes),
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-plan-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(dir, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
  const loaded = loadPrepared(path.join(dir, 'plan/manifest.json'));
  assert.equal(loaded.manifest.planHash, native.manifest.planHash);
  assert.equal(loaded.jobs.length, native.jobs.length);
  assert.ok(!Object.keys(files).some((name) => /\.env|credential/i.test(name)));
});
test('browser original-suite selection keeps the original source and request identities', async () => {
  const options = { preset: 'families', maxUsd: 1 };
  assert.deepEqual(await dispatch('original/plan', { options }), makeReplayPlan(options).manifest);
});
test('all six archived experiments preserve native reconstructed outcomes and identities', async () => {
  const boot = await dispatch('bootstrap');
  assert.equal(boot.catalog.length, 60);
  assert.equal(boot.originalCatalog.totalCells, 15184);
  for (const entry of evidenceLibrary())
    assert.deepEqual(await dispatch('evidence?id=' + entry.id), loadEvidence(entry.id));
});
test('browser preparation cannot dispatch provider calls or accept a credential', async () => {
  await assert.rejects(
    dispatch('connection/connect', { apiKey: 'test-only-sentinel' }),
    /not connected/,
  );
  await assert.rejects(dispatch('connection/run', {}), /not connected/);
  await assert.rejects(dispatch('workspace/export', { planHash: 'unknown' }), /Save this plan/);
});
test('archived request inspection verifies the exact request bytes', async () => {
  const raw = await fs.readFile(
    new URL('../../workbench/data/history/original-extra-requests.json.gz', import.meta.url),
  );
  const requests = JSON.parse(gunzipSync(raw));
  const hash = Object.keys(requests)[0];
  const archived = await dispatch('original/archived-request?hash=' + hash);
  assert.equal(archived.requestHash, hash);
  assert.deepEqual(archived.request, requests[hash]);
});
