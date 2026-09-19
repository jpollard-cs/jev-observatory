#!/usr/bin/env node
/** Offline 0.4.1 regression audit. --baseline is an extracted, unmodified 0.4 release. No provider calls. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CATALOG,expectedFor} from '../src/catalog.mjs';
import {preset} from '../src/policy.mjs';
import {compileCase} from '../src/compiler.mjs';
import {loadEvidence,evidenceLibrary} from '../src/evidence-library.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const i=process.argv.indexOf('--baseline');
const result={version:'0.4.1',providerCalls:0,currentCatalog:CATALOG.length,requestComparisons:0,expectedComparisons:0,reportBindings:[]};
if(i>=0){
 const base=path.resolve(process.argv[i+1]);
 assert.equal(JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8')).version,'0.4.0');
 const previousCompile=await import(pathToFileURL(path.join(base,'src/compiler.mjs')));
 const previousCatalog=await import(pathToFileURL(path.join(base,'src/catalog.mjs')));
 const previousPolicy=await import(pathToFileURL(path.join(base,'src/policy.mjs')));
 for(const mode of ['strict','contextual','inspection'])for(const c of CATALOG)for(const layout of ['question','criteria']){
  const pc=previousCatalog.CATALOG.find(x=>x.id===c.id);assert(pc,c.id);
  const a=compileCase(preset(mode),c,layout),b=previousCompile.compileCase(previousPolicy.preset(mode),pc,layout);
  assert.equal(a.body,b.body,`Request changed: ${mode}/${c.id}/${layout}`);result.requestComparisons++;
  assert.deepEqual(expectedFor(preset(mode),c),previousCatalog.expectedFor(previousPolicy.preset(mode),pc),`Expectations changed: ${mode}/${c.id}`);result.expectedComparisons++;
 }
}
for(const item of evidenceLibrary()){
 const file=item.id==='consumer-admission-v1'?'data/consumer-admission-v1.report.json':'data/history/'+item.id+'.report.json';
 const source=JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),normalized=loadEvidence(item.id);let count=0;
 for(const c of normalized.conditions){
  const raw=source.protocol==='compact-single-pass-48-v1'?(c.id==='compact_control'?source.rows:source.rows.map(x=>x.baseline)):(Array.isArray(source.conditions)?source.conditions.find(x=>x.id===c.id):source.conditions[c.id]).rows;
  assert.equal(c.rows.length,raw.length,item.id+'/'+c.id);
  for(let j=0;j<c.rows.length;j++){
   assert.deepEqual(c.rows[j].sourceExpected,raw[j].expected,item.id+'/'+c.id+'/'+j+' gold');
   assert.deepEqual(c.rows[j].rawAnswers,raw[j].answers??{},item.id+'/'+c.id+'/'+j+' response');count++;
  }
 }
 result.reportBindings.push({id:item.id,rows:count,sourceHash:item.sourceHash,planHash:item.planHash});
}
result.status='passed';result.totalReportBindings=result.reportBindings.reduce((n,r)=>n+r.rows,0);
result.note='Report display rows include historical references, reused evidence and unattempted plans. They are not all unique successful provider calls.';
console.log(JSON.stringify(result,null,2));
