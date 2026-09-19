const labels = {
  classification: 'Injection · Choice',
  injection_present: 'Injection · Noul / Boolean',
  integrity: 'Context integrity',
  poisoning_evidenced: 'Poisoning evidence',
  policy_decision: 'Policy decision',
  input_contract: 'Input contract',
};
const fraction = (a, b) => `${a}/${b}`;
export function followupQueries({ encoding, qwen }) {
  const queries = {};
  if (encoding) {
    queries.encoding_summary = [
      {
        status: encoding.status,
        planned: encoding.planned,
        attempted: encoding.attempted,
        valid: encoding.valid,
        costUsd: encoding.knownCostUsd,
        model: encoding.models.join(', '),
        planHash: encoding.planHash,
        limitations: encoding.limitations.join('\n'),
      },
    ];
    queries.encoding_groups = encoding.groups.map((g) => ({
      label: `${g.family} · ${g.representation}`,
      family: g.family,
      representation: g.representation,
      choiceCorrect: fraction(
        g.classification.classification.correct,
        g.classification.classification.valid,
      ),
      noulCorrect: fraction(
        g.classification.injection_present.correct,
        g.classification.injection_present.valid,
      ),
      recoveryCorrect: fraction(g.recovery.recovered_text.correct, g.recovery.recovered_text.valid),
      choiceRate: g.classification.classification.accuracy,
      noulRate: g.classification.injection_present.accuracy,
      recoveryRate: g.recovery.recovered_text.accuracy,
      choiceMisses: fraction(g.choiceErrors.falseNegatives, g.choiceErrors.attacks),
      noulMisses: fraction(g.noulErrors.falseNegatives, g.noulErrors.attacks),
      falseAlarms: g.choiceErrors.falsePositives + g.noulErrors.falsePositives,
    }));
    queries.encoding_pairs = encoding.pairs.map((p) => ({
      ...p,
      material: JSON.stringify(p.material),
      classificationQuestions: JSON.stringify(p.classificationQuestions),
      recoveryQuestions: JSON.stringify(p.recoveryQuestions),
      choiceProbabilities: JSON.stringify(p.choiceProbabilities),
      recoveryProbabilities: JSON.stringify(p.recoveryProbabilities),
    }));
  }
  if (qwen) {
    queries.qwen_summary = [
      {
        status: qwen.status,
        planned: qwen.planned,
        attempted: qwen.attempted,
        valid: qwen.valid,
        model: qwen.model,
        quantization: qwen.quantization,
        planHash: qwen.planHash,
        limitations: qwen.limitations.join('\n'),
        generation: JSON.stringify(qwen.generation),
      },
    ];
    queries.qwen_questions = qwen.perQuestion.map((q) => ({
      question: q.question,
      label: labels[q.question],
      qwenCorrect: fraction(q.qwen.correct, q.qwen.valid),
      jevCorrect: fraction(q.jev.correct, q.jev.valid),
      qwenAllPlanned: fraction(q.qwen.correct, q.qwen.planned),
      qwenUnavailable: q.qwen.unavailable,
      paired: q.paired,
      agreement: fraction(q.agreement, q.paired),
      qwenRate: q.paired ? q.qwen.correct / q.paired : null,
      jevRate: q.paired ? q.jevMatchedCorrect / q.paired : null,
      qwenOnlyCorrect: q.qwenOnlyCorrect,
      jevOnlyCorrect: q.jevOnlyCorrect,
    }));
    queries.qwen_lengths = qwen.byLength.map((g) => ({
      length: g.length,
      planned: g.planned,
      attempted: g.attempted,
      valid: g.valid,
      inputMin: g.inputTokens.min,
      inputMax: g.inputTokens.max,
      latencySeconds: g.latencyMs.median === null ? null : g.latencyMs.median / 1000,
      jevLatencySeconds: g.jevLatencyMs.median === null ? null : g.jevLatencyMs.median / 1000,
      latencyCount: g.latencyMs.n,
      jevLatencyCount: g.jevLatencyMs.n,
      outputMedian: g.outputTokens.median,
    }));
    queries.qwen_cases = qwen.rows.map((r) => ({
      ...r,
      expected: r.gold.classification,
      qwenChoice: r.answers?.classification ?? r.status,
      jevChoice: r.jevAnswers.classification,
      qwenInjection: r.answers?.injection_present ?? null,
      jevInjection: r.jevAnswers.injection_present,
      judgmentDisagreements: r.agreement
        ? Object.values(r.agreement).filter((v) => !v).length
        : null,
      answers: JSON.stringify(r.answers),
      gold: JSON.stringify(r.gold),
      jevAnswers: JSON.stringify(r.jevAnswers),
      jevNativeQuestions: JSON.stringify(r.jevNativeQuestions),
      sourceFieldHashes: JSON.stringify(r.sourceFieldHashes),
      usage: JSON.stringify(r.usage),
    }));
    queries.qwen_errors = qwen.errors.flatMap((g) =>
      ['qwen', 'jev'].map((model) => ({
        question: labels[g.question],
        model: model === 'qwen' ? 'Qwen · local UD-Q3_K_XL' : 'Jev · native',
        label: `${model === 'qwen' ? 'Qwen' : 'Jev'} · ${g.question === 'classification' ? 'Choice' : model === 'qwen' ? 'Boolean' : 'Noul'}`,
        missed: fraction(g[model].falseNegatives, g[model].attacks),
        falseAlarms: fraction(g[model].falsePositives, g[model].benign),
        missRate: g[model].attacks ? g[model].falseNegatives / g[model].attacks : null,
        falseAlarmRate: g[model].benign ? g[model].falsePositives / g[model].benign : null,
        abstentions: g[model].abstentions,
        valid: g[model].valid,
      })),
    );
  }
  return queries;
}
