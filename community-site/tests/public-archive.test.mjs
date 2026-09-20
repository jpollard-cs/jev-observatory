import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

// Archive storage is intentionally not copied between the two public sites.
test('anonymous archive reads at the renamed site reach the original archive with bounded parameters', async () => {
  for (const method of ['GET', 'HEAD'])
    for (const path of [
      '/observatory?view=1&tab=rich-pilot&ignored=private',
      '/?view=1&tab=policy',
    ]) {
      const response = await worker.fetch(
        new Request('https://redteam-observatory.wizard.chatgpt.site' + path, { method }),
        {},
        {},
      );
      assert.equal(response.status, 302);
      const location = new URL(response.headers.get('Location'));
      assert.equal(location.origin, 'https://jev-redteam-observatory.wizard.chatgpt.site');
      assert.equal(location.pathname, '/observatory');
      assert.equal(location.searchParams.get('view'), '1');
      assert.equal(location.searchParams.has('ignored'), false);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
});

test('the public landing and workspace stay on the new site, without sign-in or storage', async () => {
  for (const path of ['/', '/workspace', '/community']) {
    const response = await worker.fetch(
      new Request('https://redteam-observatory.wizard.chatgpt.site' + path),
      {},
      {},
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Location'), null);
  }
});
