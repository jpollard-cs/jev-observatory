import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { selectCases, design } from '../harness/corpus.mjs';
import { readEndpoint, reservationUsd, requestPayload } from '../harness/provider.mjs';
import { buildMessages } from '../harness/prompt.mjs';
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const { values } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    models: { type: 'string', default: 'jev,luna,terra' },
    split: { type: 'string', default: 'pilot' },
    limit: { type: 'string', default: '12' },
    'max-requests': { type: 'string', default: '36' },
    'max-cost-usd': { type: 'string', default: '5' },
  },
});
const models = values.models.split(','),
  limit = Number(values.limit),
  maxRequests = Number(values['max-requests']),
  maxCost = Number(values['max-cost-usd']);
if (
  models.some((m) => !['jev', 'luna', 'terra'].includes(m)) ||
  new Set(models).size !== models.length ||
  !['pilot', 'calibration', 'test'].includes(values.split) ||
  !Number.isInteger(limit) ||
  limit < 2 ||
  !Number.isInteger(maxRequests) ||
  maxRequests < 1 ||
  !Number.isFinite(maxCost) ||
  maxCost <= 0
)
  throw new Error('Invalid models, split, limit or caps');
const cases = selectCases({ split: values.split, limit });
if (cases.length * models.length > maxRequests)
  throw new Error('Request cap smaller than planned provider calls');
fs.mkdirSync('.promptfoo', { recursive: true });
const config = {
  description: 'Model-only Jev classifier evaluation; independent gold, no detector rules',
  prompts: ['{{case.id}}'],
  providers: models.map((alias) => ({
    id: `file://${path.resolve('harness/promptfoo-provider.mjs')}`,
    label: alias,
    config: { alias },
  })),
  tests: cases.map((c) => ({
    description: `${c.id} ${c.family}`,
    vars: { case: c },
    assert: [
      { type: 'javascript', value: `file://${path.resolve('harness/promptfoo-assertion.mjs')}` },
    ],
  })),
  evaluateOptions: { maxConcurrency: 1, cache: false },
};
fs.writeFileSync('.promptfoo/eval.json', JSON.stringify(config, null, 2) + '\n');
if (!values.live) {
  console.log(
    `Prepared .promptfoo/eval.json for ${cases.length * models.length} calls. No model or promptfoo cloud requests made.`,
  );
  process.exit(0);
}
const endpoints = models.map((m) => readEndpoint(m));
const total = cases.reduce(
  (s, c) =>
    s +
    endpoints.reduce(
      (t, e) =>
        t + reservationUsd(e, requestPayload(e, c, design.maxOutputTokens), design.maxOutputTokens),
      0,
    ),
  0,
);
if (total > maxCost) throw new Error('Cost reservation exceeds configured cap');
const runId = 'promptfoo-' + new Date().toISOString().split(':').join('-');
fs.mkdirSync(`runs/${runId}`, { recursive: true });
const pkg = JSON.parse(fs.readFileSync('node_modules/promptfoo/package.json'));
const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.promptfoo;
const result = spawnSync(
  process.execPath,
  [
    path.resolve('node_modules/promptfoo', bin),
    'eval',
    '-c',
    '.promptfoo/eval.json',
    '--no-cache',
    '--max-concurrency',
    '1',
    '--output',
    `runs/${runId}/promptfoo-results.json`,
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PROMPTFOO_CONFIG_DIR: path.resolve('.promptfoo/local'),
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: '1',
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'true',
      JEV_BENCHMARK_LIVE: '1',
      JEV_BENCHMARK_MAX_REQUESTS: String(maxRequests),
      JEV_BENCHMARK_MAX_COST_USD: String(maxCost),
      JEV_BENCHMARK_RUN_ID: runId,
      JEV_BENCHMARK_RAW_PATH: path.resolve(`runs/${runId}/raw.jsonl`),
    },
  },
);
process.exitCode = result.status ?? 1;
