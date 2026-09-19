/** Optional integration verification against the user's hash-bound source tree. No inference. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadWorkspace,importJevRequest,render,jsonHash,exampleAssignmentSignature} from '../src/index.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const project=process.argv[2];if(!project)throw Error('Usage: node tests/verify-workspace.mjs PROJECT');
const profiles=fs.readdirSync(path.join(base,'profiles')).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(base,'profiles',n),'utf8')));
const suite=await loadWorkspace({project,packageRoot:base,condition:'restored_open_set',suite:'boundary'});
const control=await loadWorkspace({project,packageRoot:base,condition:'rich_control',suite:'regression'});
let comparisons=0,bodyCount=0;const sizes=Object.fromEntries(profiles.map(p=>[p.id,{cases:0,requests:0,bytes:0}]));
for(const row of control.rows){const r=render(importJevRequest(row.request),profiles.find(p=>p.id==='jev-legacy'));assert.equal(r.receipt.exactLegacyWireMatch,true);}
for(const row of suite.rows){
 const d=importJevRequest(row.request),outputs={};
 for(const p of profiles){
  const result=render(d,p);outputs[p.id]=result;
  assert.equal(result.receipt.materialHash,jsonHash(row.request.state.material));
  assert.equal(result.receipt.trustedContextHash,jsonHash(row.request.state.trustedContext));
  assert.equal(result.receipt.configurationHash,jsonHash(row.request.state.policy));
  for(const request of result.requests){
   assert.equal(JSON.stringify(JSON.parse(request.body)),request.body);
   if(p.renderer==='jev'){
    assert.deepEqual(request.payload.state.material,row.request.state.material);
    assert.deepEqual(request.payload.state.policy,row.request.state.policy);
    assert.deepEqual(request.payload.state.trustedContext,row.request.state.trustedContext);
   }
  }
  if(p.id==='jev-legacy')assert.equal(result.receipt.exactLegacyWireMatch,true);
  sizes[p.id].cases++;sizes[p.id].requests+=result.requests.length;sizes[p.id].bytes+=result.receipt.totalWireBytes;bodyCount+=result.requests.length;comparisons++;
 }
 assert.equal(exampleAssignmentSignature(outputs['jev-question-examples']),exampleAssignmentSignature(outputs['jev-criteria-examples']));
 assert.equal(exampleAssignmentSignature(outputs['jev-criteria-examples']),exampleAssignmentSignature(outputs['jev-criteria-factored']));
}
// A second import of the original controls exercises pure source-only decomposition without demos.
assert.equal(control.rows.length,48);assert.equal(suite.rows.length,112);
const summary={status:'passed_offline',historicalByteIdenticalControls:48,caseCount:112,profileCount:profiles.length,renderings:comparisons,serializedBodies:bodyCount,profileTotals:sizes,liveCalls:0};
console.log(JSON.stringify(summary,null,2));
