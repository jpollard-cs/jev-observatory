import test from 'node:test';import assert from 'node:assert/strict';
import {CATALOG,expectedFor} from '../src/catalog.mjs';
import {PROMPTFOO_CASES} from '../src/attacks/promptfoo.mjs';
import {CONVERSATION_CASES,CONVERSATION_UNITS} from '../src/attacks/conversations.mjs';
import {preset} from '../src/policy.mjs';import {compileCase} from '../src/compiler.mjs';
import {makeAssistedPlan} from '../src/selection/planner.mjs';import {defaultApplication} from '../src/selection/application.mjs';
import {conversationSummary,conversationMarkup} from '../public/conversations.js';
import {importReport} from '../src/report.mjs';
import {reportPresentation,conditionPresentation} from '../public/evidence-model.js';
const p=preset(),a=defaultApplication(p);
test('expanded catalog includes 20 matched pairs and six complete replay units',()=>{
 assert.equal(CATALOG.length,172);assert.equal(new Set(CATALOG.map(c=>c.id)).size,172);
 assert.equal(PROMPTFOO_CASES.length,40);assert.equal(CONVERSATION_CASES.length,72);
 for(const c of PROMPTFOO_CASES){const other=PROMPTFOO_CASES.find(x=>x.group===c.group&&x.id!==c.id);assert.ok(other);assert.notEqual(other.annotations.classification,c.annotations.classification);assert.deepEqual(other.annotations.representations,c.annotations.representations);}
 for(const u of CONVERSATION_UNITS)assert.equal(u.caseIds.length,12);
});
test('every checkpoint contains only its visible prefix and no future intent labels',()=>{
 for(const c of CONVERSATION_CASES){const m=c.evaluation.conversation;
  assert.equal(c.material.exchanges.length,m.visibleExchanges);assert.equal(c.material.exchanges.at(-1).exchange,m.checkpoint);
  assert.equal(c.material.exchanges[0].exchange,m.visibleFrom);
  const gold=c.annotations.classification;
  if(m.branch==='benign'||m.checkpoint<m.firstAttackExchange)assert.equal(gold,'benign');
  else if(m.visibleFrom>m.firstAttackExchange)assert.equal(gold,'insufficient_evidence');else assert.equal(gold,'attack');
  const wire=compileCase(p,c,'criteria');
  assert.equal(wire.request.state.evaluation,undefined);assert.ok(!wire.body.includes('firstAttackExchange'));assert.ok(!wire.body.includes('authored development probe'));assert.ok(!wire.body.includes('frozen-conversation-checkpoints'));
  assert.deepEqual(wire.receipt.evaluation,c.evaluation);
 }
});
test('all added probes compile both layouts and every expectation has a native answer choice',()=>{for(const c of [...PROMPTFOO_CASES,...CONVERSATION_CASES])for(const layout of ['question','criteria']){const q=compileCase(p,c,layout).request.questions;for(const [id,value]of Object.entries(expectedFor(p,c)))assert.ok(Object.hasOwn(q[id].criteria,value),c.id+':'+id);}});
test('pack selection keeps whole trajectories; source detection does not claim live enforcement',()=>{
 const plan=makeAssistedPlan(p,{...a,surfaces:['user_messages','conversation_history'],capabilities:['read_only_analysis']},{tier:'gold',maxUsd:3,maxInputTokens:10000000,attackPacks:['crescendo-replay']});
 assert.equal(plan.manifest.counts.selectedCases,132);assert.ok(!plan.jobs.some(j=>j.caseId.startsWith('pf-')));
 for(const u of CONVERSATION_UNITS)assert.equal(plan.jobs.filter(j=>u.caseIds.includes(j.caseId)).length,24);
 const blocked=makeAssistedPlan(p,{...a,capabilities:['memory_writes']},{attackPacks:[],maxUsd:3}).manifest;
 assert.equal(blocked.state,'insufficient_coverage');assert.ok(blocked.coverage.structuredGaps.some(g=>g.id==='persistent_state'));
 assert.throws(()=>makeAssistedPlan(p,a,{attackPacks:['made-up']}),/Unknown attack pack/);
});
const replayRows=()=>CONVERSATION_CASES.filter(c=>c.group==='crescendo-gradual-concealment-full').map(c=>({id:c.id,caseId:c.id,evaluation:c.evaluation,repeat:1,valid:true,status:'ok',expected:expectedFor(p,c),answers:{classification:{choice:c.annotations.classification}},usage:{inputTokens:100,outputTokens:0},latencyMs:20}));
test('replay reporting counts sampled detections and retains unknown usage',()=>{
 const rows=replayRows(),pricing={inputUsdPerMillion:.042};
 let groups=conversationSummary(rows,pricing),attack=groups.find(g=>g.branch==='attack');
 assert.equal(attack.firstDetection,4);assert.equal(groups.find(g=>g.branch==='benign').falseAlarms,0);
 assert.equal(attack.knownInputTokens,600);assert.ok(Math.abs(attack.inputCostEstimate-.0000252)<1e-12);
 const missing=rows.find(r=>r.evaluation.conversation.branch==='attack'&&r.evaluation.conversation.checkpoint===32);
 missing.usage=null;missing.valid=false;groups=conversationSummary(rows,pricing);attack=groups.find(g=>g.branch==='attack');
 assert.equal(attack.missingUsage,1);assert.equal(attack.inputCostEstimate,null);
 assert.equal(groups.find(g=>g.branch==='benign').missingUsage,0);
 assert.match(conversationMarkup(rows,pricing),/Usage unavailable/);
});
test('exported evaluation provenance survives import without becoming classifier input',()=>{const raw={protocol:'policy-workbench-v1',status:'complete',planHash:'test',design:{pricing:{inputUsdPerMillion:.042}},conditions:[{id:'criteria',kind:'workbench',layout:'criteria',policyId:'contextual',rows:replayRows()}]};const view=importReport(JSON.stringify(raw));assert.deepEqual(view.conditions[0].rows[0].evaluation,raw.conditions[0].rows[0].evaluation);assert.deepEqual(importReport(JSON.stringify(view)).conditions[0].rows[0].evaluation,raw.conditions[0].rows[0].evaluation);});
test('historical navigation explains studies and replaces internal layout names',()=>{assert.equal(reportPresentation({id:'consumer-admission-v1'}).title,'Policy strictness comparison');assert.equal(conditionPresentation({id:'contextual_criteria',title:'contextual: criteria-local examples'}).title,'Rules with scoped exceptions · Examples grouped by answer');});

test('saved input inspection requires both immutable bindings and never guesses from current policy',async()=>{
 const {savedSpecimen}=await import('../public/saved-specimen.js');const report={planHash:'plan',design:{hostedRunId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}},row={requestIndex:3,plannedRequestHash:'request'};
 let calls=0;const read=async(id,index)=>{calls++;assert.equal(index,3);return {planHash:'plan',requestHash:'request',request:{state:{material:{text:'Frozen input'},policy:{version:'saved'}}}};};
 assert.equal((await savedSpecimen(report,row,read)).material.text,'Frozen input');
 assert.equal(await savedSpecimen(report,{...row,requestIndex:-1},read),null);assert.equal(calls,1);
 assert.equal((await savedSpecimen({...report,planHash:'other'},row,read)).available,false);
 assert.equal((await savedSpecimen(report,{...row,plannedRequestHash:'other'},read)).available,false);
});
