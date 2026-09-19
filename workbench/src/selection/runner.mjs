import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {verifyAdvisorPlan,freezeAdvisorPlan,fitSignal} from './advisor.mjs';
import {readLedgerEvents,immutable,replaceJson,unwrap} from '../../vendor/admission-v1/io.mjs';
import {assert,sha} from '../util.mjs';
const stage=(hash,i)=>'rich-'+sha(hash+':advisor:'+Math.floor(i/48)).slice(0,24);
const stamp=()=>new Date().toISOString();
export async function executeAdvisor(prepared,acct,{infer,limit=Infinity,intervalMs=300,shouldStop=()=>false,onProgress=()=>{}}={}){
 verifyAdvisorPlan(prepared.manifest);const m=prepared.manifest;assert(m.status==='prepared_offline','Advisor budget cannot cover the requested catalog');assert(typeof infer==='function','Transport required');
 const out=path.join(acct.runRoot,'catalog-advisor-'+m.planHash.slice(0,20));freezeAdvisorPlan(prepared,out);const api=acct.api;
 let ledger=unwrap(api.replayRichLedger(readLedgerEvents(acct.ledgerDir)));assert(ledger.knownNanoUsd>=acct.minimumPriorNano,'Existing project history missing; do not reset the ledger');assert(!ledger.haltedReason,'Shared ledger halted: '+ledger.haltedReason);
 const rows=new Map(),failures=new Map(),jobs=prepared.jobs.map((j,i)=>({...j,stageId:stage(m.planHash,i)})),stages=[...new Set(jobs.map(j=>j.stageId))];
 function append(e){const ev={...e,sequence:ledger.sequence+1};const next=unwrap(api.applyRichEvent(ledger,ev));immutable(path.join(acct.ledgerDir,String(ev.sequence).padStart(10,'0')+'.json'),JSON.stringify(ev)+'\n');ledger=next;}
 const known=()=>stages.reduce((n,s)=>n+(ledger.stages[s]?.knownNanoUsd??0),0),held=()=>stages.reduce((n,s)=>n+(ledger.stages[s]?.heldNanoUsd??0),0);
 function load(j,res){const f=path.join(out,'records',sha(j.id)+'.json');if(!fs.existsSync(f))return null;const raw=fs.readFileSync(f,'utf8'),e=JSON.parse(raw);assert(e.requestHash===j.requestHash&&e.key===j.stageId+':'+j.id,'Advisor record binding mismatch');if(res.settled)assert(sha(raw)===res.settlement.rawHash,'Advisor evidence changed after settlement');
  const response=e.response??{},usage=response.usage,hasUsage=Number.isSafeInteger(usage?.inputTokens)&&usage.inputTokens>=0&&Number.isSafeInteger(usage?.outputTokens)&&usage.outputTokens>=0;
  const v=response.status==='ok'?api.validateNativeAnswers(response.answers,j.request,{distributionPolicy:'bounded_rounding'}):null;
  let valid=v?.tag==='ok'&&hasUsage&&e.reportedProviderModel===m.model,error=valid?null:response.status!=='ok'?(response.error??'transport_error'):!hasUsage?'missing_usage':e.reportedProviderModel!==m.model?'model_version_changed':v?.error?.code??'invalid_response';
  if(valid&&m.options.mode==='rank')try{for(const f of j.mapping)fitSignal(response.answers[f.questionId]);}catch(err){valid=false;error='invalid_advisor_distribution';}
  return {jobId:j.id,requestHash:j.requestHash,rawHash:sha(raw),evidence:e,evidenceHash:sha(e),valid,error,usage:hasUsage?usage:null};
 }
 function report(reason=null){const records=[...rows.values()],bad=[...failures.values()];const inputTokens=[...records,...bad].reduce((n,r)=>n+(r.usage?.inputTokens??0),0),heldInputs=jobs.reduce((n,j)=>{const r=ledger.reservations[j.stageId+':'+j.id];return n+(r&&!r.settled?j.reservationInputTokens:0);},0);
  const r={protocol:'catalog-advisor-report/1',mode:m.options.mode,manifest:m,status:reason?'stopped':records.length===jobs.length?'complete':'partial',stopReason:reason,rows:records.map(({usage,...r})=>r),failures:bad.map(({usage,...r})=>r),budget:{knownNanoUsd:known(),heldNanoUsd:held(),inputTokens,heldInputTokens:heldInputs,maximumUsd:m.options.maxUsd},dispatched:records.length+bad.length,note:'These are catalog metadata judgments, not guardrail-test results or reviewed ground truth. No automatically approved tags.'};
  const full={...r,reportHash:sha(r)};replaceJson(path.join(out,'report.json'),full);return full;
 }
 for(const j of jobs){const res=ledger.reservations[j.stageId+':'+j.id];if(!res)continue;assert(res.requestHash===j.requestHash,'Advisor resume mismatch');const r=load(j,res);if(!r){report('uncertain_dispatch_no_retry');throw Error('Uncertain advisor dispatch; manual reconciliation required');}(r.valid?rows:failures).set(j.id,r);if(!res.settled)append({type:'settle',key:j.stageId+':'+j.id,requestHash:j.requestHash,rawHash:r.rawHash,usage:r.usage,providerModel:r.evidence.reportedProviderModel??null,failed:!r.valid,recordedAt:stamp()});}
 const failed=stages.map(s=>ledger.stages[s]?.haltedReason).find(Boolean);if(failed){report(failed);throw Error('Advisor run halted: '+failed);}
 assert(ledger.knownNanoUsd+ledger.heldNanoUsd+Math.max(0,m.budget.reservationInputTokens*42-known()-held())<=acct.maxNano,'Shared budget cannot cover advisor reservation');
 let n=0,reason=null;
 for(const j of jobs){const key=j.stageId+':'+j.id;if(ledger.reservations[key])continue;if(shouldStop()){reason='operator_stop';break;}if(n>=limit)break;
  const reserve=j.reservationInputTokens*42;if(known()+held()+reserve>Math.floor(m.options.maxUsd*1e9)){reason='advisor_budget_exhausted';break;}
  if(ledger.knownNanoUsd+ledger.heldNanoUsd+reserve>acct.maxNano){reason='account_budget_exhausted';break;}
  append({type:'reserve',key,stageId:j.stageId,requestHash:j.requestHash,reservationNanoUsd:reserve,experimentPlanHash:m.planHash,recordedAt:stamp()});n++;onProgress({event:'advisor_dispatch',mode:m.options.mode,completed:rows.size,total:jobs.length,groups:j.mapping.map(x=>x.unitId).filter((id,i,a)=>a.indexOf(id)===i)});
  let evidence;try{evidence=await infer(j.request);}catch{evidence={response:{status:'error',error:'transport_exception',usage:null},reportedProviderModel:null};}
  immutable(path.join(out,'records',sha(j.id)+'.json'),JSON.stringify({...evidence,key,jobId:j.id,requestHash:j.requestHash,receivedAt:stamp()})+'\n');
  const r=load(j,ledger.reservations[key]);(r.valid?rows:failures).set(j.id,r);append({type:'settle',key,requestHash:j.requestHash,rawHash:r.rawHash,usage:r.usage,providerModel:r.evidence.reportedProviderModel??null,failed:!r.valid,recordedAt:stamp()});
  onProgress({event:'advisor_response',valid:r.valid,completed:rows.size,total:jobs.length,knownUsageUsd:known()/1e9});
  if(!r.valid||ledger.haltedReason||ledger.stages[j.stageId]?.haltedReason){reason=r.error??ledger.haltedReason??ledger.stages[j.stageId].haltedReason;break;}report();if(intervalMs)await wait(intervalMs);
 }
 return {report:report(reason),path:path.join(out,'report.json'),dispatchedNow:n};
}
/** A same-workflow advisor cost is a prerequisite, not a second charge. Verify against the shared ledger. */
export function verifyAdvisorInLedger(report,ledger){
 assert(report.failures.length===0,'Failed advisor cannot authorize evaluated plan');
 for(const r of report.rows){const i=report.manifest.jobs.findIndex(j=>j.id===r.jobId),key=stage(report.manifest.planHash,i)+':'+r.jobId,res=ledger.reservations[key];
  assert(res?.settled&&res.requestHash===r.requestHash&&res.settlement.rawHash===r.rawHash,'Advisor evidence is not settled in this account ledger');
 }
}
