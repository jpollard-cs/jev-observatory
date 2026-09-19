import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  generateCases,
  prospectiveProfiles as profiles,
  trustedContext,
} from '../harness/corpus.mjs';
import { buildTypeSafeRequest } from '../harness/typesafe.mjs';
import { extensionFixtures } from '../cases/extension-fixtures.mjs';
import {
  buildRepresentationDiagnostics,
  representationHash,
} from '../harness/domain/representation-diagnostic.mjs';
import { unwrap } from '../harness/domain/result.mjs';

/** Offline only. The output is the private diagnostic array consumed by campaign --diagnostics-file. */
export function writeRepresentationPlan(output = 'work/representation-plan.json') {
  const manifestPath = output.replace(/\.json$/, '') + '.manifest.json';
  if (fs.existsSync(output) || fs.existsSync(manifestPath))
    throw new Error('Refusing to overwrite an existing representation plan or manifest');
  if (Object.values(profiles).some((profile) => profile.version !== '1.1'))
    throw new Error('Representation freeze requires reviewed prospective profiles version 1.1');
  const debugging = JSON.parse(
    fs.readFileSync(new URL('../policies/debugging-boundary-cases.json', import.meta.url), 'utf8'),
  );
  const plan = unwrap(
    buildRepresentationDiagnostics({
      cases: [
        ...generateCases({
          seedsPerFamily: 1,
          contextChars: [512],
          positions: ['start'],
          outputModes: ['structured'],
          promptArms: ['policy'],
        }),
      ],
      mainRequestBuilder: (caseItem, model) =>
        buildTypeSafeRequest(caseItem, model, { version: 'policy-v4', profiles, trustedContext }),
      integrityFixture: extensionFixtures().find(
        (fixture) => fixture.id === 'extension-dispatch-hours-changed',
      ),
      debuggingFixture: debugging.find((fixture) => fixture.id === 'debug-expiry-b'),
    }),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const { diagnostics, ...manifest } = plan;
  const serialized = JSON.stringify(diagnostics, null, 2) + '\n';
  fs.writeFileSync(output, serialized, { flag: 'wx', mode: 0o600 });
  const value = {
    ...manifest,
    createdAt: new Date().toISOString(),
    diagnosticArraySha256: representationHash(serialized),
    profilesHash: representationHash(profiles),
    trustedContextHash: representationHash(trustedContext),
    totalQuestions: diagnostics.reduce(
      (count, diagnostic) => count + Object.keys(diagnostic.request.questions).length,
      0,
    ),
    totalRequestBytes: diagnostics.reduce(
      (count, diagnostic) => count + Buffer.byteLength(JSON.stringify(diagnostic.request)),
      0,
    ),
    sourceProfileVersions: Object.fromEntries(
      Object.entries(profiles).map(([id, profile]) => [id, profile.version]),
    ),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  return {
    output: path.resolve(output),
    manifestPath: path.resolve(manifestPath),
    planned: diagnostics.length,
    diagnosticArraySha256: value.diagnosticArraySha256,
    totalQuestions: value.totalQuestions,
    totalRequestBytes: value.totalRequestBytes,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { output: { type: 'string', default: 'work/representation-plan.json' } },
  });
  console.log(JSON.stringify(writeRepresentationPlan(values.output), null, 2));
}
