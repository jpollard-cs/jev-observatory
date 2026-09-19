/** One explicitly authorized supplemental request. Never edits the original pilot. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { writeCampaignFile, withCampaignLock } from './campaign.mjs';
import {
  loadRichPilotPlan,
  loadRichPilotRows,
  richDiskPorts,
  createRichInference,
} from './rich-pilot.mjs';
import {
  richHash,
  replayRichLedger,
  runRichPilot,
} from '../harness/application/rich-pilot-run.mjs';
import {
  buildRichRepairPlan,
  verifyRichRepairReview,
  summarizeRichRepair,
  REPAIR_LIMITS,
} from '../harness/domain/rich-pilot-repair.mjs';
import { unwrap } from '../harness/domain/result.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalDirectory = path.join(root, 'runs/rich-template-pilot-v1');
const repairDirectory = path.join(root, 'runs/rich-template-pilot-repair-v1');
const ledgerDirectory = path.join(root, 'runs/rich-restart-budget-v1');
const lockPath = path.join(root, 'runs/.rich-restart.lock');
const reviewPath = path.join(root, 'data/rich-pilot-repair-review.json');
const events = () =>
  fs
    .readdirSync(ledgerDirectory)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => JSON.parse(fs.readFileSync(path.join(ledgerDirectory, n), 'utf8')));

export function prepareRichRepair() {
  const sourcePlan = loadRichPilotPlan(originalDirectory),
    sourceRows = loadRichPilotRows(originalDirectory);
  const failures = sourceRows.filter((row) => row.status !== 'ok');
  if (failures.length !== 1) throw new Error('repair_requires_exactly_one_failure');
  const failed = failures[0];
  const sourceRawBody = fs.readFileSync(
    path.join(originalDirectory, 'records', richHash(failed.id), 'response.json'),
    'utf8',
  );
  const requestBody = fs.readFileSync(
    path.join(originalDirectory, 'requests', `${failed.requestHash}.json`),
    'utf8',
  );
  return unwrap(
    buildRichRepairPlan({
      sourcePlan,
      sourceRows,
      sourceRawBody,
      requestBody,
      ledger: unwrap(replayRichLedger(events())),
    }),
  );
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      prepare: { type: 'boolean', default: false },
      live: { type: 'boolean', default: false },
      report: { type: 'boolean', default: false },
      'max-requests': { type: 'string' },
      'max-cost-usd': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'Offline plan: node scripts/repair-rich-pilot.mjs --prepare\nOne explicit supplemental attempt: node scripts/repair-rich-pilot.mjs --live --max-requests 1 --max-cost-usd 0.01\nSeparate offline views: node scripts/repair-rich-pilot.mjs --report\nSame $3 restart ledger; original failure and reservation retained; no automatic retry.',
    );
    return;
  }
  if ([values.prepare, values.live, values.report].filter(Boolean).length !== 1)
    throw new Error('choose_repair_prepare_live_or_report');
  if (
    values.live &&
    (Number(values['max-requests']) !== 1 || Number(values['max-cost-usd']) !== 0.01)
  )
    throw new Error('repair_requires_explicit_one_request_and_001_usd_caps');
  await withCampaignLock(lockPath, async () => {
    const frozen = prepareRichRepair();
    if (values.prepare) {
      writeCampaignFile(
        path.join(repairDirectory, 'requests', `${frozen.plan.source.requestHash}.json`),
        frozen.requestBody,
      );
      writeCampaignFile(
        path.join(repairDirectory, 'manifest.json'),
        JSON.stringify(frozen.plan, null, 2) + '\n',
      );
      console.log(
        JSON.stringify({
          status: 'repair_prepared',
          live: false,
          planHash: frozen.plan.planHash,
          sourcePlanHash: frozen.plan.source.planHash,
          requestHash: frozen.plan.source.requestHash,
          maximumRequests: 1,
          maximumStageCostUsd: 0.01,
          planningReservationUsd: frozen.plan.plannedReservationNanoUsd / 1e9,
          artifactPath: repairDirectory,
        }),
      );
      return;
    }
    const plan = loadRichPilotPlan(repairDirectory);
    if (
      plan.planHash !== frozen.plan.planHash ||
      JSON.stringify(plan.repairLimits) !== JSON.stringify(REPAIR_LIMITS)
    )
      throw new Error('repair_frozen_plan_changed');
    if (values.report) {
      const rows = loadRichPilotRows(repairDirectory);
      if (rows.length > 1) throw new Error('repair_multiple_observations');
      const originalReport = JSON.parse(
        fs.readFileSync(path.join(root, 'data/rich-pilot-report.json'), 'utf8'),
      );
      const report = unwrap(
        summarizeRichRepair({
          plan,
          originalReport,
          repairRow: rows[0] ?? null,
          request: JSON.parse(frozen.requestBody),
        }),
      );
      const output = path.join(root, 'data/rich-pilot-repair-report.json');
      writeCampaignFile(output, JSON.stringify(report, null, 2) + '\n');
      console.log(
        JSON.stringify({
          status: report.status,
          original: report.original,
          allAttempts: report.allAttempts,
          explicitCaseCompletion: report.explicitCaseCompletion,
          reportPath: output,
        }),
      );
      return;
    }
    const review = fs.existsSync(reviewPath)
      ? JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
      : null;
    unwrap(verifyRichRepairReview(plan, review));
    // Prior raw evidence and the bound user-authorized review are checked before credentials.
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
        { plan, events: events(), limit: 1 },
        richDiskPorts(repairDirectory, ledgerDirectory, {
          infer,
          pause: async () => {},
          progress: (entry) =>
            console.log(JSON.stringify({ ...entry, repairMaximumStageUsd: 0.01 })),
        }),
      ),
    );
    console.log(
      JSON.stringify({ ...result, repairMaximumStageUsd: 0.01, artifactPath: repairDirectory }),
    );
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(
      JSON.stringify({ status: 'error', code: error.details?.error?.code ?? error.message }),
    );
    process.exitCode = 1;
  });
