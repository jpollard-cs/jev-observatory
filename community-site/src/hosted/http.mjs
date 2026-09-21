import { json, readBody } from '../http.mjs';
import { sameOriginWrite } from '../security.mjs';
const respond = (r) =>
  r.tag === 'ok'
    ? json(r.value)
    : json({ error: r.error.code, message: r.error.message }, r.error.status);
export async function executionApi(
  request,
  { service, actor, admitWrite = async () => true, keepAlive = () => {} },
) {
  const url = new URL(request.url),
    route = url.pathname.slice('/api/execution/'.length),
    owner = actor?.id;
  try {
    if (request.method === 'GET' && route === 'session')
      return respond(await service.session(owner));
    if (!owner)
      return json(
        {
          error: 'sign_in_required',
          message:
            'Sign in with ChatGPT to use persistent hosted execution. Browsing and offline planning remain available without an account.',
        },
        401,
      );
    if (!['GET', 'POST'].includes(request.method))
      return json({ error: 'method_not_allowed' }, 405);
    let body;
    if (request.method === 'POST') {
      if (!sameOriginWrite(request) || request.headers.get('x-observatory-intent') !== 'write')
        return json({ error: 'invalid_origin' }, 403);
      if (['prepare', 'account'].includes(route) && !(await admitWrite(route, owner)))
        return json(
          {
            error: 'rate_limited',
            message:
              'New requests are temporarily limited. Wait a minute before trying again; no model call was sent.',
          },
          429,
        );
      const parsed = await readBody(request);
      if (parsed.tag === 'error') return respond(parsed);
      body = parsed.value;
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return json({ error: 'invalid_body', message: 'Expected a JSON object.' }, 400);
    }
    if (route === 'account' && body) return respond(await service.initialize(owner, body));
    if (route === 'prepare' && body) return respond(await service.prepare(owner, body));
    if (route === 'runs/cancel' && body) {
      const pending = service.cancelRuns(owner, body);
      keepAlive(pending.catch(() => {}));
      return respond(await pending);
    }
    const match = route.match(
      /^runs\/([a-f0-9-]{36})(?:\/(start|resume|step|stop|recover|request|evidence))?$/,
    );
    if (!match) return json({ error: 'not_found' }, 404);
    const [, id, action] = match;
    if (request.method === 'GET' && !action)
      return respond(await service.detail(owner, id, url.searchParams.get('report') === '1'));
    if (request.method === 'GET' && action === 'request')
      return respond(await service.request(owner, id, Number(url.searchParams.get('index'))));
    if (request.method === 'GET' && action === 'evidence')
      return respond(await service.contribution(owner, id));
    if (body && ['start', 'resume', 'step', 'stop', 'recover'].includes(action)) {
      const pending = service[action](owner, id, body);
      if (action === 'step') keepAlive(pending.catch(() => {}));
      return respond(await pending);
    }
    return json({ error: 'method_not_allowed' }, 405);
  } catch {
    // Neither provider bodies nor credentials appear in errors or application logs.
    if (route === 'prepare')
      return json(
        {
          error: 'preparation_unavailable',
          message:
            'The request could not be prepared. No model call was sent. Your draft is unchanged; dismiss this panel and try preparing again once the service is available.',
        },
        503,
      );
    return json(
      {
        error: 'execution_unavailable',
        message:
          'Execution could not be confirmed. No request was automatically retried. Refresh the saved run before taking another action; an unresolved dispatch keeps its spending hold.',
      },
      503,
    );
  }
}
