import {
  ok,
  error,
  canonical,
  sha256,
  validateBundle,
  summarize,
  canRead,
  publicResult,
} from './domain/contracts.mjs';
export function communityService({
  repo,
  blobs,
  newId = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
}) {
  const missing = () => error('not_found', 'This contribution is unavailable or private.', 404);
  const signIn = () =>
    error(
      'sign_in_required',
      'Sign in to upload or manage your contributions. Browsing shared evidence is open.',
      401,
    );
  async function get(id, actor) {
    const row = await repo.get(id);
    return canRead(row, actor) ? ok(publicResult(row, actor)) : missing();
  }
  return {
    get,
    async list(actor, mine, offset = 0) {
      if (mine && !actor) return signIn();
      const rows = await repo.list(mine ? actor.id : null, offset);
      return ok({
        items: rows.slice(0, 50).map((row) => publicResult(row, actor)),
        nextOffset: rows.length > 50 ? offset + 50 : null,
      });
    },
    async upload(input, actor) {
      if (!actor) return signIn();
      if (
        !input ||
        typeof input.author !== 'string' ||
        !input.author.trim() ||
        input.author.length > 80 ||
        input.reviewedForSharing !== true
      )
        return error(
          'review_required',
          'Add a display name and confirm that you reviewed the bundle for credentials and private data.',
        );
      const valid = await validateBundle(input.bundle);
      if (valid.tag === 'error') return valid;
      const bundle = valid.value,
        serialized = canonical(bundle),
        id = newId(),
        objectKey = `community/v1/bundles/${id}.json`;
      const row = {
        id,
        owner: actor.id,
        author: input.author.trim(),
        policyName: bundle.policy.name,
        policyHash: bundle.policy.hash,
        title: bundle.title,
        model: bundle.model,
        suiteHash: await sha256(canonical(bundle.suite)),
        bundleHash: await sha256(serialized),
        sourceRevision: bundle.provenance.sourceRevision,
        objectKey,
        bytes: new TextEncoder().encode(serialized).length,
        ...summarize(bundle),
        visibility: 'private',
        createdAt: now(),
      };
      await blobs.put(objectKey, serialized, { httpMetadata: { contentType: 'application/json' } });
      try {
        if (!(await repo.insert(row))) {
          await blobs.delete(objectKey);
          return error('quota_exceeded', 'The account limit is 200 bundles or 100 MiB.', 429);
        }
      } catch (cause) {
        await blobs.delete(objectKey);
        throw cause;
      }
      return ok(publicResult(row, actor));
    },
    async setVisibility(id, input, actor) {
      if (!actor) return signIn();
      if (!['public', 'private'].includes(input?.visibility))
        return error('invalid_visibility', 'Choose public or private.');
      const row = await repo.get(id);
      if (!row || row.owner !== actor.id) return missing();
      await repo.visibility(id, actor.id, input.visibility);
      return get(id, actor);
    },
    async remove(id, actor) {
      if (!actor) return signIn();
      const row = await repo.get(id);
      if (!row || row.owner !== actor.id) return missing();
      // Revoke access before blob cleanup; failed cleanup never leaves a public record.
      await repo.remove(id, actor.id);
      await blobs.delete(row.objectKey);
      return ok({ deleted: true });
    },
    async download(id, actor) {
      const readable = await get(id, actor);
      if (readable.tag === 'error') return readable;
      const row = await repo.get(id),
        object = await blobs.get(row.objectKey);
      if (!object)
        return error(
          'storage_unavailable',
          'The bundle could not be loaded. Please try again.',
          503,
        );
      return ok({ body: object.body, filename: `jev-result-${id}.json` });
    },
  };
}
