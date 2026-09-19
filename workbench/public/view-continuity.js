// Page refreshes are not navigation. Preserve the control and viewport the user is using.
const identity = (node) =>
  [...node.attributes]
    .filter(
      ({ name }) =>
        name === 'id' || name.startsWith('data-') || ['name', 'type', 'value'].includes(name),
    )
    .map(({ name, value }) => [name, value]);
const find = (root, record) => {
  if (!record) return null;
  const matches = [...root.querySelectorAll(record.tag)].filter((node) =>
    record.attributes.every(([key, value]) => node.getAttribute(key) === value),
  );
  return matches.length === 1 ? matches[0] : null;
};
const record = (node) => node && { tag: node.tagName, attributes: identity(node) };
export function preserveView(root) {
  const active = root?.contains(document.activeElement) ? document.activeElement : null;
  const anchor = [
    ...(root?.querySelectorAll('input, textarea, select, [data-action], [id]') ?? []),
  ].find((node) => {
    const box = node.getBoundingClientRect();
    return box.height && box.top >= 90 && box.top < innerHeight;
  });
  const focus = record(active),
    position = record(anchor),
    top = anchor?.getBoundingClientRect().top;
  const x = scrollX,
    y = scrollY;
  const selection =
    active && typeof active.selectionStart === 'number'
      ? [active.selectionStart, active.selectionEnd]
      : null;
  return () => {
    const replacement = find(root, focus);
    replacement?.focus({ preventScroll: true });
    if (selection && replacement?.setSelectionRange) replacement.setSelectionRange(...selection);
    const next = find(root, position);
    window.scrollTo({
      left: x,
      top: next ? scrollY + next.getBoundingClientRect().top - top : y,
      behavior: 'instant',
    });
  };
}
