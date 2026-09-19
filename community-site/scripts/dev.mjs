import http from 'node:http';
import { localStorage } from './local-storage.mjs';
import worker from '../dist/server/index.js';
const storage = await localStorage('runtime');
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
      const response =
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
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end('Local preview error');
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log(
      `Observatory workspace: http://127.0.0.1:${port} (${signedIn ? 'preview account' : 'anonymous'})`,
    ),
  );
