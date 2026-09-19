import legacy from '../legacy/observatory-worker.mjs';
import { repository } from './adapters/d1.mjs';
import { communityService } from './service.mjs';
import { api, securityHeaders } from './http.mjs';
import html from '../public/index.html';
import css from '../public/app.css';
import js from '../public/app.js';
import catalog from '../catalog/generated.json';
import example from '../catalog/example.json';
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === '/observatory' || (url.pathname === '/' && url.searchParams.has('tab'))) {
      url.pathname = '/';
      return legacy.fetch(new Request(url, request), env, context);
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
      '/': { body: html, type: 'text/html' },
      '/community.css': { body: css, type: 'text/css' },
      '/community.js': { body: js, type: 'text/javascript' },
    };
    if (assets[url.pathname] && ['GET', 'HEAD'].includes(request.method)) {
      const asset = assets[url.pathname];
      return new Response(request.method === 'HEAD' ? null : asset.body, {
        headers: { ...securityHeaders, 'Content-Type': asset.type + '; charset=utf-8' },
      });
    }
    return legacy.fetch(request, env, context);
  },
};
