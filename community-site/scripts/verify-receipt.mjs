#!/usr/bin/env node
// Run from a trusted checkout. Never use a contributor's verifier or trust file.
import fs from 'node:fs/promises';
import { verifySignedBundle } from '../src/receipts/verify.mjs';
import trust from '../trust/receipt-keys.json' with { type: 'json' };
import core from '../trust/admission-core-v2.json' with { type: 'json' };
const [file, ...args] = process.argv.slice(2);
const constraints = {};
try {
  if (!file || file.startsWith('--'))
    throw Error(
      'Usage: node community-site/scripts/verify-receipt.mjs BUNDLE.json [--require-core] [--policy-hash SHA256] [--evaluator-revision SHA] [--run-id UUID] [--max-age-hours N]',
    );
  const names = {
    '--policy-hash': 'policyHash',
    '--evaluator-revision': 'evaluatorRevision',
    '--run-id': 'runId',
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--require-core') constraints.requireCore = true;
    else if (names[args[i]] && args[i + 1] && !args[i + 1].startsWith('--'))
      constraints[names[args[i]]] = args[++i];
    else if (
      args[i] === '--max-age-hours' &&
      Number(args[i + 1]) > 0 &&
      Number.isFinite(Number(args[i + 1]))
    )
      constraints.maxAgeMs = Number(args[++i]) * 3600000;
    else throw Error('Unknown or incomplete verification constraint: ' + args[i]);
  }
  if ((await fs.stat(file)).size > 4 * 1024 * 1024) throw Error('Bundle exceeds 4 MiB');
  const result = await verifySignedBundle(
    JSON.parse(await fs.readFile(file, 'utf8')),
    trust,
    core,
    constraints,
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.tag !== 'ok') process.exitCode = 1;
} catch (cause) {
  console.error(
    JSON.stringify({
      tag: 'error',
      error: { code: 'verification_failed', message: cause.message },
    }),
  );
  process.exitCode = 1;
}
