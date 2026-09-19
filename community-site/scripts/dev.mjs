import http from 'node:http';
import fs from 'node:fs/promises';
import { localStorage } from './local-storage.mjs';
import { repository } from '../src/adapters/d1.mjs';
import { communityService } from '../src/service.mjs';
import { api, securityHeaders } from '../src/http.mjs';
import { makeCatalog, makeExample } from './catalog.mjs';
const storage = await localStorage('runtime'),
  catalog = await makeCatalog(),
  example = makeExample(catalog);
const service = communityService({ repo: repository(storage.db), blobs: storage.blobs });
// Explicit local identity only. Never compiled into the hosted Worker; inbound identity headers are ignored.
const actor = process.argv.includes('--signed-in') ? { id: 'local-preview' } : null;
const port = Number(process.env.PORT ?? 8795);
http
  .createServer(async (req, res) => {
    try {
      const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
        method: req.method,
        headers: req.headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}),
      });
      const path = new URL(request.url).pathname;
      let response;
      if (path.startsWith('/api/community/'))
        response = await api(request, { service, actor, catalog, example });
      else if (path === '/observatory')
        response = new Response(
          'The historical Observatory uses its existing hosted R2 data. Open the hosted Observatory to view it.',
          { headers: { 'Content-Type': 'text/plain' } },
        );
      else if (path === '/signin-with-chatgpt')
        response = new Response(
          'Local preview: restart with npm run dev -- --signed-in to test a local account. Hosted sign-in is handled by Sites.',
          { headers: { 'Content-Type': 'text/plain' } },
        );
      else {
        const file = { '/': 'index.html', '/community.css': 'app.css', '/community.js': 'app.js' }[
          path
        ];
        response = file
          ? new Response(await fs.readFile(new URL('../public/' + file, import.meta.url)), {
              headers: {
                ...securityHeaders,
                'Content-Type': file.endsWith('.css')
                  ? 'text/css'
                  : file.endsWith('.js')
                    ? 'text/javascript'
                    : 'text/html',
              },
            })
          : new Response('Not found', { status: 404 });
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
      `Community preview: http://127.0.0.1:${port} (${actor ? 'local preview account' : 'anonymous'})`,
    ),
  );
