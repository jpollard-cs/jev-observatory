import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {REVIEW_CASES,REVIEW_UNITS} from '../src/attacks/review-boundaries.mjs';
import {CATALOG,expectedFor} from '../src/catalog.mjs';
import {preset} from '../src/policy.mjs';
import {compileCase} from '../src/compiler.mjs';
import {executionSources} from '../src/sources.mjs';
import {makeAssistedPlan} from '../src/selection/planner.mjs';
import {defaultApplication} from '../src/selection/application.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../src/attacks/fixtures/candidates-b1.json',import.meta.url)));
const pointer=(object,path)=>path.slice(1).split('/').reduce((v,k)=>v[k.replaceAll('~1','/').replaceAll('~0','~')],object);
function changedLeaves(a,b,path='/material'){
 if(a&&typeof a==='object')return Object.keys(a).flatMap(k=>changedLeaves(a[k],b[k],path+'/'+k));
 return a===b?[]:[path];
}
test('candidate lineage pairs differ in exactly the declared material leaf; quoted evidence exists',()=>{
 assert.equal(REVIEW_CASES.length,24);assert.equal(REVIEW_UNITS.length,12);
 assert.equal(new Set(CATALOG.map(c=>c.id)).size,CATALOG.length);
 let quotes=0;
 for(const unit of REVIEW_UNITS){
  const pair=raw.filter(c=>unit.caseIds.includes(c.id));assert.equal(pair.length,2);
  const [a,b]=pair;assert.deepEqual(a.context,b.context);
  assert.deepEqual(changedLeaves(a.material,b.material),[a.evidence.pairedControl.changedPath]);
  assert.deepEqual(new Set(pair.map(c=>c.annotations.classification)),new Set(['benign','attack']));
  for(const c of pair){
   for(const e of c.evidence.support){assert.ok(pointer(c,e.path).includes(e.quote),c.id+e.path);quotes++;}
   const control=c.evidence.pairedControl,attack=pair.find(c=>c.id===control.attackId),benign=pair.find(c=>c.id===control.controlId);
   assert.ok(pointer(attack,control.changedPath).includes(control.attackQuote));
   assert.ok(pointer(benign,control.changedPath).includes(control.controlQuote));
  }
 }
 assert.equal(quotes,90);
});
test('all supplied policy expectations agree with the independent compiler oracle',()=>{
 for(const c of REVIEW_CASES)for(const mode of ['strict','contextual','inspection']){
  const p=preset(mode),gold=expectedFor(p,c),supplied=raw.find(x=>x.id===c.id).policyExpectations[mode];
  for(const key of ['policy_decision','input_contract','language_contract'])assert.equal(gold[key],supplied[key],c.id+' '+mode+' '+key);
 }
 assert.equal(expectedFor(preset('strict'),REVIEW_CASES.find(c=>c.id==='candidate-b1-04a')).policy_decision,'review');
});
test('new receiving tasks reach both wire layouts while evaluator metadata stays out',()=>{
 const p=preset();
 for(const c of REVIEW_CASES)for(const layout of ['question','criteria']){
  const compiled=compileCase(p,c,layout);
  assert.deepEqual(compiled.request.state.material,c.material);
  assert.deepEqual(compiled.request.state.trustedContext.consumerContext.task,c.context.task);
  for(const marker of [c.id,c.evaluation.lineageId,c.evaluation.provenance.originalCandidateHash,'reviewFlags','sourceEvidence','policyExpectations'])assert.ok(!compiled.body.includes(marker),marker);
  assert.deepEqual(compiled.receipt.evaluation,c.evaluation);
 }
 assert.ok(executionSources()['src/attacks/fixtures/candidates-b1.json']);
 const plan=makeAssistedPlan(p,defaultApplication(p),{tier:'gold',maxUsd:3,maxInputTokens:10000000,attackPacks:['review-boundaries']});
 assert.equal(plan.manifest.counts.selectedCases,84);
 for(const u of REVIEW_UNITS)assert.equal(plan.jobs.filter(j=>u.caseIds.includes(j.caseId)).length,4);
});
