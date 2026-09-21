import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { startServer } from '../workbench/server.mjs';
import { preset } from '../workbench/src/policy.mjs';
import { defaultApplication } from '../workbench/src/selection/application.mjs';
import { UNITS } from '../workbench/src/selection/registry.mjs';
import { loadPrepared } from '../workbench/src/storage.mjs';

const KEY = 'SYNTHETIC_ONLY_WORKBENCH_E2E_KEY';
const scenarios = [
  {
    name: 'Billing',
    task: 'billing-support',
    mode: 'contextual',
    languages: 'english_spanish',
    allowed: ['en', 'es'],
    surface: 'conversation_history',
    description:
      'Read English and Spanish billing conversations. Summarize account issues without issuing refunds or disclosing private records.',
  },
  {
    name: 'Incident review',
    task: 'incident-review',
    mode: 'strict',
    languages: 'english_french',
    allowed: ['en', 'fr'],
    surface: 'retrieved_documents',
    description:
      'Review English and French incident reports and retrieved documents. Source instructions must not redirect the incident summary.',
  },
  {
    name: 'Code review',
    task: 'code-review',
    mode: 'inspection',
    languages: 'english_spanish',
    allowed: ['en', 'es'],
    surface: 'code',
    description:
      'Inspect English and Spanish code comments and security samples in isolation. Never execute source instructions or disclose credentials.',
  },
];

// Deliberately fixed provider answers exercise orchestration, not model quality.
function syntheticResponse(request, scenario) {
  const selections = {
    task: scenario.task,
    mode: scenario.mode,
    languages: scenario.languages,
    language_scope: 'controlling_instructions',
    [`surface_${scenario.surface}`]: 'present',
  };
  return {
    reportedProviderModel: 'jev-1.13.0',
    response: {
      status: 'ok',
      latencyMs: 1,
      usage: { inputTokens: 160, outputTokens: 40 },
      answers: Object.fromEntries(
        Object.entries(request.questions).map(([id, question]) => {
          const options = Object.keys(question.criteria);
          const choice =
            selections[id] ??
            (options.includes('not_indicated')
              ? 'not_indicated'
              : options.includes('keep_current')
                ? 'keep_current'
                : options[0]);
          assert.ok(options.includes(choice));
          return [
            id,
            {
              type: 'choice',
              choice,
              confidence: 1,
              probabilities: Object.fromEntries(
                options.map((option) => [option, Number(option === choice)]),
              ),
            },
          ];
        }),
      ),
    },
  };
}

for (const scenario of scenarios) {
  test(`HTTP E2E: ${scenario.name} description → reviewed policy → ranked frozen suite`, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-e2e-'));
    const requests = [];
    const server = startServer({
      port: 0,
      runtime: path.join(directory, 'runtime'),
      connectionOptions: {
        inferFactory: async ({ key }) => {
          assert.equal(key, KEY);
          return async (request) => {
            requests.push(request);
            return syntheticResponse(request, scenario);
          };
        },
      },
    });
    await once(server, 'listening');
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
    async function post(route, data, expectedStatus = 200) {
      const response = await fetch(`${base}/api/${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: base,
          'X-Workbench-Token': bootstrap.csrf,
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      assert.equal(response.status, expectedStatus, `${route}: ${JSON.stringify(result)}`);
      return result;
    }
    async function run(planHash) {
      const approval = await post('connection/authorize', { planHash });
      const confirmation = { token: approval.token, planHash, confirmPaid: true };
      const started = await post('connection/run', confirmation, 202);
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const result = await (await fetch(`${base}/api/connection/run?id=${started.id}`)).json();
        if (result.status !== 'running') {
          assert.equal(result.status, 'complete', JSON.stringify(result.error));
          await post('connection/run', confirmation, 400);
          return result.report;
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      assert.fail('Synthetic advisor timed out');
    }

    const policy = preset('strict');
    const application = {
      ...defaultApplication(policy),
      name: scenario.name,
      description: scenario.description,
    };
    const prepared = await post('setup/prepare', { policy, application, maxUsd: 0.01 });
    assert.equal(requests.length, 0);
    await post('connection/connect', {
      source: 'paste',
      apiKey: KEY,
      accountKind: 'standalone',
      directory: path.join(directory, 'account'),
      createAccount: true,
      accountLimitUsd: 1,
    });
    assert.equal(requests.length, 0);
    const setup = await run(prepared.planHash);
    assert.equal(requests.length, 1);
    const reviewed = await post('setup/import', {
      policy,
      application,
      raw: JSON.stringify(setup),
    });
    assert.ok(reviewed.summary.suggestions.every((suggestion) => suggestion.selected === false));
    await post(
      'setup/apply',
      { policy, application, raw: JSON.stringify(setup), selected: [] },
      400,
    );
    const allowedFields = new Set([
      'task',
      'mode',
      'languages',
      'language_scope',
      `surface_${scenario.surface}`,
    ]);
    const selected = reviewed.summary.suggestions
      .filter((suggestion) => allowedFields.has(suggestion.id))
      .map((suggestion) => suggestion.id);
    const transaction = await post('setup/apply', {
      policy,
      application,
      raw: JSON.stringify(setup),
      selected,
    });
    const draft = transaction.after;
    assert.equal(draft.policy.mode, scenario.mode);
    assert.deepEqual(draft.policy.languages.allowed, scenario.allowed);
    assert.ok(draft.application.surfaces.includes(scenario.surface));
    assert.deepEqual(draft.policy.representations.enabledExceptions, []);
    assert.equal(requests.length, 1);

    const ranking = await post('selection/prepare', {
      ...draft,
      options: { mode: 'rank', maxUsd: 0.01, maxInputTokens: null },
    });
    const rankingCalls = ranking.manifest.jobs.length;
    const report = await run(ranking.planHash);
    assert.equal(requests.length, 1 + rankingCalls);
    const imported = await post('selection/import', { ...draft, raw: JSON.stringify(report) });
    assert.equal(imported.summary.units.length, UNITS.length);
    const suite = await post('selection/freeze', {
      ...draft,
      report,
      options: { tier: 'bronze', layouts: ['question'], maxUsd: 0.1, maxInputTokens: null },
    });
    assert.equal(suite.manifest.state, 'prepared_offline');
    assert.equal(suite.manifest.advisor.mode, 'jev-assisted');
    assert.deepEqual(suite.manifest.coverage.missingMandatory, []);
    assert.ok(
      suite.manifest.coverage.selection.some((group) => group.unitId === 'source-directive'),
    );
    assert.ok(suite.manifest.counts.physicalRequests > 0);
    assert.equal(loadPrepared(suite.planPath).manifest.planHash, suite.planHash);
    assert.equal(requests.length, 1 + rankingCalls, 'Freezing a suite must not dispatch evaluation requests');

    const edited = { ...draft, policy: { ...draft.policy, name: 'Edited after ranking' } };
    await post('selection/freeze', { ...edited, report }, 400);
    assert.equal((await post('selection/cache', edited)).report, null);
    const uncovered = await post('selection/plan', {
      ...draft,
      application: {
        ...draft.application,
        capabilities: ['read_only_analysis', 'external_actions'],
      },
    });
    assert.ok(uncovered.coverage.structuredGaps.some((gap) => gap.blocking));
    assert.notEqual(uncovered.state, 'prepared_offline');
    assert.equal(requests.length, 1 + rankingCalls);
    assert.ok(requests.every((request) => !JSON.stringify(request).includes(KEY)));
    await post('connection/forget', {});
  });
}
