// The imported full-release manifest is historical: UI/compiler integration may
// evolve. Verify its preserved evidence, vendor code and provenance separately.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'provenance/imported-0.5-file-manifest.json'), 'utf8'),
);
let checked = 0;
for (const [name, expected] of Object.entries(manifest.files)) {
  if (!/^(data|vendor|provenance)\//.test(name)) continue;
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep)) throw Error('Invalid manifest path');
  if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected)
    throw Error('Changed preserved source: ' + name);
  checked++;
}
console.log(
  JSON.stringify(
    {
      status: 'verified',
      filesChecked: checked,
      scope:
        'Preserved imported evidence, vendor code and provenance; current application behavior is covered by tests.',
      liveCalls: 0,
    },
    null,
    2,
  ),
);
