import { MAX_BYTES, error, validId } from './domain/contracts.mjs';
import { dataHeaders, sameOriginWrite } from './security.mjs';
export { securityHeaders } from './security.mjs';
export function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...dataHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
const respond = (result) =>
  result.tag === 'ok'
    ? json(result.value)
    : json({ error: result.error.code, message: result.error.message }, result.error.status);
export async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return error('content_type', 'Send a JSON request.', 415);
  const reader = request.body?.getReader();
  if (!reader) return error('invalid_json', 'A JSON body is required.');
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES + 2048) {
      await reader.cancel();
      return error('body_too_large', 'The maximum upload size is 4 MiB.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return { tag: 'ok', value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return error('invalid_json', 'The upload is not valid JSON.');
  }
}
export async function api(request, { service, actor, catalog, example }) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  try {
    if (method === 'GET' && path === '/api/community/session')
      return json({ signedIn: Boolean(actor) });
    if (method === 'GET' && path === '/api/community/catalog') return json(catalog);
    if (method === 'GET' && path === '/api/community/example') return json(example);
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method))
      return json({ error: 'method_not_allowed' }, 405);
    if (method !== 'GET') {
      if (!actor)
        return respond(error('sign_in_required', 'Sign in to manage contributions.', 401));
      if (!sameOriginWrite(request) || request.headers.get('x-observatory-intent') !== 'write')
        return respond(error('invalid_origin', 'Use the contribution form on this site.', 403));
    }
    if (path === '/api/community/results' && method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
        return respond(error('invalid_page', 'Choose a valid page.'));
      return respond(await service.list(actor, url.searchParams.get('mine') === '1', offset));
    }
    if (path === '/api/community/results' && method === 'POST') {
      const body = await readBody(request);
      return respond(body.tag === 'error' ? body : await service.upload(body.value, actor));
    }
    const match = path.match(/^\/api\/community\/results\/([^/]+)(\/download)?$/);
    if (!match || !validId(match[1])) return json({ error: 'not_found' }, 404);
    const id = match[1];
    if (method === 'GET' && match[2]) {
      const result = await service.download(id, actor);
      if (result.tag === 'error') return respond(result);
      return new Response(result.value.body, {
        headers: {
          ...dataHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${result.value.filename}"`,
        },
      });
    }
    if (match[2]) return json({ error: 'method_not_allowed' }, 405);
    if (method === 'GET') return respond(await service.get(id, actor));
    if (method === 'PATCH') {
      const body = await readBody(request);
      return respond(
        body.tag === 'error' ? body : await service.setVisibility(id, body.value, actor),
      );
    }
    if (method === 'DELETE') return respond(await service.remove(id, actor));
    return json({ error: 'method_not_allowed' }, 405);
  } catch {
    return json(
      {
        error: 'service_unavailable',
        message:
          'The contribution service is temporarily unavailable. Your uploaded file has not been marked as verified.',
      },
      503,
    );
  }
}
