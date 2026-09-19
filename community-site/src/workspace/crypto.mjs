import { Hash } from 'fast-sha256';
export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw Error('Unsupported digest');
  const hash = new Hash();
  return {
    update(value) {
      hash.update(typeof value === 'string' ? new TextEncoder().encode(value) : value);
      return this;
    },
    digest(encoding) {
      const bytes = hash.digest();
      if (encoding !== 'hex') throw Error('Unsupported encoding');
      return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
    },
  };
}
export const randomUUID = () => crypto.randomUUID();
export default { createHash, randomUUID };
