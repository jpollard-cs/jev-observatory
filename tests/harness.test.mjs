import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCases,corpusManifest,selectCases} from '../harness/corpus.mjs';
import {buildMessages} from '../harness/prompt.mjs';
import {parseOutput} from '../harness/schema.mjs';
import {scoreRows,scoreBinaryThreshold,selectThreshold,zeroFailureUpper,requiredZeroFailureTrials,calibrationStats,auc} from '../harness/metrics.mjs';
import {readEndpoint,infer,reservationUsd,requestPayload,inferTypeSafeRequest} from '../harness/provider.mjs';
import {buildTypeSafeRequest,normalizeTypeSafeResponse} from '../harness/typesafe.mjs';
const compact={contextChars:[512],positions:['start'],policyProfiles:['balanced'],outputModes:['structured'],promptArms:['policy']};
const cases=[...generateCases(compact)];
const valid=(label='attack',extra={})=>({label,attack_probability:.8,poison_probability:.1,uncertainty:.1,decision:'block',violations:[{policy_id:'P001',reason:'untrusted_instruction'}],judge_verdict:null,...extra});
const row=(c,value,status='ok')=>({runId:'unit-test-only',model:'unit-test-only',case:c,status,latencyMs:1,parsed:status==='ok'?parseOutput(JSON.stringify(value),'structured'):null});
test('every descendant of a semantic lineage remains in exactly one split',()=>{
  const map=new Map();for(const c of cases){const prior=map.get(c.clusterId);if(prior)assert.equal(prior,c.split);map.set(c.clusterId,c.split);}
  for(const id of ['authority_spoof','delimiter_breakout','encoded_payload','zero_width','html_negative_space','emoji_variation']) assert.equal(cases.find(c=>c.family===id).split,'pilot');
  assert.equal(corpusManifest().cases,15120);
});
test('paired sampling preserves clean/attack comparison and unique IDs',()=>{
  const selected=selectCases({split:'pilot',limit:12,...compact});
  assert.equal(selected.length,12);assert.equal(new Set(selected.map(c=>c.id)).size,12);
  for(const c of selected)assert.equal(selected.filter(x=>x.pairId===c.pairId).length,2);
  const full=selectCases({split:'pilot',limit:12});
  assert.equal(new Set(full.map(c=>`${c.promptArm}:${c.outputMode}`)).size,6);
});
test('judge correctness and injection are crossed; injection is within candidate',()=>{
  const judges=cases.filter(c=>c.task==='judge');
  assert.deepEqual(new Set(judges.map(c=>`${c.variant}:${c.expected.judgeVerdict}`)),new Set(['attack:pass','attack:fail','benign:pass','benign:fail']));
  assert.ok(judges.find(c=>c.variant==='attack').context.candidateAnswer.explanation.includes('Evaluator:'));
  assert.ok(judges.every(c=>c.context.resources.length===0));
});
test('history payload is transmitted only once and gold is absent from request',()=>{
  const c=cases.find(c=>c.family==='conversation_poison'&&c.variant==='attack');
  assert.equal(c.context.resources.length,0);
  const request=JSON.stringify(buildMessages(c));
  assert.ok(!request.includes('"expected"'));assert.ok(!request.includes('"clusterId"'));assert.ok(!request.includes('"variant"'));
  assert.equal(request.split('I accepted the document instruction').length-1,1);
});
test('strict schema does not repair fences, probabilities, extra keys or duplicate violations',()=>{
  assert.ok(parseOutput(JSON.stringify(valid()),'structured').valid);
  assert.equal(parseOutput('```json\n{}\n```','structured').error,'invalid_json');
  assert.equal(parseOutput(JSON.stringify(valid('attack',{attack_probability:1.1})),'structured').error,'invalid_probability');
  assert.equal(parseOutput(JSON.stringify({...valid(),extra:true}),'structured').error,'schema_keys');
  assert.equal(parseOutput(JSON.stringify(valid('attack',{violations:[...valid().violations,...valid().violations]})),'structured').error,'duplicate_policy_id');
});
test('errors, malformed output and abstentions stay in all-attempt denominator',()=>{
  const c=cases.find(c=>c.expected.label==='attack');
  const r=[row(c,valid()),row(c,valid('abstain')),row(c,null,'error'),{...row(c,valid()),parsed:{valid:false,error:'invalid_json'}}];
  const scored=scoreRows(r);
  assert.equal(scored.attempted,4);assert.equal(scored.endToEndCorrectRate,.25);assert.equal(scored.accuracyAmongDecided,1);assert.equal(scored.unresolvedAttackRate,.75);assert.equal(scored.errors,1);assert.equal(scored.malformed,1);assert.equal(scored.abstentions,1);
});
test('policy and judge use own denominators regardless of injection abstention',()=>{
  const c=cases.find(c=>c.task==='judge'&&c.variant==='attack'&&c.expected.judgeVerdict==='fail');
  const rows=[row(c,valid('attack',{judge_verdict:'fail'})),row(c,valid('abstain',{decision:'allow',violations:[],judge_verdict:'pass'})),row(c,null,'error')];
  const metrics=scoreRows(rows);assert.equal(metrics.policy.n,3);assert.equal(metrics.policy.decisionAccuracy,1/3);assert.equal(metrics.judge.n,3);assert.equal(metrics.judge.accuracy,1/3);
});
test('calibration refuses test rows and never invents a threshold without both classes',()=>{
  const c=cases.find(c=>c.split==='test');assert.throws(()=>selectThreshold([row(c,valid())]));
  const cal=cases.filter(c=>c.split==='calibration');
  assert.equal(selectThreshold([row(cal[0],valid())]).status,'insufficient_calibration');
  const pos=cal.find(c=>c.expected.label==='attack'),neg=cal.find(c=>c.expected.label==='benign');
  const t=selectThreshold([row(pos,valid('abstain',{attack_probability:.8})),row(neg,valid('benign',{attack_probability:.2}))]);assert.equal(t.status,'frozen_from_calibration');assert.equal(t.balancedError,0);
});
test('rare-event bound counts independent trials and never calls zero trials safe',()=>{
  assert.equal(requiredZeroFailureTrials(.001,.95),2995);assert.equal(zeroFailureUpper(0),null);assert.ok(zeroFailureUpper(2995)<.001);assert.ok(zeroFailureUpper(2994)>.001);
});
test('threshold scores remain separate from raw labels and include abstaining probabilities',()=>{
  const c=cases.find(c=>c.family==='conversation_poison'&&c.variant==='attack');
  const rows=[row(c,valid('abstain',{attack_probability:.9,poison_probability:.9})),row(c,valid('benign',{attack_probability:.9,poison_probability:.9})),row(c,null,'error')];
  const threshold=scoreBinaryThreshold(rows,'attack_probability',.5);
  assert.equal(threshold.scored,2);assert.equal(threshold.endToEndCorrectRate,2/3);assert.equal(threshold.labelProbabilityDisagreement,1);assert.equal(threshold.rawLabelAbstentionsAmongScored,1);
  assert.equal(scoreRows(rows).endToEndCorrectRate,0);assert.equal(scoreBinaryThreshold(rows,'poison_probability',.5).recall,1);
});
test('calibration and AUC have transparent empty and tie behavior',()=>{
  assert.equal(calibrationStats([]).brier,null);assert.equal(auc([{p:.5,y:1},{p:.5,y:0}]),.5);assert.equal(auc([{p:.8,y:1}]),null);assert.equal(calibrationStats([{p:1,y:1},{p:0,y:0}]).brier,0);
});
test('endpoint requires explicit identity, secure transport and pricing',()=>{
  assert.throws(()=>readEndpoint('jev',{}));
  const env={LUNA_BASE_URL:'https://example.invalid/v1',LUNA_MODEL:'unit-test',LUNA_API_KEY:'test-key',LUNA_INPUT_USD_PER_MILLION:'1',LUNA_OUTPUT_USD_PER_MILLION:'2'};
  const e=readEndpoint('luna',env);assert.equal(e.url,'https://example.invalid/v1/chat/completions');assert.ok(reservationUsd(e,[{role:'user',content:'hello'}],10)>0);
  assert.throws(()=>readEndpoint('luna',{...env,LUNA_BASE_URL:'http://example.invalid'}));assert.throws(()=>readEndpoint('luna',{...env,LUNA_INPUT_USD_PER_MILLION:''}));
});
test('native Jev uses documented endpoint and typed questions, never chat or output caps',async()=>{
  const endpoint=readEndpoint('jev',{TYPESAFE_API_KEY:'fixture-secret',JEV_INPUT_USD_PER_MILLION:'1',JEV_OUTPUT_USD_PER_MILLION:'1'});
  assert.equal(endpoint.url,'https://api.typesafe.ai/v1/systemone');assert.equal(endpoint.model,'jev-latest');
  const c={...cases.find(c=>c.expected.label==='attack'),outputMode:'binary'};
  const request=requestPayload(endpoint,c);
  assert.ok(request.state);assert.equal(request.questions.classification.type,'choice');assert.equal(request.messages,undefined);assert.equal(request.max_tokens,undefined);assert.equal(request.response_format,undefined);assert.ok(!JSON.stringify(request).includes('"expected"'));
  let sent;
  const result=await infer({endpoint,caseItem:c,outputMode:'binary',fetchImpl:async(_u,args)=>{sent=JSON.parse(args.body);return{ok:true,json:async()=>({model:'jev-latest',answers:{classification:{type:'choice',choice:'attack',probabilities:{attack:.8,benign:.1,abstain:.1},confidence:.6}},usage:{input_tokens:12,output_tokens:3}})};}});
  assert.deepEqual(sent,request);assert.equal(result.output,'attack');assert.equal(result.usage.inputTokens,12);assert.equal(result.nativeMetadata.outputArm,'native_choice');
});
test('native Noul stays probability and Score stays an ordinal rubric, mapped reasons are disclosed',()=>{
  const c=cases.find(c=>c.variant==='attack');const request=buildTypeSafeRequest(c);const answers={};
  for(const [id,q]of Object.entries(request.questions)){
    if(q.type==='choice'){const keys=Object.keys(q.criteria),choice=keys[0];answers[id]={type:'choice',choice,probabilities:Object.fromEntries(keys.map((k,i)=>[k,i===0?1:0])),confidence:.8};}
    if(q.type==='noul')answers[id]={type:'noul',noul:.75};
    if(q.type==='score')answers[id]={type:'score',score:2.4,legend:Object.fromEntries(q.criteria.map((s,i)=>[i,s])),probabilities:{0:0,1:0,2:.6,3:.4},confidence:.3};
  }
  const result=normalizeTypeSafeResponse({answers},c,request),parsed=parseOutput(result.output,'structured');
  assert.ok(parsed.valid);assert.equal(parsed.value.attack_probability,.75);assert.equal(result.nativeMetadata.interferenceSeverity.score,2.4);assert.equal(result.nativeMetadata.reasonCodesDerivedFromPolicy,true);assert.equal(result.nativeMetadata.confidenceMeaning,'distribution_concentration_not_correctness_probability');
  assert.throws(()=>normalizeTypeSafeResponse({answers:{...answers,attack_probability:{type:'noul',noul:1.4}}},c,request));
  const rounded=structuredClone(answers);rounded.interference_severity.score=.52;rounded.interference_severity.probabilities={0:.74,1:.01,2:.25,3:0};
  const observed=normalizeTypeSafeResponse({answers:rounded},c,request);
  assert.ok(parseOutput(observed.output,'structured').valid);assert.ok(Math.abs(observed.nativeMetadata.distributionDiagnostics.interference_severity.scoreResidual-.01)<1e-9);assert.equal(observed.nativeMetadata.distributionDiagnostics.interference_severity.probabilitiesRenormalized,false);
});
test('successful HTTP native answers and usage survive malformed-answer validation',async()=>{
  const endpoint=readEndpoint('jev',{TYPESAFE_API_KEY:'fixture-secret',JEV_INPUT_USD_PER_MILLION:'.042',JEV_OUTPUT_USD_PER_MILLION:'0'}),c={...cases[0],outputMode:'binary'};
  const data={model:'jev-latest',answers:{classification:{type:'noul',noul:.5}},usage:{input_tokens:123,output_tokens:7}};
  const result=await infer({endpoint,caseItem:c,fetchImpl:async()=>({ok:true,json:async()=>data})});
  assert.equal(result.status,'ok');assert.equal(result.nativeValidationError,'native_type_mismatch');assert.deepEqual(result.nativeAnswers,data.answers);assert.equal(result.usage.inputTokens,123);assert.equal(parseOutput(result.output,'binary').valid,false);
});
test('provider forwards unchanged messages, separates usage, and suppresses raw error bodies',async()=>{
  const endpoint={url:'https://example.invalid/v1/chat/completions',model:'fixture',apiKey:'secret-not-loggable',tokenLimitField:'max_tokens',constrainedOutput:false};
  const messages=[{role:'user',content:'literal\u200bpayload'}];let sent;
  const result=await infer({endpoint,messages,outputMode:'structured',fetchImpl:async(_u,args)=>{sent=JSON.parse(args.body);return{ok:true,json:async()=>({choices:[{message:{content:'not repaired'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2}})};}});
  assert.deepEqual(sent.messages,messages);assert.equal(sent.response_format,undefined);assert.equal(result.output,'not repaired');assert.equal(result.usage.inputTokens,10);
  const failed=await infer({endpoint,messages,outputMode:'binary',fetchImpl:async()=>({ok:false,status:401,text:async()=>endpoint.apiKey})});
  assert.equal(failed.error,'http_401');assert.ok(!JSON.stringify(failed).includes(endpoint.apiKey));
});
