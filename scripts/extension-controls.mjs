// IO adapter. No environment credentials, network requests or model invocations.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { extensionFixtures } from '../cases/extension-fixtures.mjs';
import { buildExtensionRequestResult } from '../harness/domain/extension-questions.mjs';
import { ok, err, unwrap } from '../harness/domain/result.mjs';
import {
  createExtensionControlPacketResult,
  importExtensionControlsResult,
} from '../harness/domain/extension-controls.mjs';

export function createExtensionControls({ now = new Date().toISOString() } = {}) {
  const prepared = extensionFixtures()
    .filter((fixture) => fixture.suite === 'judge')
    .map((fixture) => ({
      id: crypto.randomBytes(12).toString('hex'),
      fixture,
      request: unwrap(buildExtensionRequestResult({ fixture })),
    }));
  for (let index = prepared.length - 1; index > 0; index--) {
    const other = crypto.randomInt(index + 1);
    [prepared[index], prepared[other]] = [prepared[other], prepared[index]];
  }
  return unwrap(createExtensionControlPacketResult({ prepared, now }));
}
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
function writeNewJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
export function runCommandResult(command, values) {
  if (typeof values.out !== 'string' || !values.out.trim()) return err('missing_output_path');
  try {
    if (command === 'export') {
      const packetPath = path.join(values.out, 'packet.json'),
        manifestPath = path.join(values.out, 'manifest.json');
      if (fs.existsSync(packetPath) || fs.existsSync(manifestPath))
        return err('control_packet_output_exists');
      const { packet, manifest } = createExtensionControls();
      writeNewJson(packetPath, packet);
      writeNewJson(manifestPath, manifest);
      return ok({
        packet: packetPath,
        privateManifest: manifestPath,
        packetHash: packet.packetHash,
        records: packet.records.length,
        lineages: 8,
      });
    }
    if (command === 'import') {
      for (const argument of ['packet', 'manifest', 'responses', 'model'])
        if (!values[argument]) return err('missing_control_argument', { context: { argument } });
      if (fs.existsSync(values.out)) return err('control_report_output_exists');
      const result = importExtensionControlsResult({
        packet: readJson(values.packet),
        manifest: readJson(values.manifest),
        submission: readJson(values.responses),
        model: values.model,
        isolated: values.isolated,
        agentId: values['agent-id'] ?? null,
        reasoningEffort: values['reasoning-effort'] ?? null,
        now: new Date().toISOString(),
      });
      if (result.tag === 'error') return result;
      writeNewJson(values.out, result.value);
      return ok({
        out: values.out,
        source: result.value.source,
        model: values.model,
        summary: result.value.summary,
        pairedContextComparison: result.value.pairedContextComparison,
        poolWithDirectApiRows: false,
      });
    }
    return err('unknown_control_command');
  } catch (error) {
    return err('control_file_or_serialization_error', {
      context: { causeCode: error.code ?? error.details?.code ?? 'unknown' },
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
      isolated: { type: 'boolean', default: false },
      'agent-id': { type: 'string' },
      'reasoning-effort': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help || !command || command === '--help') {
    console.log(
      'Export: node scripts/extension-controls.mjs export --out work/extension-controls\nImport: node scripts/extension-controls.mjs import --packet work/extension-controls/packet.json --manifest work/extension-controls/manifest.json --responses work/extension-controls/luna-responses.json --model gpt-5.6-luna --isolated --out work/extension-controls/luna-control.json\nNo model calls. Send only packet.json to isolated controls; keep manifest.json private. Existing evidence is never overwritten.',
    );
    return;
  }
  console.log(JSON.stringify(unwrap(runCommandResult(command, values)), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
