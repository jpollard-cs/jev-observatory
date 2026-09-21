import { validId } from '../domain/contracts.mjs';

// An acknowledgement permits a separate run; it never settles the earlier charge.
export const holdSnapshot = (run) => ({
  id: run.id,
  heldNano: run.held_nano,
  updatedAt: run.updated_at,
});

export function validRetainedHolds(holds) {
  return (
    Array.isArray(holds) &&
    holds.length <= 100 &&
    holds.every(
      (h) =>
        h &&
        Object.keys(h).length === 3 &&
        validId(h.id) &&
        Number.isSafeInteger(h.heldNano) &&
        h.heldNano > 0 &&
        typeof h.updatedAt === 'string' &&
        h.updatedAt.length === 24 &&
        Number.isFinite(Date.parse(h.updatedAt)) &&
        new Date(h.updatedAt).toISOString() === h.updatedAt,
    ) &&
    new Set(holds.map((h) => h.id)).size === holds.length
  );
}

export function sameRetainedHolds(current, reviewed) {
  return (
    current.length > 0 &&
    current.length === reviewed.length &&
    current.every((h) =>
      reviewed.some(
        (r) => r.id === h.id && r.heldNano === h.heldNano && r.updatedAt === h.updatedAt,
      ),
    )
  );
}
