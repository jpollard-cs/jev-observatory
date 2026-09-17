import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanel, importResponses, validatePanel} from '../scripts/agent-panel.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
function fixture() {
  const {packet,manifest}=createPanel({now:'2026-01-01T00:00:00.000Z'});
  const submission={packetHash:packet.packetHash,responses:packet.records.map(r=>{
    const gold=manifest.records.find(x=>x.id===r.id).expected;
    return {id:r.id,requestHash:r.requestHash,output:{label:gold.label,attack_probability:gold.label==='attack'?1:0,poison_probability:0,uncertainty:0,decision:gold.decision,violations:gold.policyIds.map(policy_id=>({policy_id,reason:'untrusted_instruction'})),judge_verdict:gold.judgeVerdict}};
  })};
  return {packet,manifest,submission,model:'gpt-5.6-luna',isolated:true};
}

test('blinded packet has eight balanced distinct cells with only opaque metadata',()=>{
  const {packet,manifest}=fixture();
  validatePanel(packet,manifest);
  assert.equal(packet.records.length,8);
  assert.equal(new Set(packet.records.map(r=>r.id)).size,8);
  for(const r of packet.records) {
    assert.deepEqual(Object.keys(r).sort(),['id','messages','requestHash']);
    assert.match(r.id,/^[a-f0-9]{24}$/);
    const payload=JSON.parse(r.messages[1].content);
    assert.deepEqual(Object.keys(payload).sort(),['assessmentContext','task']);
    assert.equal(payload.task,'judge');
    assert.equal(typeof payload.assessmentContext.candidateAnswer,'object');
    assert.ok(!JSON.stringify(r.messages).includes('"expected"'));
    assert.ok(!JSON.stringify(r.messages).includes('"variant"'));
    assert.ok(!JSON.stringify(r.messages).includes('"family"'));
    assert.ok(!JSON.stringify(r.messages).includes('"split"'));
  }
  const counts=new Map();for(const r of manifest.records){const k=r.variant+':'+r.expected.judgeVerdict;counts.set(k,(counts.get(k)||0)+1);}
  assert.equal(counts.size,4);assert.ok([...counts.values()].every(n=>n===2));
  assert.deepEqual(manifest.conditions,{contextChars:512,position:'middle',policyProfile:'balanced',outputMode:'structured',promptArm:'policy'});
  assert.equal(new Set(manifest.records.map(r=>r.lineage)).size,1);
});

test('import binds exact IDs and hashes while retaining unknown runtime facts',()=>{
  const input=fixture();input.submission.responses.reverse();
  const result=importResponses(input);
  assert.equal(result.source,'codex_subagent');assert.equal(result.kind,'codex_subagent_control_panel');
  assert.equal(result.summary.n,8);assert.equal(result.summary.judgeCorrect,8);assert.equal(result.summary.injectionCorrect,8);
  assert.equal(result.summary.uniqueTemplateLineages,1);
  assert.equal(result.modelIdentity.exactWeights,null);assert.equal(result.modelIdentity.samplingParameters,null);assert.equal(result.modelIdentity.usage,null);
  assert.equal(result.measurementContract.poolWithDirectApiRows,false);
  assert.equal(result.isolation.forkTurns,'none');assert.equal(result.isolation.independentlyVerifiedByImporter,false);
  assert.ok(result.records.every(r=>!Object.hasOwn(r,'case')&&!Object.hasOwn(r,'model')));
});

test('import rejects missing, duplicate, unknown and mismatched responses',()=>{
  for(const mutate of [
    x=>x.submission.responses.pop(),
    x=>x.submission.responses.push(clone(x.submission.responses[0])),
    x=>x.submission.responses[0].id='000000000000000000000000',
    x=>x.submission.responses[0].requestHash='wrong',
    x=>x.submission.packetHash='wrong'
  ]) {const input=fixture();mutate(input);assert.throws(()=>importResponses(input));}
});

test('modified packet or private labels cannot pass frozen hash validation',()=>{
  const first=fixture();first.packet.records[0].messages[1].content+='changed';assert.throws(()=>importResponses(first),/hash mismatch/);
  const second=fixture();second.manifest.records[0].expected.label='changed';assert.throws(()=>importResponses(second),/hash mismatch/);
});

test('invalid and abstaining model output stays in all-case denominator without repair',()=>{
  const input=fixture();input.submission.responses[0].output='```json\n{}\n```';
  input.submission.responses[1].output={label:'abstain',attack_probability:.5,poison_probability:.5,uncertainty:1,decision:'review',violations:[],judge_verdict:'abstain'};
  const result=importResponses(input);
  assert.equal(result.summary.n,8);assert.equal(result.summary.valid,7);assert.equal(result.summary.malformed,1);
  assert.equal(result.summary.judgeCorrect,6);assert.equal(result.summary.judgeUnresolved,2);assert.equal(result.summary.injectionAbstentions,1);
  assert.equal(result.records[0].rawOutput,'```json\n{}\n```');
});

test('import requires an explicit isolation attestation and supported model selector',()=>{
  assert.throws(()=>importResponses({...fixture(),isolated:false}),/isolated/);
  assert.throws(()=>importResponses({...fixture(),model:'unverified-model'}),/model selector/);
});
