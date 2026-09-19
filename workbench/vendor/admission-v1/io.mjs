import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const sha = text => createHash('sha256').update(text).digest('hex');
export const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
export const jsonText = x => JSON.stringify(x, null, 2) + '\n';
function syncDir(dir) { const fd=fs.openSync(dir,'r'); try {fs.fsyncSync(fd);} finally {fs.closeSync(fd);} }
export function immutable(file, text) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if (fs.existsSync(file)) {
    if(fs.readFileSync(file,'utf8')!==text) throw Error(`immutable_file_conflict:${path.basename(file)}`);
    return;
  }
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const fd=fs.openSync(temp,'wx',0o600);
  try {fs.writeFileSync(fd,text);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  try {fs.linkSync(temp,file);syncDir(path.dirname(file));} finally {fs.unlinkSync(temp);}
}
export const immutableJson = (f,x) => immutable(f,jsonText(x));
export function replaceJson(file,obj) { replaceText(file,jsonText(obj)); }
export function replaceText(file,text) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=`${file}.${process.pid}.${randomUUID()}.tmp`,fd=fs.openSync(temp,'wx',0o600);
  try {fs.writeFileSync(fd,text);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  fs.renameSync(temp,file);syncDir(path.dirname(file));
}
export function readLedgerEvents(dir) {
  if(!fs.existsSync(dir)) return [];
  const names=fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort();
  if(names.some(n=>!/^\d{10}\.json$/.test(n))) throw Error('unexpected_ledger_filename');
  return names.map((name,i)=>{
    const event=readJson(path.join(dir,name));
    if(event.sequence!==i+1 || name!==String(i+1).padStart(10,'0')+'.json') throw Error('ledger_sequence_or_filename_mismatch');
    return event;
  });
}
export function verifyProject(root,base) {
  const bindings=readJson(path.join(base,'assets/project-bindings.json'));
  if(!fs.existsSync(root)) throw Error(`project_not_found:${root}`);
  for(const [name,hash] of Object.entries(bindings)) {
    const file=path.join(root,name);
    if(!fs.existsSync(file)) throw Error(`project_file_missing:${name}`);
    if(sha(fs.readFileSync(file))!==hash) throw Error(`project_source_changed:${name}`);
  }
  return bindings;
}
export function packageHashes(base) {
 const names=['lab.mjs','io.mjs','variants.mjs','consumer.mjs','results.mjs','run.sh','index.mjs','package.json'];
 function walk(dir){for(const entry of fs.readdirSync(path.join(base,dir),{withFileTypes:true})){
  const n=dir+'/'+entry.name;if(entry.isDirectory()){if(!['validation','examples','tests','docs'].includes(entry.name))walk(n);}
  else if(/\.(mjs|json|md|sh|ts|mts)$/.test(n))names.push(n);
 }}
 for(const d of ['assets','schemas','vendor'])walk(d);
 return Object.fromEntries(names.sort().map(n=>[n,sha(fs.readFileSync(path.join(base,n)))]));
}
export async function contracts(root,base) {
  const sourceFiles=verifyProject(root,base);
  const load = f => import(pathToFileURL(path.join(root,f)).href);
  const [builder,ledger,validation,cli,persistence,provider] = await Promise.all([
    load('harness/domain/rich-pilot-request.mjs'),load('harness/application/rich-pilot-run.mjs'),
    load('harness/domain/native-answers.mjs'),load('scripts/rich-pilot.mjs'),load('scripts/campaign.mjs'),load('harness/provider.mjs')]);
  return {sourceFiles,...builder,...ledger,...validation,
    createRichInference:cli.createRichInference,withLock:persistence.withCampaignLock,readEndpoint:provider.readEndpoint};
}
export const unwrap = x => {if(x.tag==='error')throw Error(x.error.code);return x.value;};
