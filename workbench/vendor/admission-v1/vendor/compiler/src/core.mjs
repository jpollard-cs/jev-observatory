import { createHash } from 'node:crypto';

export const VERSION = 'policy-payload/1';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const jsonHash = value => sha256(JSON.stringify(value));
export const clone = value => structuredClone(value);
export const pointerEscape = s => String(s).replaceAll('~', '~0').replaceAll('/', '~1');
export class CompileError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'CompileError'; this.code = code; this.details = details; }
}
export function insist(condition, code, details = {}) { if (!condition) throw new CompileError(code, details); }
export function record(value, code = 'object_required') {
  insist(value !== null && typeof value === 'object' && !Array.isArray(value), code);
}
export function exactKeys(value, allowed, code) {
  record(value, code);
  const unknown = Object.keys(value).filter(k => !allowed.includes(k));
  insist(!unknown.length, code, { unknown });
}
export function identifier(value) {
  insist(typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(value) && !['__proto__','constructor','prototype'].includes(value), 'invalid_identifier', { value });
}
/** Validate JSON without interpreting hostile strings or rejecting role-like keys in material. */
export function jsonValue(value, at = '$', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { insist(Number.isFinite(value), 'non_finite_number', { at }); return; }
  insist(typeof value === 'object', 'non_json_value', { at });
  insist(!seen.has(value), 'cyclic_input', { at }); seen.add(value);
  insist(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'non_plain_json', { at });
  if (Array.isArray(value)) for (let i=0;i<value.length;i++) jsonValue(value[i], `${at}/${i}`, seen);
  else for (const [key,child] of Object.entries(value)) jsonValue(child, `${at}/${pointerEscape(key)}`, seen);
  seen.delete(value);
}
export function orderedObject(entries) {
  return Object.fromEntries(entries); // Safe own properties, including hostile sample keys.
}
export function unique(values, code) { insist(new Set(values).size === values.length, code); }
