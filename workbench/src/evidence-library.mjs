import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importReport} from './report.mjs';
import {sha,assert,clone} from './util.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entries=[
 ['original-campaign','Original campaign · matrix, judging, moderation, integrity & scope','data/history/original-campaign.report.json'],
 ['original-encoding','Original encoding diagnostic · recognition versus classification','data/history/original-encoding.report.json'],
 ['consumer-admission-v1','Consumer admission · inspection / strict / contextual','data/consumer-admission-v1.report.json'],
 ['boundary-fewshot-v2','Boundary + revised examples · historical inspection','data/history/boundary-fewshot-v2.report.json'],
 ['prompt-variant-lab-v1','Prompt variants + decomposition · historical inspection','data/history/prompt-variant-lab-v1.report.json'],
 ['compact-single-pass-48-v1','Compact rerun · historical inspection','data/history/compact-single-pass-48-v1.report.json']
];
const ADMISSION_FIXTURES_SHA256='59065fba5b1cd3de7a334aefddb2622cb2c46d6cc598f0f2374c7b664fec22e3';
const cache=new Map();
export function evidenceLibrary(){return entries.filter(([, ,file])=>fs.existsSync(path.join(root,file))).map(([id,title,file])=>{const raw=fs.readFileSync(path.join(root,file),'utf8'),r=JSON.parse(raw);return {id,title,protocol:r.protocol,status:r.status,sourceHash:sha(raw),planHash:r.planHash,requestedCalls:r.requestedCalls};});}
export function loadEvidence(id){const e=entries.find(e=>e[0]===id);assert(e,'Unknown recorded run');if(!cache.has(id)){const raw=fs.readFileSync(path.join(root,e[2]),'utf8');cache.set(id,importReport(raw,{sourceName:e[1]}));}return clone(cache.get(id));}
/** Fetch only a version-matched archived specimen; never substitute the editable catalog. */
export function evidenceSpecimen({protocol,planHash,caseId,condition,id,requestHash}){
 const r=loadEvidence('consumer-admission-v1');
 if(protocol!==r.protocol||planHash!==r.planHash)return {available:false,reason:'No version-matched archived source is registered for this run. Inspect the original request record; no current-catalog specimen substituted.'};
 const recorded=r.conditions.find(c=>c.id===condition)?.rows.find(x=>x.id===id&&x.caseId===caseId&&x.plannedRequestHash===requestHash);
 if(!recorded)return {available:false,reason:'The selected row is not bound to a matching request in the archived admission report. No source specimen substituted.'};
 const fixtureBytes=fs.readFileSync(path.join(root,'vendor/admission-v1/assets/fixtures.json'));
 if(sha(fixtureBytes)!==ADMISSION_FIXTURES_SHA256)return {available:false,reason:'Archived fixture snapshot differs from the bound release. No source specimen substituted.'};
 const fixtures=JSON.parse(fixtureBytes.toString('utf8'));
 const f=fixtures.find(f=>f.id===caseId);
 if(!f)return {available:false,reason:'Historical control specimen is not in the admission fixture snapshot. Use its recorded request hash in the original run directory.'};
 return {available:true,source:'Frozen consumer-admission-v1/assets/fixtures.json',sourceFixtureHash:sha(f),scope:'Exact base specimen and authored context, before padding/context-resolution. Not a reconstruction of the entire wire request.',material:clone(f.material),context:clone(f.context),contextPlacement:f.contextPlacement??'entry'};
}
