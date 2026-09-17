import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { design, selectCases, hash, corpusManifest } from '../harness/corpus.mjs';
import { infer, readEndpoint, reservationUsd, requestPayload } from '../harness/provider.mjs';
import { parseOutput } from '../harness/schema.mjs';
import { planEvaluation } from '../harness/domain/evaluation-plan.mjs';
import { evaluate } from '../harness/application/evaluate.mjs';
import { unwrap } from '../harness/domain/result.mjs';

const HELP = `Offline: node scripts/run.mjs
Live: node scripts/run.mjs --live --models jev --limit 12 --max-requests 12 --max-cost-usd 0.05
Splits: pilot, calibration, test. Limit counts paired cases; an odd final slot is unused.
No retries. Explicit pricing is required. Native request versions are recorded.`;

function readOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      live: { type: 'boolean', default: false },
      models: { type: 'string', default: 'jev,luna,terra' },
      split: { type: 'string', default: 'pilot' },
      limit: { type: 'string', default: '12' },
      repeats: { type: 'string', default: '1' },
      'max-requests': { type: 'string', default: '36' },
      'max-cost-usd': { type: 'string', default: '0.05' },
      out: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  return {
    ...values,
    models: values.models.split(','),
    limit: Number(values.limit),
    repeats: Number(values.repeats),
    maxRequests: Number(values['max-requests']),
    maxCostUsd: Number(values['max-cost-usd']),
  };
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  const protocol = corpusManifest();
  // Validate options before selecting cases; malformed limits cannot silently select a full grid.
  unwrap(planEvaluation(options, [], protocol));
  const cases = selectCases({ split: options.split, limit: options.limit });
  const plan = unwrap(planEvaluation(options, cases, protocol));
  if (!options.live) {
    console.log(
      JSON.stringify(
        {
          ...plan,
          status: 'plan_only',
          live: false,
          message: 'No model requests made. Add --live after provisioning endpoints and pricing.',
        },
        null,
        2,
      ),
    );
    return;
  }

  // This composition root owns environment and filesystem access.
  if (fs.existsSync('.env')) process.loadEnvFile('.env');
  const endpoints = options.models.map((model) => readEndpoint(model));
  const runId =
    new Date().toISOString().replaceAll(':', '-') + '-' + hash(JSON.stringify(plan)).slice(0, 8);
  const directory = options.out ?? path.join('runs', runId);
  if (fs.existsSync(directory))
    throw new Error('Run directory already exists; choose a new --out.');
  const result = await evaluate(
    { plan, cases, endpoints, design, runId, trustedContextHash: protocol.trustedContextHash },
    {
      prepareRequest: requestPayload,
      reserve: reservationUsd,
      infer,
      parseOutput,
      hash,
      byteLength: (text) => Buffer.byteLength(text, 'utf8'),
      now: () => new Date().toISOString(),
      startRun: (manifest) => {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        fs.writeFileSync(
          path.join(directory, 'manifest.json'),
          JSON.stringify(manifest, null, 2) + '\n',
          { flag: 'wx', mode: 0o600 },
        );
      },
      record: (row) =>
        fs.appendFileSync(path.join(directory, 'raw.jsonl'), JSON.stringify(row) + '\n', {
          mode: 0o600,
        }),
      progress: (event) => console.log(JSON.stringify(event)),
    },
  );
  const completed = unwrap(result);
  console.log(
    `Completed ${completed.attempted} requests. Private records: ${directory}/raw.jsonl.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify({ status: 'error', code: error.message, details: error.details ?? null }),
  );
  process.exitCode = 1;
}
