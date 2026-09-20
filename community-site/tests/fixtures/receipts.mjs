import { receiptAuthority } from '../../src/receipts/crypto.mjs';
export async function testReceipts(savedSecret = null) {
  const pair = savedSecret
    ? null
    : await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const jwk = savedSecret
    ? JSON.parse(savedSecret).jwk
    : await crypto.subtle.exportKey('jwk', pair.privateKey);
  const trust = {
    protocol: 'observatory-trust/1',
    keys: [
      {
        id: 'test-key',
        issuer: 'https://test.invalid',
        algorithm: 'Ed25519',
        publicKey: jwk.x,
        status: 'active',
        notBefore: '2020-01-01T00:00:00.000Z',
        notAfter: '2099-01-01T00:00:00.000Z',
      },
    ],
  };
  const secret = JSON.stringify({ keyId: 'test-key', jwk });
  return { trust, secret, authority: receiptAuthority(secret, trust, 'a'.repeat(40)) };
}
