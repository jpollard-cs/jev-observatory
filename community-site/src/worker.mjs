import { executionApi } from './hosted/http.mjs';
import { executionService } from './hosted/service.mjs';
import { executionRepository } from './hosted/repository.mjs';
import { callJev } from './hosted/provider.mjs';
import landing from '../public/landing.html';
import landingCss from '../public/landing.css';
import landingJs from '../public/landing.js';
import workspaceAssets from 'workspace:assets';
import legacy from '../legacy/observatory-worker.mjs';
import { repository } from './adapters/d1.mjs';
import { communityService } from './service.mjs';
import { api, json } from './http.mjs';
import {
  securityHeaders,
  workspaceHeaders,
  sameOriginWrite,
  protectLegacyResponse,
} from './security.mjs';
import html from '../public/index.html';
import css from '../public/app.css';
import js from '../public/app.js';
import catalog from '../catalog/generated.json';
import example from '../catalog/example.json';
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOriginWrite(request))
      return json({ error: 'invalid_origin', message: 'Cross-site writes are not allowed.' }, 403);
    if (url.pathname === '/observatory' || (url.pathname === '/' && url.searchParams.has('tab'))) {
      url.pathname = '/';
      return protectLegacyResponse(await legacy.fetch(new Request(url, request), env, context));
    }
    if (workspaceAssets[url.pathname] && ['GET', 'HEAD'].includes(request.method)) {
      const asset = workspaceAssets[url.pathname];
      return new Response(
        request.method === 'HEAD'
          ? null
          : Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0)),
        {
          encodeBody: 'manual',
          headers: {
            ...workspaceHeaders,
            'Content-Type':
              asset.type + (asset.type === 'application/gzip' ? '' : '; charset=utf-8'),
            ...(asset.encoding ? { 'Content-Encoding': asset.encoding } : {}),
          },
        },
      );
    }
    if (url.pathname.startsWith('/api/execution/')) {
      const id = request.headers.get('oai-authenticated-user-id');
      return executionApi(request, {
        actor: id ? { id } : null,
        service: executionService({
          repo: executionRepository(env.DB),
          blobs: env.BUCKET,
          infer: callJev,
        }),
      });
    }
    if (url.pathname.startsWith('/api/community/')) {
      const id = request.headers.get('oai-authenticated-user-id');
      return api(request, {
        actor: id ? { id } : null,
        service: communityService({ repo: repository(env.DB), blobs: env.BUCKET }),
        catalog,
        example,
      });
    }
    const assets = {
      '/': { body: landing, type: 'text/html' },
      '/landing.css': { body: landingCss, type: 'text/css' },
      '/landing.js': { body: landingJs, type: 'text/javascript' },
      '/community': { body: html, type: 'text/html' },
      '/community.css': { body: css, type: 'text/css' },
      '/community.js': { body: js, type: 'text/javascript' },
    };
    if (assets[url.pathname] && ['GET', 'HEAD'].includes(request.method)) {
      const asset = assets[url.pathname];
      return new Response(request.method === 'HEAD' ? null : asset.body, {
        headers: { ...securityHeaders, 'Content-Type': asset.type + '; charset=utf-8' },
      });
    }
    return protectLegacyResponse(await legacy.fetch(request, env, context));
  },
};
