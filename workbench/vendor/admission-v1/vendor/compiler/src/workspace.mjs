import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha256,insist} from './core.mjs';
import {buildVariantRequest,loadAssets,CONDITIONS} from '../adapters/frozen-v2/variants.mjs';
import {buildCases} from '../adapters/frozen-v2/cases.mjs';

/** Read-only bridge to the actual legacy source. Does not load provider, ledger, .env or network code. */
export async function loadWorkspace({project,packageRoot,condition='restored_open_set',suite='regression'}){
 insist(['regression','boundary'].includes(suite),'unknown_suite');
 const definition=CONDITIONS.find(c=>c.id===condition);insist(definition,'unknown_source_condition',{condition});
 const bindings=JSON.parse(fs.readFileSync(path.join(packageRoot,'assets/project-bindings.json'),'utf8'));
 for(const [file,hash]of Object.entries(bindings)){
  const p=path.join(project,file);insist(fs.existsSync(p),'project_source_missing',{file});
  insist(sha256(fs.readFileSync(p))===hash,'project_source_changed',{file});
 }
 // This module's three-file dependency closure was inspected and is hash-bound above.
 const api=await import(pathToFileURL(path.join(project,'harness/domain/rich-pilot-request.mjs')).href);
 const sourceResult=api.buildRichPilotPlan({templateText:fs.readFileSync(path.join(project,'policies/prompt-injection-policy-template.md'),'utf8'),model:'jev-latest'});
 insist(sourceResult.tag!=='error','legacy_case_builder_failed',{error:sourceResult.error});
 const source=sourceResult.value,assets=loadAssets(packageRoot);
 const anchors=JSON.parse(fs.readFileSync(path.join(packageRoot,'assets/historical-token-anchors.json'),'utf8'));
 insist(source.rows.length===48,'legacy_case_count_changed');
 for(const row of source.rows)insist(sha256(JSON.stringify(row.request))===anchors[row.id].requestHash,'legacy_request_hash_mismatch',{id:row.id});
 const rows=suite==='boundary'?buildCases(source,assets,packageRoot,api):source.rows;
 // The compiler receives request only. Labels/rationale never cross that function boundary.
 return {definition,sourceBindings:bindings,rows:rows.map(row=>({
  request:buildVariantRequest(row.request,definition,assets),
  evaluationOnly:{id:row.id,lineage:row.lineage,family:row.family,lengthTarget:row.lengthTarget,suite:row.suite??'regression',expected:row.expected,diagnosticExpected:row.diagnosticExpected??null,metadata:row.metadata},
 }))};
}
