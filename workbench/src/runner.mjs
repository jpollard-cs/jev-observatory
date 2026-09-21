import {validateBudget} from './budget.mjs';
import {verifyAdvisorInLedger} from './selection/runner.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {contracts,immutable,immutableJson,replaceJson,readJson,readLedgerEvents,unwrap} from '../vendor/admission-v1/io.mjs';
import {ROOT,freezePlan} from './storage.mjs';
import {verifyPlan} from './planner.mjs';
import {deriveDecision} from './policy.mjs';
import {summarize} from './report.mjs';
import {assert,sha,clone,utf8} from './util.mjs';
const stamp=()=>new Date().toISOString();
export function initAccount(directory,maxUsd){
 validateBudget(maxUsd,'Standalone account total limit');const root=path.resolve(directory),f=path.join(root,'account.json');assert(!fs.existsSync(f),'Account already exists; its budget cannot be reset here');
 immutableJson(f,{schemaVersion:'workbench-account/1',maximumNanoUsd:Math.floor(maxUsd*1e9),createdAt:stamp(),scope:'Explicitly initialized standalone account; not a replacement for an existing project ledger'});return root;
}
export async function openAccount({project,account,forTest=false}){
 assert(!!project!==!!account,'Choose exactly one existing project or explicitly initialized account');
 const bindingBase=path.join(ROOT,'vendor/admission-v1');
 if(project){const root=path.resolve(project);const api=await contracts(root,bindingBase);return {api,root,ledgerDir:path.join(root,'runs/rich-restart-budget-v1'),lock:path.join(root,'runs/.rich-restart.lock'),runRoot:path.join(root,'runs'),maxNano:3e9,minimumPriorNano:1_450_070_202,envFile:path.join(root,'.env'),kind:'existing project'};}
 const root=path.resolve(account),config=readJson(path.join(root,'account.json'));assert(config.schemaVersion==='workbench-account/1'&&Number.isSafeInteger(config.maximumNanoUsd)&&config.maximumNanoUsd>0,'Invalid account');
 const api=await contracts(path.join(ROOT,'vendor/legacy-runtime'),bindingBase);return {api,root,ledgerDir:path.join(root,'ledger'),lock:path.join(root,'.run.lock'),runRoot:path.join(root,'runs'),maxNano:config.maximumNanoUsd,minimumPriorNano:0,envFile:path.join(root,'.env'),kind:'standalone account'};
}
export async function executePrepared(prepared,acct,{infer,limit=Infinity,intervalMs=300,shouldStop=()=>false,onProgress=()=>{}}={}){
 verifyPlan(prepared.manifest);const p=prepared.manifest,api=acct.api;assert(!['insufficient_budget','insufficient_coverage'].includes(p.state)&&prepared.jobs.length,'Minimum coverage must fit before dispatch');assert(typeof infer==='function','Transport required');
 const out=path.join(acct.runRoot,'policy-workbench-'+p.planHash.slice(0,20));freezePlan(prepared,out);
 let ledger=unwrap(api.replayRichLedger(readLedgerEvents(acct.ledgerDir)));assert(ledger.knownNanoUsd>=acct.minimumPriorNano,'Existing project history is missing; do not reset the shared ledger');assert(!ledger.haltedReason,'Shared ledger halted: '+ledger.haltedReason);if(p.advisor?.report)verifyAdvisorInLedger(p.advisor.report,ledger);
 const jobs=prepared.jobs.map((j,i)=>({...j,stageId:'rich-'+sha(p.planHash+':'+Math.floor(i/48)).slice(0,24)}));
 const ownedStages=[...new Set(jobs.map(j=>j.stageId))],observations=new Map();
 const committed=()=>ownedStages.reduce((s,id)=>s+(ledger.stages[id]?.knownNanoUsd??0)+(ledger.stages[id]?.heldNanoUsd??0),0);
 const append=e=>{const event={...e,sequence:ledger.sequence+1};const next=unwrap(api.applyRichEvent(ledger,event));immutable(path.join(acct.ledgerDir,String(event.sequence).padStart(10,'0')+'.json'),JSON.stringify(event)+'\n');ledger=next;};
 function readRecord(j,reservation){const f=path.join(out,'records',sha(j.id)+'.json');if(!fs.existsSync(f))return null;
  const raw=fs.readFileSync(f,'utf8'),e=JSON.parse(raw);assert(e.requestHash===j.requestHash&&e.key===j.stageId+':'+j.id,'Evidence binding mismatch');
  if(reservation.settled)assert(sha(raw)===reservation.settlement.rawHash,'Raw evidence changed after settlement');
  const response=e.response??{},usage=response.usage,validation=response.status==='ok'?api.validateNativeAnswers(response.answers,JSON.parse(j.body),{distributionPolicy:'bounded_rounding'}):null;
  const usageOk=Number.isSafeInteger(usage?.inputTokens)&&usage.inputTokens>=0&&Number.isSafeInteger(usage?.outputTokens)&&usage.outputTokens>=0;
  const valid=validation?.tag==='ok'&&usageOk&&e.reportedProviderModel===p.policy.model;
  const error=valid?null:response.status!=='ok'?(response.error??'transport_error'):!usageOk?'missing_usage':e.reportedProviderModel!==p.policy.model?'model_version_changed':validation?.error?.code??'invalid_response';
  return {rawHash:sha(raw),e,valid,error,usage:usageOk?usage:null,answers:response.answers??{},latencyMs:response.latencyMs??null};
 }
 function report(stopReason=null){
  const conditions=Object.fromEntries(p.options.layouts.map(layout=>[layout,{id:layout,title:`${p.policy.name} · ${layout}-local`,kind:'workbench',policyId:p.policy.mode,layout,rows:[]} ]));
  for(const j of jobs){const o=observations.get(j.id);const row={id:j.caseId+'__r'+j.repeat,caseId:j.caseId,family:j.group,suite:'workbench',evaluation:clone(j.evaluation??null),policyId:p.policy.mode,conditionId:j.layout,repeat:j.repeat,expected:j.expected,valid:o?.valid===true,status:o?.valid?'ok':o?'invalid_response':'not_dispatched',error:o?.error??null,answers:o?.answers??{},usage:o?.usage??null,latencyMs:o?.latencyMs??null,providerModel:o?.e?.reportedProviderModel??null,source:{requestHash:j.requestHash,rawHash:o?.rawHash??null},plannedRequestHash:j.requestHash};if(row.valid)row.derivedDisposition=deriveDecision(p.policy,row.answers);conditions[j.layout].rows.push(row);}
  for(const c of Object.values(conditions))c.summary=summarize(c.rows);
  const validCalls=[...observations.values()].filter(o=>o.valid).length;
  const known=ownedStages.reduce((n,id)=>n+(ledger.stages[id]?.knownNanoUsd??0),0),held=committed()-known;
  const r={protocol:'policy-workbench-v1',planHash:p.planHash,status:stopReason?'stopped':validCalls===jobs.length?'complete':'partial',stopReason,requestedCalls:jobs.length,validCalls,dispatched:jobs.filter(j=>ledger.reservations[j.stageId+':'+j.id]).length,conditions,
   budget:{bundleKnownUsageUsd:known/1e9,bundleHeldUsd:held/1e9,maximumBundleUsd:p.options.maxUsd,restartKnownUsageUsd:ledger.knownNanoUsd/1e9,restartHeldUsd:ledger.heldNanoUsd/1e9,remainingRestartEnvelopeUsd:(acct.maxNano-ledger.knownNanoUsd-ledger.heldNanoUsd)/1e9},
   design:{pricing:clone(p.pricing),policy:p.policy,policyHash:p.policyHash,catalogHash:p.catalogHash,sourceStamp:p.sourceStamp,coverage:p.coverage,advisor:p.advisor?{mode:p.advisor.mode,reportHash:p.advisor.reportHash??null,planHash:p.advisor.planHash??null,actualUsageUsd:p.advisor.actualUsageUsd??0}:null,application:p.application??null,context:'Associated task-grounded synthetic dossiers; no downstream production agent execution',labels:'Authored fact annotations plus independent specification oracle; not model grading or independent adjudication'},
   limitations:['Synthetic development catalog, not a security certification.','Repetitions and variants of a dossier are dependent.','No payload was admitted to a production agent.','Native disposition and code-derived disposition remain separate.','Current policy and source versions differ from historical admission-v1.']};replaceJson(path.join(out,'report.json'),r);return r;
 }
 // Recover saved responses, but never retry an uncertain dispatch.
 for(const j of jobs){const key=j.stageId+':'+j.id,reservation=ledger.reservations[key];if(!reservation)continue;assert(reservation.requestHash===j.requestHash,'Resume request mismatch');const saved=readRecord(j,reservation);if(!saved){report('uncertain_dispatch_no_automatic_retry');throw Error('Uncertain dispatch '+j.id+'; manual evidence reconciliation required');}observations.set(j.id,saved);if(!reservation.settled)append({type:'settle',key,requestHash:j.requestHash,rawHash:saved.rawHash,usage:saved.usage,providerModel:saved.e.reportedProviderModel??null,failed:!saved.valid,recordedAt:stamp()});}
 const bad=ownedStages.map(id=>ledger.stages[id]?.haltedReason).find(Boolean);if(bad){report(bad);throw Error('This run is halted: '+bad);}
 assert(ledger.knownNanoUsd+ledger.heldNanoUsd+Math.max(0,p.budget.reservationUsd*1e9-committed())<=acct.maxNano,'Shared budget cannot cover this frozen plan reservation');
 let dispatchedNow=0,stopReason=null;
 for(const j of jobs){
  const key=j.stageId+':'+j.id;if(ledger.reservations[key])continue;
  if(shouldStop()){stopReason='operator_stop';break;}if(dispatchedNow>=limit)break;
  const reservationNanoUsd=j.reservationInputTokens*42;
  if(committed()+reservationNanoUsd>Math.floor(p.options.maxUsd*1e9)-Math.round((p.budget.advisorCommittedUsd??0)*1e9)){stopReason='run_budget_exhausted';break;}
  if(ledger.knownNanoUsd+ledger.heldNanoUsd+reservationNanoUsd>acct.maxNano){stopReason='account_budget_exhausted';break;}
  append({type:'reserve',key,stageId:j.stageId,requestHash:j.requestHash,reservationNanoUsd,experimentPlanHash:p.planHash,recordedAt:stamp()});dispatchedNow++;
  onProgress({event:'dispatch',job:j.id,completed:observations.size,planned:jobs.length});
  let evidence;try{evidence=await infer(JSON.parse(j.body));}catch{evidence={response:{status:'error',error:'transport_exception',usage:null},reportedProviderModel:null};}
  immutable(path.join(out,'records',sha(j.id)+'.json'),JSON.stringify({...evidence,key,requestHash:j.requestHash,jobId:j.id,receivedAt:stamp()})+'\n');
  const saved=readRecord(j,ledger.reservations[key]);observations.set(j.id,saved);append({type:'settle',key,requestHash:j.requestHash,rawHash:saved.rawHash,usage:saved.usage,providerModel:saved.e.reportedProviderModel??null,failed:!saved.valid,recordedAt:stamp()});
  onProgress({event:'response',job:j.id,valid:saved.valid,error:saved.error,completed:observations.size,planned:jobs.length,committedUsd:committed()/1e9});
  report();if(!saved.valid||ledger.haltedReason||ledger.stages[j.stageId]?.haltedReason){stopReason=saved.error??ledger.haltedReason??ledger.stages[j.stageId].haltedReason;break;}
  if(intervalMs)await wait(intervalMs);
 }
 const final=report(stopReason);return {report:final,path:path.join(out,'report.json'),dispatchedNow};
}
