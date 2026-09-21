import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryPage, historicalEvidencePage} from '../public/library.js';
import {originalCatalogView} from '../src/history/catalog.mjs';
import {makeReplayPlan} from '../src/history/planner.mjs';
import {loadEvidence} from '../src/evidence-library.mjs';

const catalog=originalCatalogView();
const boot={hosted:true,originalCatalog:catalog,defaultProject:'/project',appRoot:'/workbench'};
const state=plan=>({originalOptions:plan?.options??catalog.defaultOptions,originalPlan:plan});

test('original browser suite places reviewed execution before its atlas and does not prescribe a local command',()=>{
 const plan=makeReplayPlan({preset:'families'}).manifest;
 const html=libraryPage(state(plan),boot);
 assert.ok(html.indexOf('data-action="original-review"')<html.indexOf('aria-label="Outcome atlas"'));
 assert.ok(html.includes('data-execution-slot'));
 assert.ok(!html.includes('replay.mjs'));
 const frozen={planHash:plan.planHash,planPath:'/plan/manifest.json'};
 const saved=libraryPage({...state(plan),originalFrozen:frozen},boot);
 assert.ok(saved.includes('data-action="hosted-original"'));
 assert.ok(saved.includes('data-action="download-original-plan"'));
 const local=libraryPage({...state(plan),originalFrozen:frozen},{...boot,hosted:false});
 assert.ok(local.includes('replay.mjs'));
 assert.ok(!local.includes('data-action="hosted-original"'));
});

test('original suite cannot offer execution before preview or without complete contrasts',()=>{
 for(const s of [state(),state(makeReplayPlan({maxUsd:.000001,fitBudget:true}).manifest)]){
  const html=libraryPage(s,boot);
  assert.ok(!html.includes('data-action="original-review"'));
  assert.ok(!html.includes('data-action="original-freeze"'));
  assert.ok(html.includes('data-action="original-preview"'));
 }
});

test('original planning and result pages expose imports and saved runs without mixing settings with results',()=>{
 const html=libraryPage(state(),boot);
 for(const action of ['hosted-history','import-report','original-import','original-export'])assert.ok(html.includes(`data-action="${action}"`));
 assert.ok(html.includes('They contain no model results.'));
 const evidence=loadEvidence('original-campaign');
 const results=historicalEvidencePage({evidence,condition:evidence.conditions[0].id,page:0,filter:'all'},'',{hosted:true});
 assert.ok(results.includes('data-action="import-report"'));
 assert.ok(results.includes('data-action="hosted-history"'));
});
