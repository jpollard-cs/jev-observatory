import {coverageBudget} from '../budget.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {replayOptions,originalCases,compileOriginal,verifyOriginalSources,MATRIX_MANIFEST,REPLAY_MODEL} from './catalog.mjs';
import {executionSources,PACKAGE_ROOT} from '../sources.mjs';
import {sha,assert,clone} from '../util.mjs';
import {immutable,immutableJson} from '../../vendor/admission-v1/io.mjs';
export const REPLAY_PROTOCOL='original-evaluation-v1';
function sources(){return {...executionSources(),'replay.mjs':sha(fs.readFileSync(path.join(PACKAGE_ROOT,'replay.mjs')))};}
export function makeReplayPlan(input={}){
 const options=replayOptions(input);const source=verifyOriginalSources();const groups=new Map();
 for(const item of originalCases(options)){
  const {metadata:m}=compileOriginal(item,options.nativeVersion);
  if(!groups.has(m.pairId))groups.set(m.pairId,{id:m.pairId,family:m.family,members:[],cost:0});
  const g=groups.get(m.pairId);g.members.push(m);g.cost+=(m.reservationInputTokens*42)/1e9;
 }
 const ordered=[...groups.values()].sort((a,b)=>sha(options.selectionSeed+':'+a.id).localeCompare(sha(options.selectionSeed+':'+b.id)));
 // One complete contrast per selected family/suite is a coverage floor. Never select a half pair/quartet.
 const seen=new Set(),minimum=[],remaining=[];
 for(const g of ordered){if(!seen.has(g.family)){minimum.push(g);seen.add(g.family);}else remaining.push(g);}
 const minCalls=minimum.reduce((s,g)=>s+g.members.length,0),minCost=minimum.reduce((s,g)=>s+g.cost,0);
 const impossible=minCalls>options.maxCalls||(options.fitBudget&&minCost>options.maxUsd);
 const selected=[],excluded=[];let cells=0,reserved=0;
 for(const g of [...minimum,...remaining]){
  const why=impossible?'minimum_coverage_does_not_fit':cells+g.members.length>options.maxCalls?'request_limit':options.fitBudget&&reserved+g.cost>options.maxUsd?'conservative_budget_limit':null;
  if(why){excluded.push({groupId:g.id,family:g.family,cases:g.members.length,reason:why});continue;}
  selected.push(g);cells+=g.members.length;reserved+=g.cost;
 }
 const jobs=selected.flatMap(g=>g.members);
 const estimated=jobs.reduce((s,j)=>s+j.estimatedInputTokens,0),reservationTokens=jobs.reduce((s,j)=>s+j.reservationInputTokens,0);
 const by=(key)=>Object.fromEntries([...new Set(jobs.map(j=>j[key]))].map(k=>[k,jobs.filter(j=>j[key]===k).length]));
 const sourceFiles=sources();
 const manifest={schemaVersion:'original-replay-plan/1',protocol:REPLAY_PROTOCOL,options,requiredProviderModel:REPLAY_MODEL,modelSelector:'jev-latest',state:impossible?'insufficient_budget':jobs.length===0?'empty':estimated*42/1e9>options.maxUsd?'budget_limited':'prepared',sourceFiles,sourceStamp:sha(sourceFiles),originalSource:source,originalCorpusHash:sha(MATRIX_MANIFEST),jobs,
  counts:{eligibleCells:[...groups.values()].reduce((s,g)=>s+g.members.length,0),selectedCells:jobs.length,selectedGroups:selected.length,availableGroups:groups.size,minimumCells:minCalls,families:by('family'),tasks:by('task'),lineages:[...new Set(jobs.map(j=>j.lineage))].length,physicalRequests:jobs.length},
  budget:{...coverageBudget({requestedUsd:options.maxUsd,selectedUsd:reservationTokens*42/1e9,completeUsd:[...groups.values()].reduce((n,g)=>n+g.cost,0),selectedTokens:reservationTokens,completeTokens:[...groups.values()].reduce((n,g)=>n+g.members.reduce((t,m)=>t+m.reservationInputTokens,0),0),tokenLimit:Number.MAX_SAFE_INTEGER}),maximumUsd:options.maxUsd,estimatedInputTokens:estimated,estimatedUsd:estimated*42/1e9,conservativePlanningTokens:reservationTokens,conservativePlanningUsd:reservationTokens*42/1e9,minimumPlanningUsd:minCost,method:'Forecast bytes/3; reserve bytes+256 for each in-flight request. Not a tokenizer or invoice guarantee.',execution:'The shared ledger and this run budget limit every dispatch. Without fitBudget, a complete catalog plan can stop partway at its budget; unrun cases remain untested.'},
  coverage:{minimumCovered:!impossible&&jobs.length>0,excluded,policyMeaning:'Original native contracts only; current admission-editor settings are not used.',expectedMeaning:'Original authored annotations, projected only onto questions actually asked. No expected Score accuracy is invented.',independentCells:false,sourcePadding:'Original matrix uses synthetic meeting-record padding. Extensions retain their original message/resource distractors.'}};
 manifest.planHash=sha(manifest);return {manifest};
}
export function verifyReplayPlan(manifest){
 assert(manifest?.schemaVersion==='original-replay-plan/1','Not an original replay plan');const copy=clone(manifest);delete copy.planHash;assert(sha(copy)===manifest.planHash,'Replay manifest hash mismatch');
 const rebuilt=makeReplayPlan(manifest.options);assert(rebuilt.manifest.planHash===manifest.planHash,'Replay sources, catalog, or options changed. Use the matching source version; do not edit the old plan.');return rebuilt;
}
export function *replayJobs(manifest){
 const byId=new Map(manifest.jobs.map(j=>[j.id,j]));
 for(const item of originalCases(manifest.options)){
  const id=item.kind+':'+item.data.id;if(!byId.has(id))continue;
  const built=compileOriginal(item,manifest.options.nativeVersion),m=byId.get(id);
  assert(built.metadata.requestHash===m.requestHash&&sha(built.metadata)===sha(m),'Rebuilt replay job differs from plan');yield {...built,metadata:m};
 }
}
/** Save request bytes incrementally; do not hold 15,120 full prompts in a manifest. */
export function freezeReplay(prepared,directory){
 const p=prepared.manifest;verifyReplayPlan(p);const out=path.resolve(directory);
 for(const j of replayJobs(p))immutable(path.join(out,'requests',j.metadata.requestHash+'.json'),j.body);
 immutableJson(path.join(out,'evaluation-only.json'),Object.fromEntries(p.jobs.map(j=>[j.id,j.expected])));
 for(const [name,hash]of Object.entries(p.sourceFiles)){const bytes=fs.readFileSync(path.join(PACKAGE_ROOT,name));assert(sha(bytes)===hash,'Sources changed while saving');immutable(path.join(out,'source',name),bytes.toString('utf8'));}
 immutableJson(path.join(out,'manifest.json'),p);return {directory:out,planPath:path.join(out,'manifest.json'),planHash:p.planHash,liveCalls:0};
}
export function loadReplay(file){
 const manifest=JSON.parse(fs.readFileSync(file,'utf8'));verifyReplayPlan(manifest);const directory=path.dirname(path.resolve(file));
 for(const j of manifest.jobs){const wire=fs.readFileSync(path.join(directory,'requests',j.requestHash+'.json'));assert(sha(wire)===j.requestHash,'Saved replay payload changed');}
 return {manifest,directory};
}
