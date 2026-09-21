import {ATTACK_PACKS} from './attacks/promptfoo.mjs';
import {validateBudget,validateTokenLimit,coverageBudget} from './budget.mjs';
import {executionSources} from './sources.mjs';
import {verifyAssistedPlan} from './selection/planner.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CATALOG,CATALOG_ID,catalogHash,expectedFor} from './catalog.mjs';
import {compileCase} from './compiler.mjs';
import {validatePolicy,policyId,policyWarnings} from './policy.mjs';
import {sha,assert,clone,exactKeys,enumValue} from './util.mjs';
export const PLANNER_VERSION='coverage-prefix/1';
const FRACTIONS={bronze:.05,silver:.20,gold:1};
const CORE=['ordinary-use','source-control','uncertainty'];
export function validateOptions(o={}){
 exactKeys(o,['tier','maxUsd','maxInputTokens','layouts','seed','includeContext','repeat','attackPacks'],'Plan settings');
 const x={tier:'bronze',maxUsd:.15,maxInputTokens:3_000_000,layouts:['question','criteria'],seed:'workbench-1',includeContext:true,repeat:1,attackPacks:ATTACK_PACKS.map(p=>p.id),...o};
 assert(Array.isArray(x.attackPacks)&&new Set(x.attackPacks).size===x.attackPacks.length&&x.attackPacks.every(id=>ATTACK_PACKS.some(p=>p.id===id)),'Unknown attack pack');
 enumValue(x.tier,Object.keys(FRACTIONS),'Tier');validateBudget(x.maxUsd);
 x.maxInputTokens=validateTokenLimit(x.maxInputTokens);
 assert(Array.isArray(x.layouts)&&x.layouts.length>=1&&x.layouts.length<=2&&new Set(x.layouts).size===x.layouts.length&&x.layouts.every(l=>['question','criteria'].includes(l)),'Choose question, criteria or both layouts');
 assert(typeof x.seed==='string'&&x.seed.length>0&&x.seed.length<200,'Seed required');assert(typeof x.includeContext==='boolean','includeContext must be boolean');
 assert([1,2,3].includes(x.repeat),'Repeat must be 1, 2 or 3');return x;
}
/** Seeded nested group prefix. Gold labels never influence ordering or usefulness. */
export function makePlan(policy,options={}){
 const p=validatePolicy(policy),o=validateOptions(options);
 const candidates=CATALOG.filter(c=>(!c.pack||o.attackPacks.includes(c.pack))&&(o.includeContext||c.kind!=='task-grounded-context'));
 const groups=[...new Set(candidates.map(c=>c.group))];
 const mandatory=[...CORE];
 if(p.representations.prohibited.length)mandatory.push('technical-boundaries');
 if(p.representations.prohibited.some(x=>['base_encoding','morse','cipher_or_codebook','mixed_or_layered'].includes(x)))mandatory.push('mixed-boundaries');
 if(p.representations.prohibited.includes('positional'))mandatory.push('acrostic-boundaries');
 if(p.representations.prohibited.includes('unicode_concealment'))mandatory.push('unicode-boundaries');
 if(p.mode==='contextual'){mandatory.push('context-inheritance');const modules={'puzzle-reading':['acrostic-boundaries'],'legacy-base64':['allowed-format-attack','layer-boundaries'],'format-analysis':['mixed-boundaries','uncertainty'],'security-sample':['quotation-boundaries']};for(const id of p.representations.enabledExceptions)mandatory.push(...modules[id]);}
 if(p.languages.mode==='allowlist')mandatory.push('language-en',...p.languages.allowed.filter(l=>['es','fr','de'].includes(l)).map(l=>'language-'+l));
 // Always include an out-of-allowlist probe when possible, rather than omit it as irrelevant.
 if(p.languages.mode==='allowlist'){const outside=['es','fr','de','en'].find(l=>!p.languages.allowed.includes(l));if(outside)mandatory.push('language-'+outside);}
 if(p.languages.mode==='any')mandatory.push('language-en','language-es');
 const core=[...new Set(mandatory)].filter(g=>groups.includes(g));
 const rest=groups.filter(g=>!core.includes(g)).sort((a,b)=>sha(o.seed+':'+a).localeCompare(sha(o.seed+':'+b)));
 // Greedy coverage is explicit and deterministic: prefer unseen taxonomy tags, tie-break by seed.
 let remaining=[...rest],ordered=[...core],covered=new Set(candidates.filter(c=>core.includes(c.group)).flatMap(c=>c.tags));
 while(remaining.length){remaining.sort((a,b)=>{
  const count=g=>new Set(candidates.filter(c=>c.group===g).flatMap(c=>c.tags).filter(t=>!covered.has(t))).size;
  return count(b)-count(a)||sha(o.seed+':'+a).localeCompare(sha(o.seed+':'+b));});
  const g=remaining.shift();ordered.push(g);candidates.filter(c=>c.group===g).flatMap(c=>c.tags).forEach(t=>covered.add(t));}
 const fractionGroups=Math.ceil(groups.length*FRACTIONS[o.tier]);
 const target=o.tier==='gold'?groups.length:Math.min(groups.length,Math.max(core.length+(o.tier==='silver'?3:0),fractionGroups));
 const selected=[],selection=[],jobs=[],excluded=[];let reservedTokens=0,forecastTokens=0;
 const maxNano=Math.floor(o.maxUsd*1e9);
 let budgetHit=false;
 for(const [rank,g]of ordered.entries()){
  const cs=candidates.filter(c=>c.group===g),reason=core.includes(g)?'mandatory boundary contrast group':'seeded coverage expansion';
  if(rank>=target||budgetHit){excluded.push({group:g,reason:budgetHit?'Budget prefix exhausted; whole contrast group retained as untested':'Outside selected tier',caseCount:cs.length});continue;}
  const local=[];
  for(let repetition=1;repetition<=o.repeat;repetition++)for(const c of cs){
   const order=(selected.length+cs.indexOf(c)+repetition)%2?[...o.layouts].reverse():o.layouts;
   for(const layout of order){const rendered=compileCase(p,c,layout);
    local.push({id:`${c.id}__${layout}__r${repetition}`,caseId:c.id,group:g,layout,repeat:repetition,sourceVersion:c.sourceVersion,kind:c.kind,evaluation:clone(c.evaluation??null),
     requestHash:rendered.requestHash,wireBytes:rendered.wireBytes,estimatedInputTokens:rendered.estimatedInputTokens,reservationInputTokens:rendered.reservationInputTokens,
     body:rendered.body,receipt:rendered.receipt,expected:expectedFor(p,c)});
   }
  }
  const reserve=local.reduce((n,j)=>n+j.reservationInputTokens,0),estimate=local.reduce((n,j)=>n+j.estimatedInputTokens,0);
  if((reservedTokens+reserve)*42>maxNano||reservedTokens+reserve>o.maxInputTokens){budgetHit=true;excluded.push({group:g,reason:'Whole group exceeds remaining conservative reservation budget',caseCount:cs.length});continue;}
  reservedTokens+=reserve;forecastTokens+=estimate;selected.push(...cs.map(c=>c.id));jobs.push(...local);selection.push({group:g,reason,rank,mandatory:core.includes(g),caseCount:cs.length,requests:local.length,estimatedInputTokens:estimate,reservedInputTokens:reserve});
 }
 const missingMandatory=core.filter(g=>!selection.some(s=>s.group===g)),coverageTags=[...new Set(candidates.filter(c=>selected.includes(c.id)).flatMap(c=>c.tags))].sort();
 const gaps=[];
 if(missingMandatory.length)gaps.push('Budget cannot cover mandatory groups: '+missingMandatory.join(', ')+'. This plan cannot be dispatched.');
 if(target>fractionGroups&&o.tier!=='gold')gaps.push(`Minimum coverage overrides the ${FRACTIONS[o.tier]*100}% target for this small catalog.`);
 if(budgetHit)gaps.push('The requested tier is budget-limited. This is NOT full catalog coverage.');
 if(!o.includeContext)gaps.push('Task-grounded contexts excluded; no context robustness claim.');
 if(o.includeContext&&!selection.some(s=>s.group.startsWith('context-')))gaps.push('No task-grounded dossier fits this selected prefix; context robustness remains untested.');
 gaps.push('New catalog cases are authored development probes. Gold means the selected catalog version, not all possible attacks.');
 gaps.push('Catalog scenarios provide their own task contexts. The custom task description is exported for your application but is NOT automatically validated by this synthetic catalog.');
 if(p.languages.mode==='any')gaps.push('Any-language policy; language probes cover only en, es, fr and de, not all human languages.');
 const fullTokens=candidates.reduce((n,c)=>n+o.layouts.reduce((t,l)=>t+compileCase(p,c,l).reservationInputTokens*o.repeat,0),0);
 const sourceFiles=executionSources();
 const sourceStamp=sha(sourceFiles);
 const manifest={schemaVersion:'workbench-plan/1',protocol:'policy-workbench-v1',policy:p,policyHash:policyId(p),options:o,catalogId:CATALOG_ID,catalogHash,sourceStamp,
  sourceFiles,state:missingMandatory.length?'insufficient_budget':budgetHit?'budget_limited':'prepared_offline',liveCalls:0,pricing:{inputUsdPerMillion:.042,outputUsdPerMillion:0,asOf:'2026-09-18',source:'https://docs.typesafe.ai/models',scope:'Frozen local accounting, not a provider invoice'},
  counts:{catalogCases:candidates.length,catalogGroups:groups.length,selectedCases:selected.length,selectedGroups:selection.length,physicalRequests:jobs.length,independentCasesClaimed:false},
  budget:{...coverageBudget({requestedUsd:o.maxUsd,selectedUsd:reservedTokens*42/1e9,completeUsd:fullTokens*42/1e9,selectedTokens:reservedTokens,completeTokens:fullTokens,tokenLimit:o.maxInputTokens}),maxUsd:o.maxUsd,maxInputTokens:o.maxInputTokens,estimatedInputTokens:forecastTokens,estimatedUsd:forecastTokens*42/1e9,reservationInputTokens:reservedTokens,reservationUsd:reservedTokens*42/1e9,method:'Forecast = serialized UTF-8 bytes / 3. Reservation = bytes + 256 per request. Neither is a vendor tokenizer.'},
  coverage:{selection,excluded,missingMandatory,tags:coverageTags,gaps,policyWarnings:policyWarnings(p),caseIds:selected},
  jobs:jobs.map(({body,receipt,expected,...j})=>({...j,receiptHash:sha(receipt)}))};
 return {manifest:{...manifest,planHash:sha(manifest)},jobs};
}
export function verifyPlan(plan){if(plan.schemaVersion==='workbench-plan/2')return verifyAssistedPlan(plan);const {planHash,...rest}=plan;assert(sha(rest)===planHash,'Plan content hash mismatch');const rebuilt=makePlan(plan.policy,plan.options);assert(rebuilt.manifest.planHash===planHash,'Plan no longer matches this compiler/catalog; re-prepare deliberately');return rebuilt;}

export {executionSources} from './sources.mjs';
