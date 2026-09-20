import { canonical, sha256 } from '../domain/contracts.mjs';

// Only the hosted execution port calls this with integrity-checked persisted records.
// This is source attribution, not a provider signature or a regression verdict.
export async function hostedBundle(prepared, run, observations, requests, report, provider) {
  const manifest = prepared.manifest;
  const cases = prepared.jobs.map((job, index) => ({
    id: job.id,
    expected: job.expected,
    requestHash: job.requestHash,
    request: JSON.parse(requests[index]),
  }));
  return {
    format: 'jev-observatory-bundle',
    version: 2,
    title: manifest.policy.name + ' · ' + run.created_at.slice(0, 10),
    model: provider.model,
    policy: {
      name: manifest.policy.name,
      document: manifest.policy,
      hash: await sha256(canonical(manifest.policy)),
    },
    suite: { name: manifest.protocol, definition: { planHash: manifest.planHash, cases } },
    provenance: {
      sourceStamp: manifest.sourceStamp,
      method:
        'Host-observed evaluation. The service assembled the entire frozen plan and all saved responses. Not a provider-signed attestation or a no-regression certificate.',
      settings: { runId: run.id, execution: prepared.execution, manifest, report, observations },
    },
    observations: prepared.jobs.map((job, index) => {
      const observation = observations[index];
      return {
        id: job.id,
        status: observation ? (observation.valid ? 'ok' : 'error') : 'not_run',
        ...(observation?.valid
          ? {
              observed: Object.fromEntries(
                Object.keys(job.expected).map((field) => {
                  const answer = observation.evidence.response.answers[field];
                  return [field, answer?.choice ?? answer?.noul ?? answer?.score ?? null];
                }),
              ),
            }
          : observation
            ? { errorCode: observation.error ?? 'invalid_response' }
            : {}),
      };
    }),
  };
}
