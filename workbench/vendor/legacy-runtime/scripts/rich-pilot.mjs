/** New approved rich pilot; separate accounting from the historical $4 campaign. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { writeCampaignFile, withCampaignLock } from './campaign.mjs';
import { unwrap } from '../harness/domain/result.mjs';
import {
  RICH_LIMITS,
  richHash,
  freezeRichPilotPlan,
  verifyRichApproval,
  verifyRichPreflight,
  replayRichLedger,
  richBudgetStatus,
  runRichPilot,
} from '../harness/application/rich-pilot-run.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'runs/rich-template-pilot-v1');
const ledgerDirectory = path.join(root, 'runs/rich-restart-budget-v1');
const lockPath = path.join(root, 'runs/.rich-restart.lock');
const templatePath = path.join(root, 'policies/prompt-injection-policy-template.md');
const approvalPath = path.join(root, 'data/rich-template-approval.json');
const preflightPath = path.join(root, 'data/rich-pilot-preflight-review.json');
const transportReviewPath = path.join(root, 'data/rich-pilot-transport-review.json');
const recordDirectory = (base, row) => path.join(base, 'records', richHash(row.id));
const now = () => new Date().toISOString();

export function saveRichPilotPlan(base, source) {
  const frozen = unwrap(freezeRichPilotPlan(source));
  for (const [hash, body] of Object.entries(frozen.bodies))
    writeCampaignFile(path.join(base, 'requests', `${hash}.json`), body);
  // Last file is the commit marker. Existing different plans cannot be overwritten.
  writeCampaignFile(path.join(base, 'manifest.json'), JSON.stringify(frozen.plan, null, 2) + '\n');
  return frozen.plan;
}

export function loadRichPilotPlan(base = directory) {
  const plan = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  const { planHash, stageId, ...core } = plan;
  if (
    richHash(JSON.stringify(core)) !== planHash ||
    stageId !== `rich-${planHash.slice(0, 24)}` ||
    JSON.stringify(plan.limits) !== JSON.stringify(RICH_LIMITS)
  )
    throw new Error('rich_manifest_binding_mismatch');
  return plan;
}

function readEvents(base) {
  return fs.existsSync(base)
    ? fs
        .readdirSync(base)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8')))
    : [];
}

export function loadRichPilotRows(base = directory) {
  return loadRichPilotPlan(base).rows.flatMap((row) => {
    const completed = path.join(recordDirectory(base, row), 'raw.jsonl');
    const file = fs.existsSync(completed)
      ? completed
      : path.join(recordDirectory(base, row), 'interrupted.jsonl');
    return fs.existsSync(file) ? [JSON.parse(fs.readFileSync(file, 'utf8'))] : [];
  });
}

/** Persistence ports can be tested with an injected infer function and temporary directories. */
export function richDiskPorts(
  base,
  ledgerBase,
  { infer, progress = () => {}, pause = () => delay(300) } = {},
) {
  return {
    now,
    progress,
    pause,
    infer,
    appendEvent: (event) =>
      writeCampaignFile(
        path.join(ledgerBase, `${String(event.sequence).padStart(10, '0')}.json`),
        JSON.stringify(event) + '\n',
      ),
    readBody: (row) =>
      fs.readFileSync(path.join(base, 'requests', `${row.requestHash}.json`), 'utf8'),
    loadRaw: (row) => {
      const file = path.join(recordDirectory(base, row), 'response.json');
      if (!fs.existsSync(file)) return null;
      const body = fs.readFileSync(file, 'utf8');
      return { evidence: JSON.parse(body), rawHash: richHash(body) };
    },
    writeRaw: (row, evidence) => {
      const body = JSON.stringify(evidence) + '\n';
      writeCampaignFile(path.join(recordDirectory(base, row), 'response.json'), body);
      return richHash(body);
    },
    hasRow: (row) => fs.existsSync(path.join(recordDirectory(base, row), 'raw.jsonl')),
    writeRow: (row, value) =>
      writeCampaignFile(
        path.join(recordDirectory(base, row), 'raw.jsonl'),
        JSON.stringify(value) + '\n',
      ),
    writeUnknown: (row, value) =>
      writeCampaignFile(
        path.join(recordDirectory(base, row), 'interrupted.jsonl'),
        JSON.stringify(value) + '\n',
      ),
  };
}

/** Raw body capture precedes TypeSafe interpretation; neither headers nor keys are persisted. */
export async function createRichInference(endpoint, { fetchImpl = fetch } = {}) {
  const { inferTypeSafeRequest } = await import('../harness/provider.mjs');
  const { createHttpJsonTransport } = await import('../harness/adapters/http-json.mjs');
  return async (request) => {
    let httpResponse = null,
      providerEnvelope = null;
    const transport = createHttpJsonTransport({
      fetchImpl: async (url, options) => {
        const received = await fetchImpl(url, options);
        let bodyText = null,
          bodyCaptureError = null;
        try {
          bodyText = await received.clone().text();
        } catch {
          bodyCaptureError = 'raw_body_capture_failed';
        }
        httpResponse = { status: received.status, bodyText, bodyCaptureError };
        return received;
      },
    });
    const response = await inferTypeSafeRequest({
      endpoint,
      request,
      timeoutMs: 90000,
      transport: {
        postJson: async (args) => {
          const result = await transport.postJson(args);
          providerEnvelope = result;
          return result;
        },
      },
    });
    const reportedProviderModel =
      typeof providerEnvelope?.value?.data?.model === 'string'
        ? providerEnvelope.value.data.model
        : null;
    return {
      response: { ...response, providerModel: reportedProviderModel },
      reportedProviderModel,
      providerEnvelope,
      httpResponse,
    };
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      prepare: { type: 'boolean', default: false },
      live: { type: 'boolean', default: false },
      status: { type: 'boolean', default: false },
      'max-requests': { type: 'string' },
      'max-cost-usd': { type: 'string' },
      limit: { type: 'string' },
      'resume-transport-after-review': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'Offline freeze: node scripts/rich-pilot.mjs --prepare\nLive/resume: node scripts/rich-pilot.mjs --live --max-requests 48 --max-cost-usd 0.30 [--limit 1] [--resume-transport-after-review]\nStatus: node scripts/rich-pilot.mjs --status\nSeparate $3 restart ledger; $0.30 stage limit; no retries. --limit caps additional dispatches in this invocation. Transport review reads data/rich-pilot-transport-review.json and permits only unattempted rows.',
    );
    return;
  }
  if ([values.prepare, values.live, values.status].filter(Boolean).length !== 1)
    throw new Error('choose_rich_prepare_live_or_status');
  if (values['resume-transport-after-review'] && !values.live)
    throw new Error('rich_transport_resume_requires_live');
  if (
    values.live &&
    (Number(values['max-requests']) !== 48 || Number(values['max-cost-usd']) !== 0.3)
  )
    throw new Error('rich_live_requires_explicit_48_request_and_030_usd_caps');
  const limit = values.limit === undefined ? 48 : Number(values.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 48)
    throw new Error('invalid_rich_invocation_limit');
  if (values.status) {
    const plan = loadRichPilotPlan();
    const ledger = unwrap(replayRichLedger(readEvents(ledgerDirectory)));
    console.log(
      JSON.stringify({
        status: 'rich_pilot_status',
        stageId: plan.stageId,
        plannedRequests: plan.rows.length,
        ...richBudgetStatus(ledger, plan.stageId),
        artifactPath: directory,
        snapshotMayBeInProgress: true,
      }),
    );
    return;
  }
  await withCampaignLock(lockPath, async () => {
    if (values.prepare) {
      const { buildRichPilotPlan } = await import('../harness/domain/rich-pilot-request.mjs');
      const source = unwrap(
        buildRichPilotPlan({
          templateText: fs.readFileSync(templatePath, 'utf8'),
          model: 'jev-latest',
        }),
      );
      const plan = saveRichPilotPlan(directory, source);
      console.log(
        JSON.stringify({
          status: 'rich_pilot_prepared',
          live: false,
          stageId: plan.stageId,
          templateHash: plan.templateHash,
          plannedRequests: plan.rows.length,
          planningReservationUsd: plan.plannedReservationNanoUsd / 1e9,
          artifactPath: directory,
        }),
      );
      return;
    }
    const plan = loadRichPilotPlan();
    const approval = fs.existsSync(approvalPath)
      ? JSON.parse(fs.readFileSync(approvalPath, 'utf8'))
      : null;
    unwrap(verifyRichApproval(plan, approval));
    const preflight = fs.existsSync(preflightPath)
      ? JSON.parse(fs.readFileSync(preflightPath, 'utf8'))
      : null;
    unwrap(verifyRichPreflight(plan, preflight));
    const events = readEvents(ledgerDirectory);
    unwrap(replayRichLedger(events));
    const transportReview = values['resume-transport-after-review']
      ? JSON.parse(fs.readFileSync(transportReviewPath, 'utf8'))
      : null;
    // Approval/manifest checks are complete before reading any credential-bearing configuration.
    if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
    const { readEndpoint } = await import('../harness/provider.mjs');
    const endpoint = readEndpoint('jev', {
      ...process.env,
      JEV_MODEL: plan.model,
      JEV_REQUEST_VERSION: 'policy-v4',
      JEV_INPUT_USD_PER_MILLION: '0.042',
      JEV_OUTPUT_USD_PER_MILLION: '0',
    });
    const infer = await createRichInference(endpoint);
    const result = unwrap(
      await runRichPilot(
        { plan, events, limit, transportReview },
        richDiskPorts(directory, ledgerDirectory, {
          infer,
          progress: (entry) => console.log(JSON.stringify(entry)),
        }),
      ),
    );
    console.log(JSON.stringify({ ...result, artifactPath: directory }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(
      JSON.stringify({ status: 'error', code: error.details?.error?.code ?? error.message }),
    );
    process.exitCode = 1;
  });
