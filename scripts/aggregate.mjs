import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { corpusManifest, design, hash } from '../harness/corpus.mjs';
import {
  scoreRows,
  scoreBinaryThreshold,
  selectThreshold,
  requiredZeroFailureTrials,
} from '../harness/metrics.mjs';
const { values } = parseArgs({
  options: {
    input: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: 'data/report.json' },
  },
});
if (
  !values.input.length &&
  fs.existsSync(values.out) &&
  JSON.parse(fs.readFileSync(values.out, 'utf8')).status === 'measured'
)
  throw new Error(
    'Refusing to replace measured evidence with an empty design report. Supply --input or a new --out path.',
  );
const rows = [];
for (const filename of values.input)
  for (const line of fs.readFileSync(filename, 'utf8').split('\n').filter(Boolean))
    rows.push(JSON.parse(line));
// Deduplicate re-imported runs, not repeat observations.
const unique = new Map();
for (const r of rows) unique.set(`${r.runId}:${r.model}:${r.case.id}:${r.repeat}`, r);
const all = [...unique.values()],
  manifest = corpusManifest();
const groupBy = (list, fn) => {
  const m = new Map();
  for (const x of list) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};
const armKey = (r) =>
  [
    r.model,
    r.configuredModel,
    r.transport || 'unknown',
    r.nativeMetadata?.outputArm || 'chat_completion',
    r.nativeMetadata?.adapterVersion || 'legacy',
    r.nativeRequestVersion || 'historical_unspecified',
    r.constrainedOutput ? 'constrained' : 'unconstrained',
    r.case.promptArm,
    r.case.policyProfile,
    r.case.outputMode,
  ].join('|');
const calibration = [];
const frozen = new Map();
for (const [key, group] of groupBy(
  all.filter((r) => r.case.split === 'calibration'),
  armKey,
)) {
  const attack = selectThreshold(group),
    poison = selectThreshold(group, 'poison_probability');
  const entry = {
    key,
    model: group[0].model,
    mode: group[0].case.outputMode,
    attack,
    poison,
    calibrationHash: hash(JSON.stringify(group.map((r) => [r.case.id, r.repeat, r.parsed]))),
  };
  calibration.push(entry);
  frozen.set(key, entry);
}
const metrics = [];
for (const [key, group] of groupBy(all, (r) => `${armKey(r)}|${r.case.split}`)) {
  const r = group[0],
    threshold = frozen.get(armKey(r))?.attack.threshold ?? null;
  const poisonThreshold = frozen.get(armKey(r))?.poison.threshold ?? null;
  metrics.push({
    key,
    model: r.model,
    configuredModel: r.configuredModel,
    transport: r.transport || null,
    outputArm: r.nativeMetadata?.outputArm || 'chat_completion',
    nativeQuestionCount: r.nativeMetadata?.nativeQuestionCount || null,
    nativeRequestVersion: r.nativeRequestVersion || 'historical_unspecified',
    constrainedOutput: r.constrainedOutput,
    promptArm: r.case.promptArm,
    policyProfile: r.case.policyProfile,
    outputMode: r.case.outputMode,
    split: r.case.split,
    ...scoreRows(group),
    thresholdEvaluation:
      r.case.split === 'test' && threshold !== null
        ? scoreBinaryThreshold(group, 'attack_probability', threshold)
        : null,
    poisonThresholdEvaluation:
      r.case.split === 'test' && poisonThreshold !== null
        ? scoreBinaryThreshold(group, 'poison_probability', poisonThreshold)
        : null,
  });
}
const lengthScaling = [];
for (const [key, group] of groupBy(all, (r) =>
  [armKey(r), r.case.split, r.case.contextChars, r.case.position].join('|'),
)) {
  const r = group[0];
  lengthScaling.push({
    key,
    model: r.model,
    split: r.case.split,
    promptArm: r.case.promptArm,
    policyProfile: r.case.policyProfile,
    outputMode: r.case.outputMode,
    contextChars: r.case.contextChars,
    position: r.case.position,
    lengthUnit: 'context_characters',
    ...scoreRows(group),
  });
}
const familyMetrics = [];
for (const [key, group] of groupBy(all, (r) =>
  [armKey(r), r.case.split, r.case.family].join('|'),
)) {
  const r = group[0];
  familyMetrics.push({
    key,
    model: r.model,
    split: r.case.split,
    family: r.case.family,
    promptArm: r.case.promptArm,
    policyProfile: r.case.policyProfile,
    outputMode: r.case.outputMode,
    ...scoreRows(group),
  });
}
const totals = scoreRows(all);
const report = {
  schemaVersion: 1,
  status: all.length ? 'measured' : 'not_run',
  generatedAt: new Date().toISOString(),
  provenance: {
    kind: all.length ? 'observed_api_outputs' : 'design_only',
    syntheticResults: false,
    protocolHash: manifest.protocolHash,
    sourceRunIds: [...new Set(all.map((r) => r.runId))],
    promptfooVersion: '0.123.0',
    rawOutputsPublished: false,
  },
  design: manifest,
  coverage: {
    planned: manifest.cases,
    attempted: totals.attempted,
    valid: totals.valid,
    errors: totals.errors,
    malformed: totals.malformed,
    abstentions: totals.abstentions,
  },
  models: ['jev', 'luna', 'terra'].map((alias) => ({
    alias,
    status: all.some((r) => r.model === alias) ? 'measured' : 'not_configured',
    configuredModel: [
      ...new Set(all.filter((r) => r.model === alias).map((r) => r.configuredModel)),
    ],
  })),
  metrics,
  calibration,
  lengthScaling,
  familyMetrics,
  rareEvents: {
    targetRate: design.rareEventTargetRate,
    confidence: design.confidence,
    zeroFailureTrialsRequired: requiredZeroFailureTrials(
      design.rareEventTargetRate,
      design.confidence,
    ),
    claim:
      '2995 independent Bernoulli trials with zero failures are needed for a one-sided 95% upper bound at 0.1%. Correlated variants and repeated completions do not qualify as independent trials.',
    demonstrated: false,
  },
  limitations: [
    'No real Jev conclusions are available until authenticated model calls are run.',
    'Synthetic templates measure specified constructs; they are not representative prevalence estimates.',
    'Context poisoning means tampered inference-time resources or prior adoption; no training-time data poisoning experiment is performed.',
    'HTML and invisible Unicode are tested as source text, not rendered multimodal pixels.',
    'Fixed multi-message snapshots are tested; this is not an adaptive stateful agent benchmark.',
    'Character length is a controlled axis; measured token counts are separate and may be unavailable.',
    'A tiny pilot checks plumbing and cannot establish low rare-event risk.',
    'Thresholds are fitted only on separate calibration clusters. Held-out families assess transfer; related synthetic seeds are still correlated.',
    'Minimal arm has no moderation policy; policy compliance is reported only for the policy arm.',
    'Judge gold here is deterministic answer matching; subjective moderation and realistic judge quality require independently labeled external data.',
    'Ablation effects require matched complete cells; missing/error responses and abstentions are reported, not silently dropped.',
    'Byte-based reservations plus request/output caps bound ordinary usage but cannot guarantee provider billing or hidden reasoning charges.',
  ],
};
report.limitations.push(
  'This starter corpus is development/integration evidence. Confirmatory generalization claims require independently authored external test lineages, gold-label review, and a frozen preregistration.',
  'Shared canonical payload transformations are grouped in one semantic lineage and split; seeds only vary padding, not independent scenarios.',
  'Four-state context-integrity labels (clean, suspected, confirmed, insufficient evidence) are not implemented; this version provides a binary poison probability with separate uncertainty.',
);
report.design.outputModeMappings = {
  jev: {
    binary: 'native Choice classification',
    scores: 'native Choice + Noul attack/poison + Score interference severity',
    structured: 'native independent multi-question policy battery',
  },
  controls: {
    binary: 'generated literal label',
    scores: 'generated probability JSON',
    structured: 'generated assessment JSON',
  },
};
report.limitations.push(
  'Jev uses TypeSafe native primitives. Choice confidence is distribution concentration, not accuracy; its complement is stored as uncertainty with explicit metadata. Noul is probability of yes. Score is an ordinal rubric value, never an attack probability.',
  'Native policy violation IDs are thresholded at 0.5 from individual Noul answers; reason codes are static policy metadata, not generated explanations. Native reason-code consistency is not a model-quality score.',
  'Jev native types and control generated JSON have different structural guarantees; JSON validity is not a like-for-like quality comparison.',
  'The native TypeSafe API has no documented configurable output-token cap. The runner enforces request caps and reservations locally; use provider account caps for a hard spend ceiling.',
);
if (all.length)
  report.limitations[0] =
    'These are observed API calls for a synthetic development/integration corpus. Pilot counts do not establish representative Jev performance.';
fs.mkdirSync(path.dirname(values.out), { recursive: true });
fs.writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({ out: values.out, status: report.status, coverage: report.coverage }, null, 2),
);
