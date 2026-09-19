import {validateBudget,validateTokenLimit,coverageBudget} from '../budget.mjs';
import {UNITS,REGISTRY_ID,registryHash,FACETS} from './registry.mjs';
import {validateApplication} from './application.mjs';
import {adviceSummary,validateAdviceReport} from './advisor.mjs';
import {allocateUnits} from './allocate.mjs';
import {CATALOG,catalogHash,expectedFor} from '../catalog.mjs';
import {compileCase} from '../compiler.mjs';
import {validatePolicy,policyId,policyWarnings} from '../policy.mjs';
import {executionSources} from '../sources.mjs';
import {assert,clone,sha,exactKeys} from '../util.mjs';
export function mandatoryUnits(p,a){
 const ids=['ordinary-core','ordinary-syntax','ordinary-identifiers','source-directive','role-spoof','source-self-grant','missing-task','associated-fragments','allowed-format-directive'];
 if(p.requireRelevance)ids.push('task-relevance');
 for(const r of p.representations.prohibited){const m={base_encoding:['encoded-code-literal'],morse:['mixed-grants'],cipher_or_codebook:['opaque-versus-decisive'],unicode_concealment:['unicode-message'],positional:['acrostic-grants','coincidence'],mixed_or_layered:['mixed-grants','layer-grants']};ids.push(...m[r]);}
 if(p.mode==='contextual'){ids.push('context-inheritance');const m={'puzzle-reading':['acrostic-grants'],'legacy-base64':['layer-grants','allowed-format-directive'],'format-analysis':['mixed-grants','opaque-versus-decisive'],'security-sample':['quotation-pair']};for(const e of p.representations.enabledExceptions)ids.push(...m[e]);}
 const known=['en','es','fr','de'];if(p.languages.mode==='any')ids.push('language-en','language-es');else{for(const l of p.languages.allowed)if(known.includes(l))ids.push('language-'+l);const outside=known.find(l=>!p.languages.allowed.includes(l));if(outside)ids.push('language-'+outside);}
 const dom={'incident-review':'receiving','billing-support':'billing','code-review':'review'};
 for(const d of a.focusDomains)ids.push(dom[d]+'-dossier-core');
 if(a.surfaces.includes('retrieved_documents')&&!a.focusDomains.length)ids.push('receiving-dossier-core');
 if(a.surfaces.includes('code'))ids.push('review-dossier-core');
 for(const f of a.requiredFacets){const u=UNITS.filter(u=>u.facets.includes(f)).sort((x,y)=>x.caseIds.length-y.caseIds.length||x.id.localeCompare(y.id))[0];if(u)ids.push(u.id);}
 return [...new Set(ids)];
}
function gapsFor(p,a){const gaps=[];for(const l of p.languages.mode==='allowlist'?p.languages.allowed:[])if(!['en','es','fr','de'].includes(l))gaps.push({kind:'unrepresented_language',id:l,blocking:false,message:`No authored language probes for ${l}; enabling it is not validated by this catalog.`});
 const critical=[...a.requiredFacets];if(a.capabilities.some(c=>['external_actions','sensitive_disclosure'].includes(c)))critical.push('tools_and_disclosure');if(a.capabilities.includes('memory_writes')||a.surfaces.includes('persistent_memory'))critical.push('persistent_state');
 for(const f of new Set(critical))if(!UNITS.some(u=>u.facets.includes(f)))gaps.push({kind:'unsupported_critical_boundary',id:f,blocking:true,message:`No executable contrast group for ${f}. Catalog tagging cannot create missing coverage.`});
 for(const c of a.capabilities.filter(c=>['judging','moderation'].includes(c)))gaps.push({kind:'unsupported_evaluation_adapter',id:c,blocking:true,message:`The admission-only evaluator cannot certify ${c}. The historical catalog needs its separate adapter.`});return gaps;
}
export function assistedOptions(o={}){exactKeys(o,['tier','maxUsd','maxInputTokens','layouts','seed','includeContext','repeat','explorationShare'],'Assisted options');const x={tier:'budget',maxUsd:.15,maxInputTokens:3000000,layouts:['question','criteria'],seed:'coverage-advisor-1',includeContext:true,repeat:1,explorationShare:.15,...o};
 assert(['budget','bronze','silver','gold'].includes(x.tier),'Invalid assisted tier');validateBudget(x.maxUsd);x.maxInputTokens=validateTokenLimit(x.maxInputTokens);assert(Array.isArray(x.layouts)&&x.layouts.length>0&&x.layouts.length<=2&&new Set(x.layouts).size===x.layouts.length&&x.layouts.every(s=>['question','criteria'].includes(s)),'Invalid layouts');assert([1,2,3].includes(x.repeat),'Invalid repeat');assert(typeof x.seed==='string'&&x.seed.length>0&&x.seed.length<200,'Invalid seed');assert(typeof x.includeContext==='boolean','Invalid context option');assert(Number.isFinite(x.explorationShare)&&x.explorationShare>=.05&&x.explorationShare<=.5,'Independent exploration share must be 5–50%');return x;}
export function makeAssistedPlan(policy,application,options={},report=null){
 const p=validatePolicy(policy),a=validateApplication(application),o=assistedOptions(options),sourceFiles=executionSources();
 const advice=report?adviceSummary(report,{policy:p,application:a,mode:'rank'}):null;
 // Ranking is always charged to the original shared account. Its same-workflow cost also consumes this campaign allowance.
 const overheadNano=report?report.budget.knownNanoUsd+report.budget.heldNanoUsd:0;
 const overheadTokens=report?report.budget.inputTokens+report.budget.heldInputTokens:0;
 assert(Number.isSafeInteger(overheadNano)&&overheadNano>=0&&Number.isSafeInteger(overheadTokens)&&overheadTokens>=0,'Invalid advisor overhead');
 const jobMap=new Map();for(const c of CATALOG){if(!o.includeContext&&c.kind==='task-grounded-context')continue;for(let repeat=1;repeat<=o.repeat;repeat++)for(const layout of o.layouts){const r=compileCase(p,c,layout),id=c.id+'__'+layout+'__r'+repeat;jobMap.set(id,{id,caseId:c.id,group:c.group,layout,repeat,sourceVersion:c.sourceVersion,kind:c.kind,requestHash:r.requestHash,wireBytes:r.wireBytes,estimatedInputTokens:r.estimatedInputTokens,reservationInputTokens:r.reservationInputTokens,body:r.body,receipt:r.receipt,expected:expectedFor(p,c)});}}
 const units=UNITS.filter(u=>o.includeContext||!u.domain).map(u=>({...clone(u),jobs:[...new Set(u.caseIds.flatMap(id=>Array.from({length:o.repeat},(_,i)=>o.layouts.map(l=>id+'__'+l+'__r'+(i+1))).flat()))].map(id=>{const j=jobMap.get(id);assert(j,'Missing unit job');return {id,nano:j.reservationInputTokens*42,tokens:j.reservationInputTokens};})}));
 const mandatory=mandatoryUnits(p,a),missingByFilter=mandatory.filter(id=>!units.some(u=>u.id===id));
 const gaps=gapsFor(p,a);for(const id of missingByFilter)gaps.push({kind:'critical_context_excluded',id,blocking:true,message:'Configured critical dossier was excluded by includeContext=false.'});
 const signals=Object.fromEntries((advice?.units??[]).map(u=>[u.unitId,u.signal]));
 const target=o.tier==='budget'||o.tier==='gold'?units.length:Math.ceil(units.length*(o.tier==='bronze'?.05:.2));
 const allocation=allocateUnits(units,{required:mandatory.filter(id=>!missingByFilter.includes(id)),maxNano:Math.max(0,Math.floor(o.maxUsd*1e9)-overheadNano),maxTokens:Math.max(0,o.maxInputTokens-overheadTokens),seed:o.seed,explorationShare:o.explorationShare,targetUnits:target,signals});
 const jobs=allocation.selectedJobIds.map(id=>jobMap.get(id)),cases=[...new Set(jobs.map(j=>j.caseId))],estimated=jobs.reduce((n,j)=>n+j.estimatedInputTokens,0);
 const state=gaps.some(g=>g.blocking)?'insufficient_coverage':allocation.state;
 const manifest={schemaVersion:'workbench-plan/2',protocol:'policy-workbench-v1',policy:p,policyHash:policyId(p),application:a,options:o,catalogId:REGISTRY_ID,catalogHash,registryHash,sourceFiles,sourceStamp:sha(sourceFiles),state,liveCalls:0,
 advisor:advice?{mode:'jev-assisted',reportHash:report.reportHash,planHash:report.manifest.planHash,providerModel:report.manifest.model,complete:advice.complete,actualUsageUsd:report.budget.knownNanoUsd/1e9,report:clone(report)}:{mode:'deterministic-fallback',reason:'No matching advisor evidence supplied; no heuristic is labeled as a Jev result.'},
 pricing:{inputUsdPerMillion:.042,outputUsdPerMillion:0,asOf:'2026-09-18',source:'https://docs.typesafe.ai/models'},
 counts:{catalogCases:new Set(units.flatMap(u=>u.caseIds)).size,catalogGroups:units.length,selectedCases:cases.length,selectedGroups:allocation.selectedUnitIds.length,physicalRequests:jobs.length,independentCasesClaimed:false},
 budget:{...coverageBudget({requestedUsd:o.maxUsd,selectedUsd:(overheadNano+allocation.costNano)/1e9,completeUsd:(overheadNano+[...jobMap.values()].reduce((n,j)=>n+j.reservationInputTokens*42,0))/1e9,selectedTokens:overheadTokens+allocation.tokens,completeTokens:overheadTokens+[...jobMap.values()].reduce((n,j)=>n+j.reservationInputTokens,0),tokenLimit:o.maxInputTokens}),maxUsd:o.maxUsd,maxInputTokens:o.maxInputTokens,estimatedInputTokens:estimated,estimatedUsd:estimated*42/1e9,reservationInputTokens:allocation.tokens,reservationUsd:allocation.costNano/1e9,advisorCommittedUsd:overheadNano/1e9,advisorCommittedInputTokens:overheadTokens,campaignReservationUsd:(overheadNano+allocation.costNano)/1e9,campaignReservationInputTokens:overheadTokens+allocation.tokens,unusedUsd:Math.max(0,o.maxUsd-(overheadNano+allocation.costNano)/1e9),method:'Provider usage for scored advice; conservative bytes+256 reservations for evaluation. Local accounting, not a provider billing guarantee.'},
 coverage:{selection:allocation.selection.map(s=>({...s,group:s.unitId,caseCount:UNITS.find(u=>u.id===s.unitId).caseIds.length,requests:s.addedJobs})),excluded:allocation.excluded,missingMandatory:allocation.missingMandatory,tags:[...new Set(units.filter(u=>allocation.selectedUnitIds.includes(u.id)).flatMap(u=>u.facets))].sort(),caseIds:cases,exploration:allocation.exploration,minimum:allocation.minimum,gaps:[...gaps.map(g=>g.message),...allocation.missingMandatory.length?['Mandatory coverage cannot fit. No paid evaluation may be dispatched.']:[],...(!o.includeContext?['Task-grounded context excluded.']:[]),'Selection tailors a suite, not specimen text or its receiving task. Dossiers remain authored proxies, not validation of arbitrary application semantics.','Confidence means concentration of a provider distribution, not probability that selection is correct. Thresholds/weights are uncalibrated, versioned heuristics.','Budget is a ceiling. Do not invent extra tests or repeat results merely to spend the remainder.','Full means the active 60-case catalog. The 15,120 historical cells are not yet live-compatible with this admission schema.'],structuredGaps:gaps,policyWarnings:policyWarnings(p)},
 jobs:jobs.map(({body,receipt,expected,...j})=>({...j,receiptHash:sha(receipt)}))};
 return {manifest:{...manifest,planHash:sha(manifest)},jobs};
}
export function verifyAssistedPlan(m){const {planHash,...content}=m;assert(sha(content)===planHash,'Plan content hash mismatch');const rebuilt=makeAssistedPlan(m.policy,m.application,m.options,m.advisor?.report??null);assert(rebuilt.manifest.planHash===planHash,'Assisted plan no longer matches source, advisory, or catalog');return rebuilt;}
