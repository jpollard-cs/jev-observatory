import {validateBudget,validateTokenLimit,coverageBudget} from '../budget.mjs';
/** Original evaluations, under their original contracts. No admission-label translation. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateCases, corpusManifest, policyProfileMetadataForVersion} from '../../vendor/original-catalog/harness/corpus.mjs';
import {families} from '../../vendor/original-catalog/cases/families.mjs';
import {extensionFixtures, EXTENSION_DESIGN} from '../../vendor/original-catalog/cases/extension-fixtures.mjs';
import {buildTypeSafeRequest} from '../../vendor/original-catalog/harness/typesafe.mjs';
import {buildExtensionRequestResult} from '../../vendor/original-catalog/harness/domain/extension-questions.mjs';
import {assert, sha, clone, exactKeys} from '../util.mjs';
import {unwrap} from '../../vendor/admission-v1/io.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const frozenRoot=path.join(ROOT,'vendor/original-catalog');
export const REPLAY_MODEL='jev-1.13.0';
export const MATRIX_MANIFEST=corpusManifest();
export const EXTENSION_SUITES=['integrity','judge','moderation','scope'];
export const PRESETS={
 families:{title:'Family sweep',description:'Every original vector family, one archive seed, middle placement, short context, balanced policy and structured questions.',suite:'matrix',seeds:[0],lengths:[512],positions:['middle'],profiles:['balanced'],outputs:['structured'],arms:['policy']},
 contexts:{title:'Context & position sweep',description:'All 18 families across three lengths and three positions, preserving each attack/benign pair.',suite:'matrix',seeds:[0],lengths:[512,4096,16384],positions:['start','middle','end'],profiles:['balanced'],outputs:['structured'],arms:['policy']},
 profiles:{title:'Policy contrast sweep',description:'All 18 families under their original permissive, balanced and strict rules—not the admission presets.',suite:'matrix',seeds:[0],lengths:[512],positions:['middle'],profiles:['permissive','balanced','strict'],outputs:['structured'],arms:['policy']},
 extensions:{title:'Original boundary suites',description:'Four-state integrity, deterministic judging, contextual moderation, and nested authorization scope. Original contrast groups retained.',suite:'extensions',seeds:[0],lengths:[512],positions:['middle'],profiles:['balanced'],outputs:['structured'],arms:['policy']},
 full:{title:'Complete original matrix',description:'All 15,120 original cells, including all output formats, policy profiles, seeds, lengths, positions and eligible prompt arms.',suite:'matrix',seeds:[0,1,2,3],lengths:[512,4096,16384],positions:['start','middle','end'],profiles:['permissive','balanced','strict'],outputs:['binary','scores','structured'],arms:['minimal','policy']},
 all:{title:'Matrix + boundary suites',description:'15,120 original matrix cells plus 64 original extension cases. Both keep their own questions and expectations.',suite:'all',seeds:[0,1,2,3],lengths:[512,4096,16384],positions:['start','middle','end'],profiles:['permissive','balanced','strict'],outputs:['binary','scores','structured'],arms:['minimal','policy']}
};
export function verifyOriginalSources(){
 const spec=JSON.parse(fs.readFileSync(path.join(frozenRoot,'SOURCE.json')));
 for(const [name,hash] of Object.entries(spec.files)) assert(sha(fs.readFileSync(path.join(frozenRoot,name)))===hash,'Original catalog source changed: '+name);
 assert(JSON.stringify(MATRIX_MANIFEST)===JSON.stringify(JSON.parse(fs.readFileSync(path.join(frozenRoot,'data/corpus-manifest.json')))),'Regenerated historical matrix differs from its archived manifest');
 return spec;
}
export function replayOptions(input={}){
 exactKeys(input,['preset','suite','families','extensionSuites','seeds','lengths','positions','profiles','outputs','arms','splits','nativeVersion','maxCalls','maxUsd','selectionSeed','fitBudget'],'Original replay options');
 const p=input.preset??'families';assert(Object.hasOwn(PRESETS,p),'Unknown replay preset');
 const defaults=PRESETS[p];const o={preset:p,suite:defaults.suite,families:families.map(f=>f.id),extensionSuites:[...EXTENSION_SUITES],seeds:[...defaults.seeds],lengths:[...defaults.lengths],positions:[...defaults.positions],profiles:[...defaults.profiles],outputs:[...defaults.outputs],arms:[...defaults.arms],splits:['pilot','calibration','test'],nativeVersion:'policy-v4',maxCalls:15184,maxUsd:.4,selectionSeed:'original-replay-1',fitBudget:false,...clone(input)};
 if(o.suite==='extensions'){for(const k of ['families','seeds','lengths','positions','profiles','outputs','arms'])o[k]=k==='families'?[]:[...PRESETS.extensions[k]];}
 if(o.suite==='matrix')o.extensionSuites=[];
 const arrays={families:families.map(f=>f.id),extensionSuites:EXTENSION_SUITES,seeds:[0,1,2,3],lengths:[512,4096,16384],positions:['start','middle','end'],profiles:['permissive','balanced','strict'],outputs:['binary','scores','structured'],arms:['minimal','policy'],splits:['pilot','calibration','test']};
 for(const [key,values]of Object.entries(arrays)){assert(Array.isArray(o[key])&&new Set(o[key]).size===o[key].length&&o[key].every(v=>values.includes(v)),`Invalid replay ${key}`);if(!['families','extensionSuites'].includes(key))assert(o[key].length>0,`Select at least one ${key}`);}
 assert(['matrix','extensions','all'].includes(o.suite),'Invalid replay suite');
 assert(['policy-v4','advanced-v3','legacy-v2'].includes(o.nativeVersion),'Unsupported original question version');
 assert(Number.isSafeInteger(o.maxCalls)&&o.maxCalls>=2&&o.maxCalls<=15184,'Replay request limit must be 2–15,184');
 validateBudget(o.maxUsd,'Replay planning budget');
 assert(typeof o.selectionSeed==='string'&&o.selectionSeed.length>0&&o.selectionSeed.length<=160,'Invalid selection seed');
 assert(typeof o.fitBudget==='boolean','fitBudget must be boolean');return o;
}
export function *originalCases(options={}){
 const o=replayOptions(options);
 if(o.suite!=='extensions')for(const c of generateCases({contextChars:o.lengths,positions:o.positions,policyProfiles:o.profiles,outputModes:o.outputs,promptArms:o.arms})){
  if(!o.families.includes(c.family)||!o.seeds.includes(c.seed)||!o.splits.includes(c.split))continue;
  yield {kind:'matrix',data:c};
 }
 if(o.suite!=='matrix')for(const f of extensionFixtures())if(o.extensionSuites.includes(f.suite)&&o.splits.includes(f.split))yield {kind:'extension',data:f};
}
export function compileOriginal(item,nativeVersion='policy-v4'){
 const c=item.data;let request,expected,conditionId,pairId,title;
 if(item.kind==='matrix'){
  // Keep original model selector for exact request-body reproduction; check returned pinned model at runtime.
  request=buildTypeSafeRequest(c,'jev-latest',{version:nativeVersion});
  const gold={classification:c.expected.label,attack_probability:c.expected.label==='attack',poison_probability:c.expected.poisoned,policy_decision:c.expected.decision,judge_verdict:c.expected.judgeVerdict};
  for(const id of Object.keys(request.questions))if(id.startsWith('violation_'))gold[id]=c.expected.policyIds.includes(id.slice(10));
  expected=Object.fromEntries(Object.entries(gold).filter(([id])=>Object.hasOwn(request.questions,id)));
  conditionId=['matrix',c.task,c.promptArm,c.policyProfile,c.outputMode].join(':');
  pairId='matrix:'+c.pairId;title=`${c.task} · ${c.policyProfile} · ${c.promptArm} · ${c.outputMode}`;
 }else{
  request=unwrap(buildExtensionRequestResult({fixture:c,model:'jev-latest'}));
  expected=clone(c.expected);conditionId='extension:'+c.suite;pairId='extension:'+c.suite+':'+c.pairId;title=`Original ${c.suite} boundary suite`;
 }
 const body=JSON.stringify(request),bytes=Buffer.byteLength(body);
 const metadata={id:item.kind+':'+c.id,sourceId:c.id,kind:item.kind,pairId,conditionId,conditionTitle:title,family:item.kind==='matrix'?c.family:'extension_'+c.suite,task:item.kind==='matrix'?c.task:c.suite,split:c.split,lineage:c.clusterId??c.lineageId,seed:c.seed??null,position:c.position??null,lengthTarget:c.contextChars??null,promptArm:c.promptArm??null,outputMode:c.outputMode??'native_extension',originalPolicyProfile:c.policyProfile??null,originalExpected:clone(c.expected),expected,requestHash:sha(body),requestBytes:bytes,reservationInputTokens:bytes+256,estimatedInputTokens:Math.ceil(bytes/3),questionCount:Object.keys(request.questions).length,nativeVersion:item.kind==='matrix'?nativeVersion:'release-extension-v1',sourceContextHash:sha(c.context),rationale:c.annotationRationale??'Original synthetic paired fixture. Output/profile/position/archive variants are dependent, not independent attacks.'};
 return {body,request,metadata};
}
export function originalCatalogView(){
 const source=verifyOriginalSources(),extensions=extensionFixtures();
 return {schemaVersion:'original-catalog/1',matrixCells:MATRIX_MANIFEST.cases,extensionCases:extensions.length,totalCells:MATRIX_MANIFEST.cases+extensions.length,semanticLineages:MATRIX_MANIFEST.templateLineages,extensionLineages:EXTENSION_DESIGN.scenarioLineages,sourceContextValues:1296,presets:Object.entries(PRESETS).map(([id,p])=>({id,title:p.title,description:p.description,defaults:{...p}})),families:MATRIX_MANIFEST.families.map(f=>({...f,task:families.find(x=>x.id===f.id)?.judge?'judge':families.find(x=>x.id===f.id)?.policy?'moderation':'classification'})),extensions:EXTENSION_SUITES.map(id=>({id,cases:extensions.filter(f=>f.suite===id).length,groups:new Set(extensions.filter(f=>f.suite===id).map(f=>f.pairId)).size})),defaultOptions:replayOptions(),source,profiles:policyProfileMetadataForVersion('policy-v4'),cautions:['Historical profiles and labels are not the editable admission policy.','Paired transformations, positions, seeds and output modes are correlated cells.','Matrix contexts use repetitive meeting-record padding, not realistic full-window tasks.','Judge and integrity classes remain native judgments, not admission labels.','Rendering HTML source does not measure visual/multimodal attack detection.']};
}
export function originalSpecimen(id,options={}){
 assert(typeof id==='string'&&id.length<=200,'Invalid historical case identity');
 for(const item of originalCases({...options,preset:'all',suite:'all',maxCalls:15184}))if(item.kind+':'+item.data.id===id){const c=compileOriginal(item,options.nativeVersion??'policy-v4');return {available:true,scope:'Exact original source/context and rebuilt native request. No model response has been invented.',metadata:c.metadata,request:c.request};}
 throw Error('Original case was not found in the selected catalog');
}
