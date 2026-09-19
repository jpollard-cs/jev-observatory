// Pure presentation projection. Every numeric field comes from a versioned report.
const percent = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const rounded = (v, n = 3) => (v == null ? null : Number(v.toFixed(n)));
const fraction = (n, d) => `${n}/${d}`;
const dimensions = (r) => ({
  split: r.split,
  promptArm: r.promptArm,
  policyProfile: r.policyProfile,
  outputMode: r.outputMode,
  providerModel: r.providerModel,
  nativeRequestVersion: r.nativeRequestVersion,
});
const metric = (r) => ({
  ...dimensions(r),
  attempted: r.attempted,
  valid: r.valid,
  attackCases: r.attackCases,
  benignCases: r.benignCases,
  detected: r.confusion.tp,
  misses: r.confusion.fn,
  falseAlarms: r.confusion.fp,
  unresolved: r.errors + r.malformed + r.abstentions,
  attackDetectionRate: r.attackDetectionRateAllAttempts,
  falsePositiveRate: r.benignFalsePositiveRateAllAttempts,
  unresolvedAttackRate: r.unresolvedAttackRate,
  policyMatches: r.policy.n
    ? fraction(Math.round(r.policy.decisionAccuracy * r.policy.n), r.policy.n)
    : 'not assessed',
  usageCount: r.measuredTokens.n,
  meanInputTokens: r.measuredTokens.n
    ? rounded(r.measuredTokens.input / r.measuredTokens.n, 1)
    : null,
  meanOutputTokens: r.measuredTokens.n
    ? rounded(r.measuredTokens.output / r.measuredTokens.n, 1)
    : null,
  p50LatencyMs: rounded(r.latencyMs.p50, 1),
  p95LatencyMs: rounded(r.latencyMs.p95, 1),
});

export function campaignQueries({ report, extensions, controls = [] }) {
  report ??= { metrics: [], lengthScaling: [] };
  const metrics = report.metrics.map(metric);
  const lengths = report.lengthScaling.map((r) => ({
    ...metric(r),
    contextChars: r.contextChars,
    position: r.position,
    meanLatencyMs: r.latencyMs.mean,
  }));
  const lengthPairs = (report.pairedLengthDifferences ?? []).map((r) => ({
    ...dimensions(r),
    contrast: `${r.leftValue} → ${r.rightValue}`,
    pairs: r.pairs,
    correctDeltaPp: rounded(
      r.attackCorrect.differenceRightMinusLeft == null
        ? null
        : 100 * r.attackCorrect.differenceRightMinusLeft,
      2,
    ),
    latencyDeltaMs: rounded(r.latencyMs.differenceRightMinusLeft, 1),
    missing: r.missingLeft + r.missingRight + r.ambiguousCells,
  }));
  const policyPairs = (report.pairedPolicyDifferences ?? [])
    .filter((r) => r.outputMode === 'structured' && r.promptArm === 'policy')
    .map((r) => ({
      ...dimensions(r),
      contrast: `${r.leftValue} → ${r.rightValue}`,
      pairs: r.pairs,
      changedPairs: r.policyTransitions.expectedChanged,
      correctChanges: fraction(
        r.policyTransitions.correctChangedPairs,
        r.policyTransitions.expectedChanged,
      ),
      invariantPairs: r.policyTransitions.expectedInvariant,
      correctInvariants: fraction(
        r.policyTransitions.correctInvariantPairs,
        r.policyTransitions.expectedInvariant,
      ),
    }));
  const reliability = report.metrics
    .filter((r) => r.outputMode !== 'binary')
    .flatMap((r) =>
      r.attackCalibration.bins.filter((b) => b.n).map((b) => ({ ...dimensions(r), ...b })),
    );
  const thresholds = report.metrics
    .filter((r) => r.outputMode !== 'binary')
    .flatMap((r) =>
      [
        ['attack', r.thresholdEvaluation, r.attackCalibration],
        ['poison', r.poisonThresholdEvaluation, r.poisonCalibration],
      ].map(([target, score, cal]) => ({
        ...dimensions(r),
        target,
        threshold: score?.threshold ?? null,
        recall: score ? percent(score.positiveDetectionRateAllAttempts) : 'not evaluated',
        falsePositive: score ? percent(score.falsePositiveRateAllAttempts) : 'not evaluated',
        scoreCoverage: score ? fraction(score.scored, score.attempted) : 'not evaluated',
        brier: rounded(cal.brier, 4),
      })),
    );
  const suites = Object.entries(extensions?.bySuite ?? {}).map(([suite, r]) => ({
    suite,
    planned: r.planned,
    attempted: r.attempted,
    valid: r.valid,
    lineages: r.attemptedLineages,
    decisionCorrect: fraction(r.questions.decision.correct, r.questions.decision.attempted),
    attackCorrect: fraction(
      r.questions.attack_present.correct,
      r.questions.attack_present.attempted,
    ),
  }));
  const states = ['no_poisoning_evidence', 'attempted_only', 'poisoned', 'insufficient_evidence'];
  const integrity = states.map((expected) => {
    const records = (extensions?.records ?? []).filter(
      (r) => r.suite === 'integrity' && r.expected.decision === expected && r.attempted,
    );
    return {
      expected,
      attempted: records.length,
      correct: records.filter((r) => r.observed.decision.correct).length,
      ...Object.fromEntries(
        states.map((s) => [
          s,
          records.filter((r) => r.observed.decision.valid && r.observed.decision.value === s)
            .length,
        ]),
      ),
      unresolved: records.filter((r) => !r.observed.decision.valid).length,
    };
  });
  const policy = (extensions?.records ?? [])
    .filter((r) => ['moderation', 'scope'].includes(r.suite))
    .map((r) => ({
      suite: r.suite,
      scenario: r.lineageId,
      condition: r.id.split('/').pop(),
      expected: r.expected.decision,
      observed: r.observed.decision.value ?? r.observed.decision.status ?? 'unresolved',
      audit:
        r.expected.audit_required === undefined
          ? 'not asked'
          : `${r.observed.audit_required?.valid ? (r.observed.audit_required.predictedAtFixedThreshold ? 'yes' : 'no') : 'unresolved'} / ${r.expected.audit_required ? 'yes' : 'no'}`,
      reason: `${r.observed.reason?.value ?? 'unresolved'} / ${r.expected.reason}`,
    }));
  const nativeJudge = extensions?.bySuite?.judge;
  const judgeCases = (extensions?.records ?? [])
    .filter((r) => r.suite === 'judge')
    .map((r) => ({
      scenario: r.lineageId,
      condition: r.id.endsWith('-expanded') ? 'expanded' : 'short',
      messages: r.counts.messages,
      resources: r.counts.resources,
      expected: r.expected.decision,
      observed: r.observed.decision.value ?? r.observed.decision.status ?? 'unresolved',
      probabilityAssignedToGold: r.observed.decision.probabilities?.[r.expected.decision] ?? null,
      concentration: r.observed.decision.distributionConcentration ?? null,
      attackProbability: r.observed.attack_present.value ?? null,
      expectedAttack: r.expected.attack_present,
      reason: r.observed.reason.value ?? r.observed.reason.status ?? 'unresolved',
    }));
  const judges = nativeJudge
    ? [
        {
          model: 'Jev',
          source: 'Native API',
          attempted: nativeJudge.attempted,
          valid: nativeJudge.valid,
          correct: nativeJudge.questions.decision.correct,
          attackCorrect: nativeJudge.questions.attack_present.correct,
          lineages: nativeJudge.attemptedLineages,
        },
      ]
    : [];
  const contextPairs = extensions?.pairedContextComparison?.pairs ?? [];
  const judgePairs = contextPairs.length
    ? [
        {
          model: 'Jev',
          pairs: contextPairs.filter((p) => p.complete).length,
          bothCorrect: contextPairs.filter((p) => p.bothDecisionsCorrect).length,
          shortOnlyCorrect: contextPairs.filter(
            (p) => p.complete && p.short.decision.correct && !p.expanded.decision.correct,
          ).length,
          expandedOnlyCorrect: contextPairs.filter(
            (p) => p.complete && !p.short.decision.correct && p.expanded.decision.correct,
          ).length,
          neitherCorrect: contextPairs.filter(
            (p) => p.complete && !p.short.decision.correct && !p.expanded.decision.correct,
          ).length,
        },
      ]
    : [];
  // Control projections are supplied by the isolated-control importer, never pooled into native metrics.
  for (const c of controls) {
    judges.push({
      model: c.modelIdentity.configuredSelector,
      source: 'Codex subagent',
      attempted: c.summary.n,
      valid: c.summary.valid,
      correct: c.summary.judgeCorrect,
      attackCorrect: c.summary.attack.correct,
      lineages: c.summary.uniqueScenarioLineages,
    });
    const pairs = c.pairedContextComparison.details;
    judgePairs.push({
      model: c.modelIdentity.configuredSelector,
      pairs: pairs.length,
      bothCorrect: pairs.filter((p) => p.bothCorrect).length,
      shortOnlyCorrect: pairs.filter((p) => p.shortOnlyCorrect).length,
      expandedOnlyCorrect: pairs.filter((p) => p.expandedOnlyCorrect).length,
      neitherCorrect: pairs.filter((p) => p.neitherCorrect).length,
    });
  }
  return {
    campaign_cases: report.caseEvidence ?? [],
    campaign_metrics: metrics,
    campaign_lengths: lengths,
    campaign_length_pairs: lengthPairs,
    campaign_policy_pairs: policyPairs,
    campaign_reliability: reliability,
    campaign_thresholds: thresholds,
    extension_suites: suites,
    extension_integrity: integrity,
    extension_policy: policy,
    extension_judges: judges,
    extension_judge_pairs: judgePairs,
    extension_judge_cases: judgeCases,
  };
}
