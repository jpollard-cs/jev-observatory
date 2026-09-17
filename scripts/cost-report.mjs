// Application/CLI adapter. This is the only cost-report layer that reads files.
// Historical evidence never goes through today's request builder; only future plans do.
// No .env, keys, balances, network requests or model calls are accessed here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ok, err } from '../harness/domain/result.mjs';
import { generateCases, corpusManifest } from '../harness/corpus.mjs';
import { buildTypeSafeRequest } from '../harness/typesafe.mjs';
import {
  PROTOCOL_VERSIONS,
  PRICING,
  PLANNING_BUDGET,
  usageCost,
  summarizeEvidence,
  planRequestCasesResult,
  scanEvidenceSources,
  assembleCostReport,
} from '../harness/cost-planning.mjs';
export { PRICING, PLANNING_BUDGET, usageCost, summarizeEvidence };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PROTOCOL_VERSION = 'advanced-v3';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** @template T @param {import('../harness/cost-planning.mjs').Result<T>} result @returns {T} */
function unwrap(result) {
  if (result.tag === 'ok') return result.value;
  const error = new Error(
    result.error.code === 'unsupported_protocol'
      ? 'Unsupported protocol version'
      : result.error.code,
  );
  error.code = result.error.code;
  throw error;
}
function* preparedRequests(model, options, protocolVersion) {
  for (const caseItem of generateCases(options))
    yield {
      caseItem,
      request: buildTypeSafeRequest(caseItem, model, { version: protocolVersion }),
    };
}
function planCaseGrid(model, options = {}, protocolVersion = DEFAULT_PROTOCOL_VERSION) {
  return unwrap(
    planRequestCasesResult({
      model,
      protocolVersion,
      plannedRequests: preparedRequests(model, options, protocolVersion),
      manifest: corpusManifest(),
    }),
  );
}
export function planCorpus(
  model = 'jev-latest',
  { protocolVersion = DEFAULT_PROTOCOL_VERSION } = {},
) {
  const plan = planCaseGrid(model, {}, protocolVersion);
  return {
    ...plan,
    expectedStarterCells: 15120,
    matchesExpectedStarterDesign: plan.cells === 15120,
  };
}
export function planExpandedIntegration(
  model = 'jev-latest',
  { protocolVersion = DEFAULT_PROTOCOL_VERSION } = {},
) {
  const conditions = {
    seedsPerFamily: 2,
    contextChars: [512, 4096, 16384],
    positions: ['middle'],
    policyProfiles: ['balanced'],
    outputModes: ['structured'],
    promptArms: ['policy'],
  };
  const plan = planCaseGrid(model, conditions, protocolVersion);
  if (
    plan.cells !== 216 ||
    plan.uniqueCaseIds !== 216 ||
    plan.familyCount !== 18 ||
    plan.variantCounts.attack !== 108 ||
    plan.variantCounts.benign !== 108
  )
    throw new Error(
      'Expanded integration design changed; review the intended 216-case budget before proceeding',
    );
  return {
    ...plan,
    kind: 'proposed_expanded_integration',
    conditions,
    selection:
      'Deterministic full-generator slice: all 18 families, both variants, seeds 0/1, all three configured lengths; no split filter',
    expectedCells: 216,
    matchesExpectedDesign: true,
    requestCap: 216,
    fitsRecommendedMaximum:
      plan.reservation.totalCostUsd <= PLANNING_BUDGET.recommendedMaximumNextStageUsd,
    launchedByThisScript: false,
    confirmatory: false,
  };
}
function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(filename));
    else if (entry.isFile() && ['raw.jsonl', 'result.json'].includes(entry.name))
      files.push(filename);
  }
  return files;
}

function readEvidenceSources(runsDir) {
  return filesUnder(runsDir).map((filename) => ({
    contents: fs.readFileSync(filename, 'utf8'),
    relative: path.relative(root, filename),
    modifiedAt: fs.statSync(filename).mtime.toISOString(),
    isDiagnostic: path.basename(filename) === 'result.json',
  }));
}
export function scanRuns(runsDir = path.join(root, 'runs')) {
  return scanEvidenceSources(readEvidenceSources(runsDir));
}
function planningSnapshotBasis(protocolVersion) {
  const entrypoint = 'harness/typesafe.mjs';
  return {
    selectedProtocolVersion: protocolVersion,
    plannedRequests:
      'Current working-tree native builder with an explicit protocol version; requestCorpusHash binds all serialized request bytes including EntryType structures.',
    historicalAccounting:
      'Recorded usage and recorded request bytes (or an archived request object) only. Missing usage stays unknown. Never rebuild a past request with the current builder.',
    nativeBuilderEntrypoint: {
      file: entrypoint,
      sha256: sha(fs.readFileSync(path.join(root, entrypoint), 'utf8')),
    },
    entrypointHashScope:
      'Entrypoint hash is not a transitive dependency fingerprint; requestCorpusHash is the authoritative serialized-request snapshot.',
    legacyDocumentation:
      'docs/full-run-cost.md historical numeric snapshot is legacy-v2; new advanced-v3 proposals must be costed separately.',
  };
}
/** File failures become tagged Results here; exported compatibility API still throws. */
export function createCostReportResult({
  runsDir = path.join(root, 'runs'),
  model = 'jev-latest',
  protocolVersion = DEFAULT_PROTOCOL_VERSION,
  now = new Date().toISOString(),
} = {}) {
  if (!PROTOCOL_VERSIONS.includes(protocolVersion)) return err('unsupported_protocol');
  try {
    const plan = planCorpus(model, { protocolVersion }),
      nextStage = planExpandedIntegration(model, { protocolVersion }),
      scan = scanRuns(runsDir);
    return ok(
      assembleCostReport({
        plan,
        nextStage,
        scan,
        now,
        snapshotBasis: planningSnapshotBasis(protocolVersion),
      }),
    );
  } catch (error) {
    return err('cost_report_error', { context: { causeCode: error.code ?? 'unknown_cost_error' } });
  }
}
export function createCostReport(options = {}) {
  return unwrap(createCostReportResult(options));
}
export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'runs-dir': { type: 'string', default: path.join(root, 'runs') },
      model: { type: 'string', default: 'jev-latest' },
      'protocol-version': { type: 'string', default: DEFAULT_PROTOCOL_VERSION },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'Offline only: node scripts/cost-report.mjs [--runs-dir runs] [--model jev-latest] [--protocol-version advanced-v3|legacy-v2|legacy-v1]\nPrints JSON to stdout. Historical accounting reads archived bytes/usage only. Planned requests use the selected protocol; never loads .env or launches a model.',
    );
    return;
  }
  console.log(
    JSON.stringify(
      createCostReport({
        runsDir: path.resolve(values['runs-dir']),
        model: values.model,
        protocolVersion: values['protocol-version'],
      }),
      null,
      2,
    ),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
