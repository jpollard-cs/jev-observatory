import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {importReport,summarize,matchedComparison} from '../src/report.mjs';
import {sha,assert,label} from '../src/util.mjs';
import {deriveDisposition} from '../vendor/admission-v1/consumer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const raw=fs.readFileSync(path.join(root,'data/consumer-admission-v1.report.json'),'utf8'),r=JSON.parse(raw),report=importReport(raw,{sourceName:'User-supplied consumer-admission-v1 report.json'});
assert(!report.summaryDifferences.length,'Summary mismatch');let blocks=0,derivedComparisons=0;
for(const c of Object.values(r.conditions)){
 const check=(rows,s)=>{assert(sha(summarize(rows))===sha(s),'Summary reconstruction mismatch');blocks++;};
 check(c.rows,c.summary);
 if(c.primaryExcludingDisputedAcrostic)check(c.rows.filter(x=>!x.id.startsWith('rich-acrostic-message:attack')),c.primaryExcludingDisputedAcrostic);
 for(const [pad,s]of Object.entries(c.byPadding??{}))check(c.rows.filter(x=>x.paddingChars===Number(pad)),s);
 for(const [realism,s]of Object.entries(c.byRealism??{}))check(c.rows.filter(x=>x.realism===realism),s);
 for(const row of c.rows)if(row.derivedDisposition){assert(sha(deriveDisposition({operation:c.policyId==='inspection'?'inspect_for_authorized_analysis':'admit_as_task_data'},row.answers))===sha(row.derivedDisposition),'Derived decision mismatch');derivedComparisons++;}
}
const count=report.conditions.reduce((s,c)=>s+c.rows.length,0),tokens=report.conditions.reduce((s,c)=>s+c.summary.inputTokens,0);
assert(count===480&&r.validCalls===480,'Unexpected completed call count');assert(Math.abs(tokens*42/1e9-r.budget.bundleKnownUsageUsd)<1e-12,'Usage accounting mismatch');
let bindings={status:'Not rebuilt in this invocation. Report-recorded request and response hashes retained.'};
if(process.argv.includes('--project')){
 const project=process.argv[process.argv.indexOf('--project')+1];
 const store=fs.mkdtempSync(path.join(os.tmpdir(),'jev-source-audit-'));
 const {createLab}=await import('../vendor/admission-v1/lab.mjs');const lab=await createLab({project,base:path.join(root,'vendor/admission-v1'),store});
 lab.prepare();
 assert(lab.plan.planHash===r.planHash,'Source/report plan mismatch');let n=0;
 for(const c of Object.values(r.conditions))for(const row of c.rows){const request=lab.baseRequest(row.source.variant,row.id);assert(sha(JSON.stringify(request))===row.plannedRequestHash,'Request hash mismatch:'+row.id);n++;}
 bindings={status:'All exact request bodies rebuilt against the supplied source snapshot',matched:n,planHash:lab.plan.planHash};
 fs.rmSync(store,{recursive:true,force:true});
}
const evidence={...report,sourceAudit:{summaryBlocks:blocks,derivedComparisons,inputTokens:tokens,requestBindings:bindings,rawHttpFilesRehashed:false,paidCallsMadeHere:0}};
fs.writeFileSync(path.join(root,'data/evidence.json'),JSON.stringify(evidence)+'\n');
fs.writeFileSync(path.join(root,'validation/report-audit.json'),JSON.stringify({protocol:r.protocol,sourceSha256:sha(raw),summaryBlocks:blocks,derivedComparisons,rows:count,inputTokens:tokens,usageUsd:tokens*42/1e9,requestBindings:bindings,rawResponsesVerified:false,paidCalls:0},null,2)+'\n');
console.log(JSON.stringify({summaryBlocks:blocks,derivedComparisons,rows:count,inputTokens:tokens,requestBindings:bindings}));
