// Keep disclosure state across page redraws without persisting form contents.
// Summary ancestry distinguishes nested sections; an explicit ID wins when present.
function key(details) {
  if (details.id) return details.id;
  const parts = [];
  for (let node = details; node; node = node.parentElement?.closest('details'))
    parts.unshift(node.querySelector(':scope > summary')?.textContent.trim() ?? '');
  return parts.join(' / ');
}
export function rememberDisclosures(root) {
  const snapshot = new Map(
    [...(root?.querySelectorAll('details') ?? [])].map((d) => [key(d), d.open]),
  );
  const active = root?.ownerDocument.activeElement;
  if (root?.contains(active) && active.matches('input[type=checkbox]'))
    snapshot.focus = [...active.attributes]
      .filter((a) => a.name.startsWith('data-') || ['id', 'name', 'value', 'type'].includes(a.name))
      .map((a) => [a.name, a.value]);
  return snapshot;
}
export function restoreDisclosures(root, snapshot) {
  if (!snapshot) return;
  for (const d of root.querySelectorAll('details'))
    if (snapshot.has(key(d))) d.open = snapshot.get(key(d));
  if (snapshot.focus) {
    const matches = [...root.querySelectorAll('input[type=checkbox]')].filter((n) =>
      snapshot.focus.every(([k, v]) => n.getAttribute(k) === v),
    );
    if (matches.length === 1) matches[0].focus({ preventScroll: true });
  }
}
