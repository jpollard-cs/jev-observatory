/** Canonical local entry point. Starting, inspecting and testing never load credentials. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workbench = path.join(repository, 'workbench');

export async function inspectResearchAccount() {
  const { openAccount } = await import('../workbench/src/runner.mjs');
  const { readLedgerEvents, unwrap } = await import('../workbench/vendor/admission-v1/io.mjs');
  const account = await openAccount({ project: repository });
  const events = readLedgerEvents(account.ledgerDir);
  const ledger = unwrap(account.api.replayRichLedger(events));
  return {
    kind: account.kind,
    directory: repository,
    events: events.length,
    maximumUsd: account.maxNano / 1e9,
    knownUsageUsd: ledger.knownNanoUsd / 1e9,
    heldUsd: ledger.heldNanoUsd / 1e9,
    remainingLocalAllowanceUsd: (account.maxNano - ledger.knownNanoUsd - ledger.heldNanoUsd) / 1e9,
    historyComplete: ledger.knownNanoUsd >= account.minimumPriorNano,
    haltedReason: ledger.haltedReason,
    providerBalanceChecked: false,
    credentialsRead: false,
    providerCalls: 0,
  };
}

function execute(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: workbench, stdio: 'inherit' });
    const stop = () => child.kill('SIGINT');
    process.on('SIGINT', stop);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', stop);
      process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
      resolve();
    });
  });
}

export async function main(argv = process.argv.slice(2)) {
  const action = argv[0] ?? 'start';
  const { values } = parseArgs({
    args: argv.slice(1),
    options: { port: { type: 'string', default: '8794' }, help: { type: 'boolean' } },
  });
  if (action === 'help' || values.help) {
    console.log(
      'node scripts/workbench.mjs start [--port 8794]\n' +
        'node scripts/workbench.mjs verify\n' +
        'node scripts/workbench.mjs test\n' +
        'node scripts/workbench.mjs account\n' +
        'Local authoring and offline checks. Paid runs retain their separate exact-plan approval.',
    );
    return;
  }
  if (action === 'account') {
    console.log(JSON.stringify(await inspectResearchAccount(), null, 2));
    return;
  }
  if (action === 'verify') return execute(['scripts/verify.mjs']);
  if (action === 'test') {
    const files = fs
      .readdirSync(path.join(workbench, 'tests'))
      .filter((name) => name.endsWith('.test.mjs'))
      .sort()
      .map((name) => `tests/${name}`);
    return execute([
      '--test',
      ...files,
      'vendor/admission-v1/vendor/compiler/tests/compiler.test.mjs',
    ]);
  }
  if (action !== 'start') throw new Error('Unknown workbench command. Use help.');
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Use a port from 1024 to 65535.');
  return execute(['server.mjs', '--port', String(port)]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
