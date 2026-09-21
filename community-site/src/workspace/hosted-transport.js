// A missing network response is uncertainty, never permission to retry a paid call.
export async function hostedRemote(path, data, { fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetchImpl('/api/execution/' + path, {
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json', 'x-observatory-intent': 'write' } : {},
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    if (!r.headers.get('content-type')?.includes('application/json'))
      throw Error(
        'The server returned an unexpected page, possibly because sign-in expired. Your draft is still here. Refresh saved status before retrying an approved request.',
      );
    const v = await r.json();
    if (!r.ok)
      throw Object.assign(Error(v.message ?? 'Hosted execution could not be confirmed'), {
        code: v.error,
        status: r.status,
      });
    return v;
  } catch (e) {
    if (controller.signal.aborted)
      throw Error(
        'The server did not respond in time. Refresh saved status to check what completed. Nothing is automatically retried.',
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
