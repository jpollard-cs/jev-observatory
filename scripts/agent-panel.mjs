// Application/CLI adapter: owns entropy, clock, corpus access and filesystem writes.
// Pure rules and tagged validation results live in agent-panel-domain.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ok, err } from '../harness/domain/result.mjs';
import { generateCases } from '../harness/corpus.mjs';
import { buildMessages } from '../harness/prompt.mjs';
import {
  PANEL_CONDITIONS,
  createPanelResult,
  validatePanelResult,
  importResponsesResult,
  panelErrorMessage,
} from '../harness/agent-panel-domain.mjs';

/** @template T @param {import('../harness/agent-panel-domain.mjs').Result<T>} result @returns {T} */
function unwrap(result) {
  if (result.tag === 'ok') return result.value;
  const error = new Error(adapterErrorMessage(result.error));
  error.code = result.error.code;
  throw error;
}
const ADAPTER_MESSAGES = {
  output_exists: 'Output exists; choose a new filename instead of overwriting control evidence',
  panel_output_exists:
    'Panel destination already exists; reuse the frozen packet or select a new directory',
  missing_output: '--out is required',
  unknown_command: 'Command must be export or import',
  file_or_serialization_error: 'File or JSON operation failed',
};
function adapterErrorMessage(error) {
  if (error.code === 'missing_argument') return `--${error.context.argument} is required`;
  return ADAPTER_MESSAGES[error.code] ?? panelErrorMessage(error);
}
function failure(code, context = {}) {
  return err(code, { context });
}
function preparedFixtures() {
  const c = PANEL_CONDITIONS;
  const options = {
    seedsPerFamily: 4,
    contextChars: [c.contextChars],
    positions: [c.position],
    policyProfiles: [c.policyProfile],
    outputModes: [c.outputMode],
    promptArms: [c.promptArm],
  };
  const fixtures = [...generateCases(options)]
    .filter((caseItem) => caseItem.task === 'judge')
    .map((caseItem) => ({
      caseItem,
      id: crypto.randomBytes(12).toString('hex'),
      messages: buildMessages(caseItem),
    }));
  for (let i = fixtures.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [fixtures[i], fixtures[j]] = [fixtures[j], fixtures[i]];
  }
  return fixtures;
}
// Compatibility facade retains the existing throwing API used by tests and special-pilot.
export function createPanel({ now = new Date().toISOString() } = {}) {
  return unwrap(createPanelResult({ fixtures: preparedFixtures(), now }));
}
export function validatePanel(packet, manifest) {
  return unwrap(validatePanelResult(packet, manifest));
}
export function importResponses(input) {
  return unwrap(importResponsesResult({ ...input, now: input.now ?? new Date().toISOString() }));
}
function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}
function writeNewJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
function exportPacket(values) {
  const packetPath = path.join(values.out, 'packet.json'),
    manifestPath = path.join(values.out, 'private-manifest.json');
  if (fs.existsSync(packetPath) || fs.existsSync(manifestPath))
    return failure('panel_output_exists');
  const { packet, manifest } = createPanel();
  writeNewJson(packetPath, packet);
  writeNewJson(manifestPath, manifest);
  return ok({
    packet: packetPath,
    privateManifest: manifestPath,
    packetHash: packet.packetHash,
    records: packet.records.length,
    evidenceStage: packet.evidenceStage,
  });
}
function importPacket(values) {
  for (const key of ['packet', 'manifest', 'responses', 'model'])
    if (!values[key]) return failure('missing_argument', { argument: key });
  if (fs.existsSync(values.out)) return failure('output_exists');
  const result = importResponsesResult({
    packet: readJson(values.packet),
    manifest: readJson(values.manifest),
    submission: readJson(values.responses),
    model: values.model,
    agentId: values['agent-id'] ?? null,
    reasoningEffort: values['reasoning-effort'] ?? null,
    isolated: values.isolated,
    now: new Date().toISOString(),
  });
  if (result.tag === 'error') return result;
  writeNewJson(values.out, result.value);
  return ok({
    out: values.out,
    source: result.value.source,
    model: result.value.modelIdentity.configuredSelector,
    summary: result.value.summary,
    poolWithDirectApiRows: false,
  });
}
/** Translate filesystem/JSON exceptions at the application boundary. No file error becomes a model finding. */
export function runCommandResult(command, values) {
  if (typeof values.out !== 'string' || values.out.length === 0) return failure('missing_output');
  try {
    if (command === 'export') return exportPacket(values);
    if (command === 'import') return importPacket(values);
    return failure('unknown_command');
  } catch (error) {
    return err('file_or_serialization_error', {
      context: { causeCode: error.code ?? 'unknown_file_error' },
    });
  }
}
export function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const { values } = parseArgs({
    args,
    options: {
      out: { type: 'string' },
      packet: { type: 'string' },
      manifest: { type: 'string' },
      responses: { type: 'string' },
      model: { type: 'string' },
      'agent-id': { type: 'string' },
      'reasoning-effort': { type: 'string' },
      isolated: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help || !command || command === '--help') {
    console.log(
      'Export: node scripts/agent-panel.mjs export --out work/agent-panel\nImport: node scripts/agent-panel.mjs import --packet work/agent-panel/packet.json --manifest work/agent-panel/private-manifest.json --responses work/agent-panel/luna-responses.json --model gpt-5.6-luna --isolated --out work/agent-panel/luna-control.json\nNo model requests are made. Never send private-manifest.json to a judge.',
    );
    return;
  }
  console.log(JSON.stringify(unwrap(runCommandResult(command, values))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
