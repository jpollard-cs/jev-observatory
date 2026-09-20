import { gunzipSync } from 'node:zlib';
import http from 'node:http';
import { localStorage } from './local-storage.mjs';
import worker from '../dist/server/index.js';
const mocked = process.argv.includes('--mock-jev');
const slow = mocked && process.argv.includes('--slow-preview');
const delay = () => new Promise(resolve => setTimeout(resolve, 2200));
const mockFailure = mocked && process.argv.includes('--mock-jev-failure');
const storage = await localStorage(
  mocked ? (mockFailure ? 'runtime/mock-execution-failure' : 'runtime/mock-execution') : 'runtime',
);
if (mocked) {
  const { mockProvider } = await import('../tests/fixtures/provider.mjs');
  globalThis.fetch = async (url, options) => {
    if (url !== 'https://api.typesafe.ai/v1/systemone')
      throw Error('Mock preview blocks external network');
    if (slow) await delay();
    if (mockFailure) return new Response('Synthetic malformed provider response');
    return Response.json(
      mockProvider(
        JSON.parse(options.body),
        process.argv.includes('--mock-spanish-only') ? { languages: 'spanish' } : process.argv.includes('--mock-english-only') ? { languages: 'english' } : {},
      ),
    );
  };
}
// Explicit preview identity only; never trust incoming identity headers locally.
const signedIn = process.argv.includes('--signed-in');
const port = Number(process.env.PORT ?? 8795);
http
  .createServer(async (req, res) => {
    try {
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
        res.writeHead(403);
        res.end('Host not allowed');
        return;
      }
      const headers = new Headers(req.headers);
      headers.delete('oai-authenticated-user-id');
      headers.delete('oai-authenticated-user-email');
      if (signedIn) headers.set('oai-authenticated-user-id', 'local-preview');
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}),
      });
      const pathname = new URL(request.url).pathname;
      if (slow && pathname.startsWith('/api/execution/')) await delay();
      let response =
        pathname === '/observatory'
          ? Response.redirect(
              'https://jev-redteam-observatory.wizard.chatgpt.site/observatory',
              302,
            )
          : pathname === '/signin-with-chatgpt'
            ? new Response(
                'Local preview: restart with npm run dev -- --signed-in. Hosted sign-in is handled by Sites.',
                { headers: { 'Content-Type': 'text/plain' } },
              )
            : await worker.fetch(request, { DB: storage.db, BUCKET: storage.blobs }, {});
      if (mocked && response.headers.get('content-type')?.startsWith('text/html')) {
        const raw = Buffer.from(await response.arrayBuffer());
        const html = (
          response.headers.get('content-encoding') === 'gzip' ? gunzipSync(raw) : raw
        ).toString('utf8');
        const previewHeaders = new Headers(response.headers);
        previewHeaders.delete('content-encoding');
        previewHeaders.delete('content-length');
        response = new Response(
          html.replace(
            '<body>',
            '<body><p role="status">LOCAL MOCK PREVIEW — simulated provider answers; no real model calls. Do not share these as measured results.</p>',
          ),
          { status: response.status, headers: previewHeaders },
        );
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end('Local preview error');
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log(
      `Observatory workspace: http://127.0.0.1:${port} (${signedIn ? 'preview account' : 'anonymous'}${mocked ? ', MOCK Jev: zero network calls' : ''})`,
    ),
  );
