import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unwrap } from '../harness/domain/result.mjs';
import { qwenHash } from '../harness/domain/qwen-baseline.mjs';
import {
  summarizeEncodingDiagnostic,
  summarizeQwenBaseline,
} from '../harness/domain/followup-reports.mjs';
import { replayRichLedger } from '../harness/application/rich-pilot-run.mjs';
import { richPilotQueries } from '../harness/site-rich-pilot.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const loadPlan = (dir) => {
  const p = read(path.join(dir, 'manifest.json'));
  const { planHash, stageId, ...core } = p;
  if (qwenHash(core) !== planHash) throw Error('report_manifest_mismatch');
  return p;
};
const save = (name, report) => {
  const file = path.join(root, 'data', name);
  const temp = file + '.tmp';
  fs.writeFileSync(
    temp,
    JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2) + '\n',
  );
  fs.renameSync(temp, file);
  console.log(
    JSON.stringify({
      file: name,
      status: report.status,
      planned: report.planned,
      attempted: report.attempted,
      valid: report.valid,
      knownCostUsd: report.knownCostUsd,
    }),
  );
};
const eDir = path.join(root, 'runs/rich-encoding-diagnostic-v1');
if (fs.existsSync(path.join(eDir, 'manifest.json'))) {
  const plan = loadPlan(eDir),
    evidence = {};
  const ledger = unwrap(
    replayRichLedger(
      fs
        .readdirSync(path.join(root, 'runs/rich-restart-budget-v1'))
        .filter((n) => n.endsWith('.json'))
        .sort()
        .map((n) => read(path.join(root, 'runs/rich-restart-budget-v1', n))),
    ),
  );
  for (const row of plan.rows) {
    const dir = path.join(eDir, 'records', qwenHash(row.id));
    if (!fs.existsSync(path.join(dir, 'raw.jsonl'))) continue;
    const rawBody = fs.readFileSync(path.join(dir, 'response.json'), 'utf8');
    const settlement = ledger.reservations[`${plan.stageId}:${row.id}`]?.settlement;
    if (!settlement || settlement.rawHash !== qwenHash(rawBody))
      throw Error('diagnostic_ledger_raw_mismatch');
    evidence[row.id] = {
      requestBody: fs.readFileSync(path.join(eDir, 'requests', row.requestHash + '.json'), 'utf8'),
      raw: JSON.parse(rawBody),
      rowRecord: read(path.join(dir, 'raw.jsonl')),
    };
  }
  save('encoding-diagnostic-report.json', unwrap(summarizeEncodingDiagnostic({ plan, evidence })));
}
const qDir = path.join(root, 'runs/qwen-rich-baseline-v1');
if (fs.existsSync(path.join(qDir, 'manifest.json'))) {
  const plan = loadPlan(qDir),
    evidence = {};
  for (const row of plan.rows) {
    const dir = path.join(qDir, 'evaluation', qwenHash(row.id));
    if (!fs.existsSync(path.join(dir, 'record.json'))) continue;
    evidence[row.id] = {
      record: read(path.join(dir, 'record.json')),
      exchange: fs.existsSync(path.join(dir, 'exchange.json'))
        ? read(path.join(dir, 'exchange.json'))
        : null,
      requestBody: fs.readFileSync(path.join(qDir, 'requests', row.requestHash + '.json'), 'utf8'),
    };
  }
  const jevCompletedCases = richPilotQueries(
    read(path.join(root, 'data/rich-pilot-report.json')),
    read(path.join(root, 'data/rich-pilot-repair-report.json')),
  ).rich_completed_cases;
  save(
    'qwen-baseline-report.json',
    unwrap(summarizeQwenBaseline({ plan, evidence, jevCompletedCases })),
  );
}
