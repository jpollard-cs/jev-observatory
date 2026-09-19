// Offline composition boundary: project the frozen campaign into versioned public summaries.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCampaign, loadCampaignRows } from './campaign.mjs';
import { aggregateRows } from './aggregate.mjs';
import { corpusManifest } from '../harness/corpus.mjs';
import { replayCampaignLedger, campaignBudgetStatus } from '../harness/domain/campaign-budget.mjs';
import { campaignProgressStatus, campaignHash } from '../harness/domain/campaign-plan.mjs';
import { summarizeRepresentationDiagnostics } from '../harness/domain/representation-report.mjs';
import { summarizeExtensionRows } from '../harness/domain/extension-report.mjs';
import { unwrap } from '../harness/domain/result.mjs';
import { matrixCaseEvidence } from '../harness/domain/case-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'runs/release-campaign-policy-v4');
const ledgerDirectory = path.join(root, 'runs/campaign-budget-v1');
if (fs.existsSync(path.join(root, 'runs/.campaign.lock')))
  throw new Error(
    'Finish or pause the active campaign invocation before writing canonical reports. Read-only campaign --status is available during execution.',
  );
const read = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const write = (name, data) =>
  fs.writeFileSync(path.join(root, 'data', name), JSON.stringify(data, null, 2) + '\n');
const { plan, trials } = loadCampaign(directory);
const eventFiles = fs.existsSync(ledgerDirectory)
  ? fs
      .readdirSync(ledgerDirectory)
      .filter((f) => f.endsWith('.json'))
      .sort()
  : [];
const events = eventFiles.map((f) => read(path.join(ledgerDirectory, f)));
const ledger = unwrap(replayCampaignLedger(events));
const budget = campaignBudgetStatus(ledger);
const progress = campaignProgressStatus(plan, trials, ledger);
const generatedAt = new Date().toISOString();
const operatorStopPath = path.join(directory, 'operator-stop.json');
const operatorStop = fs.existsSync(operatorStopPath) ? read(operatorStopPath) : null;
const observedThrough = events.at(-1)?.recordedAt ?? null;
const status = {
  schemaVersion: 1,
  operatorStop,
  campaignId: plan.campaignId,
  planHash: plan.planHash,
  generatedAt,
  observedThrough,
  maximumUsd: budget.maximumUsd,
  knownCostUsd: budget.knownUsageUsd,
  unresolvedReservationUsd: budget.unresolvedReservationUsd,
  committedUsd: budget.committedUsd,
  remainingUsd: budget.remainingUsd,
  haltedReason: budget.haltedReason,
  catalogCases: plan.catalogCases,
  queuedCases: progress.fullCatalogQueued,
  dispatched: budget.dispatched,
  unresolvedUsage: budget.unresolved,
  userReportedBalanceUsd: 5,
  providerInvoiceInspected: false,
  pricing: plan.budget,
  policyProfiles: plan.policyProfiles,
  validation: plan.validation,
  protocolHash: plan.protocolHash,
  phases: Object.entries(progress.phases).map(([phase, p]) => ({
    phase,
    planned: p.planned,
    attempted: p.dispatched,
    recorded: p.outcomesRecorded,
    remaining: p.queued,
    unknownDispatch: p.interruptedUnknown,
    unknownUsage: p.usageUnknown,
    reservationUsd:
      trials.filter((t) => t.phase === phase).reduce((n, t) => n + t.reservationNanoUsd, 0) / 1e9,
    status:
      p.queued === 0
        ? p.interruptedUnknown
          ? 'Recorded with unknown dispatch outcomes'
          : 'Complete'
        : p.dispatched
          ? 'Partial'
          : 'Awaiting execution',
  })),
  scope: plan.selection,
  allTestsPreserved: true,
  githubPushed: false,
};
status.phases.push({
  phase: 'Additional corpus seeds',
  planned: plan.queuedOtherSeeds,
  attempted: 0,
  recorded: 0,
  remaining: plan.queuedOtherSeeds,
  unknownDispatch: 0,
  unknownUsage: 0,
  status: 'Frozen and preserved for a subsequent phase',
});
write('campaign-status.json', status);
const matrix = loadCampaignRows(directory, 'matrix');
if (matrix.length) {
  const manifest = {
    ...corpusManifest(),
    cases: plan.phaseCounts.matrix,
    fullCatalogCases: plan.catalogCases,
    protocolHash: plan.protocolHash,
    corpusProtocolHash: plan.corpusProtocolHash,
    selection: plan.selection,
  };
  const report = aggregateRows(matrix, { manifest, now: generatedAt });
  report.observedThrough = observedThrough;
  report.campaignPlanHash = plan.planHash;
  report.caseEvidence = matrixCaseEvidence(matrix);
  write('campaign-report.json', report);
}
const diagnostics = trials
  .filter((t) => t.kind === 'diagnostic')
  .map((t) => ({
    ...t.diagnostic,
    request: read(path.join(directory, 'requests', `${t.requestHash}.json`)),
  }));
const representation = loadCampaignRows(directory, 'representation');
if (representation.length) {
  const report = unwrap(
    summarizeRepresentationDiagnostics(diagnostics, representation, {
      generatedAt,
      observedThrough,
      campaignPlanHash: plan.planHash,
      source: 'direct_api_campaign_representation',
      planHash: campaignHash(JSON.stringify(diagnostics)),
    }),
  );
  write('representation-report.json', report);
}
const extensions = loadCampaignRows(directory, 'extensions');
if (extensions.length) {
  const fixtures = trials.filter((t) => t.kind === 'extension').map((t) => t.fixture);
  write(
    'extension-report.json',
    unwrap(
      summarizeExtensionRows(fixtures, extensions, {
        generatedAt,
        observedThrough,
        campaignPlanHash: plan.planHash,
        source: 'direct_api_campaign_extensions',
      }),
    ),
  );
}
console.log(
  JSON.stringify({
    status: 'reported',
    matrix: matrix.length,
    representation: representation.length,
    extensions: extensions.length,
    knownCostUsd: status.knownCostUsd,
    heldUsd: status.unresolvedReservationUsd,
    queuedCatalog: status.queuedCases,
  }),
);
