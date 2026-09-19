import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {immutable,immutableJson} from '../vendor/admission-v1/io.mjs';
import {verifyPlan} from './planner.mjs';
import {assert,sha} from './util.mjs';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function freezePlan(prepared,directory){
 const {manifest,jobs}=prepared;verifyPlan(manifest);const out=path.resolve(directory);
 for(const job of jobs){assert(sha(job.body)===job.requestHash,'Request changed before freeze');immutable(path.join(out,'requests',job.requestHash+'.json'),job.body);immutableJson(path.join(out,'receipts',sha(job.id)+'.json'),job.receipt);}
 immutableJson(path.join(out,'evaluation-only.json'),Object.fromEntries(jobs.map(j=>[j.id,j.expected])));
 for(const [file,hash]of Object.entries(manifest.sourceFiles)){const b=fs.readFileSync(path.join(ROOT,file));assert(sha(b)===hash,'Sources changed while freezing');immutable(path.join(out,'source',file),b.toString('utf8'));}
 immutableJson(path.join(out,'manifest.json'),manifest);
 return {directory:out,planPath:path.join(out,'manifest.json'),planHash:manifest.planHash};
}
export function loadPrepared(file){const manifest=JSON.parse(fs.readFileSync(file,'utf8')),prepared=verifyPlan(manifest),dir=path.dirname(path.resolve(file));
 for(const j of prepared.jobs){const wire=fs.readFileSync(path.join(dir,'requests',j.requestHash+'.json'),'utf8');assert(wire===j.body,'Frozen request mismatch');}
 return prepared;
}
