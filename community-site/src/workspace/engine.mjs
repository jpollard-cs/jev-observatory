import {
  TASK_STARTERS,
  applySetupSummary,
  undoSetupTransaction,
} from '../../../workbench/src/setup.mjs';
import {
  preset,
  validatePolicy,
  policyWarnings,
  RULE_CARDS,
  REPRESENTATIONS,
  EXCEPTIONS,
  LANGUAGE_NAMES,
} from '../../../workbench/src/policy.mjs';
import {modelLanguageCatalog} from '../../../workbench/src/model-capabilities.mjs';
import { CATALOG, catalogView, expectedFor, LANGUAGE_PROBE_CODES } from '../../../workbench/src/catalog.mjs';
import { compileCase } from '../../../workbench/src/compiler.mjs';
import { makePlan } from '../../../workbench/src/planner.mjs';
import { makeAssistedPlan } from '../../../workbench/src/selection/planner.mjs';
import { makeAdvisorPlan, adviceSummary } from '../../../workbench/src/selection/advisor.mjs';
import { registryView } from '../../../workbench/src/selection/registry.mjs';
import {
  defaultApplication,
  validateApplication,
  SURFACES,
  CAPABILITIES,
} from '../../../workbench/src/selection/application.mjs';
import { originalCatalogView, originalSpecimen } from '../../../workbench/src/history/catalog.mjs';
import { makeReplayPlan, replayJobs } from '../../../workbench/src/history/planner.mjs';
import { loadEvidence, evidenceSpecimen } from '../../../workbench/src/evidence-library.mjs';
import { importReport } from '../../../workbench/src/report.mjs';
import { sha, assert } from '../../../workbench/src/util.mjs';
import { registerFile, readFileSync } from './files.mjs';
import { zipSync, strToU8, gunzipSync } from 'fflate';
import records from 'workspace:records';
import release from 'workspace:release';
const saved = new Map(),
  specs = new Map(),
  advice = new Map(),
  loaded = new Set();
async function loadRecord(id) {
  const record = records.find((x) => x.id === id);
  assert(record, 'Unknown recorded experiment');
  if (!loaded.has(id)) {
    const response = await fetch('/workspace/data/' + id + '.json');
    assert(response.ok, 'Recorded experiment could not load');
    const raw = await response.text();
    assert(sha(raw) === record.sourceHash, 'Recorded experiment failed its integrity check');
    registerFile('/workbench/' + record.file, raw);
    loaded.add(id);
  }
  return loadEvidence(id);
}
function freeze(prepared, route, input) {
  const hash = prepared.manifest.planHash;
  saved.set(hash, prepared);
  specs.set(hash, { route, input, planHash: hash });
  return {
    directory: 'plan',
    planPath: 'plan/manifest.json',
    planHash: hash,
    manifest: prepared.manifest,
    liveCalls: 0,
    storage: 'browser-session',
  };
}
function exportPlan(hash) {
  const prepared = saved.get(hash);
  assert(prepared, 'Save this plan in the current browser session first');
  const files = {},
    manifest = prepared.manifest;
  for (const [path, hash] of Object.entries(manifest.sourceFiles)) {
    const bytes = readFileSync('/workbench/' + path);
    assert(sha(bytes) === hash, 'Pinned source mismatch');
    files[path] = new Uint8Array(bytes);
    files['plan/source/' + path] = new Uint8Array(bytes);
  }
  const jobs =
    prepared.jobs ?? [...replayJobs(manifest)].map((j) => ({ ...j.metadata, body: j.body }));
  for (const job of jobs) {
    assert(sha(job.body) === job.requestHash, 'Pinned request mismatch');
    files['plan/requests/' + job.requestHash + '.json'] = strToU8(job.body);
    if (job.receipt)
      files['plan/receipts/' + sha(job.id) + '.json'] = strToU8(
        JSON.stringify(job.receipt, null, 2) + '\n',
      );
  }
  files['plan/manifest.json'] = strToU8(JSON.stringify(manifest, null, 2) + '\n');
  files['plan/evaluation-only.json'] = strToU8(
    JSON.stringify(
      Object.fromEntries(jobs.filter((j) => j.expected).map((j) => [j.id, j.expected])),
      null,
      2,
    ) + '\n',
  );
  files['BROWSER-EXPORT.txt'] = strToU8(
    'Frozen offline in the browser. No provider calls or keys included.\nRelease: ' +
      release.commit +
      '\nKeep this entire extracted folder; request and source hashes are checked at execution.\nUse the matching repository instructions and your own local budget ledger to run it.\nThis export is not a signed verification receipt.\n',
  );
  return {
    bytes: zipSync(files, { level: 6 }),
    filename: 'jev-plan-' + hash.slice(0, 12) + '.zip',
  };
}
export async function dispatch(route, input = {}) {
  const url = new URL(route, 'https://workspace.invalid/'),
    name = url.pathname.slice(1),
    query = url.searchParams;
  if (name === 'bootstrap')
    return {
      hosted: true,
      version: '0.5 + browser workspace',
      csrf: null,
      taskStarters: TASK_STARTERS,
      connectionDefaults: { projectExists: false, defaultProject: '', defaultAccount: '' },
      originalCatalog: originalCatalogView(),
      appRoot: '.',
      selectionRegistry: registryView(),
      defaultApplication: defaultApplication(preset()),
      selectionSurfaces: SURFACES,
      selectionCapabilities: CAPABILITIES,
      defaultPolicy: preset(),
      catalog: catalogView(),
      rules: RULE_CARDS,
      representations: REPRESENTATIONS,
      exceptions: EXCEPTIONS,
      languages: LANGUAGE_NAMES,
      modelLanguages: modelLanguageCatalog(),
      languageProbeCodes: LANGUAGE_PROBE_CODES,
      historical: await loadRecord('consumer-admission-v1'),
      recordedRuns: records,
      newCalls: 0,
      release,
    };
  if (name === 'workspace/execution-spec') {
    assert(specs.has(input.planHash), 'Save this plan again to review hosted execution');
    return specs.get(input.planHash);
  }
  if (name === 'connection') return { connected: false, hosted: true, account: null };
  if (name.startsWith('connection/'))
    throw Error(
      'Paid execution is not connected on the hosted workspace yet. Your local workbench retains its reviewed Jev connection; this browser never asks for your key.',
    );
  if (name === 'evidence') return loadRecord(query.get('id'));
  if (name === 'evidence-specimen') {
    await loadRecord('consumer-admission-v1');
    return evidenceSpecimen(Object.fromEntries(query));
  }
  if (name === 'original/archived-request') {
    const hash = query.get('hash');
    assert(/^[a-f0-9]{64}$/.test(hash), 'Invalid request identity');
    const response = await fetch('/workspace/data/original-extra-requests.gz');
    assert(response.ok, 'Archived request unavailable');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(
      sha(Buffer.from(bytes)) === release.archivedRequestsHash,
      'Archived requests failed their integrity check',
    );
    const request = JSON.parse(new TextDecoder().decode(gunzipSync(bytes)))[hash];
    assert(
      request && sha(JSON.stringify(request)) === hash,
      'No exact archived request registered',
    );
    return { request, requestHash: hash };
  }
  if (name === 'original/specimen')
    return originalSpecimen(query.get('id'), {
      nativeVersion: query.get('nativeVersion') ?? 'policy-v4',
    });
  if (name === 'original/plan' || name === 'original/prepare') {
    const prepared = makeReplayPlan(input.options ?? {});
    return name.endsWith('prepare') ? freeze(prepared, name, input) : prepared.manifest;
  }
  if (name === 'case') {
    const item = CATALOG.find((x) => x.id === query.get('id'));
    assert(item, 'Unknown case');
    return item;
  }
  if (name === 'selection/validate-context') return validateApplication(input.application);
  if (name === 'compile') {
    const policy = validatePolicy(input.policy);
    let item = CATALOG.find((x) => x.id === input.caseId);
    if (input.custom) {
      assert(Object.hasOwn(input.custom, 'material'), 'Custom material required');
      item = {
        id: 'custom-preview',
        sourceVersion: 'user-authored-preview',
        material: input.custom.material,
        context: input.custom.context ?? {
          task: policy.task,
          expectedRepresentation: 'Natural-language task data.',
          exceptionIds: [],
          source: { id: 'user-supplied', kind: 'untrusted data' },
        },
      };
    }
    assert(item, 'Unknown case');
    const compiled = compileCase(policy, item, input.layout ?? policy.layout);
    return {
      request: compiled.request,
      receipt: compiled.receipt,
      wireBytes: compiled.wireBytes,
      estimatedInputTokens: compiled.estimatedInputTokens,
      expected: item.annotations ? expectedFor(policy, item) : null,
      caseId: item.id,
      warnings: policyWarnings(policy),
      liveCalls: 0,
    };
  }
  if (['plan', 'prepare', 'selection/plan', 'selection/freeze'].includes(name)) {
    const prepared = name.startsWith('selection/')
      ? makeAssistedPlan(input.policy, input.application, input.options, input.report ?? null)
      : makePlan(input.policy, input.options);
    return ['prepare', 'selection/freeze'].includes(name)
      ? freeze(prepared, name, input)
      : prepared.manifest;
  }
  if (name === 'workspace/export') return exportPlan(input.planHash);
  if (name === 'setup/prepare' || name === 'selection/prepare')
    return freeze(
      makeAdvisorPlan(
        input.policy,
        input.application,
        name === 'setup/prepare'
          ? { mode: 'setup', maxUsd: input.maxUsd ?? 0.01, maxInputTokens: null }
          : (input.options ?? {}),
        input.catalogDescriptors ?? null,
      ),
      name,
      input,
    );
  if (name === 'setup/request') {
    const prepared = saved.get(input.planHash);
    assert(prepared?.manifest.options.mode === 'setup', 'No saved setup request');
    return {
      request: prepared.jobs[0].request,
      requestHash: prepared.jobs[0].requestHash,
      liveCalls: 0,
    };
  }
  if (['setup/import', 'setup/apply', 'selection/import'].includes(name)) {
    assert(
      typeof input.raw === 'string' && input.raw.length < 12 * 1024 * 1024,
      'Advice must be JSON under 12 MiB',
    );
    const report = JSON.parse(input.raw),
      setup = name.startsWith('setup/');
    assert(
      setup ? report.mode === 'setup' : report.mode !== 'setup',
      'Use the matching advice importer',
    );
    const summary = adviceSummary(
      report,
      setup || report.mode === 'rank'
        ? { policy: input.policy, application: input.application, mode: setup ? 'setup' : 'rank' }
        : {},
    );
    if (name === 'setup/apply')
      return applySetupSummary(input.policy, input.application, summary, input.selected);
    advice.set(report.reportHash, report);
    return { report, summary, liveCalls: 0 };
  }
  if (name === 'setup/undo')
    return undoSetupTransaction(input.policy, input.application, input.transaction);
  if (name === 'selection/cache') {
    for (const report of [...advice.values()].reverse()) {
      try {
        const summary = adviceSummary(report, {
          policy: input.policy,
          application: input.application,
          mode: input.mode ?? 'rank',
        });
        return { report, summary, liveCalls: 0 };
      } catch {}
    }
    return { report: null, summary: null, liveCalls: 0 };
  }
  if (name === 'import-report')
    return importReport(input.raw, { sourceName: input.name ?? 'browser import' });
  throw Error('Unknown workspace operation');
}
// One queue keeps plan/evidence mutations ordered while expensive planning leaves the UI responsive.
if (typeof self !== 'undefined') {
  let queue = Promise.resolve();
  self.onmessage = ({ data }) => {
    queue = queue.then(async () => {
      try {
        self.postMessage({ id: data.id, ok: true, value: await dispatch(data.route, data.data) });
      } catch (error) {
        self.postMessage({ id: data.id, ok: false, message: error.message });
      }
    });
  };
}
