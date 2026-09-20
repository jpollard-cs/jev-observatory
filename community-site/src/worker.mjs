import { publicRedirect } from './public-routing.mjs';
import { executionApi } from './hosted/http.mjs';
import { executionService } from './hosted/service.mjs';
import { executionRepository } from './hosted/repository.mjs';
import { jevExecutionAdapter } from './hosted/jev-adapter.mjs';
import landing from '../public/landing.html';
import landingCss from '../public/landing.css';
import landingJs from '../public/landing.js';
import workspaceAssets from 'workspace:assets';
import legacy from '../legacy/observatory-worker.mjs';
import { repository } from './adapters/d1.mjs';
import { writeLimits } from './adapters/write-limits.mjs';
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
import trust from '../trust/receipt-keys.json';
import receiptCore from '../trust/admission-core-v1.json';
import release from 'workspace:release';
import { receiptAuthority } from './receipts/crypto.mjs';
export function createWorker({
  receiptTrust = trust,
  receiptsFor = (env) =>
    receiptAuthority(env.OBSERVATORY_RECEIPT_SIGNING_KEY, receiptTrust, release.commit),
} = {}) {
  return {
    async fetch(request, env, context) {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/.well-known/observatory-receipt-keys.json')
        return json(receiptTrust);
      if (
        request.method === 'GET' &&
        url.pathname === '/.well-known/observatory-admission-core.json'
      )
        return json(receiptCore);
      const receipts = receiptsFor(env);
      if (
        request.method === 'GET' &&
        url.pathname === '/.well-known/observatory-receipt-status.json'
      ) {
        try {
          const status = { protocol: 'observatory-signing-status/1', status: 'ready' };
          return json({ ...status, receipt: await receipts.sign('service-status', status) });
        } catch {
          return json({ error: 'receipt_signing_unavailable' }, 503);
        }
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOriginWrite(request))
        return json(
          { error: 'invalid_origin', message: 'Cross-site writes are not allowed.' },
          403,
        );
      const redirect = publicRedirect(request);
      if (redirect)
        return new Response(null, {
          status: 302,
          headers: { ...securityHeaders, Location: redirect, 'Cache-Control': 'no-store' },
        });
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
          admitWrite: writeLimits(env.DB),
          service: executionService({
            repo: executionRepository(env.DB),
            blobs: env.BUCKET,
            adapter: jevExecutionAdapter,
            receipts,
          }),
        });
      }
      if (url.pathname.startsWith('/api/community/')) {
        const id = request.headers.get('oai-authenticated-user-id');
        return api(request, {
          actor: id ? { id } : null,
          admitWrite: writeLimits(env.DB),
          service: communityService({
            repo: repository(env.DB),
            blobs: env.BUCKET,
            trust: receiptTrust,
            evidence: executionService({
              repo: executionRepository(env.DB),
              blobs: env.BUCKET,
              adapter: jevExecutionAdapter,
              receipts,
            }),
          }),
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
      // The preserved research runtime never receives signing authority.
      const { OBSERVATORY_RECEIPT_SIGNING_KEY, ...legacyEnv } = env;
      return protectLegacyResponse(await legacy.fetch(request, legacyEnv, context));
    },
  };
}
export default createWorker();
