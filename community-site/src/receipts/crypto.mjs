import { canonical, sha256 } from '../domain/contracts.mjs';

const bytes = (text) => new TextEncoder().encode(text);
const encoded = (value) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
function decoded(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value))
    throw Error('Malformed receipt encoding');
  const result = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
  if (result.length !== length || encoded(result) !== value) throw Error('Invalid receipt length');
  return result;
}
const signable = (header) => bytes('observatory-receipt/1\n' + canonical(header));
function trustedKey(trust, id) {
  const keys =
    trust?.protocol === 'observatory-trust/1' ? trust.keys.filter((k) => k.id === id) : [];
  if (keys.length !== 1 || !['active', 'retired'].includes(keys[0].status))
    throw Error('Unknown or revoked signing key');
  return keys[0];
}
export async function assertReceipt(
  subject,
  receipt,
  trust,
  kind,
  { now = Date.now(), issuer, evaluatorRevision } = {},
) {
  if (
    !receipt ||
    Object.keys(receipt).sort().join(',') !==
      'algorithm,evaluatorRevision,issuedAt,issuer,keyId,kind,protocol,signature,subjectHash' ||
    receipt.protocol !== 'observatory-receipt/1' ||
    receipt.algorithm !== 'Ed25519' ||
    receipt.kind !== kind ||
    !/^[a-f0-9]{40}$/.test(receipt.evaluatorRevision)
  )
    throw Error('Unsupported receipt');
  const key = trustedKey(trust, receipt.keyId),
    time = Date.parse(receipt.issuedAt);
  if (evaluatorRevision && receipt.evaluatorRevision !== evaluatorRevision)
    throw Error('Unexpected evaluator revision');
  if (
    key.algorithm !== 'Ed25519' ||
    receipt.issuer !== key.issuer ||
    (issuer && issuer !== key.issuer) ||
    !Number.isFinite(time) ||
    time < Date.parse(key.notBefore) ||
    time > Date.parse(key.notAfter) ||
    time > now + 300000
  )
    throw Error('Receipt issuer or validity interval mismatch');
  if (receipt.subjectHash !== (await sha256(canonical(subject))))
    throw Error('Signed content has changed');
  const publicKey = await crypto.subtle.importKey(
    'raw',
    decoded(key.publicKey, 32),
    'Ed25519',
    false,
    ['verify'],
  );
  const { signature, ...header } = receipt;
  if (!(await crypto.subtle.verify('Ed25519', publicKey, decoded(signature, 64), signable(header))))
    throw Error('Receipt signature does not verify');
  return key;
}
// Injected signing port. No HTTP endpoint signs caller-supplied content.
export function receiptAuthority(
  secret,
  trust,
  evaluatorRevision,
  { now = () => new Date().toISOString() } = {},
) {
  let loaded;
  async function load() {
    if (!loaded)
      loaded = (async () => {
        if (!secret) throw Error('Receipt signing is not configured');
        const config = JSON.parse(secret),
          key = trustedKey(trust, config.keyId);
        if (key.status !== 'active' || config.jwk?.x !== key.publicKey)
          throw Error('Signing key does not match trust registry');
        const privateKey = await crypto.subtle.importKey('jwk', config.jwk, 'Ed25519', false, [
          'sign',
        ]);
        const publicKey = await crypto.subtle.importKey(
          'raw',
          decoded(key.publicKey, 32),
          'Ed25519',
          false,
          ['verify'],
        );
        const challenge = bytes('observatory-signing-key-check/1');
        if (
          !(await crypto.subtle.verify(
            'Ed25519',
            publicKey,
            await crypto.subtle.sign('Ed25519', privateKey, challenge),
            challenge,
          ))
        )
          throw Error('Signing key pair mismatch');
        return { key, privateKey };
      })();
    return loaded;
  }
  return {
    trust,
    async ready() {
      const { key } = await load(),
        time = Date.parse(now());
      if (
        !Number.isFinite(time) ||
        time < Date.parse(key.notBefore) ||
        time > Date.parse(key.notAfter)
      )
        throw Error('Signing key is outside its validity interval');
    },
    async sign(kind, subject) {
      const { key, privateKey } = await load();
      const header = {
        protocol: 'observatory-receipt/1',
        algorithm: 'Ed25519',
        keyId: key.id,
        issuer: key.issuer,
        evaluatorRevision,
        issuedAt: now(),
        kind,
        subjectHash: await sha256(canonical(subject)),
      };
      const receipt = {
        ...header,
        signature: encoded(await crypto.subtle.sign('Ed25519', privateKey, signable(header))),
      };
      await assertReceipt(subject, receipt, trust, kind);
      return receipt;
    },
    verify: (kind, subject, receipt) => assertReceipt(subject, receipt, trust, kind),
  };
}
