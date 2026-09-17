import fs from 'node:fs';
import { corpusManifest, generateCases } from '../harness/corpus.mjs';
fs.mkdirSync('data', { recursive: true });
const manifest = corpusManifest();
fs.writeFileSync('data/corpus-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
if (process.argv.includes('--write-cases')) {
  fs.mkdirSync('cases/generated', { recursive: true });
  const stream = fs.createWriteStream('cases/generated/corpus.jsonl');
  for (const item of generateCases()) {
    if (!stream.write(JSON.stringify(item) + '\n'))
      await new Promise((resolve) => stream.once('drain', resolve));
  }
  stream.end();
}
console.log(
  JSON.stringify(
    {
      cases: manifest.cases,
      families: manifest.families.length,
      splits: manifest.splits,
      manifest: 'data/corpus-manifest.json',
    },
    null,
    2,
  ),
);
