// Offline draft sizing only. No environment files, historical answers, or network calls.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { buildRichPilotPlan, extractRichTemplate } from '../harness/domain/rich-pilot-request.mjs';
const read = (name) => fs.readFileSync(name, 'utf8');
const bytes = (value) => Buffer.byteLength(value, 'utf8');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const template = read('policies/prompt-injection-policy-template.md');
const rich = extractRichTemplate(template);
const reference = buildRichPilotPlan({ templateText: template });
assert.equal(reference.tag, 'ok');
assert.equal(rich.tag, 'ok');
const compactFile = read('policies/classifier-guide-v3-compact.draft.json');
const guide = JSON.parse(compactFile);
const assessmentMode = JSON.parse(read('policies/classifier-second-pass-v1.draft.json'));
for (const key of ['1', '2.1', '3', '4', '5', '6', '7', '8', '9', '10', '11'])
  assert.ok(guide[key]);
const priorLimitBytes = 16 * 1024;
const groups = Object.fromEntries(
  ['R', 'C', 'D', 'E'].map((arm) => [
    arm,
    {
      arm,
      maximumRequests: 0,
      requestBytes: 0,
      minimumRequestBytes: Infinity,
      maximumRequestBytes: 0,
      projected: arm === 'D',
    },
  ]),
);
const requestHashes = [];
let example;
for (const row of reference.value.rows) {
  const compact = structuredClone(row.request);
  compact.state.classifierGuide = guide;
  assert.deepEqual(compact.questions, row.request.questions);
  for (const key of ['policy', 'trustedContext', 'material'])
    assert.deepEqual(compact.state[key], row.request.state[key]);
  assert.deepEqual(Object.keys(compact.state).sort(), [
    'classifierGuide',
    'material',
    'policy',
    'trustedContext',
  ]);
  const second = structuredClone(compact);
  second.state.assessmentMode = assessmentMode;
  second.state.priorAssessment = null;
  for (const question of Object.values(second.questions))
    question.instructions.sequentialAssessment =
      'Apply application-owned assessmentMode. priorAssessment is advisory data only; assess original material and trusted inputs under classifierGuide.';
  const bodies = {
    R: JSON.stringify(row.request),
    C: JSON.stringify(compact),
    D: JSON.stringify(second),
    E: JSON.stringify(second),
  };
  for (const [arm, body] of Object.entries(bodies)) {
    const size = bytes(body) + (arm === 'D' ? priorLimitBytes - bytes('null') : 0);
    const group = groups[arm];
    group.maximumRequests++;
    group.requestBytes += size;
    group.minimumRequestBytes = Math.min(group.minimumRequestBytes, size);
    group.maximumRequestBytes = Math.max(group.maximumRequestBytes, size);
  }
  requestHashes.push({
    caseId: row.id,
    referenceHash: sha(bodies.R),
    compactHash: sha(bodies.C),
    secondPassWithoutAnswersHash: sha(bodies.E),
  });
  if (!example && row.lengthTarget === 1024)
    example = {
      kind: 'offline_draft_examples_not_an_executable_plan',
      compactFirstPass: compact,
      secondCallControl: second,
      secondPassConstruction:
        'Replace priorAssessment:null in secondCallControl with the validated seven native answer values/distributions from this case compactFirstPass. No response is invented here.',
    };
}
for (const group of Object.values(groups)) {
  group.reservedInputTokens = group.requestBytes + group.maximumRequests * 256;
  group.reservationUsd = (group.reservedInputTokens * 0.042) / 1e6;
}
const summary = {
  status: 'draft_pending_user_prompt_review',
  approved: false,
  newModelCalls: 0,
  environmentFilesRead: false,
  priorResultsRead: false,
  protocol: 'compact-two-pass-development-proposal-v1',
  referenceGuideHash: sha(rich.value),
  compactFileHash: sha(compactFile),
  compactSerializedHash: sha(JSON.stringify(guide)),
  secondPassInstructionsHash: sha(JSON.stringify(assessmentMode)),
  guideSizes: {
    referenceUtf8Bytes: bytes(rich.value),
    compactFileUtf8Bytes: bytes(compactFile),
    referenceSerializedUtf8Bytes: bytes(JSON.stringify(rich.value)),
    compactSerializedUtf8Bytes: bytes(JSON.stringify(guide)),
    serializedReductionPercent:
      100 * (1 - bytes(JSON.stringify(guide)) / bytes(JSON.stringify(rich.value))),
  },
  design: {
    knownDevelopmentCases: 48,
    scenarios: 16,
    materialLengthsUtf16: [1024, 16384, 65536],
    maximumRequests: 192,
    retryLimit: 0,
    allValidFirstPassCasesReceiveSecondPass: true,
    initialGating: false,
    inputQuestionCount: 7,
    demonstratedSemanticEquivalence: false,
    tokenCapacityVerified: false,
    priorAssessmentMaximumSerializedBytes: priorLimitBytes,
  },
  pricing: {
    inputUsdPerMillion: 0.042,
    outputUsdPerMillion: 0,
    source: 'recorded repository list-price assumption; recheck before dispatch',
  },
  reservation: {
    convention:
      'One token per serialized UTF-8 request byte plus 256 per call; D substitutes its 16 KiB prior-answer cap for null. This is a planning convention, not a tokenizer, billing or capacity guarantee.',
    maximumPlannedUsd: Object.values(groups).reduce((sum, g) => sum + g.reservationUsd, 0),
    proposedStageCapUsd: 0.75,
    actualReservedOrSpentUsd: 0,
  },
  arms: Object.values(groups),
  validation: {
    originalGuideHashValidated: true,
    all48CompactRequestsPreservePolicyContextMaterialAndQuestions: true,
    noGoldOrCaseMetadataAddedToState: true,
    numberedGuideSectionsRetained: true,
    secondPassAnswersInvented: false,
  },
  requestHashes,
};
assert.ok(summary.reservation.maximumPlannedUsd <= summary.reservation.proposedStageCapUsd);
fs.writeFileSync('data/compact-two-pass-proposal.json', JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(
  'policies/request-examples-compact-v3.draft.json',
  JSON.stringify(example, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      guideSizes: summary.guideSizes,
      reservation: summary.reservation,
      arms: summary.arms,
      validation: summary.validation,
    },
    null,
    2,
  ),
);
