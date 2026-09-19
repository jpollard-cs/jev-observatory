import { Buffer } from 'buffer';
import sources from 'workspace:files';
const files = new Map(Object.entries(sources));
const name = (value) => (value instanceof URL ? decodeURIComponent(value.pathname) : String(value));
export function registerFile(path, contents) {
  files.set(path, contents);
}
export function readFileSync(path, encoding) {
  const key = name(path);
  if (!files.has(key)) {
    const error = Error('Packaged workspace file unavailable: ' + key);
    error.code = 'ENOENT';
    throw error;
  }
  const bytes = Buffer.from(files.get(key));
  return encoding ? bytes.toString(encoding) : bytes;
}
export function existsSync(path) {
  const key = name(path);
  return files.has(key) || [...files.keys()].some((x) => x.startsWith(key + '/'));
}
export function readdirSync(path, options = {}) {
  const base = name(path) + '/',
    entries = new Map();
  for (const file of files.keys())
    if (file.startsWith(base)) {
      const parts = file.slice(base.length).split('/');
      entries.set(parts[0], parts.length > 1);
    }
  return [...entries]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, directory]) =>
      options.withFileTypes
        ? { name, isDirectory: () => directory, isFile: () => !directory }
        : name,
    );
}
export default { readFileSync, existsSync, readdirSync };
