import fs from 'node:fs/promises';
import { canonical, sha256 } from '../src/domain/contracts.mjs';
export async function makeCatalog() {
  const profiles = JSON.parse(
    await fs.readFile(new URL('../catalog/profiles.json', import.meta.url), 'utf8'),
  );
  const components = JSON.parse(
    await fs.readFile(new URL('../catalog/components.json', import.meta.url), 'utf8'),
  );
  return {
    schemaVersion: 1,
    repository: 'https://github.com/jpollard-cs/jev-observatory',
    profiles: await Promise.all(
      profiles.map(async (p) => ({ ...p, hash: await sha256(canonical(p.document)) })),
    ),
    components,
  };
}
export function makeExample(catalog) {
  const p = catalog.profiles[0];
  return {
    format: 'jev-observatory-bundle',
    version: 1,
    title: 'Format example — not an evaluation',
    model: 'not-run',
    policy: { name: p.name, hash: p.hash, document: p.document },
    suite: {
      name: 'Example only',
      definition: {
        purpose: 'Illustrate portable evidence; replace with a reviewed frozen suite.',
        cases: [{ id: 'example-1', input: 'Ordinary task data', expected: 'benign' }],
      },
    },
    provenance: {
      sourceRevision: '0000000000000000000000000000000000000000',
      method:
        'Format example. No model call was made. Replace this revision with the evaluator commit.',
      settings: {},
    },
    observations: [{ id: 'example-1', status: 'not_run' }],
  };
}
