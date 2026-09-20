import { receiptAuthority } from './receipts/crypto.mjs';
export default {
  async test() {
    const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    jwk.alg = 'Ed25519'; // Node 24 exports the fully specified JOSE algorithm name.
    const trust = {
      protocol: 'observatory-trust/1',
      keys: [
        {
          id: 'test',
          issuer: 'https://test.invalid',
          algorithm: 'Ed25519',
          publicKey: jwk.x,
          status: 'active',
          notBefore: '2020-01-01T00:00:00.000Z',
          notAfter: '2099-01-01T00:00:00.000Z',
        },
      ],
    };
    const receipts = receiptAuthority(
      JSON.stringify({ keyId: 'test', jwk }),
      trust,
      'a'.repeat(40),
    );
    const subject = { proof: 'runtime signing check' };
    const r = await receipts.sign('service-status', subject);
    await receipts.verify('service-status', subject, r);
  },
};
