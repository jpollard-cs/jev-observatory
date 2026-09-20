import { rebuild, assess, makeReport } from './core.mjs';
import { callJev } from './provider.mjs';
import { ENDPOINT, PRICE_NANO } from './jev-contract.mjs';

const model = (p) =>
  p.manifest.policy?.model ?? p.manifest.model ?? p.manifest.requiredProviderModel;
const identity = Object.freeze({ id: 'typesafe-jev-workbench', version: 1 });

// Execution port: compile, reserve, infer, assess, price, report and describe.
// The composition root selects trusted adapters. Clients cannot supply endpoints or code.
export const jevExecutionAdapter = Object.freeze({
  identity,
  legacyIdentity: identity, // v8 stored plans predate the explicit adapter identity.
  capabilities: Object.freeze({
    policyAdvice: true,
    coverageAdvice: true,
    nativeDistributions: true,
  }),
  compile: rebuild,
  reservation: (job) => job.reservationInputTokens * PRICE_NANO,
  infer: callJev,
  assess: (job, evidence, prepared) => assess(job, evidence, model(prepared)),
  cost: (observation) => (observation.usage ? observation.usage.inputTokens * PRICE_NANO : null),
  report: makeReport,
  describe: (p) => ({
    providerLabel: 'Jev / TypeSafe',
    endpoint: ENDPOINT,
    model: model(p),
    policyHash: p.manifest.policyHash ?? null,
    evaluationScope: p.manifest.coverage?.evaluationScope ?? null,
    unevaluatedBoundaries: (p.manifest.coverage?.structuredGaps ?? [])
      .filter(g => p.manifest.coverage?.evaluationScope?.deferredGapIds.includes(g.kind + ':' + g.id))
      .map(g => g.id),
    estimatedUsd: p.jobs.reduce((n, j) => n + j.estimatedInputTokens * PRICE_NANO, 0) / 1e9,
  }),
  disclosure:
    'The exact frozen policy/application text and selected test material go through this hosted service to TypeSafe. Authored expected answers are not sent. Requests and results are saved privately on this site. Your key is used only for the current request and is never written to our storage.',
});
