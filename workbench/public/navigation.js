const pages = new Set([
  'start',
  'policy',
  'planner',
  'review',
  'evidence',
  'overview',
  'original',
  'context',
  'selection',
  'connection',
  'provenance',
]);
export const pageFromHash = (hash) => (pages.has(hash.slice(1)) ? hash.slice(1) : null);
export function rememberWorkspacePage(page) {
  if (pages.has(page) && location.hash !== '#' + page)
    history.replaceState(null, '', location.pathname + location.search + '#' + page);
}
