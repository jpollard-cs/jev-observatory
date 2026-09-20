import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
test('receipt signing and verification use native Cloudflare workerd Web Crypto', async () => {
  await promisify(execFile)(
    fileURLToPath(new URL('../node_modules/.bin/workerd', import.meta.url)),
    [
      'test',
      fileURLToPath(new URL('./fixtures/receipt-runtime.capnp', import.meta.url)),
      '--no-verbose',
    ],
    { timeout: 20000 },
  );
});
