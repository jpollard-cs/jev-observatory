import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {sha,assert,clone} from '../util.mjs';
import {immutable,immutableJson,replaceJson,replaceText,readLedgerEvents,unwrap} from '../../vendor/admission-v1/io.mjs';
import {verifyReplayPlan,freezeReplay,REPLAY_PROTOCOL} from './planner.mjs';
import {summarize} from '../report.mjs';
const stamp=()=>new Date().toISOString();
/** The frozen legacy reducer only reads global counters, this reservation, and its stage.
 * Validate through that SAME reducer with a scoped projection; copy just its changed keys
 * back after persistence. Avoid O(N²) copying of all reservations on a large replay.
 * Equivalence is tested against the full original reducer; not a new budget policy.
 */
export function prepareScopedEvent(state,event,api){
 const prior=state.reservations[event.key];const stageId=event.stageId??prior?.stageId;
 const local={...state,reservations:prior?{[event.key]:prior}:{},stages:stageId&&state.stages[stageId]?{[stageId]:state.stages[stageId]}:{}};
 const result=unwrap(api.applyRichEvent(local,event));
 return ()=>{for(const k of ['sequence','knownNanoUsd','heldNanoUsd','haltedReason'])state[k]=result[k];if(result.reservations[event.key])state.reservations[event.key]=result.reservations[event.key];if(stageId&&result.stages[stageId])state.stages[stageId]=result.stages[stageId];};
}
export function replayScopedLedger(events,api){const state={sequence:0,knownNanoUsd:0,heldNanoUsd:0,reservations:{},stages:{},haltedReason:null};for(const e of events)prepareScopedEvent(state,e,api)();return state;}
export function scoreOriginal(rows){
 const metrics={};for(const row of rows){for(const [key,expected]of Object.entries(row.expected??{})){
  if(typeof expected!=='string'&&typeof expected!=='boolean')continue;
  const m=metrics[key]??={planned:0,valid:0,correct:0,unavailable:0,threshold:typeof expected==='boolean'?.5:null};m.planned++;
  const answer=row.answers?.[key],observed=typeof expected==='boolean'?(Number.isFinite(answer?.noul)?answer.noul>=.5:null):answer?.choice;
  if(!row.valid||observed===undefined||observed===null){m.unavailable++;continue;}m.valid++;if(observed===expected)m.correct++;
 }}return metrics;
}
export async function executeReplay(prepared,acct,{infer,limit=Infinity,intervalMs=300,checkpointEvery=128,shouldStop=()=>false,onProgress=()=>{}}={}){
 const p=prepared.manifest;verifyReplayPlan(p);assert(!['empty','insufficient_budget'].includes(p.state)&&p.jobs.length,'No complete minimum suite fits this plan');assert(typeof infer==='function','Transport required');
 assert(Number.isInteger(checkpointEvery)&&checkpointEvery>0&&checkpointEvery<=1024,'Invalid checkpoint frequency');
 const out=path.join(acct.runRoot,'original-evaluation-'+p.planHash.slice(0,20));
 if(!fs.existsSync(path.join(out,'manifest.json')))freezeReplay(prepared,out);
 else assert(sha(JSON.parse(fs.readFileSync(path.join(out,'manifest.json'))))===sha(p),'Saved replay plan differs');
 // Check every request before dispatch; never silently reconstruct altered frozen bytes.
 for(const j of p.jobs)assert(sha(fs.readFileSync(path.join(out,'requests',j.requestHash+'.json')))===j.requestHash,'Saved replay request differs');
 let ledger=replayScopedLedger(readLedgerEvents(acct.ledgerDir),acct.api);
 assert(ledger.knownNanoUsd>=acct.minimumPriorNano,'Existing project history is missing; do not reset the shared ledger');assert(!ledger.haltedReason,'Shared ledger halted: '+ledger.haltedReason);
 const jobs=p.jobs.map((j,i)=>({...j,stageId:'rich-'+sha(p.planHash+':original:'+Math.floor(i/48)).slice(0,24)}));
 const contrasts=new Map();for(const j of jobs){if(!contrasts.has(j.pairId))contrasts.set(j.pairId,[]);contrasts.get(j.pairId).push(j);}
 const owned=new Set(jobs.map(j=>j.stageId)),observations=new Map();let dispatchedNow=0,validCount=0;const reservedKeys=new Set(jobs.filter(j=>ledger.reservations[j.stageId+':'+j.id]).map(j=>j.id));
 const remember=(id,o)=>{const previous=observations.get(id);if(previous?.valid)validCount--;observations.set(id,o);if(o.valid)validCount++;};
 const total=field=>[...owned].reduce((s,id)=>s+(ledger.stages[id]?.[field]??0),0);
 const append=event=>{const e={...event,sequence:ledger.sequence+1};const commit=prepareScopedEvent(ledger,e,acct.api);immutable(path.join(acct.ledgerDir,String(e.sequence).padStart(10,'0')+'.json'),JSON.stringify(e)+'\n');commit();};
 function readSaved(j,reservation){const file=path.join(out,'records',sha(j.id)+'.json');if(!fs.existsSync(file))return null;
  const raw=fs.readFileSync(file,'utf8'),e=JSON.parse(raw);assert(e.requestHash===j.requestHash&&e.key===j.stageId+':'+j.id,'Replay response identity mismatch');if(reservation.settled)assert(sha(raw)===reservation.settlement.rawHash,'Replay raw evidence changed');
  const response=e.response??{},usage=response.usage,usageOk=Number.isSafeInteger(usage?.inputTokens)&&usage.inputTokens>=0&&Number.isSafeInteger(usage?.outputTokens)&&usage.outputTokens>=0;
  const request=JSON.parse(fs.readFileSync(path.join(out,'requests',j.requestHash+'.json'),'utf8'));
  const validation=response.status==='ok'?acct.api.validateNativeAnswers(response.answers,request,{distributionPolicy:'bounded_rounding'}):null;
  const valid=validation?.tag==='ok'&&usageOk&&e.reportedProviderModel===p.requiredProviderModel;
  const error=valid?null:response.status!=='ok'?(response.error??'transport_error'):!usageOk?'missing_usage':e.reportedProviderModel!==p.requiredProviderModel?'model_version_changed':validation?.error?.code??'invalid_response';
  return {rawHash:sha(raw),valid,error,answers:response.answers??{},usage:usageOk?usage:null,latencyMs:response.latencyMs??null,model:e.reportedProviderModel??null,receivedAt:e.receivedAt};
 }
 function rowFor(j){const o=observations.get(j.id);return {id:j.id,caseId:j.sourceId,family:j.family,group:j.family,suite:'original',panel:j.task,policyId:j.originalPolicyProfile,conditionId:j.conditionId,repeat:1,valid:o?.valid===true,status:o?.valid?'ok':o?'invalid_response':'not_dispatched',error:o?.error??null,expected:j.expected,originalExpected:j.originalExpected,answers:o?.answers??{},usage:o?.usage??null,latencyMs:o?.latencyMs??null,providerModel:o?.model??null,receivedAt:o?.receivedAt??null,lengthTarget:j.lengthTarget,position:j.position,seed:j.seed,pairId:j.pairId,lineage:j.lineage,split:j.split,originalKind:j.kind,originalTask:j.task,nativeVersion:j.nativeVersion,sourceContextHash:j.sourceContextHash,rationale:j.rationale,source:{requestHash:j.requestHash,rawHash:o?.rawHash??null,stageId:j.stageId},plannedRequestHash:j.requestHash};}
 function budget(){return {maximumBundleUsd:p.options.maxUsd,bundleKnownUsageUsd:total('knownNanoUsd')/1e9,bundleHeldUsd:total('heldNanoUsd')/1e9,restartKnownUsageUsd:ledger.knownNanoUsd/1e9,restartHeldUsd:ledger.heldNanoUsd/1e9,remainingRestartEnvelopeUsd:(acct.maxNano-ledger.knownNanoUsd-ledger.heldNanoUsd)/1e9};}
 function progress(stopReason=null){const validCalls=validCount;const r={protocol:REPLAY_PROTOCOL,planHash:p.planHash,status:stopReason?'stopped':validCalls===jobs.length?'complete':'partial',stopReason,requestedCalls:jobs.length,validCalls,dispatched:reservedKeys.size,budget:budget(),updatedAt:stamp()};replaceJson(path.join(out,'progress.json'),r);return r;}
 function report(stopReason=null){const r=progress(stopReason),conditions={};
  for(const j of jobs){conditions[j.conditionId]??={id:j.conditionId,title:j.conditionTitle,kind:j.kind==='matrix'?'original-matrix':'original-extension',policyId:j.originalPolicyProfile,originalTask:j.task,rows:[]};conditions[j.conditionId].rows.push(rowFor(j));}
  for(const c of Object.values(conditions)){c.summary=summarize(c.rows);c.originalMetrics=scoreOriginal(c.rows);}
  Object.assign(r,{conditions,design:{catalog:'original-catalog/1',originalCorpusHash:p.originalCorpusHash,sourceStamp:p.sourceStamp,nativeVersion:p.options.nativeVersion,selection:p.options,counts:p.counts,policyMeaning:p.coverage.policyMeaning,operation:'Original adoption/action, judge, moderation or integrity question; NOT current admission-editor policy.',boolScoring:'Native Noul values scored at frozen 0.5 threshold. No calibrated correctness claim.',sources:p.originalSource},limitations:['Original synthetic development catalog with dependent pairs, seeds, positions and output/profile variants.','Native question definitions and authored gold are preserved; only asked questions are graded.','Original matrix padding is repetitive meeting prose, not full-window task-grounded context.','Unattempted rows stay not_dispatched; they are never filled with simulated outcomes.','No material is forwarded, executed, disclosed or adopted by a downstream agent.']});
  // Compact output avoids pretty-print inflation; raw envelopes stay separately hash-bound.
  replaceText(path.join(out,'report.json'),JSON.stringify(r)+'\n');return r;
 }
 for(const j of jobs){const key=j.stageId+':'+j.id,res=ledger.reservations[key];if(!res)continue;assert(res.requestHash===j.requestHash,'Replay resume request mismatch');const saved=readSaved(j,res);if(!saved){report('uncertain_dispatch_no_retry');throw Error('Uncertain dispatch; manual reconciliation required for '+j.id);}remember(j.id,saved);if(!res.settled)append({type:'settle',key,requestHash:j.requestHash,rawHash:saved.rawHash,usage:saved.usage,providerModel:saved.model,failed:!saved.valid,recordedAt:stamp()});}
 const halted=[...owned].map(id=>ledger.stages[id]?.haltedReason).find(Boolean);if(halted){report(halted);throw Error('This original replay is halted: '+halted);}
 let stopReason=null;
 for(const j of jobs){const key=j.stageId+':'+j.id;if(ledger.reservations[key])continue;
  if(shouldStop()){stopReason='operator_stop';break;}if(dispatchedNow>=limit)break;
  const reserve=j.reservationInputTokens*42;
  // A budget boundary must not start an unaffordable half-contrast. Errors/operator stops can still interrupt a group and remain visible.
  const pendingContrast=contrasts.get(j.pairId).filter(x=>!ledger.reservations[x.stageId+':'+x.id]);
  const contrastReserve=pendingContrast.reduce((n,x)=>n+x.reservationInputTokens*42,0);
  if(total('knownNanoUsd')+total('heldNanoUsd')+contrastReserve>Math.floor(p.options.maxUsd*1e9)){stopReason='run_budget_exhausted';break;}
  if(ledger.knownNanoUsd+ledger.heldNanoUsd+contrastReserve>acct.maxNano){stopReason='account_budget_exhausted';break;}
  if(total('knownNanoUsd')+total('heldNanoUsd')+reserve>Math.floor(p.options.maxUsd*1e9)){stopReason='run_budget_exhausted';break;}
  if(ledger.knownNanoUsd+ledger.heldNanoUsd+reserve>acct.maxNano){stopReason='account_budget_exhausted';break;}
  append({type:'reserve',key,stageId:j.stageId,requestHash:j.requestHash,reservationNanoUsd:reserve,experimentPlanHash:p.planHash,recordedAt:stamp()});dispatchedNow++;reservedKeys.add(j.id);
  onProgress({event:'dispatch',job:j.id,completed:observations.size,planned:jobs.length});
  let evidence;try{evidence=await infer(JSON.parse(fs.readFileSync(path.join(out,'requests',j.requestHash+'.json'),'utf8')));}catch{evidence={response:{status:'error',error:'transport_exception',usage:null},reportedProviderModel:null};}
  immutable(path.join(out,'records',sha(j.id)+'.json'),JSON.stringify({...evidence,key,requestHash:j.requestHash,jobId:j.id,receivedAt:stamp()})+'\n');
  const saved=readSaved(j,ledger.reservations[key]);remember(j.id,saved);
  append({type:'settle',key,requestHash:j.requestHash,rawHash:saved.rawHash,usage:saved.usage,providerModel:saved.model,failed:!saved.valid,recordedAt:stamp()});
  progress();onProgress({event:'response',job:j.id,valid:saved.valid,error:saved.error,completed:observations.size,planned:jobs.length,committedUsd:(total('knownNanoUsd')+total('heldNanoUsd'))/1e9});
  if(dispatchedNow%checkpointEvery===0)report();
  if(!saved.valid||ledger.haltedReason||ledger.stages[j.stageId]?.haltedReason){stopReason=saved.error??ledger.haltedReason??ledger.stages[j.stageId].haltedReason;break;}
  if(intervalMs)await wait(intervalMs);
 }
 const final=report(stopReason);return {report:final,path:path.join(out,'report.json'),dispatchedNow};
}
