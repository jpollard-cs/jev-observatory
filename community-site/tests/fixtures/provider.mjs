// Deterministic transport fixture. Never included in the production Worker.
export function mockProvider(request) {
  return {
    model: 'jev-1.13.0',
    usage: { input_tokens: 1234, output_tokens: 0 },
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([id, q]) => {
        const options = Object.keys(q.criteria ?? {}),
          choice = options[0],
          probabilities = Object.fromEntries(options.map((k) => [k, k === choice ? 1 : 0]));
        return [
          id,
          q.type === 'noul'
            ? { type: 'noul', noul: 0.8 }
            : q.type === 'choice'
              ? { type: 'choice', choice, confidence: 1, probabilities }
              : {
                  type: 'score',
                  score: 0,
                  confidence: 1,
                  probabilities,
                  legend: Object.fromEntries(options.map((k) => [k, q.criteria[Number(k)]])),
                },
        ];
      }),
    ),
  };
}
