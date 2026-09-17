/** Composition root: read frozen requests, freeze a plan, call once per trial, retain every outcome. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { buildExpiryDiagnosticPlan } from '../harness/domain/expiry-diagnostic.mjs';
import {
  readExpiryObservation,
  summarizeExpiryDiagnostic,
} from '../harness/domain/expiry-diagnostic-report.mjs';
import { unwrap } from '../harness/domain/result.mjs';
import { readEndpoint, reservationUsd, inferTypeSafeRequest } from '../harness/provider.mjs';

const { values } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    out: { type: 'string', default: 'data/expiry-diagnostic-report.json' },
    'run-dir': { type: 'string', default: 'runs/expiry-diagnostic-v1' },
    'max-cost-usd': { type: 'string', default: '0.03' },
  },
});
const maxCost = Number(values['max-cost-usd']);
if (!Number.isFinite(maxCost) || maxCost <= 0 || maxCost > 0.03)
  throw new Error('Diagnostic cost cap must be positive and at most USD0.03');
const archived = fs
  .readFileSync('runs/special-native-v1/raw.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse);
const plan = unwrap(
  buildExpiryDiagnosticPlan({
    beforeRequest: archived.find((r) => r.id === 'debug-expiry-a').request,
    boundaryRequest: archived.find((r) => r.id === 'debug-expiry-b').request,
  }),
);
let endpoint = {
  model: 'jev-latest',
  transport: 'typesafe_systemone',
  inputPrice: 0.042,
  outputPrice: 0,
};
if (values.live) {
  if (fs.existsSync('.env')) process.loadEnvFile('.env');
  endpoint = readEndpoint('jev');
}
if (plan.trials.length !== 48 || plan.trials.some((t) => t.request.model !== endpoint.model))
  throw new Error('Frozen diagnostic request count/model mismatch');
const reserved = plan.trials.reduce((s, t) => s + reservationUsd(endpoint, t.request, 0), 0);
if (reserved > maxCost) throw new Error('Diagnostic reservation exceeds cap');
const metadata = {
  protocol: 'expiry-diagnostic-v1',
  requestCap: 48,
  costCapUsd: maxCost,
  costReservationUsd: reserved,
  pricing: { inputUsdPerMillion: endpoint.inputPrice, outputUsdPerMillion: endpoint.outputPrice },
};
if (!values.live) {
  console.log(
    JSON.stringify(
      {
        ...metadata,
        status: 'plan_only',
        planHash: plan.planHash,
        requests: 48,
        noInferenceMade: true,
      },
      null,
      2,
    ),
  );
} else {
  if (fs.existsSync(values.out) || fs.existsSync(values['run-dir']))
    throw new Error('Refusing to overwrite diagnostic evidence');
  fs.mkdirSync(values['run-dir'], { recursive: true, mode: 0o700 });
  const runId = path.basename(values['run-dir']);
  fs.writeFileSync(
    path.join(values['run-dir'], 'manifest.json'),
    JSON.stringify({ ...metadata, ...plan, frozenAt: new Date().toISOString() }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  const rows = [];
  let used = 0,
    stopped = null;
  for (const trial of plan.trials) {
    const reserve = reservationUsd(endpoint, trial.request, 0);
    if (used + reserve > maxCost) {
      stopped = 'budget_exhausted';
      break;
    }
    const start = new Date().toISOString();
    const response = await inferTypeSafeRequest({
      endpoint,
      request: trial.request,
      timeoutMs: 60000,
    });
    const observation =
      response.status === 'ok'
        ? readExpiryObservation(response.answers, trial.questionScope)
        : null;
    const row = {
      ...trial,
      kind: 'expiry_diagnostic',
      runId,
      model: 'jev',
      configuredModel: endpoint.model,
      transport: endpoint.transport,
      attempt: rows.length + 1,
      startedAt: start,
      ...response,
      observation,
    };
    fs.appendFileSync(path.join(values['run-dir'], 'raw.jsonl'), JSON.stringify(row) + '\n', {
      mode: 0o600,
    });
    rows.push(row);
    const measured = response.usage
      ? (response.usage.inputTokens * endpoint.inputPrice +
          response.usage.outputTokens * endpoint.outputPrice) /
        1e6
      : null;
    used += Math.max(reserve, measured ?? 0);
    console.log(
      JSON.stringify({
        attempt: rows.length,
        id: trial.id,
        status: response.status,
        decision: observation?.value?.decision,
        block: observation?.value?.probabilities?.block,
      }),
    );
    if (measured !== null && measured > reserve) {
      stopped = 'usage_exceeds_reservation';
      break;
    }
  }
  const report = unwrap(
    summarizeExpiryDiagnostic(plan, rows, {
      ...metadata,
      runId,
      generatedAt: new Date().toISOString(),
      stopped,
      rawSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(values['run-dir'], 'raw.jsonl')))
        .digest('hex'),
    }),
  );
  fs.mkdirSync(path.dirname(values.out), { recursive: true });
  fs.writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(
    JSON.stringify({
      status: report.status,
      attempted: report.attempted,
      valid: report.valid,
      usage: report.usage,
    }),
  );
}
