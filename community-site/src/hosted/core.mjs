// Jev workbench adapter: frozen native compiler, oracle, validators and report format.
// Provider-independent dispatch and persistence belong in service.mjs.
import { makePlan } from '../../../workbench/src/planner.mjs';
import { makeAssistedPlan } from '../../../workbench/src/selection/planner.mjs';
import { makeAdvisorPlan, fitSignal } from '../../../workbench/src/selection/advisor.mjs';
import { makeReplayPlan, replayJobs } from '../../../workbench/src/history/planner.mjs';
import { deriveDecision } from '../../../workbench/src/policy.mjs';
import { summarize } from '../../../workbench/src/report.mjs';
import { validateNativeAnswers } from '../../../workbench/vendor/legacy-runtime/harness/domain/native-answers.mjs';
import { sha, assert } from '../../../workbench/src/util.mjs';
export { sha };
import { PRICE_NANO } from './jev-contract.mjs';
export const MAX_CALLS = 480;
export function rebuild(spec) {
  assert(spec && typeof spec === 'object', 'A frozen plan is required');
  const i = spec.input ?? {};
  // Bound compilation before doing expensive replay work. Bodies/code are never accepted.
  assert(JSON.stringify(spec).length <= 250000, 'Plan description exceeds hosted limit');
  // Original selections carry the catalog ceiling even when only a small sweep
  // is selected. Check their actual manifest count before rebuilding bodies.
  if (spec.route !== 'original/prepare' && i.options?.maxCalls)
    assert(
      i.options.maxCalls <= MAX_CALLS,
      'Use at most 480 requests per hosted run; larger suites remain exportable',
    );
  let p;
  switch (spec.route) {
    case 'prepare':
      p = makePlan(i.policy, i.options);
      break;
    case 'selection/freeze':
      p = makeAssistedPlan(i.policy, i.application, i.options, i.report ?? null);
      break;
    case 'setup/prepare':
      p = makeAdvisorPlan(i.policy, i.application, {
        mode: 'setup',
        maxUsd: i.maxUsd ?? 0.01,
        maxInputTokens: null,
      });
      break;
    case 'selection/prepare':
      p = makeAdvisorPlan(i.policy, i.application, i.options ?? {}, i.catalogDescriptors ?? null);
      break;
    case 'original/prepare':
      p = makeReplayPlan(i.options);
      break;
    default:
      throw Error('Unknown hosted plan type');
  }
  const m = p.manifest;
  assert(
    m.planHash === spec.planHash,
    'The deployed compiler or draft differs. Save a fresh plan before running',
  );
  assert(
    !['insufficient_budget', 'insufficient_coverage', 'empty'].includes(m.state) &&
      m.status !== 'insufficient_budget',
    'Minimum coverage does not fit',
  );
  if (!p.jobs) {
    assert(
      m.jobs.length > 0 && m.jobs.length <= MAX_CALLS,
      'Hosted runs support 1–480 requests. All larger suites remain available through export',
    );
    const all = new Map(
      [...replayJobs(m)].map((j) => [j.metadata.id, { ...j.metadata, body: j.body }]),
    );
    p.jobs = m.jobs.map((j) => all.get(j.id));
  }
  assert(
    p.jobs.length > 0 && p.jobs.length <= MAX_CALLS,
    'Hosted runs support 1–480 requests. All larger suites remain available through export',
  );
  assert(
    p.jobs.reduce(
      (n, j) => n + (j.wireBytes ?? j.requestBytes ?? new TextEncoder().encode(j.body).length),
      0,
    ) <=
      24 * 1024 * 1024,
    'Hosted request bundle exceeds 24 MiB; choose a smaller batch',
  );
  for (const j of p.jobs) {
    assert(j && sha(j.body) === j.requestHash, 'Compiler request identity mismatch');
    const r = JSON.parse(j.body);
    assert(['jev-1.13.0', 'jev-latest'].includes(r.model), 'Unsupported provider model');
    assert(
      Number.isSafeInteger(j.reservationInputTokens) && j.reservationInputTokens > 0,
      'Invalid reservation',
    );
  }
  p.reserveNano = p.jobs.reduce((n, j) => n + j.reservationInputTokens * PRICE_NANO, 0);
  assert(
    p.reserveNano <= Math.floor(m.options.maxUsd * 1e9),
    'This entire run must fit its planning allowance before hosted dispatch',
  );
  return p;
}
export function assess(job, evidence, model) {
  const r = evidence.response ?? {},
    u = r.usage;
  const usage =
    Number.isSafeInteger(u?.inputTokens) &&
    u.inputTokens >= 0 &&
    u.inputTokens <= 1000000 &&
    Number.isSafeInteger(u?.outputTokens) &&
    u.outputTokens >= 0
      ? u
      : null;
  const contract =
    r.status === 'ok'
      ? validateNativeAnswers(r.answers, JSON.parse(job.body), {
          distributionPolicy: 'bounded_rounding',
        })
      : null;
  let reason =
    r.status !== 'ok'
      ? (r.error ?? 'transport_error')
      : !usage
        ? 'missing_usage'
        : evidence.reportedProviderModel !== model
          ? 'model_version_changed'
          : contract?.tag !== 'ok'
            ? (contract?.error?.code ?? 'invalid_response')
            : null;
  if (!reason && job.mapping)
    try {
      for (const f of job.mapping) if (f.field === 'fit') fitSignal(r.answers[f.questionId]);
    } catch {
      reason = 'invalid_advisor_distribution';
    }
  return {
    valid: !reason,
    error: reason,
    usage,
    evidence,
    rawHash: sha(JSON.stringify(evidence) + '\n'),
  };
}
export function makeReport(prepared, run, observations) {
  const m = prepared.manifest;
  const common = {
    planHash: m.planHash,
    execution: prepared.execution ?? null,
    status: run.status,
    stopReason: run.reason,
    requestedCalls: prepared.jobs.length,
    dispatched: run.next_index + (run.inflight !== null ? (run.inflight_count ?? 1) : 0),
  };
  const budget = {
    bundleKnownUsageUsd: run.known_nano / 1e9,
    bundleHeldUsd: run.held_nano / 1e9,
    maximumBundleUsd: m.options.maxUsd,
    accountingScope: 'Hosted account; any carried prior usage is accounted separately',
  };
  if (m.protocol === 'catalog-advisor/1' || m.schemaVersion === 'catalog-advisor-plan/1') {
    const rows = [],
      failures = [];
    for (let n = 0; n < prepared.jobs.length; n++) {
      const o = observations[n];
      if (!o) continue;
      const j = prepared.jobs[n],
        r = {
          jobId: j.id,
          requestHash: j.requestHash,
          rawHash: o.rawHash,
          evidence: o.evidence,
          evidenceHash: sha(o.evidence),
          valid: o.valid,
          error: o.error,
        };
      (o.valid ? rows : failures).push(r);
    }
    const r = {
      ...common,
      protocol: 'catalog-advisor-report/1',
      mode: m.options.mode,
      manifest: m,
      rows,
      failures,
      budget: {
        knownNanoUsd: run.known_nano,
        heldNanoUsd: run.held_nano,
        inputTokens: observations.reduce((n, o) => n + (o?.usage?.inputTokens ?? 0), 0),
        heldInputTokens: run.held_nano / PRICE_NANO,
        maximumUsd: m.options.maxUsd,
      },
      note: 'Catalog metadata judgments, not guardrail-test results or approved ground truth.',
    };
    return { ...r, reportHash: sha(r) };
  }
  const original = m.protocol === 'original-evaluation-v1',
    conditions = {};
  for (let n = 0; n < prepared.jobs.length; n++) {
    const j = prepared.jobs[n],
      o = observations[n],
      c = original ? j.conditionId : j.layout;
    conditions[c] ??= {
      id: c,
      title: original ? j.conditionTitle : `${m.policy.name} · ${c}-local`,
      kind: original
        ? j.kind === 'matrix'
          ? 'original-matrix'
          : 'original-extension'
        : 'workbench',
      policyId: original ? j.originalPolicyProfile : m.policy.mode,
      layout: j.layout,
      originalTask: j.task,
      rows: [],
    };
    const row = {
      ...j,
      requestIndex: n,
      body: undefined,
      request: undefined,
      receipt: undefined,
      id: j.caseId ? j.caseId + '__r' + j.repeat : j.id,
      caseId: j.caseId ?? j.sourceId,
      family: j.group ?? j.family,
      suite: original ? (j.suite ?? 'original') : 'workbench',
      policyId: conditions[c].policyId,
      conditionId: c,
      valid: o?.valid === true,
      status: o?.valid
        ? 'ok'
        : o
          ? 'invalid_response'
          : run.inflight !== null &&
              n >= run.inflight &&
              n < run.inflight + (run.inflight_count ?? 1)
            ? 'uncertain_dispatch'
            : 'not_dispatched',
      error: o?.error ?? null,
      answers: o?.evidence.response.answers ?? {},
      usage: o?.usage ?? null,
      latencyMs: o?.evidence.response.latencyMs ?? null,
      dispatch: o?.evidence.dispatch ?? null,
      providerModel: o?.evidence.reportedProviderModel ?? null,
      source: { requestHash: j.requestHash, rawHash: o?.rawHash ?? null },
      plannedRequestHash: j.requestHash,
      originalKind: original ? j.kind : null,
      originalTask: j.task,
    };
    if (row.valid && !original) row.derivedDisposition = deriveDecision(m.policy, row.answers);
    conditions[c].rows.push(row);
  }
  for (const c of Object.values(conditions)) c.summary = summarize(c.rows);
  return {
    ...common,
    protocol: m.protocol,
    validCalls: observations.filter((o) => o?.valid).length,
    conditions,
    budget,
    design: {
      hostedRunId: run.id,
      pricing: m.pricing ?? null,
      execution: prepared.execution ?? null,
      policy: m.policy ?? null,
      policyHash: m.policyHash ?? null,
      catalogHash: m.catalogHash ?? m.originalCorpusHash,
      sourceStamp: m.sourceStamp,
      coverage: m.coverage,
      selection: m.options,
      application: m.application ?? null,
      advisor: m.advisor
        ? {
            mode: m.advisor.mode,
            reportHash: m.advisor.reportHash ?? null,
            planHash: m.advisor.planHash ?? null,
            actualUsageUsd: m.advisor.actualUsageUsd ?? 0,
            provenance: 'Imported metadata advice; not independently attested',
          }
        : null,
      context: 'Authored synthetic dossiers. No downstream agent execution.',
    },
    limitations: [
      'Development probes with dependent variants; not a security certification.',
      'Native and derived decisions remain separate.',
      'Unattempted or invalid requests are not scored as model successes.',
      'This hosted report is not a provider-signed attestation or a no-regression certificate.',
    ],
  };
}
