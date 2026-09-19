import { sha256 } from './domain/contracts.mjs';
import provenance from '../legacy/provenance.json' with { type: 'json' };

const framing = "frame-ancestors 'self' https://chatgpt.com https://chat.openai.com";
export const commonHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=(), clipboard-read=()',
};
export const securityHeaders = {
  ...commonHeaders,
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "worker-src 'none'",
    framing,
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; '),
};
export const workspaceHeaders = {
  ...securityHeaders,
  'Content-Security-Policy': securityHeaders['Content-Security-Policy']
    .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
    .replace("worker-src 'none'", "worker-src 'self'")
    .replace("trusted-types 'none'", 'trusted-types dompurify workspace-worker'),
};
export const dataHeaders = {
  ...commonHeaders,
  'Content-Security-Policy':
    "default-src 'none'; sandbox; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
export function sameOriginWrite(request) {
  const site = request.headers.get('sec-fetch-site');
  return (
    request.headers.get('origin') === new URL(request.url).origin &&
    (!site || site === 'same-origin' || site === 'none')
  );
}
export function applyHeaders(response, additions) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(additions)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
// The complete legacy document is a pinned, reviewed build. Never grant script
// nonces to arbitrary uploaded HTML. A changed R2 document fails closed.
export async function protectLegacyResponse(
  response,
  reviewedHtmlHash = provenance.deploymentAssets.html.sha256,
) {
  if (!response.headers.get('content-type')?.startsWith('text/html'))
    return applyHeaders(response, dataHeaders);
  if (!response.body) return applyHeaders(response, dataHeaders);
  const html = await response.text();
  if ((await sha256(html)) !== reviewedHtmlHash)
    return new Response('The research page failed its build-integrity check.', {
      status: 503,
      headers: { ...dataHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
  // This is a transformation of the hash-verified artifact, not an HTML sanitizer.
  const protectedHtml = html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(commonHeaders)) headers.set(name, value);
  headers.delete('content-length');
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      "script-src-attr 'none'",
      // The preserved chart/editor runtime uses generated inline styles, but never inline event handlers.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      framing,
    ].join('; '),
  );
  return new Response(protectedHtml, { status: response.status, headers });
}
