const canonicalOrigin = 'https://redteam-observatory.wizard.chatgpt.site';
const retiredOrigin = 'https://jev-redteam-observatory.wizard.chatgpt.site';

// Retire public pages only. Never forward credentials, request bodies or private API routes.
export function publicRedirect(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  const url = new URL(request.url);
  const archive =
    url.pathname === '/observatory' ||
    /^\/_data\/(charts|components)\//.test(url.pathname) ||
    (url.pathname === '/' && url.searchParams.has('tab'));
  if (archive) return canonicalOrigin + '/workspace#overview';
  if (url.origin !== retiredOrigin) return null;
  if (['/', '/workspace', '/workspace/', '/community', '/community/'].includes(url.pathname))
    return canonicalOrigin + url.pathname.replace(/\/$/, '');
  return null;
}
