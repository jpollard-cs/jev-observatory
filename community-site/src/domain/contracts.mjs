export const MAX_BYTES = 4 * 1024 * 1024;
export const ok = (value) => ({ tag: 'ok', value });
export const error = (code, message, status = 400) => ({
  tag: 'error',
  error: { code, message, status },
});
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const keys = (value, allowed) =>
  object(value) && Object.keys(value).every((key) => allowed.includes(key));
export const validId = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export const canonical = (value) => JSON.stringify(normalize(value));
function normalize(value, depth = 0) {
  if (depth > 32) throw new RangeError('JSON exceeds 32 levels.');
  if (Array.isArray(value)) return value.map((item) => normalize(item, depth + 1));
  if (object(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key], depth + 1)]),
    );
  return value;
}
export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
export async function validateBundle(input) {
  if (
    !keys(input, [
      'format',
      'version',
      'title',
      'model',
      'policy',
      'suite',
      'provenance',
      'observations',
    ]) ||
    input.format !== 'jev-observatory-bundle' ||
    input.version !== 1
  )
    return error(
      'unsupported_bundle',
      'Use the portable Jev Observatory bundle format, version 1.',
    );
  let serialized;
  try {
    serialized = canonical(input);
  } catch {
    return error('invalid_structure', 'JSON must have no more than 32 nested levels.');
  }
  if (new TextEncoder().encode(serialized).length > MAX_BYTES)
    return error('bundle_too_large', 'The maximum bundle size is 4 MiB.', 413);
  if (!text(input.model, 160) || !text(input.title, 120))
    return error('invalid_bundle', 'Include a title and model identity.');
  const p = input.policy;
  if (
    !keys(p, ['name', 'hash', 'document']) ||
    !text(p.name, 100) ||
    !object(p.document) ||
    p.hash !== (await sha256(canonical(p.document)))
  )
    return error(
      'policy_mismatch',
      'Include the full policy document and its matching canonical SHA-256.',
    );
  const s = input.suite;
  if (
    !keys(s, ['name', 'definition']) ||
    !text(s.name, 160) ||
    !object(s.definition) ||
    !Array.isArray(s.definition.cases) ||
    !s.definition.cases.length ||
    s.definition.cases.length > 10000
  )
    return error(
      'invalid_suite',
      'The suite definition must include 1–10,000 cases with unique IDs and expected values.',
    );
  const cases = new Map();
  for (const row of s.definition.cases) {
    if (!object(row) || !text(row.id, 200) || cases.has(row.id) || !Object.hasOwn(row, 'expected'))
      return error('invalid_suite', 'Each suite case needs a unique ID and an expected value.');
    cases.set(row.id, row);
  }
  if (
    !keys(input.provenance, ['sourceRevision', 'method', 'settings', 'pullRequest']) ||
    !/^[a-f0-9]{40}$/.test(input.provenance.sourceRevision ?? '') ||
    !text(input.provenance.method, 1200) ||
    !object(input.provenance.settings)
  )
    return error(
      'invalid_provenance',
      'Include the evaluator Git commit (40 lowercase hex characters), method and complete run settings.',
    );
  if (
    input.provenance.pullRequest !== undefined &&
    (typeof input.provenance.pullRequest !== 'string' ||
      !/^https:\/\/github\.com\/jpollard-cs\/jev-observatory\/pull\/[1-9][0-9]*$/.test(
        input.provenance.pullRequest,
      ))
  )
    return error('invalid_pull_request', 'Use a pull request URL in the Observatory repository.');
  if (!Array.isArray(input.observations) || input.observations.length !== cases.size)
    return error(
      'incomplete_coverage',
      'Include one observation for every suite case, including errors and cases not run.',
    );
  const ids = new Set();
  for (const row of input.observations) {
    if (
      !keys(row, ['id', 'status', 'observed', 'errorCode']) ||
      !cases.has(row.id) ||
      ids.has(row.id) ||
      !['ok', 'error', 'unavailable', 'not_run'].includes(row.status)
    )
      return error(
        'invalid_observation',
        'Observations must uniquely cover suite IDs and preserve explicit execution status.',
      );
    if (row.status === 'ok' && !Object.hasOwn(row, 'observed'))
      return error(
        'missing_evidence',
        'Successful observations must preserve the observed output.',
      );
    if (row.errorCode !== undefined && !text(row.errorCode, 120))
      return error(
        'invalid_error',
        'Use a short error code, without provider response bodies or credentials.',
      );
    ids.add(row.id);
  }
  return ok(input);
}
export function summarize(bundle) {
  const expected = new Map(bundle.suite.definition.cases.map((row) => [row.id, row.expected]));
  const completed = bundle.observations.filter((row) => row.status === 'ok');
  return {
    total: bundle.observations.length,
    completed: completed.length,
    incomplete: bundle.observations.length - completed.length,
    exactMatches: completed.filter(
      (row) => canonical(row.observed) === canonical(expected.get(row.id)),
    ).length,
  };
}
export function canRead(row, actor) {
  return Boolean(row && (row.visibility === 'public' || (actor && row.owner === actor.id)));
}
export function publicResult(row, actor) {
  const { owner, objectKey, ...metadata } = row;
  return { ...metadata, owned: actor?.id === owner, evidenceStatus: 'contributor-reported' };
}
