import test from 'node:test';
import assert from 'node:assert/strict';
import { preset } from '../../workbench/src/policy.mjs';
import { defaultApplication } from '../../workbench/src/selection/application.mjs';
import { makeAssistedPlan } from '../../workbench/src/selection/planner.mjs';
import { guidedPlanner, runReview, coverageScopeNotice } from '../../workbench/public/guided.js';
import { jevExecutionAdapter } from '../src/hosted/jev-adapter.mjs';

const policy = preset();
const application = { ...defaultApplication(policy), capabilities: ['external_actions','judging','moderation'] };
const options = { tier: 'gold', maxUsd: .3, coverageScope: 'available_policy_tests' };
const plan = makeAssistedPlan(policy, application, options);

test('hosted execution rebuilds an explicitly scoped plan and discloses its untested boundaries', () => {
 const input = { policy, application, options };
 const rebuilt = jevExecutionAdapter.compile({ route: 'selection/freeze', input, planHash: plan.manifest.planHash });
 assert.equal(rebuilt.manifest.planHash, plan.manifest.planHash);
 const disclosure = jevExecutionAdapter.describe(rebuilt);
 assert.deepEqual(disclosure.evaluationScope, plan.manifest.coverage.evaluationScope);
 assert.deepEqual(disclosure.unevaluatedBoundaries, ['tools_and_disclosure','judging','moderation']);
 const full = makeAssistedPlan(policy, application, { tier: 'gold', maxUsd: .3 });
 assert.throws(() => jevExecutionAdapter.compile({ route:'selection/freeze', input:{...input,options:full.manifest.options}, planHash:full.manifest.planHash }), /Minimum coverage/);
});

test('scope is visible in planner, saved-run review and report view without hiding gaps', () => {
 const state = { policy, application, options:plan.manifest.options, plan:plan.manifest, planningMode:'assisted', frozen:{manifest:plan.manifest,planHash:plan.manifest.planHash} };
 const planner = guidedPlanner(state,{hosted:true});
 assert.match(planner,/grid workflow-stack/);assert.doesNotMatch(planner,/grid cols-2/);
 assert.match(planner,/Available policy tests only/);assert.match(planner,/tools and disclosure, judging, moderation/);
 assert.match(planner,/Require full declared scope/);assert.match(planner,/SCOPED PLAN/);
 assert.doesNotMatch(planner,/data-action="guided-save-plan" disabled/);
 assert.match(runReview(state,{hosted:true},''),/Available policy tests only/);
 assert.match(coverageScopeNotice(plan.manifest.coverage),/Not evaluated/);
 const full = makeAssistedPlan(policy,application,{tier:'gold'}).manifest;
 assert.match(guidedPlanner({...state,plan:full},{hosted:true}),/Run available policy tests only/);
 assert.match(guidedPlanner({...state,plan:full},{hosted:true}),/data-action="guided-save-plan" disabled/);
});

test('untrusted imported scope metadata cannot break the evidence view or inject markup', () => {
 for (const coverage of [
  { evaluationScope:{mode:'available_policy_tests'}, structuredGaps:[{kind:'x',id:'y'}] },
  { evaluationScope:{mode:'available_policy_tests',deferredGapIds:{}}, structuredGaps:{} },
  { evaluationScope:{mode:'available_policy_tests',deferredGapIds:['x:<script>']}, structuredGaps:[null,{kind:'x',id:42},{kind:'x',id:'<script>'}] },
 ]) {
  const html = coverageScopeNotice(coverage);
  assert.match(html,/Available policy tests only/);assert.doesNotMatch(html,/<script>/);
 }
});
