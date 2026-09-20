import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import { publicRedirect } from '../src/public-routing.mjs';
const current = 'https://redteam-observatory.wizard.chatgpt.site';
const old = 'https://jev-redteam-observatory.wizard.chatgpt.site';
test('both archive entry points reach the preserved workspace evidence without the retired site', async () => {
  for (const origin of [current, old])
    for (const method of ['GET', 'HEAD'])
      for (const path of [
        '/observatory?view=1&tab=rich-pilot&ignored=private',
        '/?view=1&tab=policy',
        '/_data/components/research',
      ]) {
        const r = await worker.fetch(new Request(origin + path, { method }), {}, {});
        assert.equal(r.status, 302);
        assert.equal(r.headers.get('Location'), current + '/workspace#overview');
        assert.equal(r.headers.get('Cache-Control'), 'no-store');
      }
});
test('retired public pages redirect without forwarding queries or touching private APIs', async () => {
  for (const path of ['/', '/workspace', '/workspace/', '/community', '/community/']) {
    const r = await worker.fetch(new Request(old + path + '?ignored=private'), {}, {});
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('Location'), current + path.replace(/\/$/, ''));
  }
  assert.equal(publicRedirect(new Request(old + '/api/execution/runs/private')), null);
  assert.equal(publicRedirect(new Request(old + '/workspace', { method: 'POST' })), null);
});
test('canonical landing, workspace and community stay public, without sign-in or storage', async () => {
  for (const path of ['/', '/workspace', '/community']) {
    const r = await worker.fetch(new Request(current + path), {}, {});
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Location'), null);
  }
});
