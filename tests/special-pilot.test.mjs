import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPanel} from '../scripts/agent-panel.mjs';
import {panelCases,debuggingCases,debuggingRequest,parseDebugging,summarizeSpecial} from '../scripts/special-pilot.mjs';
import {hash} from '../harness/corpus.mjs';
const fixtures=JSON.parse(fs.readFileSync(new URL('../policies/debugging-boundary-cases.json',import.meta.url)));
const stable=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const digest=v=>hash(stable(v));
const mockAnswers=(request,decision='allow',audit=.1)=>Object.fromEntries(Object.entries(request.questions).map(([id,q])=>[id,q.type==='noul'?{type:'noul',noul:id==='audit_required'?audit:.1}:{type:'choice',choice:decision,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===decision?.99:0])),confidence:.95}]));
test('matched native battery binds exactly eight frozen packet IDs and assessed contexts',()=>{
  const {packet,manifest}=createPanel();const cases=panelCases(packet,manifest);
  assert.equal(cases.length,8);assert.equal(new Set(cases.map(c=>c.sourceCaseId)).size,8);
  for(const c of cases){assert.deepEqual(c.request.state.assessmentContext,c.case.context);assert.equal(c.packetHash,packet.packetHash);assert.ok(!Object.hasOwn(c.request.state,'expected'));}
});
test('protocol binding rejects mutated provenance even after private hash is recomputed',()=>{
  const {packet,manifest}=createPanel();const changed=structuredClone(manifest);changed.records[0].sourceCaseId=changed.records[1].sourceCaseId;delete changed.manifestHash;changed.manifestHash=digest(changed);
  assert.throws(()=>panelCases(packet,changed),/differs from current protocol/);
  const changedPacket=structuredClone(packet);changedPacket.records[0].messages[0].content+=' changed';assert.throws(()=>panelCases(changedPacket,manifest),/hash mismatch/);
});
test('debugging native state excludes annotation, identifiers, gold and expected reasons',()=>{
  const fixture={...fixtures[0],id:'PRIVATE_ID_SENTINEL',title:'PRIVATE_TITLE_SENTINEL',expected:{decision:'PRIVATE_LABEL_SENTINEL',auditRequired:false,reasonIds:['PRIVATE_REASON_SENTINEL']},notes:'PRIVATE_NOTE_SENTINEL'};
  const request=debuggingRequest(fixture);assert.deepEqual(Object.keys(request.state).sort(),['material','policy','trustedContext']);
  assert.ok(!JSON.stringify(request).includes('SENTINEL'));assert.deepEqual(request.state.material,fixtures[0].material);assert.equal(request.questions.reason_DBG_DISPOSITION_AUDIT,undefined);assert.equal(request.questions.audit_required.type,'noul');
});
test('debugging uses native independent outputs and tolerates reported distribution rounding',()=>{
  const request=debuggingRequest(fixtures[0]),answers=mockAnswers(request,'allow',.1);const parsed=parseDebugging(answers,request);
  assert.ok(parsed.valid);assert.equal(parsed.value.decision,'allow');assert.equal(parsed.value.auditRequired,false);assert.equal(parsed.value.auditProbability,.1);assert.equal(parsed.value.distributionConcentration,.95);
  const invalid=structuredClone(answers);invalid.audit_required.noul=1.1;assert.equal(parseDebugging(invalid,request).valid,false);
});
test('special report preserves task errors in denominators and omits material text',()=>{
  const planned=debuggingCases(fixtures),c=planned[0];
  const parsed=parseDebugging(mockAnswers(c.request,'allow',.1),c.request);
  const rows=[{...c,status:'ok',parsed},{...planned[1],status:'error',parsed:null}];
  const report=summarizeSpecial(planned,rows);
  assert.equal(report.status,'measured_partial');assert.equal(report.contextualDebugging.attempted,2);assert.equal(report.contextualDebugging.decisionAccuracyAllAttempts,.5);assert.equal(report.contextualDebugging.errors,1);assert.equal(report.contextualDebugging.pairs[0].complete,false);
  assert.ok(!JSON.stringify(report).includes('SYNTHETIC_CANARY_7Q2'));assert.ok(!JSON.stringify(report).includes('proposedAction'));
});
