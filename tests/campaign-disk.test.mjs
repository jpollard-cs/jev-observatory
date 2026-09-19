import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  prepareCampaign,
  loadCampaign,
  loadCampaignRows,
  campaignDiskPorts,
  withCampaignLock,
} from '../scripts/campaign.mjs';
import { generateCases } from '../harness/corpus.mjs';
import { runCampaignPhase } from '../harness/application/campaign-run.mjs';
import { campaignProgressStatus } from '../harness/domain/campaign-plan.mjs';
import { replayCampaignLedger } from '../harness/domain/campaign-budget.mjs';
import { ok } from '../harness/domain/result.mjs';

const cases = [
  ...generateCases({
    contextChars: [128],
    positions: ['start'],
    policyProfiles: ['balanced'],
    outputModes: ['binary'],
    promptArms: ['minimal'],
    seedsPerFamily: 2,
  }),
].filter((item) => item.family === 'authority_spoof');

test('offline preparation preserves every case, full request bytes, seeds and immutable manifests', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-campaign-plan-'));
  try {
    const plan = prepareCampaign(directory, {
      cases,
      smokeCases: cases.slice(0, 2),
      extensions: [],
      preparedAt: 'fixture',
    });
    assert.equal(plan.catalogCases, 4);
    assert.equal(plan.phaseCounts.matrix, 2);
    assert.equal(plan.queuedOtherSeeds, 2);
    assert.match(plan.selection, /does not cover both correct and incorrect judge answers/);
    const catalog = fs
      .readFileSync(path.join(directory, 'catalog.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    for (const entry of catalog) {
      const request = JSON.parse(
        fs.readFileSync(path.join(directory, 'requests', `${entry.requestHash}.json`), 'utf8'),
      );
      assert.equal(request.expected, undefined);
      assert.equal(
        request.state.assessmentContext.resources[0].text,
        cases.find((item) => item.id === entry.id).context.resources[0].text,
      );
    }
    assert.deepEqual(loadCampaign(directory).plan, plan);
    fs.appendFileSync(path.join(directory, 'trials.json'), ' ');
    assert.throws(() => loadCampaign(directory), /campaign_catalog_or_trials_changed/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('representation preparation honors preregistered dispatch order and each source request version', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-campaign-diagnostic-order-'));
  const diagnostic = (id, dispatchOrder, nativeRequestVersion) => ({
    id,
    dispatchOrder,
    nativeRequestVersion,
    scenarioId: id,
    request: {
      state: { id },
      model: 'jev-latest',
      questions: { q: { type: 'noul', instructions: 'Is the source present?' } },
    },
  });
  try {
    prepareCampaign(directory, {
      cases: [],
      smokeCases: [],
      extensions: [],
      diagnostics: [
        diagnostic('second', 1, 'policy-v4'),
        diagnostic('first', 0, 'release-extension-v1'),
      ],
      preparedAt: 'fixture',
    });
    const { trials } = loadCampaign(directory);
    assert.deepEqual(
      trials.map((trial) => trial.sourceId),
      ['first', 'second'],
    );
    assert.deepEqual(
      trials.map((trial) => trial.nativeRequestVersion),
      ['release-extension-v1', 'policy-v4'],
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('disk boundary captures the original response envelope before settlement and reloads aggregate-compatible rows', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-campaign-disk-'));
  try {
    const plan = prepareCampaign(directory, {
      cases: cases.slice(0, 2),
      smokeCases: cases.slice(0, 2),
      extensions: [],
      preparedAt: 'fixture',
    });
    const { trials } = loadCampaign(directory);
    const ledgerDirectory = path.join(directory, 'ledger');
    const endpoint = {
      model: 'jev-latest',
      transport: 'typesafe_systemone',
      url: 'https://unused.invalid',
      apiKey: 'SECRET_NOT_PERSISTED',
    };
    let calls = 0;
    const ports = campaignDiskPorts(directory, ledgerDirectory, endpoint, {
      transport: {
        postJson: async () => {
          calls++;
          return ok({
            data: {
              model: 'jev-fixture-version',
              answers: {
                classification: {
                  type: 'choice',
                  choice: 'benign',
                  probabilities: { attack: 0, benign: 1, abstain: 0 },
                  confidence: 1,
                },
              },
              usage: { input_tokens: 20, output_tokens: 2 },
              envelopeMarker: 'original-response',
            },
            latencyMs: 1,
          });
        },
      },
    });
    const first = await runCampaignPhase(
      { plan, trials, phase: 'smoke', events: [], maxRequests: 1 },
      ports,
    );
    assert.equal(first.value.reason, 'invocation_request_limit');
    const eventFiles = fs.readdirSync(ledgerDirectory).sort();
    const events = eventFiles.map((name) =>
      JSON.parse(fs.readFileSync(path.join(ledgerDirectory, name), 'utf8')),
    );
    assert.deepEqual(
      events.map((event) => event.type),
      ['reserve', 'settle'],
    );
    const rows = loadCampaignRows(directory, 'smoke');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].parsed.valid, true);
    assert.equal(rows[0].source, 'direct_api_campaign_smoke');
    assert.equal(rows[0].case.context.resources.length, 1);
    assert.equal(rows[0].usage.inputTokens, 20);
    assert.ok(!JSON.stringify(rows).includes('SECRET_NOT_PERSISTED'));
    const saved = ports.loadRaw(trials.find((trial) => trial.id === rows[0].trialId));
    assert.equal(saved.evidence.providerEnvelope.value.data.envelopeMarker, 'original-response');
    const status = campaignProgressStatus(plan, trials, replayCampaignLedger(events).value);
    assert.equal(status.phases.smoke.dispatched, 1);
    assert.equal(status.phases.smoke.queued, 1);
    await runCampaignPhase({ plan, trials, phase: 'smoke', events, maxRequests: 1 }, ports);
    assert.equal(calls, 2);
    assert.equal(loadCampaignRows(directory, 'smoke').length, 2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('global exclusive lock prevents a second owner from running', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-campaign-lock-'));
  const lock = path.join(directory, '.lock');
  try {
    await withCampaignLock(lock, async () => {
      await assert.rejects(
        withCampaignLock(lock, async () => assert.fail('second owner ran')),
        /campaign_locked/,
      );
      assert.equal(fs.existsSync(lock), true);
    });
    assert.equal(fs.existsSync(lock), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('derived interrupted rows enter exports and a recovered response supersedes them without another dispatch', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-campaign-unknown-'));
  try {
    const plan = prepareCampaign(directory, {
      cases: cases.slice(0, 2),
      smokeCases: cases.slice(0, 1),
      extensions: [],
      preparedAt: 'fixture',
    });
    const { trials } = loadCampaign(directory);
    const trial = trials.find((entry) => entry.phase === 'smoke');
    const key = `${plan.campaignId}:${trial.id}`;
    const event = {
      type: 'reserve',
      sequence: 1,
      key,
      requestHash: trial.requestHash,
      reservationNanoUsd: trial.reservationNanoUsd,
    };
    const ports = campaignDiskPorts(
      directory,
      path.join(directory, 'ledger'),
      {},
      { transport: { postJson: async () => assert.fail('unknown dispatch retried') } },
    );
    ports.appendEvent(event);
    await runCampaignPhase({ plan, trials, phase: 'smoke', events: [event] }, ports);
    const unknown = loadCampaignRows(directory, 'smoke');
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0].status, 'unknown_interrupted_dispatch');
    assert.equal(unknown[0].parsed, null);
    assert.equal(ports.loadRaw(trial), null);
    ports.writeRaw(trial, {
      key,
      requestHash: trial.requestHash,
      reportedProviderModel: 'jev-fixed',
      response: {
        status: 'ok',
        providerModel: 'jev-fixed',
        usage: { inputTokens: 1, outputTokens: 1 },
        answers: {
          classification: {
            type: 'choice',
            choice: 'benign',
            probabilities: { benign: 1, attack: 0, abstain: 0 },
            confidence: 1,
          },
        },
      },
    });
    await runCampaignPhase({ plan, trials, phase: 'smoke', events: [event] }, ports);
    const recovered = loadCampaignRows(directory, 'smoke');
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].status, 'ok');
    assert.equal(recovered[0].parsed.valid, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
