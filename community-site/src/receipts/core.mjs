import { canonical, sha256 } from '../domain/contracts.mjs';

// Coverage is separate from model correctness. Neither a signature nor complete
// development-catalog coverage is a no-regression verdict.
export async function coreCoverage(prepared, observations, core) {
  const required = core.cases.flatMap((c) =>
    core.layouts.map((layout) => `${c.id}__${layout}__r${core.minimumRepeat}`),
  );
  const indices = new Map(prepared.jobs.map((j, i) => [j.id, i]));
  const missing = required.filter((id) => !indices.has(id));
  const invalid = required.filter(
    (id) => indices.has(id) && observations[indices.get(id)]?.valid !== true,
  );
  return {
    id: core.id,
    definitionHash: await sha256(canonical(core)),
    catalogMatches: prepared.manifest.catalogHash === core.catalogHash,
    requiredRequests: required.length,
    missing,
    invalid,
    status:
      prepared.manifest.catalogHash === core.catalogHash && !missing.length && !invalid.length
        ? 'complete'
        : 'incomplete',
  };
}
