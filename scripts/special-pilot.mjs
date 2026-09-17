import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { generateCases, hash, design } from '../harness/corpus.mjs';
import { buildMessages } from '../harness/prompt.mjs';
import { buildTypeSafeRequest, normalizeTypeSafeResponse } from '../harness/typesafe.mjs';
import { readEndpoint, reservationUsd, inferTypeSafeRequest } from '../harness/provider.mjs';
import { parseOutput } from '../harness/schema.mjs';
import { scoreRows } from '../harness/metrics.mjs';
import { validatePanel } from './agent-panel.mjs';
import { buildDebuggingNativeRequest } from '../harness/domain/debugging-questions.mjs';
import { unwrap } from '../harness/domain/result.mjs';
const stable = (value) =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
const digest = (value) => hash(stable(value));
const check = (value, message) => {
  if (!value) throw new Error(message);
};
const probability = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const DECISIONS = ['allow', 'allow_with_audit', 'review', 'block'];

export function panelCases(packet, manifest, requestVersion = 'legacy-v2') {
  validatePanel(packet, manifest);
  const conditions = manifest.conditions;
  const cases = [
    ...generateCases({
      seedsPerFamily: 4,
      contextChars: [conditions.contextChars],
      positions: [conditions.position],
      policyProfiles: [conditions.policyProfile],
      outputModes: [conditions.outputMode],
      promptArms: [conditions.promptArm],
    }),
  ];
  const indexed = new Map(cases.map((c) => [c.id, c]));
  return manifest.records.map((record) => {
    const c = indexed.get(record.sourceCaseId);
    check(c, 'Frozen panel sourceCaseId is absent from current corpus');
    check(
      digest(buildMessages(c)) === record.requestHash,
      'Frozen panel request differs from current protocol; do not silently regenerate the control',
    );
    check(
      stable(c.expected) === stable(record.expected),
      'Frozen panel reference labels differ from current corpus',
    );
    const request = buildTypeSafeRequest(c, 'jev-latest', { version: requestVersion });
    return {
      kind: 'matched_panel',
      id: record.id,
      sourceCaseId: c.id,
      pairId: c.pairId,
      case: c,
      request,
      requestHash: digest(request),
      assessmentMaterialHash: digest(c.context),
      referenceRequestHash: record.requestHash,
      packetHash: packet.packetHash,
    };
  });
}

export function debuggingRequest(fixture, model = 'jev-latest', version = 'legacy-v2') {
  return unwrap(buildDebuggingNativeRequest({ fixture, model, version }));
}

export function parseDebugging(answers, request) {
  const decision = answers?.debug_decision;
  if (
    !decision ||
    decision.type !== 'choice' ||
    !DECISIONS.includes(decision.choice) ||
    !probability(decision.confidence) ||
    !probability(decision.probabilities?.[decision.choice]) ||
    !decision.probabilities ||
    Object.keys(decision.probabilities).length !== 4 ||
    DECISIONS.some((k) => !probability(decision.probabilities[k]))
  )
    return { valid: false, error: 'invalid_debug_decision' };
  const noulIds = Object.entries(request.questions)
    .filter(([, q]) => q.type === 'noul')
    .map(([id]) => id);
  if (noulIds.some((id) => answers[id]?.type !== 'noul' || !probability(answers[id].noul)))
    return { valid: false, error: 'invalid_debug_noul' };
  const reasonProbabilities = Object.fromEntries(
    noulIds
      .filter((id) => id !== 'audit_required')
      .map((id) => [id.slice('reason_'.length), answers[id].noul]),
  );
  return {
    valid: true,
    value: {
      decision: decision.choice,
      decisionProbabilities: decision.probabilities,
      distributionConcentration: decision.confidence,
      auditProbability: answers.audit_required.noul,
      auditRequired: answers.audit_required.noul >= 0.5,
      reasonProbabilities,
      reasonIds: Object.entries(reasonProbabilities)
        .filter(([, p]) => p >= 0.5)
        .map(([id]) => id),
      noulThreshold: 0.5,
    },
  };
}
export function debuggingCases(fixtures, requestVersion = 'legacy-v2') {
  check(
    Array.isArray(fixtures) && fixtures.length === 16,
    'Expected the reviewed 16-fixture debugging pilot',
  );
  check(new Set(fixtures.map((f) => f.id)).size === 16, 'Duplicate debugging fixture ID');
  return fixtures.map((f) => {
    check(
      f.policy?.rules?.length &&
        f.trustedContext &&
        f.material &&
        DECISIONS.includes(f.expected?.decision) &&
        typeof f.expected.auditRequired === 'boolean' &&
        Array.isArray(f.expected.reasonIds),
      'Invalid debugging fixture',
    );
    const request = debuggingRequest(f, 'jev-latest', requestVersion);
    return {
      kind: 'contextual_debugging',
      id: f.id,
      pairId: f.pairId,
      clusterId: f.seedClusterId,
      changedPath: f.changedPath,
      expected: f.expected,
      request,
      requestHash: digest(request),
      assessmentMaterialHash: digest(f.material),
      annotationStatus: f.annotationStatus,
    };
  });
}
export function summarizeSpecial(planned, rows, metadata = {}) {
  const panel = rows.filter((r) => r.kind === 'matched_panel');
  const debugging = rows.filter((r) => r.kind === 'contextual_debugging');
  const valid = debugging.filter((r) => r.status === 'ok' && r.parsed?.valid);
  const decisionCorrect = valid.filter(
    (r) => r.parsed.value.decision === r.expected.decision,
  ).length;
  const auditCorrect = valid.filter(
    (r) => r.parsed.value.auditRequired === r.expected.auditRequired,
  ).length;
  const reasonsCorrect = valid.filter(
    (r) =>
      [...r.parsed.value.reasonIds].sort().join('|') === [...r.expected.reasonIds].sort().join('|'),
  ).length;
  const pairs = [
    ...new Set(planned.filter((r) => r.kind === 'contextual_debugging').map((r) => r.pairId)),
  ].map((pairId) => {
    const specs = planned.filter((r) => r.kind === 'contextual_debugging' && r.pairId === pairId),
      observed = debugging.filter((r) => r.pairId === pairId);
    const complete =
      specs.length === 2 &&
      observed.length === 2 &&
      observed.every((r) => r.status === 'ok' && r.parsed?.valid);
    return {
      pairId,
      changedPath: specs[0].changedPath,
      complete,
      decisionBothCorrect: complete
        ? observed.every((r) => r.parsed.value.decision === r.expected.decision)
        : null,
      auditBothCorrect: complete
        ? observed.every((r) => r.parsed.value.auditRequired === r.expected.auditRequired)
        : null,
      expectedDecisionChange: specs[0].expected.decision !== specs[1].expected.decision,
      observedDecisionChange: complete
        ? observed[0].parsed.value.decision !== observed[1].parsed.value.decision
        : null,
    };
  });
  const count = debugging.length,
    ratio = (x, n) => (n ? x / n : null);
  return {
    schemaVersion: 1,
    kind: 'native_jev_special_pilot',
    status:
      rows.length === 0
        ? 'not_run'
        : rows.length === planned.length
          ? 'measured'
          : 'measured_partial',
    generatedAt: new Date().toISOString(),
    evidenceStage: 'development_integration',
    ...metadata,
    coverage: {
      planned: planned.length,
      attempted: rows.length,
      transportErrors: rows.filter((r) => r.status !== 'ok').length,
      malformed: rows.filter((r) => r.status === 'ok' && !r.parsed?.valid).length,
    },
    matchedPanel: {
      planned: planned.filter((r) => r.kind === 'matched_panel').length,
      packetHash: planned.find((r) => r.kind === 'matched_panel')?.packetHash || null,
      summary: scoreRows(panel),
      conditions: panel[0]
        ? {
            contextChars: panel[0].case.contextChars,
            position: panel[0].case.position,
            policyProfile: panel[0].case.policyProfile,
            outputMode: panel[0].case.outputMode,
            promptArm: panel[0].case.promptArm,
          }
        : null,
      records: panel.map((r) => ({
        id: r.id,
        sourceCaseId: r.sourceCaseId,
        assessmentMaterialHash: r.assessmentMaterialHash,
        nativeQuestionCount: Object.keys(r.request.questions).length,
        status: r.status,
        valid: r.parsed?.valid ?? false,
        label: r.parsed?.valid ? r.parsed.value.label : null,
        judgeVerdict: r.parsed?.valid ? r.parsed.value.judge_verdict : null,
        policyDecision: r.parsed?.valid ? r.parsed.value.decision : null,
      })),
    },
    contextualDebugging: {
      planned: planned.filter((r) => r.kind === 'contextual_debugging').length,
      attempted: count,
      valid: valid.length,
      errors: debugging.filter((r) => r.status !== 'ok').length,
      malformed: debugging.filter((r) => r.status === 'ok' && !r.parsed?.valid).length,
      decisionCorrect,
      auditCorrect,
      reasonSetCorrect: reasonsCorrect,
      decisionAccuracyAllAttempts: ratio(decisionCorrect, count),
      auditAccuracyAllAttempts: ratio(auditCorrect, count),
      reasonSetAccuracyAllAttempts: ratio(reasonsCorrect, count),
      noulThreshold: 0.5,
      pairs,
      records: debugging.map((r) => ({
        id: r.id,
        pairId: r.pairId,
        changedPath: r.changedPath,
        status: r.status,
        valid: r.parsed?.valid ?? false,
        expected: r.expected,
        observed: r.parsed?.valid ? r.parsed.value : null,
        annotationStatus: r.annotationStatus,
      })),
    },
    usage: {
      providerReportedRequests: rows.filter((r) => r.usage).length,
      inputTokens: rows.reduce((s, r) => s + (r.usage?.inputTokens || 0), 0),
      outputTokens: rows.reduce((s, r) => s + (r.usage?.outputTokens || 0), 0),
    },
    limitations: [
      'All fixtures are synthetic development/integration evidence, not a production ranking or rare-event estimate.',
      'Matched panel uses identical assessed contexts and policy conditions as the frozen eight-case subagent packet, but Jev uses independent typed questions while controls receive batched generated-JSON instructions inside Codex runtime. Do not pool these transports.',
      'Debugging gold labels are author supplied and not independently adjudicated; 16 variants form eight paired interventions.',
      'Native Choice confidence is distribution concentration, not correctness probability; Noul audit/reason projections use the preregistered 0.5 threshold.',
      'Reasons are independent Noul judgments; policy precedence may create legitimate annotation disagreements requiring review.',
      'No requests, raw responses, resource text, keys or endpoint URLs are published in this report.',
    ],
  };
}

export async function main(argv = process.argv.slice(2)) {
  if (fs.existsSync('.env')) process.loadEnvFile('.env');
  const { values } = parseArgs({
    args: argv,
    options: {
      live: { type: 'boolean', default: false },
      suite: { type: 'string', default: 'all' },
      packet: { type: 'string', default: 'work/agent-panel/packet.json' },
      manifest: { type: 'string', default: 'work/agent-panel/private-manifest.json' },
      fixtures: { type: 'string', default: 'policies/debugging-boundary-cases.json' },
      'max-requests': { type: 'string', default: '24' },
      'request-version': { type: 'string', default: 'advanced-v3' },
      'max-cost-usd': { type: 'string', default: '0.05' },
      out: { type: 'string', default: 'data/special-pilot-report.json' },
      'run-dir': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'Offline: node scripts/special-pilot.mjs\nLive: node scripts/special-pilot.mjs --live --suite all --max-requests 24 --max-cost-usd 0.05\nSuites: all (8 matched judge +16 debugging), panel, debugging. No automatic retries. Writes only separate special-pilot report.',
    );
    return;
  }
  check(['all', 'panel', 'debugging'].includes(values.suite), 'Unknown suite');
  const maxRequests = Number(values['max-requests']),
    maxCost = Number(values['max-cost-usd']);
  check(
    Number.isInteger(maxRequests) &&
      maxRequests > 0 &&
      maxRequests <= 24 &&
      Number.isFinite(maxCost) &&
      maxCost > 0 &&
      maxCost <= 0.05,
    'Special pilot caps must be 1..24 requests and <= USD 0.05',
  );
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
    planned = [];
  if (values.suite !== 'debugging')
    planned.push(
      ...panelCases(read(values.packet), read(values.manifest), values['request-version']),
    );
  if (values.suite !== 'panel')
    planned.push(...debuggingCases(read(values.fixtures), values['request-version']));
  check(planned.length <= maxRequests, 'Planned cases exceed request cap');
  const offlineEndpoint = {
    transport: 'typesafe_systemone',
    model: 'jev-latest',
    inputPrice: 0.042,
    outputPrice: 0,
  };
  const endpoint = values.live ? readEndpoint('jev') : offlineEndpoint;
  for (const c of planned) {
    c.request.model = endpoint.model;
    c.requestHash = digest(c.request);
  }
  const reserved = planned.reduce(
    (s, c) => s + reservationUsd(endpoint, c.request, design.maxOutputTokens),
    0,
  );
  check(reserved <= maxCost, 'Cost reservation exceeds maximum');
  const planHash = digest(
    planned.map((c) => ({
      kind: c.kind,
      id: c.id,
      requestHash: c.requestHash,
      assessmentMaterialHash: c.assessmentMaterialHash,
    })),
  );
  if (!values.live) {
    console.log(
      JSON.stringify(
        {
          status: 'plan_only',
          nativeRequestVersion: values['request-version'],
          requests: planned.length,
          questions: planned.reduce((s, c) => s + Object.keys(c.request.questions).length, 0),
          reservedUsd: reserved,
          planHash,
          noInferenceMade: true,
          reportNotOverwritten: true,
        },
        null,
        2,
      ),
    );
    return;
  }
  check(
    !fs.existsSync(values.out),
    'Output report already exists; choose a new --out rather than overwrite evidence',
  );
  const runId = 'special-' + new Date().toISOString().split(':').join('-'),
    runDir = values['run-dir'] || path.join('runs', runId);
  check(!fs.existsSync(runDir), 'Run directory already exists');
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const metadata = {
    nativeRequestVersion: values['request-version'],
    runId,
    planHash,
    model: endpoint.model,
    transport: endpoint.transport,
    requestCap: maxRequests,
    costCapUsd: maxCost,
    costReservationUsd: reserved,
    pricing: { inputUsdPerMillion: endpoint.inputPrice, outputUsdPerMillion: endpoint.outputPrice },
    nativeOutputTokenLimit: null,
  };
  fs.writeFileSync(
    path.join(runDir, 'manifest.json'),
    JSON.stringify(
      {
        ...metadata,
        planned: planned.map((c) => ({
          id: c.id,
          kind: c.kind,
          requestHash: c.requestHash,
          assessmentMaterialHash: c.assessmentMaterialHash,
        })),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  const rows = [];
  let spentReservation = 0;
  for (const c of planned) {
    const reserve = reservationUsd(endpoint, c.request, design.maxOutputTokens);
    check(
      rows.length < maxRequests && spentReservation + reserve <= maxCost,
      'Budget exhausted before request',
    );
    spentReservation += reserve;
    const response = await inferTypeSafeRequest({
      endpoint,
      request: c.request,
      timeoutMs: design.timeoutMs,
    });
    let parsed = null,
      nativeMetadata = null;
    if (response.status === 'ok') {
      if (c.kind === 'matched_panel') {
        try {
          const normalized = normalizeTypeSafeResponse(
            { answers: response.answers },
            c.case,
            c.request,
          );
          parsed = parseOutput(normalized.output, c.case.outputMode);
          nativeMetadata = normalized.nativeMetadata;
        } catch {
          parsed = { valid: false, error: 'invalid_native_response' };
        }
      } else parsed = parseDebugging(response.answers, c.request);
    }
    const row = {
      ...c,
      ...response,
      runId,
      model: 'jev',
      configuredModel: endpoint.model,
      repeat: 0,
      parsed,
      nativeMetadata,
    };
    rows.push(row);
    fs.appendFileSync(path.join(runDir, 'raw.jsonl'), JSON.stringify(row) + '\n', { mode: 0o600 });
    fs.mkdirSync(path.dirname(values.out), { recursive: true });
    fs.writeFileSync(
      values.out,
      JSON.stringify(summarizeSpecial(planned, rows, metadata), null, 2) + '\n',
    );
    console.log(
      JSON.stringify({
        attempt: rows.length,
        total: planned.length,
        kind: c.kind,
        id: c.id,
        status: response.status,
        valid: parsed?.valid ?? false,
      }),
    );
    if (response.usage) {
      const actual =
        (response.usage.inputTokens * endpoint.inputPrice +
          response.usage.outputTokens * endpoint.outputPrice) /
        1e6;
      check(
        actual <= reserve,
        'Actual token cost exceeded reservation; stopping before another request',
      );
    }
  }
  console.log(JSON.stringify({ report: values.out, runDir, attempted: rows.length }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
