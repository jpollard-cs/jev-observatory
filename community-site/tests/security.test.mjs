import test from 'node:test';
import assert from 'node:assert/strict';
import {
  protectLegacyResponse,
  securityHeaders,
  dataHeaders,
  sameOriginWrite,
} from '../src/security.mjs';
import { canonical, sha256, validateBundle } from '../src/domain/contracts.mjs';
import { makeCatalog, makeExample } from '../scripts/catalog.mjs';
import { api } from '../src/http.mjs';
const example = makeExample(await makeCatalog());

test('every legacy executable script gets a fresh nonce only after whole-document verification', async () => {
  const html =
      '<html><script src="data:text/javascript;base64,Y29uc29sZS5sb2coMSk7"></script><script>document.title="reviewed";</script></html>',
    digest = await sha256(html);
  const make = () =>
    new Response(html, {
      headers: { 'Content-Type': 'text/html', 'Content-Length': String(html.length) },
    });
  const first = await protectLegacyResponse(make(), digest),
    second = await protectLegacyResponse(make(), digest);
  const csp = first.headers.get('content-security-policy'),
    nonce = csp.match(/nonce-([^']+)/)[1];
  assert.notEqual(csp, second.headers.get('content-security-policy'));
  assert.equal((await first.text()).split(`nonce="${nonce}"`).length - 1, 2);
  assert.equal(first.headers.has('content-length'), false);
  assert.match(csp, /script-src-attr 'none'/);
  assert.doesNotMatch(csp, /script-src [^;]*(?:unsafe-inline|unsafe-eval| data:|\*)/);
  const changed = await protectLegacyResponse(
    new Response(html + '<script>alert(1)</script>', { headers: { 'Content-Type': 'text/html' } }),
    digest,
  );
  assert.equal(changed.status, 503);
  assert.doesNotMatch(await changed.text(), /alert\(1\)/);
});

test('security headers block framing, active downloads, unnecessary capabilities and browser injection sinks', () => {
  const csp = securityHeaders['Content-Security-Policy'];
  for (const directive of [
    "object-src 'none'",
    "base-uri 'none'",
    "script-src-attr 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "trusted-types 'none'",
    "require-trusted-types-for 'script'",
  ])
    assert.ok(csp.includes(directive));
  assert.match(csp, /frame-ancestors 'self' https:\/\/chatgpt.com https:\/\/chat.openai.com/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.match(dataHeaders['Content-Security-Policy'], /sandbox/);
  assert.equal(dataHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(dataHeaders['Cross-Origin-Resource-Policy'], 'same-origin');
  assert.match(dataHeaders['Cache-Control'], /no-store/);
  assert.equal(dataHeaders['Referrer-Policy'], 'no-referrer');
});

test('write protection fails closed for missing, cross-site and sibling-origin requests', () => {
  for (const [origin, site, expected] of [
    [null, null, false],
    ['null', 'cross-site', false],
    ['https://evil.test', 'cross-site', false],
    ['https://sibling.test', 'same-site', false],
    ['https://site.test', 'cross-site', false],
    ['https://site.test', 'same-origin', true],
    ['https://site.test', null, true],
  ]) {
    const headers = {};
    if (origin !== null) headers.Origin = origin;
    if (site !== null) headers['Sec-Fetch-Site'] = site;
    assert.equal(
      sameOriginWrite(
        new Request('https://site.test/api/community/results', { method: 'POST', headers }),
      ),
      expected,
    );
  }
});

test('uploaded script markup stays JSON data and URL validation rejects executable or deceptive URLs', async () => {
  const attack = '<img src=x onerror="document.documentElement.dataset.xssExecuted=1">';
  const bundle = structuredClone(example);
  bundle.title = attack;
  bundle.observations[0] = {
    id: 'example-1',
    status: 'ok',
    observed: '</script><script>alert(1)</script>',
  };
  bundle.suite.definition.cases[0].input = attack;
  assert.equal((await validateBundle(bundle)).tag, 'ok');
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://github.com.evil.test/jpollard-cs/jev-observatory/pull/1',
    'https://github.com@evil.test/jpollard-cs/jev-observatory/pull/1',
    ['https://github.com/jpollard-cs/jev-observatory/pull/1'],
  ]) {
    const malicious = structuredClone(example);
    malicious.provenance.pullRequest = url;
    assert.equal((await validateBundle(malicious)).tag, 'error');
  }
  const result = await api(new Request('https://site.test/api/community/results/id/download'), {
    service: {},
    actor: null,
    catalog: {},
    example,
  });
  assert.equal(result.status, 404);
  const parsed = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
  );
  assert.equal(JSON.parse(canonical(parsed)).__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
});

test('compiled worker applies write protection and security headers to legacy APIs too', async () => {
  const worker = (await import('../dist/server/index.js')).default;
  const denied = await worker.fetch(
    new Request('https://site.test/api/presentation', {
      method: 'PUT',
      headers: {
        Origin: 'https://evil.test',
        'oai-authenticated-user-email': 'spoofed@example.test',
      },
      body: '{}',
    }),
    {},
    {},
  );
  assert.equal(denied.status, 403);
  const unknown = await worker.fetch(new Request('https://site.test/missing'), {}, {});
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get('x-content-type-options'), 'nosniff');
  assert.match(unknown.headers.get('content-security-policy'), /sandbox/);
});
