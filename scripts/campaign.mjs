/** Filesystem/environment composition root. Offline preparation never reads credentials. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  generateCases,
  selectCases,
  corpusManifest,
  prospectiveProfiles,
  policyProfileMetadataForVersion,
} from '../harness/corpus.mjs';
import { buildTypeSafeRequest } from '../harness/typesafe.mjs';
import { inferTypeSafeRequest, readEndpoint } from '../harness/provider.mjs';
import { createHttpJsonTransport } from '../harness/adapters/http-json.mjs';
import { nativeValidationMetadata } from '../harness/domain/native-answers.mjs';
import { extensionFixtures, EXTENSION_PROTOCOL } from '../cases/extension-fixtures.mjs';
import { buildExtensionRequestResult } from '../harness/domain/extension-questions.mjs';
import {
  CAMPAIGN_BUDGET,
  campaignBudgetStatus,
  replayCampaignLedger,
} from '../harness/domain/campaign-budget.mjs';
import {
  CAMPAIGN_PROTOCOL,
  CAMPAIGN_NATIVE_VERSION,
  CAMPAIGN_PHASES,
  campaignHash,
  campaignCaseMetadata,
  freezeCampaignRequest,
  makeCampaignTrial,
  makeCampaignDiagnosticTrial,
  campaignProgressStatus,
  verifyCampaignPreflight,
} from '../harness/domain/campaign-plan.mjs';
import { projectCampaignRecord } from '../harness/domain/campaign-record.mjs';
import { runCampaignPhase } from '../harness/application/campaign-run.mjs';
import { unwrap } from '../harness/domain/result.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runsRoot = path.join(root, 'runs');
const globalLedgerDirectory = path.join(runsRoot, 'campaign-budget-v1');
const globalLockPath = path.join(runsRoot, '.campaign.lock');
const now = () => new Date().toISOString();
const recordDirectory = (directory, trial) =>
  path.join(directory, 'records', campaignHash(trial.id));

function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Commit a complete immutable file, never replacing an existing different value. */
export function writeCampaignFile(filename, contents) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  if (fs.existsSync(filename)) {
    if (fs.readFileSync(filename, 'utf8') !== contents)
      throw new Error('campaign_file_already_exists_with_different_content');
    return;
  }
  const temporary = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.linkSync(temporary, filename);
    syncDirectory(path.dirname(filename));
  } finally {
    fs.unlinkSync(temporary);
  }
}

/** One lock covers preparation, every phase, every campaign directory, and the shared ledger. */
export async function withCampaignLock(lockPath, action) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // Serialize stale-owner recovery too, so two recovering processes cannot
    // unlink a fresh lock acquired by the other process.
    const recoveryPath = `${lockPath}.recovery`;
    let recovery;
    try {
      recovery = fs.openSync(recoveryPath, 'wx', 0o600);
    } catch {
      throw new Error('campaign_lock_recovery_busy_or_requires_inspection');
    }
    try {
      if (fs.existsSync(lockPath)) {
        let previous;
        try {
          previous = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        } catch {
          throw new Error('campaign_lock_requires_manual_inspection');
        }
        if (
          previous.hostname !== os.hostname() ||
          !Number.isInteger(previous.pid) ||
          previous.pid <= 0
        )
          throw new Error('campaign_locked');
        try {
          process.kill(previous.pid, 0);
          throw new Error('campaign_locked');
        } catch (probe) {
          if (probe.code !== 'ESRCH') throw probe;
        }
        // Dead local owner only; its durable reservations remain untouched.
        fs.unlinkSync(lockPath);
      }
      fd = fs.openSync(lockPath, 'wx', 0o600);
    } finally {
      fs.closeSync(recovery);
      fs.unlinkSync(recoveryPath);
    }
  }
  const token = crypto.randomUUID();
  try {
    fs.writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, hostname: os.hostname(), token, startedAt: now() }),
    );
    fs.fsyncSync(fd);
    return await action();
  } finally {
    fs.closeSync(fd);
    if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).token !== token)
      throw new Error('campaign_lock_owner_changed');
    fs.unlinkSync(lockPath);
    syncDirectory(path.dirname(lockPath));
  }
}

function orderedTrials(trials) {
  return trials.sort((a, b) => {
    const phase = CAMPAIGN_PHASES.indexOf(a.phase) - CAMPAIGN_PHASES.indexOf(b.phase);
    if (phase) return phase;
    if (
      a.phase === 'representation' &&
      Number.isSafeInteger(a.diagnostic?.dispatchOrder) &&
      Number.isSafeInteger(b.diagnostic?.dispatchOrder)
    )
      return a.diagnostic.dispatchOrder - b.diagnostic.dispatchOrder;
    const groupA =
      a.caseMetadata?.pairId ?? a.fixture?.pairId ?? a.diagnostic?.scenarioId ?? a.sourceId;
    const groupB =
      b.caseMetadata?.pairId ?? b.fixture?.pairId ?? b.diagnostic?.scenarioId ?? b.sourceId;
    return (
      campaignHash(`campaign-order-v1:${groupA}`).localeCompare(
        campaignHash(`campaign-order-v1:${groupB}`),
      ) || a.id.localeCompare(b.id)
    );
  });
}

export function prepareCampaign(
  directory,
  {
    cases = generateCases(),
    smokeCases = selectCases({ split: 'pilot', limit: 12 }),
    extensions = extensionFixtures(),
    diagnostics = [],
    model = 'jev-latest',
    protocol = corpusManifest(),
    preparedAt = now(),
    progress = () => {},
  } = {},
) {
  if (fs.existsSync(path.join(directory, 'manifest.json'))) {
    const existing = loadCampaign(directory);
    for (const diagnostic of diagnostics) {
      const prior = existing.trials.find((trial) => trial.id === `representation:${diagnostic.id}`);
      if (!prior || prior.requestHash !== campaignHash(JSON.stringify(diagnostic.request)))
        throw new Error('campaign_already_frozen_with_different_diagnostics');
    }
    return existing.plan;
  }
  const catalog = [],
    trials = [],
    frozenById = new Map();
  function freeze(request) {
    const frozen = unwrap(freezeCampaignRequest(request));
    writeCampaignFile(path.join(directory, 'requests', `${frozen.requestHash}.json`), frozen.body);
    return frozen;
  }
  for (const caseItem of cases) {
    const frozen = freeze(
      buildTypeSafeRequest(caseItem, model, { version: CAMPAIGN_NATIVE_VERSION }),
    );
    if (frozenById.has(caseItem.id)) throw new Error('duplicate_campaign_catalog_case');
    const { body, ...reference } = frozen;
    frozenById.set(caseItem.id, reference);
    catalog.push({
      ...campaignCaseMetadata(caseItem),
      requestHash: frozen.requestHash,
      requestBytes: frozen.requestBytes,
      selectedPhase: caseItem.seed === 0 ? 'matrix' : null,
      queueStatus: caseItem.seed === 0 ? 'planned_matrix' : 'queued_future_seed',
    });
    if (caseItem.seed === 0)
      trials.push(
        unwrap(
          makeCampaignTrial({
            phase: 'matrix',
            caseItem,
            frozen,
            contractVersion: CAMPAIGN_NATIVE_VERSION,
          }),
        ),
      );
    if (catalog.length % 500 === 0) progress({ status: 'preparing', catalogCases: catalog.length });
  }
  for (const caseItem of smokeCases) {
    const frozen = frozenById.get(caseItem.id);
    if (!frozen) throw new Error('smoke_case_absent_from_campaign_catalog');
    trials.push(
      unwrap(
        makeCampaignTrial({
          phase: 'smoke',
          caseItem,
          frozen,
          contractVersion: CAMPAIGN_NATIVE_VERSION,
        }),
      ),
    );
  }
  for (const fixture of extensions) {
    const frozen = freeze(unwrap(buildExtensionRequestResult({ fixture, model })));
    trials.push(
      unwrap(
        makeCampaignTrial({
          phase: 'extensions',
          fixture,
          frozen,
          contractVersion: EXTENSION_PROTOCOL,
        }),
      ),
    );
  }
  for (const { request, ...diagnostic } of diagnostics) {
    const frozen = freeze(request);
    if (request.model !== model) throw new Error('diagnostic_model_differs_from_campaign');
    trials.push(
      unwrap(
        makeCampaignDiagnosticTrial({
          diagnostic,
          frozen,
          contractVersion:
            diagnostic.nativeRequestVersion ??
            diagnostic.contractVersion ??
            CAMPAIGN_NATIVE_VERSION,
        }),
      ),
    );
  }
  if (new Set(trials.map((trial) => trial.id)).size !== trials.length)
    throw new Error('duplicate_campaign_trial');
  const catalogBody = catalog.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
  const trialsBody = JSON.stringify(orderedTrials(trials)) + '\n';
  writeCampaignFile(path.join(directory, 'catalog.jsonl'), catalogBody);
  writeCampaignFile(path.join(directory, 'trials.json'), trialsBody);
  const policyProfiles = policyProfileMetadataForVersion(CAMPAIGN_NATIVE_VERSION);
  const validation = nativeValidationMetadata('bounded_rounding');
  const effectiveProtocolHash = campaignHash(
    JSON.stringify({
      corpusProtocolHash: protocol.protocolHash,
      policyProfiles,
      nativeRequestVersion: CAMPAIGN_NATIVE_VERSION,
      extensionProtocol: EXTENSION_PROTOCOL,
      validation,
    }),
  );
  const core = {
    schemaVersion: 1,
    protocol: CAMPAIGN_PROTOCOL,
    model,
    nativeRequestVersion: CAMPAIGN_NATIVE_VERSION,
    extensionProtocol: EXTENSION_PROTOCOL,
    budget: CAMPAIGN_BUDGET,
    corpusProtocolHash: protocol.protocolHash,
    protocolHash: effectiveProtocolHash,
    trustedContextHash: protocol.trustedContextHash,
    policyProfiles,
    validation,
    catalogHash: campaignHash(catalogBody),
    trialsHash: campaignHash(trialsBody),
    catalogCases: catalog.length,
    phaseCounts: Object.fromEntries(
      CAMPAIGN_PHASES.map((phase) => [
        phase,
        trials.filter((trial) => trial.phase === phase).length,
      ]),
    ),
    queuedOtherSeeds: catalog.filter((entry) => entry.selectedPhase === null).length,
    modelPolicy:
      'Configured model and request bodies are frozen; first reported provider model binds all later responses. Drift pauses the entire campaign.',
    selection:
      'Matrix contains seed 0 only. Other seeds remain frozen and queued; seed parity changes judge correctness, so seed 0 does not cover both correct and incorrect judge answers.',
    evidenceSeparation:
      'Smoke is a separately charged schema check, excluded from matrix evidence. Extensions use their own contract. Resume never retries a reserved/dispatched trial.',
    reservationCaveat:
      'UTF-8 bytes plus 256 are a planning allowance, not a provider tokenizer/billing guarantee. Native output is uncapped and priced at zero here; provider account limits are needed for a hard monetary guarantee.',
  };
  const planHash = campaignHash(JSON.stringify(core));
  const plan = { ...core, planHash, campaignId: `campaign-${planHash.slice(0, 24)}`, preparedAt };
  writeCampaignFile(path.join(directory, 'manifest.json'), JSON.stringify(plan, null, 2) + '\n');
  return plan;
}

export function loadCampaign(directory) {
  const plan = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const { planHash, campaignId, preparedAt, ...core } = plan;
  if (
    campaignHash(JSON.stringify(core)) !== planHash ||
    campaignId !== `campaign-${planHash.slice(0, 24)}` ||
    plan.nativeRequestVersion !== CAMPAIGN_NATIVE_VERSION ||
    JSON.stringify(plan.budget) !== JSON.stringify(CAMPAIGN_BUDGET)
  )
    throw new Error('campaign_manifest_binding_mismatch');
  const catalogBody = fs.readFileSync(path.join(directory, 'catalog.jsonl'), 'utf8');
  const trialsBody = fs.readFileSync(path.join(directory, 'trials.json'), 'utf8');
  if (
    campaignHash(catalogBody) !== plan.catalogHash ||
    campaignHash(trialsBody) !== plan.trialsHash
  )
    throw new Error('campaign_catalog_or_trials_changed');
  return { plan, trials: JSON.parse(trialsBody) };
}

function readEvents(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
}

export function loadCampaignRows(directory, phase) {
  const { trials } = loadCampaign(directory);
  return trials
    .filter((trial) => !phase || trial.phase === phase)
    .flatMap((trial) => {
      const completed = path.join(recordDirectory(directory, trial), 'raw.jsonl');
      const file = fs.existsSync(completed)
        ? completed
        : path.join(recordDirectory(directory, trial), 'interrupted.jsonl');
      return fs.existsSync(file) ? [JSON.parse(fs.readFileSync(file, 'utf8'))] : [];
    });
}

export function campaignDiskPorts(
  directory,
  ledgerDirectory,
  endpoint,
  { progress = () => {}, transport = createHttpJsonTransport() } = {},
) {
  return {
    now,
    progress,
    appendEvent: (event) =>
      writeCampaignFile(
        path.join(ledgerDirectory, `${String(event.sequence).padStart(10, '0')}.json`),
        JSON.stringify(event) + '\n',
      ),
    readBody: (trial) =>
      fs.readFileSync(path.join(directory, 'requests', `${trial.requestHash}.json`), 'utf8'),
    loadRaw: (trial) => {
      const file = path.join(recordDirectory(directory, trial), 'response.json');
      if (!fs.existsSync(file)) return null;
      const body = fs.readFileSync(file, 'utf8');
      return { evidence: JSON.parse(body), rawHash: campaignHash(body) };
    },
    writeRaw: (trial, evidence) => {
      const body = JSON.stringify(evidence) + '\n';
      writeCampaignFile(path.join(recordDirectory(directory, trial), 'response.json'), body);
      return campaignHash(body);
    },
    hasRow: (trial) => fs.existsSync(path.join(recordDirectory(directory, trial), 'raw.jsonl')),
    writeRow: (trial, row) =>
      writeCampaignFile(
        path.join(recordDirectory(directory, trial), 'raw.jsonl'),
        JSON.stringify(row) + '\n',
      ),
    writeUnknownRow: (trial, row) =>
      writeCampaignFile(
        path.join(recordDirectory(directory, trial), 'interrupted.jsonl'),
        JSON.stringify(row) + '\n',
      ),
    project: (args) => projectCampaignRecord({ ...args, profiles: prospectiveProfiles }),
    infer: async (request) => {
      let envelope = null;
      const capturingTransport = {
        postJson: async (args) => {
          const result = await transport.postJson(args);
          envelope = result;
          return result;
        },
      };
      const response = await inferTypeSafeRequest({
        endpoint,
        request,
        transport: capturingTransport,
      });
      const reportedProviderModel =
        typeof envelope?.value?.data?.model === 'string' ? envelope.value.data.model : null;
      return {
        response: { ...response, providerModel: reportedProviderModel },
        providerEnvelope: envelope,
        reportedProviderModel,
      };
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      live: { type: 'boolean', default: false },
      phase: { type: 'string', default: 'smoke' },
      'campaign-dir': {
        type: 'string',
        default: path.join(runsRoot, 'release-campaign-policy-v4'),
      },
      'max-requests': { type: 'string' },
      help: { type: 'boolean', default: false },
      status: { type: 'boolean', default: false },
      'diagnostics-file': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(
      'Offline prepare: node scripts/campaign.mjs [--diagnostics-file private-plan.json]\nStatus: node scripts/campaign.mjs --status\nLive/resume: node scripts/campaign.mjs --live --phase smoke|representation|matrix|extensions [--max-requests N]\nOne immutable global $4 allocation across all phases and campaign directories. Reserved IDs are never retried. No .env is read during offline preparation.',
    );
    return;
  }
  if (!CAMPAIGN_PHASES.includes(values.phase)) throw new Error('invalid_campaign_phase');
  const maxRequests =
    values['max-requests'] === undefined ? Infinity : Number(values['max-requests']);
  if (!(maxRequests === Infinity || (Number.isSafeInteger(maxRequests) && maxRequests > 0)))
    throw new Error('invalid_campaign_request_limit');
  const directory = path.resolve(values['campaign-dir']);
  if (!directory.startsWith(runsRoot + path.sep))
    throw new Error('campaign_directory_must_be_under_runs');
  if (values.status) {
    // Immutable files provide a coherent committed-event prefix while another
    // process owns the execution lock. Status never waits for model inference.
    const { plan, trials } = loadCampaign(directory);
    const ledger = unwrap(replayCampaignLedger(readEvents(globalLedgerDirectory)));
    console.log(
      JSON.stringify({
        status: 'campaign_status',
        snapshotMayBeInProgress: true,
        ...campaignProgressStatus(plan, trials, ledger),
        budget: campaignBudgetStatus(ledger),
      }),
    );
    return;
  }
  await withCampaignLock(globalLockPath, async () => {
    if (!values.live) {
      const diagnostics = values['diagnostics-file']
        ? JSON.parse(fs.readFileSync(values['diagnostics-file'], 'utf8'))
        : [];
      const plan = prepareCampaign(directory, {
        diagnostics,
        progress: (entry) => console.log(JSON.stringify(entry)),
      });
      const budget = campaignBudgetStatus(
        unwrap(replayCampaignLedger(readEvents(globalLedgerDirectory))),
      );
      console.log(
        JSON.stringify({
          status: 'prepared',
          live: false,
          campaignId: plan.campaignId,
          directory,
          catalogCases: plan.catalogCases,
          phases: plan.phaseCounts,
          queuedOtherSeeds: plan.queuedOtherSeeds,
          budget,
        }),
      );
      return;
    }
    const { plan, trials } = loadCampaign(directory);
    if (fs.existsSync(path.join(directory, 'operator-stop.json')))
      throw new Error('campaign_stopped_pending_explicit_template_approval');
    const events = readEvents(globalLedgerDirectory);
    if (['matrix', 'extensions'].includes(values.phase)) {
      const gatePath = path.join(directory, 'preflight-review.json');
      const review = fs.existsSync(gatePath) ? JSON.parse(fs.readFileSync(gatePath, 'utf8')) : null;
      unwrap(
        verifyCampaignPreflight({
          plan,
          trials,
          ledger: unwrap(replayCampaignLedger(events)),
          review,
        }),
      );
    }
    if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
    const endpoint = readEndpoint('jev', {
      ...process.env,
      JEV_MODEL: plan.model,
      JEV_REQUEST_VERSION: plan.nativeRequestVersion,
      JEV_INPUT_USD_PER_MILLION: '0.042',
      JEV_OUTPUT_USD_PER_MILLION: '0',
    });
    const result = await runCampaignPhase(
      { plan, trials, phase: values.phase, events, maxRequests },
      campaignDiskPorts(directory, globalLedgerDirectory, endpoint, {
        progress: (entry) => console.log(JSON.stringify(entry)),
      }),
    );
    console.log(JSON.stringify(unwrap(result)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      JSON.stringify({ status: 'error', code: error.message, details: error.details ?? null }),
    );
    process.exitCode = 1;
  });
}
