// Pure cost domain. No filesystem, environment, clock or native request-builder import.
// Recorded accounting accepts snapshots only; future planning accepts an injected
// stream of already-built requests. A builder migration cannot rewrite past usage.
import crypto from 'node:crypto';
import { ok, err } from './domain/result.mjs';

/** @template T @typedef {{tag:'ok',value:T}|{tag:'error',error:{code:string,retryable:boolean,context:object}}} Result */
/** @typedef {'policy-v4'|'advanced-v3'|'legacy-v2'|'legacy-v1'} ProtocolVersion */
/** @typedef {{inputTokens:number,outputTokens:number}} ProviderUsage */
/** @typedef {{source:string,category:'corpus_run'|'diagnostic'|'special_pilot'|'extension',status:string,error:string|null,inputTokens:number|null,outputTokens:number|null,requestBytes:number|null,hasUsage:boolean,providerModel:string|null,configuredModel:string|null,outputMode:string|null,promptArm:string|null,contextChars:number|null,adapterVersion:string|null}} RecordedEvidence */
/** @typedef {{contents:string,relative:string,modifiedAt:string,isDiagnostic:boolean}} EvidenceSource */
/** @typedef {{reportedAccountBalanceUsd:number,balanceSource:'user_reported',providerBalanceInspected:false,recommendedMaximumNextStageUsd:number,unallocatedHeadroomUsd:number}} PlanningBudget */
/** @typedef {{caseItem:object,request:object}} PlannedRequest */
/** @typedef {{model:string,protocolVersion:ProtocolVersion,plannedRequests:Iterable<PlannedRequest>,manifest:object}} PlanningInput */

export const PROTOCOL_VERSIONS = Object.freeze([
  'policy-v4',
  'advanced-v3',
  'legacy-v2',
  'legacy-v1',
]);
export const LEGACY_PLANNING_SNAPSHOT = Object.freeze({
  capturedAt: '2026-09-17T02:30:28.229Z',
  protocolVersion: 'legacy-v2',
  kind: 'historical_immutable_reference_not_current_builder_output',
  cells: 15120,
  requestUtf8Bytes: 221167152,
  reservationUsd: 9.451590624,
  pilotLimitedEstimateUsd: 2.3336219444931716,
  requestCorpusHash: '8df7740ca01ada7fd9fbbf85ffaeba439e5530ba97d101571049f88978b55169',
  nextStage: {
    cells: 216,
    reservationUsd: 0.231216552,
    requestCorpusHash: '8892c764933db82a742b82444c5d489172f67853738d32d2ccdec1e59e5bf329',
  },
  note: 'Archived legacy planning arithmetic. It is never treated as the price or request hash of a later EntryType/protocol proposal.',
});
function isJevName(value) {
  return typeof value === 'string' && value.startsWith('jev');
}
/** @param {PlanningInput} input @returns {Result<object>} */
export function planRequestCasesResult(input) {
  if (!PROTOCOL_VERSIONS.includes(input.protocolVersion)) return err('unsupported_protocol');
  return ok(calculateRequestPlan(input));
}
export const PRICING = Object.freeze({
  inputUsdPerMillion: 0.042,
  outputUsdPerMillion: 0,
  currency: 'USD',
  source: 'https://typesafe.ai/blog/introducing-system-one-models-and-jev',
  verifiedDate: '2026-09-16',
  kind: 'public_list_price_not_account_invoice',
});
const RESERVATION_EXTRA_BYTES = 256;
/** @type {Readonly<PlanningBudget>} */
export const PLANNING_BUDGET = Object.freeze({
  reportedAccountBalanceUsd: 5,
  balanceSource: 'user_reported',
  providerBalanceInspected: false,
  recommendedMaximumNextStageUsd: 4,
  unallocatedHeadroomUsd: 1,
});
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const sum = (rows, key) => rows.reduce((s, r) => s + (Number.isFinite(r[key]) ? r[key] : 0), 0);
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
const validUsage = (usage) =>
  usage && validCount(usage.inputTokens) && validCount(usage.outputTokens);
export const usageCost = (inputTokens, outputTokens = 0) =>
  (inputTokens * PRICING.inputUsdPerMillion) / 1e6 +
  (outputTokens * PRICING.outputUsdPerMillion) / 1e6;

function calculateRequestPlan({ model, protocolVersion, plannedRequests, manifest }) {
  const digest = crypto.createHash('sha256'),
    groups = new Map(),
    families = new Set(),
    ids = new Set(),
    splitCounts = {},
    variantCounts = {};
  let cells = 0,
    requestBytes = 0,
    questions = 0,
    minBytes = Infinity,
    maxBytes = 0;
  for (const { caseItem: c, request } of plannedRequests) {
    const serialized = JSON.stringify(request),
      bytes = Buffer.byteLength(serialized, 'utf8');
    digest.update(c.id + '\0' + serialized + '\n');
    cells++;
    requestBytes += bytes;
    questions += Object.keys(request.questions).length;
    minBytes = Math.min(minBytes, bytes);
    maxBytes = Math.max(maxBytes, bytes);
    families.add(c.family);
    ids.add(c.id);
    splitCounts[c.split] = (splitCounts[c.split] || 0) + 1;
    variantCounts[c.variant] = (variantCounts[c.variant] || 0) + 1;
    const key = [c.outputMode, c.promptArm, c.contextChars].join('|');
    if (!groups.has(key))
      groups.set(key, {
        outputMode: c.outputMode,
        promptArm: c.promptArm,
        contextChars: c.contextChars,
        cells: 0,
        requestBytes: 0,
        questions: 0,
      });
    const group = groups.get(key);
    group.cells++;
    group.requestBytes += bytes;
    group.questions += Object.keys(request.questions).length;
  }
  const reservedInputTokens = requestBytes + cells * RESERVATION_EXTRA_BYTES;
  return {
    model,
    protocolVersion,
    cells,
    uniqueCaseIds: ids.size,
    familyCount: families.size,
    splitCounts,
    variantCounts,
    repeats: 1,
    questions,
    requestUtf8Bytes: requestBytes,
    minRequestBytes: minBytes,
    maxRequestBytes: maxBytes,
    requestCorpusHash: digest.digest('hex'),
    protocolHash: manifest.protocolHash,
    templateLineages: manifest.templateLineages,
    evidenceStage: manifest.evidenceStage,
    reservation: {
      method:
        'One input token per serialized UTF-8 request byte, plus 256 input tokens per request for planning overhead',
      extraPerRequest: RESERVATION_EXTRA_BYTES,
      reservedInputTokens,
      inputCostUsd: usageCost(reservedInputTokens),
      outputCostUsd: 0,
      totalCostUsd: usageCost(reservedInputTokens),
      billingGuarantee: false,
    },
    breakdown: [...groups.values()].map((g) => ({
      ...g,
      reservedInputTokens: g.requestBytes + g.cells * RESERVATION_EXTRA_BYTES,
      reservationUsd: usageCost(g.requestBytes + g.cells * RESERVATION_EXTRA_BYTES),
    })),
  };
}

/** @param {EvidenceSource[]} sourceFiles Pure normalization of frozen record contents. */
export function scanEvidenceSources(sourceFiles) {
  const rows = [],
    sources = [],
    warnings = [],
    seen = new Set();
  let duplicates = 0,
    ignoredNonJev = 0;
  for (const { contents, relative, modifiedAt, isDiagnostic } of sourceFiles) {
    const source = {
      file: relative,
      sha256: sha(contents),
      modifiedAt,
      recordsRead: 0,
      recordsIncluded: 0,
    };
    sources.push(source);
    const lines = isDiagnostic
      ? [contents]
      : contents.split('\n').filter((line) => line.trim().length > 0);
    for (let index = 0; index < lines.length; index++) {
      let record;
      try {
        record = JSON.parse(lines[index]);
      } catch {
        warnings.push({
          file: relative,
          line: index + 1,
          issue: 'invalid_or_incomplete_json_excluded',
        });
        continue;
      }
      source.recordsRead++;
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        warnings.push({ file: relative, line: index + 1, issue: 'invalid_record_shape_excluded' });
        continue;
      }
      const result = isDiagnostic ? record.result : record;
      const request = record.request;
      const native =
        result &&
        result.source !== 'codex_subagent' &&
        (record.transport === 'typesafe_systemone' ||
          record.model === 'jev' ||
          isJevName(record.configuredModel) ||
          isJevName(request?.model) ||
          isJevName(result.providerModel));
      if (!native) {
        ignoredNonJev++;
        continue;
      }
      // A real repeated call counts again. Deduplicate only repeated recording of the
      // same run/attempt identity, or exact duplicate rows within the same source file.
      const identity =
        record.campaignId && record.trialId
          ? `campaign:${record.campaignId}|${record.trialId}`
          : record.runId && Number.isInteger(record.attempt)
            ? `${record.runId}|${record.model}|${record.attempt}`
            : record.runId && (record.id || record.case?.id)
              ? `${record.runId}|${record.model}|${record.id || record.case.id}|${record.repeat ?? 0}`
              : `${relative}|${sha(lines[index])}`;
      if (seen.has(identity)) {
        duplicates++;
        warnings.push({
          file: relative,
          line: index + 1,
          issue: 'duplicate_record_identity_excluded',
        });
        continue;
      }
      seen.add(identity);
      const bytes = validCount(record.inputUtf8Bytes)
        ? record.inputUtf8Bytes
        : request
          ? Buffer.byteLength(JSON.stringify(request), 'utf8')
          : null;
      const usage = validUsage(result.usage) ? result.usage : null;
      const category =
        isDiagnostic ||
        ['expiry_diagnostic', 'campaign_diagnostic', 'campaign_representation'].includes(
          record.kind,
        )
          ? 'diagnostic'
          : record.kind === 'campaign_extension'
            ? 'extension'
            : record.kind === 'matched_panel' ||
                record.kind === 'contextual_debugging' ||
                (record.campaignId && record.phase === 'smoke')
              ? 'special_pilot'
              : 'corpus_run';
      rows.push({
        source: relative,
        category,
        status: result.status ?? 'unknown',
        error: result.error ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        requestBytes: bytes,
        hasUsage: !!usage,
        providerModel: result.providerModel ?? null,
        configuredModel: record.configuredModel ?? request?.model ?? null,
        outputMode: record.case?.outputMode ?? null,
        promptArm: record.case?.promptArm ?? null,
        contextChars: record.case?.contextChars ?? null,
        adapterVersion: record.nativeMetadata?.adapterVersion ?? null,
      });
      source.recordsIncluded++;
    }
  }
  return { rows, sources, warnings, duplicates, ignoredNonJev };
}

/** @param {RecordedEvidence[]} rows */
export function summarizeEvidence(rows) {
  const withUsage = rows.filter((r) => r.hasUsage),
    missing = rows.filter((r) => !r.hasUsage),
    missingWithBytes = missing.filter((r) => validCount(r.requestBytes));
  const inputTokens = sum(withUsage, 'inputTokens'),
    outputTokens = sum(withUsage, 'outputTokens');
  const missingReservedInputTokens = missingWithBytes.reduce(
    (s, r) => s + r.requestBytes + RESERVATION_EXTRA_BYTES,
    0,
  );
  return {
    recordedRequests: rows.length,
    requestsWithUsage: withUsage.length,
    requestsMissingUsage: missing.length,
    inputTokensKnown: inputTokens,
    outputTokensKnown: outputTokens,
    knownUsageCostUsd: usageCost(inputTokens, outputTokens),
    unknownUsageIsZero: false,
    missingUsageRequestsWithBytes: missingWithBytes.length,
    missingUsageRequestsWithoutBytes: missing.length - missingWithBytes.length,
    missingUsageInputReservationTokens: missingReservedInputTokens,
    missingUsageReservationUsd: usageCost(missingReservedInputTokens),
    knownPlusMissingReservationUsd:
      usageCost(inputTokens, outputTokens) + usageCost(missingReservedInputTokens),
    completeInvoiceTotal: false,
    invalidNativeResponses: rows.filter((r) => r.error === 'invalid_native_response').length,
    statusCounts: Object.fromEntries(
      [...new Set(rows.map((r) => r.status))].map((status) => [
        status,
        rows.filter((r) => r.status === status).length,
      ]),
    ),
    providerModels: [...new Set(rows.map((r) => r.providerModel).filter(Boolean))],
  };
}

export function estimateFromRatio(rows, fullPlan) {
  const eligible = rows.filter(
    (r) =>
      r.category === 'corpus_run' &&
      r.hasUsage &&
      Number.isFinite(r.requestBytes) &&
      r.requestBytes > 0,
  );
  if (!eligible.length)
    return {
      status: 'unavailable',
      reason: 'No corpus-run request has both recorded usage and serialized request bytes',
    };
  const bytes = sum(eligible, 'requestBytes'),
    tokens = sum(eligible, 'inputTokens'),
    ratio = tokens / bytes;
  const perRequestRatios = eligible.map((r) => r.inputTokens / r.requestBytes);
  const tokenEstimate = fullPlan.requestUtf8Bytes * ratio;
  const byCondition = new Map();
  for (const r of eligible) {
    const key = [r.outputMode, r.promptArm, r.contextChars].join('|');
    if (!byCondition.has(key)) byCondition.set(key, []);
    byCondition.get(key).push(r);
  }
  const strata = [...byCondition].map(([condition, list]) => ({
    condition,
    requests: list.length,
    inputTokens: sum(list, 'inputTokens'),
    requestBytes: sum(list, 'requestBytes'),
    tokenPerByteRatio: sum(list, 'inputTokens') / sum(list, 'requestBytes'),
  }));
  return {
    status: 'pilot_limited_extrapolation',
    projectionProtocolVersion: fullPlan.protocolVersion,
    observedRequestFormatReconstructed: false,
    requiresNewRatioCalibration: ['advanced-v3', 'policy-v4'].includes(fullPlan.protocolVersion),
    method:
      'Sum of observed input tokens divided by sum of serialized request bytes, multiplied by all planned request bytes',
    eligibleCorpusRequests: eligible.length,
    corpusRequestsMissingUsage: rows.filter((r) => r.category === 'corpus_run' && !r.hasUsage)
      .length,
    diagnosticAndSpecialRequestsExcludedFromRatio: rows.filter((r) => r.category !== 'corpus_run')
      .length,
    observedInputTokens: tokens,
    observedRequestBytes: bytes,
    inputTokensPerRequestByte: ratio,
    estimatedFullRunInputTokens: tokenEstimate,
    estimatedFullRunCostUsd: usageCost(tokenEstimate),
    observedRatioRange: { min: Math.min(...perRequestRatios), max: Math.max(...perRequestRatios) },
    costsAtObservedRatioExtremes: {
      minUsd: usageCost(fullPlan.requestUtf8Bytes * Math.min(...perRequestRatios)),
      maxUsd: usageCost(fullPlan.requestUtf8Bytes * Math.max(...perRequestRatios)),
      interpretation:
        'Illustrative sensitivity only; neither a confidence interval nor a billing bound',
    },
    strata,
    representativeOfFullCorpus: false,
    limitations: [
      'Small convenience pilot with dependent fixtures, uneven output/question/length coverage, and possible adapter-version changes.',
      'Missing usage is not random: early native validator failures discarded provider usage.',
      'Tokenization of long invisible/Unicode/encoded payloads can differ materially from observed English-heavy requests.',
      'Diagnostic and special-policy requests have different question mixes and are accounted for financially but excluded from this corpus extrapolation.',
      'No invoice reconciliation, cache discount, tax, account-specific pricing, or external-generation/annotation/control-model charge is included.',
    ],
  };
}

export function assembleCostReport({ plan, nextStage, scan, now, snapshotBasis }) {
  const observed = summarizeEvidence(scan.rows);
  const bySource = scan.sources.map((source) => ({
    ...source,
    ...summarizeEvidence(scan.rows.filter((r) => r.source === source.file)),
  }));
  const independentRequired = Math.ceil(Math.log(0.05) / Math.log(1 - 0.001));
  const budget = {
    ...PLANNING_BUDGET,
    fullGridFitsReportedBalance:
      plan.reservation.totalCostUsd <= PLANNING_BUDGET.reportedAccountBalanceUsd,
    fullGridFitsRecommendedMaximum:
      plan.reservation.totalCostUsd <= PLANNING_BUDGET.recommendedMaximumNextStageUsd,
    recommendation:
      'Plan the 216-case wider integration stage, cap any next-stage allocation at USD 4 and leave USD 1 unallocated. Do not launch the full grid under this balance.',
    pilotEstimateCanOverrideReservation: false,
    balanceIsNotVerifiedRemainingAfterUnreconciledCharges: true,
    priorCallsKnownListPriceUsd: observed.knownUsageCostUsd,
    priorCallsMissingUsage: observed.requestsMissingUsage,
    nextStageReservationUsd: nextStage.reservation.totalCostUsd,
  };
  return {
    schemaVersion: 1,
    kind: 'offline_jev_cost_planning',
    generatedAt: now,
    noModelCalls: true,
    environmentFilesRead: false,
    pricing: PRICING,
    snapshotBasis,
    historicalPlanningSnapshot: LEGACY_PLANNING_SNAPSHOT,
    budget,
    nextStage,
    fullCorpus: plan,
    observedRequests: observed,
    bySource,
    pilotLimitedEstimate: estimateFromRatio(scan.rows, plan),
    sourceAudit: {
      duplicateRecordsExcluded: scan.duplicates,
      nonJevRecordsExcluded: scan.ignoredNonJev,
      warnings: scan.warnings,
      snapshotMayIncludeInProgressRuns: true,
    },
    controls: {
      codexSubagent: {
        billing: 'subscription/account usage unknown',
        perTokenCostUsd: null,
        notEquivalentToDirectApi: true,
      },
      directLunaTerraApi: { ratesKnown: false, totalCostUsd: null },
      excludedCosts: [
        'Promptfoo or other attack-generation services',
        'Human annotation and adjudication',
        'Compute, hosting, taxes and any account-specific charges',
      ],
    },
    confirmatoryPlanning: {
      targetFailureRate: 0.001,
      oneSidedConfidence: 0.95,
      zeroFailureIndependentScenariosRequiredPerPopulation: independentRequired,
      formula: 'ceil(log(0.05) / log(1 - 0.001))',
      upperBoundAtRequiredN: 1 - Math.pow(0.05, 1 / independentRequired),
      populationMeaning:
        'One prespecified model/version/policy/representation/task/deployment sampling distribution. Separate population claims need separate evidence or a justified simultaneous-inference design.',
      starterCorpusQualifies: false,
      reason:
        '15120 cells are correlated transformations and repeated conditions of a small synthetic lineage set, not 2995 independent real scenarios.',
    },
    publication: {
      status: 'verify_actual_agreement_before_public_results',
      source: 'https://typesafe.ai/legal/mca',
      sourceUpdated: '2026-08-27',
      benchmarkClause: '2.3(f)',
      orderPrecedenceClause: '15.14',
      note: 'The public MCA prohibits benchmark/performance publication. Review the applicable Order, written permissions and any research/early-access terms. Access alone does not establish a publication exception.',
    },
    limitations: [
      'UTF-8 byte reservation is a conservative planning convention, not a verified tokenizer upper bound or a hard spending limit. Provider hidden overhead and billing rules may differ.',
      'Native TypeSafe has no documented output-token limit in this adapter; public output pricing is zero, while request and account limits still apply.',
      'Source files are read as a point-in-time snapshot; rerun after pilots finish. No account ledger was consulted.',
      'All recorded retries and diagnostic calls count as separate financial events even when their inputs duplicate another call.',
      'Public list-price arithmetic is not an invoice or evidence of actual credit consumption.',
      'The USD 5 balance is user-reported, not queried from the provider. USD 4 is a recommended maximum allocation, not a target to spend or verified available balance.',
    ],
  };
}
