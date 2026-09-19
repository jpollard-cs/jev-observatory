#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {spawnSync} from 'node:child_process';
import {importJevRequest,render,validateDocument,loadWorkspace,jsonHash,sha256,exampleAssignmentSignature} from './src/index.mjs';
import {insist} from './src/core.mjs';
const BASE=path.dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx'});};
const profiles=()=>fs.readdirSync(path.join(BASE,'profiles')).filter(n=>n.endsWith('.json')).map(n=>read(path.join(BASE,'profiles',n)));
function sourceFiles(){
 const result={};
 function walk(dir){for(const e of fs.readdirSync(path.join(BASE,dir),{withFileTypes:true})){const rel=path.posix.join(dir,e.name);if(e.isDirectory())walk(rel);else if(e.isFile())result[rel]=sha256(fs.readFileSync(path.join(BASE,rel)));}}
 for(const d of ['src','adapters','assets','profiles','schemas'])walk(d);
 result['cli.mjs']=sha256(fs.readFileSync(fileURLToPath(import.meta.url)));return result;
}
const HELP=`Policy Payload Compiler 0.1.0 — OFFLINE ONLY

node cli.mjs prepare [--project PATH] [--condition restored_open_set]
  [--suite regression|boundary] [--profiles id,id | --all-profiles] [--out PATH]
node cli.mjs import --input request.json --out document.json
node cli.mjs render --input document.json --profile profile.json --out NEW_DIRECTORY
  [--allow-policy-omissions]
node cli.mjs profiles
node cli.mjs self-check

Default prepare profiles: jev-legacy,jev-question-examples,jev-criteria-examples.
The project is read-only. No .env, API client, ledger or live-run module is loaded.
prepare emits all request bodies and source/placement receipts, not a live test run.
There is deliberately no --live option. Existing output paths are never overwritten.
`;
async function main(){
 const command=process.argv[2]??'help';
 const {values}=parseArgs({args:process.argv.slice(3),strict:true,options:{project:{type:'string'},condition:{type:'string'},suite:{type:'string'},profiles:{type:'string'},'all-profiles':{type:'boolean'},out:{type:'string'},input:{type:'string'},profile:{type:'string'},'allow-policy-omissions':{type:'boolean'}}});
 if(command==='help'){console.log(HELP);return;}
 if(command==='profiles'){console.log(JSON.stringify(profiles(),null,2));return;}
 if(command==='self-check'){
  const r=spawnSync(process.execPath,['--test',...fs.readdirSync(path.join(BASE,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>path.join(BASE,'tests',f))],{stdio:'inherit',cwd:BASE,env:process.env});process.exitCode=r.status??1;return;
 }
 if(command==='import'){
  insist(values.input&&values.out,'input_and_out_required');
  const doc=importJevRequest(read(values.input));write(values.out,doc);
  console.log(JSON.stringify({status:'imported_offline',sourceRequestHash:doc.provenance.sourceRequestHash,out:values.out},null,2));return;
 }
 if(command==='render'){
  insist(values.input&&values.out&&values.profile,'input_profile_out_required');
  const doc=read(values.input);validateDocument(doc);const result=render(doc,read(values.profile),{allowPolicyOmissions:!!values['allow-policy-omissions']});
  insist(!fs.existsSync(values.out),'output_already_exists');fs.mkdirSync(values.out,{recursive:true});
  for(const [i,r]of result.requests.entries())write(path.join(values.out,`request-${i+1}.json`),r.body);
  write(path.join(values.out,'receipt.json'),result.receipt);
  console.log(JSON.stringify({status:'rendered_offline',requests:result.requests.length,out:values.out},null,2));return;
 }
 insist(command==='prepare','unknown_command');
 insist(!values.profile&&!values.input,'unexpected_import_options');
 const project=path.resolve(values.project??path.join(os.homedir(),'Documents/Codex/2026-09-16/i-g/outputs/jev-redteam'));
 const condition=values.condition??'restored_open_set',suite=values.suite??'regression';
 const available=profiles();
 insist(!(values['all-profiles']&&values.profiles),'profile_selection_conflict');
 const wanted=values['all-profiles']?available.map(p=>p.id):(values.profiles??'jev-legacy,jev-question-examples,jev-criteria-examples').split(',');
 insist(new Set(wanted).size===wanted.length,'duplicate_profile');
 const selected=wanted.map(id=>{const p=available.find(p=>p.id===id);insist(p,'unknown_profile',{id});return p;});
 const workspace=await loadWorkspace({project,packageRoot:BASE,condition,suite});
 const packageFiles=sourceFiles();
 const identity=jsonHash({compiler:'0.1.0',packageFiles,sourceBindings:workspace.sourceBindings,condition,suite,profiles:selected});
 const out=path.resolve(values.out??path.join(BASE,'rendered',`${condition}-${suite}-${identity.slice(0,12)}`));
 insist(!fs.existsSync(out),'output_already_exists',{out});
 const products=workspace.rows.map((row,i)=>{
  const document=importJevRequest(row.request);
  const rendered=selected.map(p=>({profile:p,result:render(document,p,{allowPolicyOmissions:!!values['allow-policy-omissions']})}));
  const a=rendered.find(x=>x.profile.id==='jev-question-examples'),b=rendered.find(x=>x.profile.id==='jev-criteria-examples');
  if(a&&b)insist(exampleAssignmentSignature(a.result)===exampleAssignmentSignature(b.result),'placement_pair_example_evidence_changed');
  return {id:`case-${String(i+1).padStart(4,'0')}`,document,evaluationOnly:row.evaluationOnly,rendered};
 });
 fs.mkdirSync(out,{recursive:true});
 const policyPacks=new Set(),manifestRows=[],totals={};
 for(const p of products){
  const packHash=jsonHash(p.document.policyPack);if(!policyPacks.has(packHash)){write(path.join(out,'policy-packs',`${packHash}.json`),p.document.policyPack);policyPacks.add(packHash);}
  const {policyPack,...instance}=p.document;write(path.join(out,'instances',`${p.id}.json`),{...instance,policyPackHash:packHash});
  for(const {profile,result}of p.rendered){
   const rel=`receipts/${profile.id}/${p.id}.json`;write(path.join(out,rel),result.receipt);
   const outputs=result.requests.map((r,i)=>{
    const f=`payloads/${profile.id}/${p.id}-${i+1}.json`;write(path.join(out,f),r.body);
    return {path:f,wireHash:r.wireHash,wireBytes:r.wireBytes,questionIds:r.questionIds,inputTokens:null};
   });
   const t=totals[profile.id]??={cases:0,physicalRequests:0,wireBytes:0};t.cases++;t.physicalRequests+=outputs.length;t.wireBytes+=result.receipt.totalWireBytes;
   manifestRows.push({caseKey:p.id,profileId:profile.id,assessmentHash:result.receipt.assessmentHash,profileHash:result.receipt.profileHash,receipt:rel,exactLegacyWireMatch:result.receipt.exactLegacyWireMatch,outputs});
  }
 }
 write(path.join(out,'evaluation-only.json'),products.map(p=>({caseKey:p.id,...p.evaluationOnly})));
 const manifest={schemaVersion:'payload-matrix/1',compilerVersion:'0.1.0',buildIdentity:identity,status:'prepared_offline',liveCalls:0,
   condition,suite,sourceBindings:workspace.sourceBindings,packageFiles,profiles:selected,caseCount:products.length,policyPackCount:policyPacks.size,totals,rows:manifestRows,
   boundaries:{credentialsRead:false,projectWritten:false,ledgerTouched:false,materialDecoded:false,labelsFile:'evaluation-only.json',evaluationLabelsInPayloads:false},
   interpretation:['Criteria-local versus question-local holds per-question example content and labels fixed; their placement and associated JSON scaffolding differ.',
     'Legacy shared corpus versus resolved examples also changes indirection and the explicit profile/default-context resolution and grouping; do not call that a pure placement ablation.',
     'Guidance remains complete and verbatim by default. Slicing and reformatting are not automatic policy summarization or a proof of semantic equivalence.',
     'The generic chat output is a message plan, not a provider-specific HTTP request. Jev payloads were not sent to validate service acceptance.',
     'Input tokens, prices and performance are unmeasured. Keep model-native answers, generation-derived numbers and errors distinguishable.']};
 write(path.join(out,'manifest.json'),manifest);
 console.log(JSON.stringify({status:'prepared_offline',liveCalls:0,out,caseCount:products.length,policyPackCount:policyPacks.size,totals,
  next:'Inspect manifest.json and payloads. Submit through the existing budgeted harness only under a new, separately authorized run identity.'},null,2));
}
main().catch(error=>{console.error(JSON.stringify({status:'failed_before_inference',error:error.code??error.message,details:error.details??{}},null,2));process.exitCode=1;});
