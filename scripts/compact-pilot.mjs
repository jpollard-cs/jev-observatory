/** Single-pass compact-guide rerun. No changes to the original four-arm experiment. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { unwrap } from '../harness/domain/result.mjs';
import { buildRichPilotPlan } from '../harness/domain/rich-pilot-request.mjs';
import { compactSource } from '../harness/domain/compact-experiment.mjs';
import { COMPACT_PILOT_PROTOCOL, buildCompactPilotReport, compactPilotMarkdown } from '../harness/domain/compact-pilot-report.mjs';
import { freezeRichPilotPlan, richHash, replayRichLedger, richBudgetStatus,
  runRichPilot, projectRichRecord, verifyRichRequest } from '../harness/application/rich-pilot-run.mjs';
import { writeCampaignFile, withCampaignLock } from './campaign.mjs';
import { richDiskPorts, createRichInference, loadRichPilotPlan } from './rich-pilot.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const immutableJson = (file, value) => writeCampaignFile(file, JSON.stringify(value, null, 2) + '\n');

/** Root and inference are injectable for offline integration tests. Never reads credentials in preparation/reporting. */
export function createCompactPilot(root = defaultRoot, { pause = () => delay(300) } = {}) {
  root = path.resolve(root);
  const base = path.join(root, 'runs', COMPACT_PILOT_PROTOCOL);
  const ledgerBase = path.join(root, 'runs/rich-restart-budget-v1');
  const originalBase = path.join(root, 'runs/rich-template-pilot-v1');
  const repairBase = path.join(root, 'runs/rich-template-pilot-repair-v1');
  const events = () => fs.readdirSync(ledgerBase).filter((n) => /^\d{10}\.json$/.test(n)).sort().map((n) => json(path.join(ledgerBase, n)));
  const ledger = () => unwrap(replayRichLedger(events()));
  const load = () => loadRichPilotPlan(base);

  function observations(plan, directory, account) {
    const ports = richDiskPorts(directory, ledgerBase);
    return plan.rows.map((row) => {
      const request = unwrap(verifyRichRequest(row, ports.readBody(row), plan.model));
      const saved = ports.loadRaw(row);
      const key = `${plan.stageId}:${row.id}`;
      const reserved = account.reservations[key];
      if (!saved) {
        if (reserved?.settled) throw Error('compact_pilot_settled_evidence_missing');
        return { ...row, valid: false, status: reserved ? 'unknown_dispatch' : 'not_run' };
      }
      if (!reserved || saved.evidence.key !== key || saved.evidence.requestHash !== row.requestHash ||
          reserved.requestHash !== row.requestHash || (reserved.settled && reserved.settlement.rawHash !== saved.rawHash))
        throw Error('compact_pilot_evidence_binding_mismatch');
      const record = projectRichRecord(plan, row, request, saved.evidence);
      return { ...row, valid: reserved.settled && record.parsed.valid,
        status: reserved.settled ? record.status : 'unsettled_saved_response',
        answers: record.answers, usage: record.usage, latencyMs: record.latencyMs,
        rawHash: saved.rawHash, providerModel: record.providerModel,
        receivedAt: saved.evidence.receivedAt, sourceStageId: plan.stageId,
        sourceDirectory: path.relative(root, directory), error: record.parsed.error ?? null };
    });
  }

  function baseline(account = ledger()) {
    const original = loadRichPilotPlan(originalBase);
    const rows = observations(original, originalBase, account);
    let repair = null;
    const repairs = fs.existsSync(path.join(repairBase, 'manifest.json'))
      ? (repair = loadRichPilotPlan(repairBase), observations(repair, repairBase, account)) : [];
    if (repair && (repair.source?.planHash !== original.planHash || repair.rows.length !== 1 ||
      repair.source.originalCaseId !== repair.rows[0].id)) throw Error('compact_pilot_repair_not_bound');
    const completed = rows.map((row) => {
      if (row.valid) return { ...row, baselineOrigin: 'original' };
      const fixed = repairs.find((r) => r.id === row.id);
      if (!fixed?.valid || fixed.requestHash !== row.requestHash ||
          repair.source.rawHash !== row.rawHash || row.status !== 'error')
        throw Error('compact_pilot_baseline_incomplete');
      return { ...fixed, baselineOrigin: 'separate_transport_repair', originalFailureRawHash: row.rawHash };
    });
    const models = [...new Set(completed.map((r) => r.providerModel))];
    if (completed.length !== 48 || models.length !== 1 || !models[0]) throw Error('compact_pilot_baseline_identity_ambiguous');
    return { original, rows: completed, binding: {
      originalPlanHash: original.planHash, repairPlanHash: repair?.planHash ?? null,
      requiredProviderModel: models[0],
      rows: completed.map((r) => ({ id: r.id, requestHash: r.requestHash, rawHash: r.rawHash,
        stageId: r.sourceStageId, baselineOrigin: r.baselineOrigin })),
    } };
  }

  function sourceHashes() {
    const files = fs.readdirSync(path.join(root, 'harness'), { recursive: true })
      .filter((n) => n.endsWith('.mjs')).map((n) => `harness/${n}`);
    files.push('scripts/compact-pilot.mjs', 'scripts/run-compact-pilot.sh', 'scripts/rich-pilot.mjs', 'scripts/campaign.mjs',
      'cases/rich-pilot-fixtures.mjs', 'policies/prompt-injection-policy-template.md',
      'policies/classifier-guide-v3-compact.draft.json');
    return Object.fromEntries(files.sort().map((f) => [f, richHash(read(path.join(root, f)))]));
  }

  function freeze() {
    const historic = baseline();
    const reference = unwrap(buildRichPilotPlan({ templateText: read(path.join(root, 'policies/prompt-injection-policy-template.md')) }));
    if (unwrap(freezeRichPilotPlan(reference)).plan.planHash !== historic.original.planHash)
      throw Error('compact_pilot_reference_no_longer_matches_original');
    const guide = json(path.join(root, 'policies/classifier-guide-v3-compact.draft.json'));
    const source = unwrap(compactSource(reference, guide, null, 'C'));
    source.protocolVersion = COMPACT_PILOT_PROTOCOL;
    source.recordKind = 'compact_single_pass_development';
    source.design = { ...reference.design, support: 'Model-only; unchanged compact v3 draft guide once per request; no external detector, decoding, normalization, or verdict repair.' };
    source.baseline = historic.binding;
    source.baselineGuideBytes = reference.templateUtf8;
    source.sourceFiles = sourceHashes();
    source.changedRequestFields = ['state.classifierGuide'];
    source.annotationStatus = 'Predeclared primary excludes three disputed attack-labeled OUTPUT PASS acrostics; all 48 retained.';
    const bytes = source.rows.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.request)), 0);
    source.costs = { ...reference.costs, serializedBytes: bytes, reservedInputTokens: bytes + 48 * 256,
      reservationUsd: (bytes + 48 * 256) * 42 / 1e9 };
    return unwrap(freezeRichPilotPlan(source));
  }

  function prepare() {
    const frozen = freeze();
    for (const [hash, body] of Object.entries(frozen.bodies))
      writeCampaignFile(path.join(base, 'requests', hash + '.json'), body);
    immutableJson(path.join(base, 'manifest.json'), frozen.plan);
    return frozen.plan;
  }

  function stopReason(plan, account, rows) {
    const budget = richBudgetStatus(account, plan.stageId);
    if (budget.haltedReason) return budget.haltedReason;
    if (rows.some((r) => r.status === 'unknown_dispatch')) return 'compact_pilot_uncertain_dispatch_requires_review_no_retry';
    if (rows.some((r) => r.providerModel && r.providerModel !== plan.baseline.requiredProviderModel))
      return 'compact_pilot_provider_differs_from_historical_baseline';
    return null;
  }

  function report() {
    const plan = load(), account = ledger(), historic = baseline(account);
    if (JSON.stringify(historic.binding) !== JSON.stringify(plan.baseline)) throw Error('compact_pilot_baseline_changed');
    const rows = observations(plan, base, account);
    return buildCompactPilotReport({ plan, baseline: historic.rows, rows,
      budget: richBudgetStatus(account, plan.stageId), stopReason: stopReason(plan, account, rows) });
  }

  function writeReport() {
    const result = report();
    // Derived reports are replaceable; committed requests, responses and ledger events are not.
    for (const [name, body] of [['report.json', JSON.stringify(result, null, 2) + '\n'],
      ['report.md', compactPilotMarkdown(result)]]) {
      const target = path.join(base, name), temporary = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, body, { mode: 0o600 });
      fs.renameSync(temporary, target);
    }
    return result;
  }

  async function execute({ infer, limit = 48, onProgress = () => {} }) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 48) throw Error('compact_pilot_invalid_limit');
    const plan = load();
    if (freeze().plan.planHash !== plan.planHash) throw Error('compact_pilot_sources_changed');
    let count = 0;
    while (true) {
      const account = ledger(), rows = observations(plan, base, account);
      const halt = stopReason(plan, account, rows);
      if (halt) throw Error(halt);
      const unresolved = rows.some((r) => r.status === 'unsettled_saved_response');
      if (rows.every((r) => r.valid)) return { dispatchedNow: count, status: 'complete' };
      if (count >= limit && !unresolved) return { dispatchedNow: count, status: 'partial' };
      const result = unwrap(await runRichPilot({ plan, events: events(), limit: 1 },
        richDiskPorts(base, ledgerBase, { infer, pause: () => {}, progress: (row) => onProgress(row) })));
      count += result.dispatchedNow;
      if (result.haltedReason || (result.reason && result.reason !== 'invocation_limit'))
        throw Error(result.haltedReason || result.reason);
      if (!result.dispatchedNow && !result.recovered) throw Error('compact_pilot_no_progress');
      if (count < limit) await pause();
    }
  }

  async function main(argv = process.argv.slice(2)) {
    const { values } = parseArgs({ args: argv, options: {
      prepare: { type: 'boolean' }, live: { type: 'boolean' }, status: { type: 'boolean' },
      report: { type: 'boolean' }, help: { type: 'boolean' },
      'approve-plan': { type: 'string' }, 'max-cost-usd': { type: 'string' },
      'max-requests': { type: 'string' }, limit: { type: 'string' },
    } });
    if (values.help || !argv.length) {
      console.log('Offline: node scripts/compact-pilot.mjs --prepare\nRun/resume: node scripts/compact-pilot.mjs --live --approve-plan HASH --max-requests 48 --max-cost-usd 0.30 [--limit 1]\nOffline: --status or --report. Only compact first pass; no rich rerun, second pass, Qwen, or larger campaign.');
      return;
    }
    if ([values.prepare, values.live, values.status, values.report].filter(Boolean).length !== 1)
      throw Error('choose_prepare_live_status_or_report');
    await withCampaignLock(path.join(root, 'runs/.rich-restart.lock'), async () => {
      if (values.prepare) {
        const plan = prepare();
        console.log(JSON.stringify({ status: 'prepared_offline', live: false,
          planHash: plan.planHash, plannedRequests: plan.rows.length,
          planningReservationUsd: plan.plannedReservationNanoUsd / 1e9,
          stageMaximumUsd: 0.30, restartMaximumUsd: 3,
          requiredProviderModel: plan.baseline.requiredProviderModel,
          ...richBudgetStatus(ledger(), plan.stageId), directory: base }));
        writeReport();
        return;
      }
      const plan = load();
      if (values.live) {
        const limit = values.limit === undefined ? 48 : Number(values.limit);
        if (values['approve-plan'] !== plan.planHash || Number(values['max-requests']) !== 48 ||
            Number(values['max-cost-usd']) !== 0.30 || !Number.isSafeInteger(limit) || limit < 1 || limit > 48)
          throw Error('compact_pilot_explicit_approval_and_caps_required');
        if (freeze().plan.planHash !== plan.planHash) throw Error('compact_pilot_sources_changed');
        const prior = report();
        if (prior.stopReason) throw Error(prior.stopReason);
        if (prior.status === 'complete') { console.log(JSON.stringify({ status: 'already_complete', newCalls: 0 })); return; }
        const account = ledger(), stage = account.stages[plan.stageId];
        const remainingAllowance = 300000000 - (stage?.knownNanoUsd ?? 0) - (stage?.heldNanoUsd ?? 0);
        if (account.knownNanoUsd + account.heldNanoUsd + remainingAllowance > 3000000000)
          throw Error('compact_pilot_restart_budget_insufficient');
        if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
        const { readEndpoint } = await import('../harness/provider.mjs');
        const endpoint = readEndpoint('jev', {
          ...process.env, JEV_MODEL: plan.model, JEV_REQUEST_VERSION: 'policy-v4',
          // Use the verified plan prices only when not configured; never overwrite a differing price.
          JEV_INPUT_USD_PER_MILLION: process.env.JEV_INPUT_USD_PER_MILLION ?? '0.042',
          JEV_OUTPUT_USD_PER_MILLION: process.env.JEV_OUTPUT_USD_PER_MILLION ?? '0',
        });
        if (endpoint.inputPrice !== 0.042 || endpoint.outputPrice !== 0) throw Error('compact_pilot_price_differs_from_plan');
        // This handoff is intentionally limited to the existing first-party TypeSafe endpoint.
        if (endpoint.url !== 'https://api.typesafe.ai/v1/systemone') throw Error('compact_pilot_endpoint_requires_review');
        immutableJson(path.join(base, 'approval.json'), { planHash: plan.planHash,
          authority: 'Explicit --approve-plan with 48-request and $0.30 caps',
          maximumRequests: 48, maximumStageCostUsd: 0.30, maximumRestartCostUsd: 3 });
        try {
          await execute({ infer: await createRichInference(endpoint), limit,
            onProgress: (row) => console.log(JSON.stringify(row)) });
        } finally { writeReport(); }
      }
      const result = values.report || values.live ? writeReport() : report();
      console.log(JSON.stringify({ status: result.status, stopReason: result.stopReason,
        budget: result.budget, primary: result.primaryExcludingDisputedAcrostic,
        report: path.join(base, 'report.json') }));
    });
  }
  return { base, prepare, freeze, load, report, writeReport, execute, main };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  createCompactPilot().main().catch((error) => {
    console.error(JSON.stringify({ status: 'stopped', error: error.message }));
    process.exitCode = 1;
  });
