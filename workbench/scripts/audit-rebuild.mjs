#!/usr/bin/env node
/** Offline source and evidence comparisons; never reads an account or credentials. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha} from '../src/util.mjs';
import {CATALOG,expectedFor} from '../src/catalog.mjs';
import {preset} from '../src/policy.mjs';
import {compileCase} from '../src/compiler.mjs';
import {loadEvidence,evidenceLibrary} from '../src/evidence-library.mjs';
import {makeAdvisorPlan} from '../src/selection/advisor.mjs';
import {defaultApplication} from '../src/selection/application.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=process.argv.indexOf('--baseline');
assert(index>=0&&process.argv[index+1],'Usage: node scripts/audit-rebuild.mjs --baseline /path/to/unmodified-0.4.1');
const base=path.resolve(process.argv[index+1]);
assert.equal(JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8')).version,'0.4.1');
const baselineManifest=JSON.parse(fs.readFileSync(path.join(base,'file-manifest.json'),'utf8'));
for(const [name,hash] of Object.entries(baselineManifest.files)) assert.equal(sha(fs.readFileSync(path.join(base,name))),hash,'Parent changed: '+name);
const r={version:'0.5.0-rebuilt',scope:'Independent offline comparisons with the supplied 0.4.1 archive',parentFilesVerified:Object.keys(baselineManifest.files).length,paidCalls:0,requestComparisons:0,expectedComparisons:0,unchanged:{},reportBindings:[]};
for(const dir of ['vendor','data']){
 let count=0;const walk=d=>{for(const e of fs.readdirSync(path.join(base,d),{withFileTypes:true})){const f=d+'/'+e.name;if(e.isDirectory())walk(f);else{assert.equal(sha(fs.readFileSync(path.join(root,f))),sha(fs.readFileSync(path.join(base,f))),'Changed retained file: '+f);count++;}}};walk(dir);r.unchanged[dir]=count;
}
const core=['src/policy.mjs','src/catalog.mjs','src/compiler.mjs','src/runner.mjs','src/budget.mjs','src/selection/runner.mjs','src/selection/allocate.mjs','src/history/catalog.mjs','src/history/planner.mjs','src/history/runner.mjs','public/atlas.js','public/atlas-data.js','public/cosmos.js','public/evidence-model.js'];
for(const f of core)assert.equal(sha(fs.readFileSync(path.join(root,f))),sha(fs.readFileSync(path.join(base,f))),f);r.unchanged.namedCore=core;
const pC=await import(pathToFileURL(path.join(base,'src/compiler.mjs'))),pT=await import(pathToFileURL(path.join(base,'src/catalog.mjs'))),pP=await import(pathToFileURL(path.join(base,'src/policy.mjs')));
for(const mode of ['strict','contextual','inspection'])for(const c of CATALOG)for(const layout of ['question','criteria']){
 const old=pT.CATALOG.find(x=>x.id===c.id);assert(old);
 assert.equal(compileCase(preset(mode),c,layout).body,pC.compileCase(pP.preset(mode),old,layout).body);r.requestComparisons++;
 assert.deepEqual(expectedFor(preset(mode),c),pT.expectedFor(pP.preset(mode),old));r.expectedComparisons++;
}
for(const item of evidenceLibrary()){
 const f=item.id==='consumer-admission-v1'?'data/consumer-admission-v1.report.json':'data/history/'+item.id+'.report.json';
 const source=JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),normalized=loadEvidence(item.id);let count=0;
 for(const c of normalized.conditions){
  const raw=source.protocol==='compact-single-pass-48-v1'?(c.id==='compact_control'?source.rows:source.rows.map(x=>x.baseline)):(Array.isArray(source.conditions)?source.conditions.find(x=>x.id===c.id):source.conditions[c.id]).rows;
  assert.equal(c.rows.length,raw.length);
  for(let i=0;i<raw.length;i++){assert.deepEqual(c.rows[i].sourceExpected,raw[i].expected);assert.deepEqual(c.rows[i].rawAnswers,raw[i].answers??{});count++;}
 }
 r.reportBindings.push({id:item.id,rows:count,sourceHash:item.sourceHash,planHash:item.planHash});
}
const p=preset(),a=defaultApplication(p),plan=makeAdvisorPlan(p,a,{mode:'setup',maxUsd:.01,maxInputTokens:null});
r.setup={physicalRequests:plan.jobs.length,questions:Object.keys(plan.jobs[0].request.questions).length,requestHash:plan.jobs[0].requestHash,planHash:plan.manifest.planHash,budget:plan.manifest.budget,sourceStamp:plan.manifest.sourceStamp};
r.totalReportBindings=r.reportBindings.reduce((n,x)=>n+x.rows,0);r.status='passed';
r.note='Displayed rows include references, repeated/derived observations and unattempted historical definitions; not a new paid-call count. Source equality does not validate new setup-model behavior.';
console.log(JSON.stringify(r,null,2));
