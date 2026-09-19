/** Offline Promptfoo integration: saved outputs only, never an inference or attack-generation run. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadCampaignRows, loadCampaign } from './campaign.mjs';
import { profiles } from '../harness/corpus.mjs';
import { replayScopes, scoreReplayScope } from '../harness/promptfoo-replay-assertion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const version = '0.123.0';

export function buildReplayPacket(rows, provenance = {}) {
  if (!rows.length) throw new Error('no_frozen_matrix_outputs_to_replay');
  const records = rows.map((row) => {
    if (!row.case?.id || !row.case.expected || !row.requestHash || !row.runId)
      throw new Error('invalid_frozen_replay_record');
    if (row.request && hash(JSON.stringify(row.request)) !== row.requestHash)
      throw new Error('frozen_replay_request_hash_mismatch');
    const originalRecordHash = hash(JSON.stringify(row));
    const frozenPolicy = row.request?.questions?.classification?.instructions?.trustedPolicy;
    const rules = frozenPolicy?.rules || profiles[row.case.policyProfile].rules;
    return {
      id: hash(
        JSON.stringify([row.runId, row.trialId ?? row.case.id, row.repeat ?? 0, row.attempt ?? 0]),
      ).slice(0, 24),
      originalRecordHash,
      originalRunId: row.runId,
      originalTrialId: row.trialId ?? null,
      requestHash: row.requestHash,
      requestBodyAvailable: Boolean(row.request),
      nativeRequestVersion:
        row.nativeRequestVersion ?? row.nativeMetadata?.requestVersion ?? 'historical_unspecified',
      adapterVersion: row.nativeMetadata?.adapterVersion ?? null,
      status: row.status,
      output: row.output ?? null,
      error: row.error ?? null,
      nativeValidationError: row.nativeValidationError ?? null,
      usage: row.usage ?? null,
      latencyMs: row.latencyMs ?? null,
      case: Object.fromEntries(
        ['id', 'family', 'task', 'outputMode', 'promptArm', 'policyProfile', 'expected'].map(
          (key) => [key, row.case[key]],
        ),
      ),
      reasonCodes: Object.fromEntries(rules.map((rule) => [rule.id, rule.reason])),
    };
  });
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error('duplicate_frozen_replay_identity');
  return {
    schemaVersion: 1,
    kind: 'offline_promptfoo_replay',
    promptfooVersion: version,
    newModelCalls: 0,
    adaptivePluginsRun: false,
    provenance,
    records,
  };
}

export function replayMetrics(packet) {
  const groups = new Map();
  for (const record of packet.records)
    for (const scope of replayScopes(record.case)) {
      if (!groups.has(scope))
        groups.set(scope, { scope, eligibleAttempts: 0, passed: 0, originalProviderErrors: 0 });
      const group = groups.get(scope);
      group.eligibleAttempts++;
      if (record.status !== 'ok') group.originalProviderErrors++;
      else if (scoreReplayScope(record.output, record.case, scope, record.reasonCodes).pass)
        group.passed++;
    }
  return [...groups.values()].map((group) => ({
    ...group,
    allAttemptPassRate: group.passed / group.eligibleAttempts,
  }));
}

export function isolatedReplayEnvironment(directory, inherited = process.env) {
  const allowed = ['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT'];
  return {
    ...Object.fromEntries(
      allowed.filter((key) => inherited[key]).map((key) => [key, inherited[key]]),
    ),
    CI: 'true',
    PROMPTFOO_CONFIG_DIR: path.join(directory, 'isolated-config'),
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: '1',
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'true',
    PROMPTFOO_DISABLE_SHARING: 'true',
    PROMPTFOO_DISABLE_CACHE: 'true',
    REPLAY_NETWORK_AUDIT: path.join(directory, 'network-audit.json'),
  };
}

export function prepareReplay(directory, packet) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const packetPath = path.join(directory, 'packet.json');
  const body = JSON.stringify(packet, null, 2) + '\n';
  fs.writeFileSync(packetPath, body, { mode: 0o600 });
  const packetHash = hash(body);
  const assertionPath = path.join(root, 'harness/promptfoo-replay-assertion.mjs');
  const config = {
    description:
      'OFFLINE REPLAY of frozen native outputs; zero new model calls and no Promptfoo attack plugins executed',
    prompts: ['Replay recorded case {{replayId}}'],
    providers: [
      {
        id: `file://${path.join(root, 'harness/promptfoo-replay-provider.mjs')}`,
        config: { packetPath, packetHash },
      },
    ],
    sharing: false,
    tests: packet.records.map((record) => ({
      description: `${record.case.id} ${record.case.outputMode} ${record.case.promptArm}`,
      vars: { replayId: record.id, case: record.case, reasonCodes: record.reasonCodes },
      metadata: {
        replay: true,
        originalRequestHash: record.requestHash,
        originalRecordHash: record.originalRecordHash,
        nativeRequestVersion: record.nativeRequestVersion,
      },
      assert: replayScopes(record.case).map((scope) => ({
        type: 'javascript',
        value: `file://${assertionPath}`,
        config: { scope },
        metric: scope,
      })),
    })),
    evaluateOptions: { maxConcurrency: 1, cache: false },
  };
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(config, null, 2) + '\n', {
    mode: 0o600,
  });
  const manifest = {
    kind: 'offline_promptfoo_replay',
    promptfooVersion: version,
    packetHash,
    newModelCalls: 0,
    adaptivePluginsRun: false,
    remoteGeneration: false,
    originalAttempts: packet.records.length,
    originalProviderErrors: packet.records.filter((record) => record.status !== 'ok').length,
    provenance: packet.provenance,
    metrics: replayMetrics(packet),
    interpretation:
      'Promptfoo overall pass is the conjunction of applicable exact assertions, not classifier accuracy. Scoped all-attempt metrics include original provider errors. Model probabilities, calibration and latency remain original evidence; replay adds no new model observation.',
  };
  fs.writeFileSync(
    path.join(directory, 'replay-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}

export function runReplay(directory) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 22))
    throw new Error('promptfoo_replay_requires_node_22_22_or_later');
  const packageRoot = path.join(root, 'node_modules/promptfoo');
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error('promptfoo_replay_version_not_pinned');
  if (fs.existsSync(path.join(directory, '.env')))
    throw new Error('replay_working_directory_contains_environment_file');
  const outputPath = path.join(directory, 'promptfoo-results.json');
  if (fs.existsSync(outputPath))
    fs.renameSync(
      outputPath,
      path.join(directory, `promptfoo-results.previous-${Date.now()}.json`),
    );
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.promptfoo;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      path.join(root, 'harness/promptfoo-replay-offline.mjs'),
      path.resolve(packageRoot, bin),
      'eval',
      '-c',
      path.join(directory, 'config.json'),
      '--no-cache',
      '--no-write',
      '--no-share',
      '--no-table',
      '--no-progress-bar',
      '--max-concurrency',
      '1',
      '--output',
      path.join(directory, 'promptfoo-results.json'),
    ],
    {
      cwd: directory,
      env: isolatedReplayEnvironment(directory),
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  fs.writeFileSync(path.join(directory, 'cli.stdout.log'), result.stdout || '');
  fs.writeFileSync(path.join(directory, 'cli.stderr.log'), result.stderr || '');
  if (result.error) throw new Error('promptfoo_replay_process_failed');
  if (![0, 100].includes(result.status)) throw new Error('promptfoo_replay_cli_failed');
  const audit = JSON.parse(fs.readFileSync(path.join(directory, 'network-audit.json'), 'utf8'));
  if (audit.unexpectedAttempts !== 0 || audit.blockedAttempts !== audit.blockedCallSites.length)
    throw new Error('promptfoo_replay_attempted_unexpected_network');
  if (!fs.existsSync(outputPath)) throw new Error('promptfoo_replay_results_missing');
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const results = Array.isArray(output.results) ? output.results : output.results?.results;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'replay-manifest.json'), 'utf8'),
  );
  if (!Array.isArray(results) || results.length !== manifest.originalAttempts)
    throw new Error('promptfoo_replay_attempt_count_mismatch');
  const packet = JSON.parse(fs.readFileSync(path.join(directory, 'packet.json'), 'utf8'));
  const expectedRecords = new Map(
    packet.records.map((record) => [record.id, record.originalRecordHash]),
  );
  const replayIds = results.map((entry) => entry.testCase?.vars?.replayId);
  if (
    new Set(replayIds).size !== packet.records.length ||
    results.some(
      (entry) =>
        expectedRecords.get(entry.testCase?.vars?.replayId) !==
        entry.response?.metadata?.originalRecordHash,
    )
  )
    throw new Error('promptfoo_replay_result_provenance_mismatch');
  const completion = {
    status: 'offline_replay_complete',
    originalAttempts: manifest.originalAttempts,
    replayRows: results.length,
    promptfooPassed: results.filter((entry) => entry.success).length,
    promptfooErrors: results.filter((entry) => entry.failureReason === 2).length,
    promptfooAssertionFailures: results.filter(
      (entry) => !entry.success && entry.failureReason !== 2,
    ).length,
    newModelCalls: 0,
    adaptivePluginsRun: false,
    cliExitCode: result.status,
    networkAudit: {
      networkDisabled: audit.networkDisabled,
      blockedAttempts: audit.blockedAttempts,
      unexpectedAttempts: audit.unexpectedAttempts,
      localIpcConnections: audit.localIpcConnections,
    },
    telemetryNote:
      'Pinned Promptfoo may attempt a telemetry-disabled acknowledgement; the preload guard prevents transmission. Local Unix IPC for the module loader is permitted.',
    resultSha256: hash(fs.readFileSync(outputPath)),
  };
  fs.writeFileSync(
    path.join(directory, 'completion.json'),
    JSON.stringify(completion, null, 2) + '\n',
  );
  return completion;
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'campaign-dir': { type: 'string' },
      'input-jsonl': { type: 'string' },
      'out-dir': { type: 'string', default: path.join(root, 'work/promptfoo-replay') },
      'prepare-only': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'Offline replay: node scripts/promptfoo-replay.mjs [--campaign-dir runs/release-campaign-policy-v4 | --input-jsonl frozen/raw.jsonl] [--out-dir work/promptfoo-replay] [--prepare-only]\nOnly saved matrix responses are replayed. No .env, credentials, model calls, adaptive plugins or remote generation.',
    );
    return;
  }
  if (values['campaign-dir'] && values['input-jsonl'])
    throw new Error('choose_one_frozen_replay_source');
  let rows, provenance;
  if (values['input-jsonl']) {
    const source = path.resolve(values['input-jsonl']);
    if (path.extname(source) !== '.jsonl') throw new Error('frozen_replay_requires_jsonl');
    const body = fs.readFileSync(source, 'utf8');
    rows = body.trim().split('\n').map(JSON.parse);
    provenance = {
      kind: 'frozen_compatibility_sample',
      source,
      sourceSha256: hash(body),
      currentCampaignEvidence: false,
    };
  } else {
    const directory = path.resolve(
      values['campaign-dir'] || path.join(root, 'runs/release-campaign-policy-v4'),
    );
    const { plan } = loadCampaign(directory);
    rows = loadCampaignRows(directory, 'matrix');
    provenance = {
      kind: 'frozen_campaign_matrix',
      campaignId: plan.campaignId,
      planHash: plan.planHash,
      phase: 'matrix',
    };
  }
  const directory = path.resolve(values['out-dir']);
  const replayRoot = path.join(root, 'work/promptfoo-replay');
  if (!(directory === replayRoot || directory.startsWith(replayRoot + path.sep)))
    throw new Error('replay_outputs_must_stay_in_ignored_work_directory');
  prepareReplay(directory, buildReplayPacket(rows, provenance));
  console.log(
    JSON.stringify(
      values['prepare-only']
        ? { status: 'offline_replay_prepared', newModelCalls: 0, directory }
        : { ...runReplay(directory), directory },
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
