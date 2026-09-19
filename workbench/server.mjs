#!/usr/bin/env node
import {TASK_STARTERS,applySetupSummary,undoSetupTransaction} from './src/setup.mjs';
import {createLocalConnection} from './src/local-connection.mjs';
import {originalCatalogView,originalSpecimen} from './src/history/catalog.mjs';
import {makeReplayPlan,freezeReplay} from './src/history/planner.mjs';
import {evidenceLibrary,loadEvidence,evidenceSpecimen} from './src/evidence-library.mjs';
import {registryView} from './src/selection/registry.mjs';
import {defaultApplication,validateApplication,SURFACES,CAPABILITIES} from './src/selection/application.mjs';
import {makeAdvisorPlan,freezeAdvisorPlan,loadAdvisorPlan,adviceSummary} from './src/selection/advisor.mjs';
import {makeAssistedPlan} from './src/selection/planner.mjs';
import {gunzipSync} from 'node:zlib';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {preset,validatePolicy,policyWarnings,RULE_CARDS,REPRESENTATIONS,EXCEPTIONS,LANGUAGE_NAMES} from './src/policy.mjs';
import {CATALOG,catalogView,expectedFor} from './src/catalog.mjs';
import {compileCase} from './src/compiler.mjs';
import {makePlan} from './src/planner.mjs';
import {importReport} from './src/report.mjs';
import {freezePlan,ROOT} from './src/storage.mjs';
import {sha,assert,clone} from './src/util.mjs';
import {immutable,immutableJson} from './vendor/admission-v1/io.mjs';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const HISTORICAL=loadEvidence('consumer-admission-v1');
export function startServer({port=8792,host='127.0.0.1',runtime=path.join(ROOT,'runtime'),connectionOptions={}}={}){
 assert(host==='127.0.0.1','The workbench may only bind to loopback');const csrf=randomBytes(32).toString('hex');
 const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
 const defaultAccount=process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/Jev Policy Workbench/account'):path.join(os.homedir(),'.local/share/jev-policy-workbench/account');
 const defaultProject=path.join(os.homedir(),'Documents/Codex/2026-09-16/i-g/outputs/jev-redteam');
 const connection=createLocalConnection({runtime,defaultAccount,...connectionOptions});
 const server=http.createServer(async(req,res)=>{
  const addr=server.address(),allowed=[`127.0.0.1:${addr.port}`,`localhost:${addr.port}`];
  if(!allowed.includes(req.headers.host)){send(res,403,{error:'Host not allowed'});return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   const url=new URL(req.url,`http://${req.headers.host}`),route=url.pathname;
   if(route.startsWith('/api/')&&(['cross-site','same-site'].includes(req.headers['sec-fetch-site'])||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`))){send(res,403,{error:'Cross-origin local API access denied'});return;}
   if(req.method==='GET'&&route==='/api/connection'){send(res,200,await connection.status());return;}
   if(req.method==='GET'&&route==='/api/connection/run'){send(res,200,connection.runStatus(url.searchParams.get('id')));return;}
   if(req.method==='GET'&&route==='/api/bootstrap'){send(res,200,{csrf,version:'0.5.0-rebuilt',taskStarters:TASK_STARTERS,connectionDefaults:{defaultAccount,defaultProject,projectExists:fs.existsSync(defaultProject)},originalCatalog:originalCatalogView(),appRoot:ROOT,selectionRegistry:registryView(),defaultApplication:defaultApplication(preset()),selectionSurfaces:SURFACES,selectionCapabilities:CAPABILITIES,defaultPolicy:preset(),catalog:catalogView(),rules:RULE_CARDS,representations:REPRESENTATIONS,exceptions:EXCEPTIONS,languages:LANGUAGE_NAMES,historical:HISTORICAL,recordedRuns:evidenceLibrary(),defaultProject:path.join(os.homedir(),'Documents/Codex/2026-09-16/i-g/outputs/jev-redteam'),newCalls:0});return;}
   if(req.method==='GET'&&route==='/api/evidence'){send(res,200,loadEvidence(url.searchParams.get('id')));return;}
   if(req.method==='GET'&&route==='/api/evidence-specimen'){send(res,200,evidenceSpecimen({protocol:url.searchParams.get('protocol'),planHash:url.searchParams.get('planHash'),caseId:url.searchParams.get('caseId'),condition:url.searchParams.get('condition'),id:url.searchParams.get('id'),requestHash:url.searchParams.get('requestHash')}));return;}
   if(req.method==='GET'&&route==='/api/original/archived-request'){const hash=url.searchParams.get('hash');assert(/^[a-f0-9]{64}$/.test(hash),'Invalid request identity');const requests=JSON.parse(gunzipSync(fs.readFileSync(path.join(ROOT,'data/history/original-extra-requests.json.gz'))));const request=requests[hash];assert(request&&sha(JSON.stringify(request))===hash,'No exact archived request registered');send(res,200,{request,requestHash:hash});return;}
   if(req.method==='GET'&&route==='/api/original/specimen'){send(res,200,originalSpecimen(url.searchParams.get('id'),{nativeVersion:url.searchParams.get('nativeVersion')??'policy-v4'}));return;}
   if(req.method==='GET'&&route==='/api/case'){
    const c=CATALOG.find(c=>c.id===url.searchParams.get('id'));assert(c,'Unknown case');send(res,200,c);return;
   }
   if(req.method==='POST'){
    assert(req.headers.origin===`http://${req.headers.host}`&&req.headers['x-workbench-token']===csrf,'Origin/CSRF check failed');assert((req.headers['content-type']??'').startsWith('application/json'),'JSON required');
    let len=0,parts=[];for await(const chunk of req){len+=chunk.length;assert(len<=(route.startsWith('/api/connection/')?8192:(route==='/api/import-report'?160:32)*1024*1024),'Local request is too large');parts.push(chunk);}const input=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(route==='/api/connection/connect'){send(res,200,await connection.connect(input));return;}
    if(route==='/api/connection/forget'){send(res,200,await connection.forget());return;}
    if(route==='/api/connection/authorize'){send(res,200,await connection.authorize(input));return;}
    if(route==='/api/connection/run'){send(res,202,await connection.run(input));return;}
    if(route==='/api/connection/stop'){send(res,200,connection.stop(input.id));return;}
    if(route==='/api/original/plan'||route==='/api/original/prepare'){
     const prepared=makeReplayPlan(input.options??{});
     if(route==='/api/original/plan'){send(res,200,prepared.manifest);return;}
     const saved=freezeReplay(prepared,path.join(runtime,'original-plans',prepared.manifest.planHash));send(res,200,{...saved,manifest:prepared.manifest});return;
    }
    if(route==='/api/setup/request'){
     assert(/^[a-f0-9]{64}$/.test(input.planHash),'Invalid setup plan identity');
     const saved=loadAdvisorPlan(path.join(runtime,'advisor-plans',input.planHash,'manifest.json'));
     assert(saved.manifest.options.mode==='setup','Not a setup plan');send(res,200,{request:saved.jobs[0].request,requestHash:saved.jobs[0].requestHash,liveCalls:0});return;
    }
    if(route==='/api/setup/prepare'){
     const prepared=makeAdvisorPlan(input.policy,input.application,{mode:'setup',maxUsd:input.maxUsd??.01,maxInputTokens:null});
     const saved=freezeAdvisorPlan(prepared,path.join(runtime,'advisor-plans',prepared.manifest.planHash));
     send(res,200,{...saved,manifest:prepared.manifest,liveCalls:0});return;
    }
    if(route==='/api/setup/import'||route==='/api/setup/apply'){
     assert(typeof input.raw==='string'&&input.raw.length<2*1024*1024,'Setup report must be a JSON string under 2 MiB');
     const report=JSON.parse(input.raw),summary=adviceSummary(report,{policy:input.policy,application:input.application,mode:'setup'});
     if(route==='/api/setup/apply'){
      const transaction=applySetupSummary(input.policy,input.application,summary,input.selected);
      immutableJson(path.join(runtime,'setup-reviews',sha(transaction)+'.json'),transaction);send(res,200,transaction);return;
     }
     immutableJson(path.join(runtime,'setup-advice',report.reportHash+'.json'),report);send(res,200,{report,summary,liveCalls:0});return;
    }
    if(route==='/api/setup/undo'){send(res,200,undoSetupTransaction(input.policy,input.application,input.transaction));return;}
    if(route==='/api/selection/validate-context'){send(res,200,validateApplication(input.application));return;}
    if(route==='/api/selection/prepare'){
     const prepared=makeAdvisorPlan(input.policy,input.application,input.options??{},input.catalogDescriptors??null);
     const frozen=freezeAdvisorPlan(prepared,path.join(runtime,'advisor-plans',prepared.manifest.planHash));
     send(res,200,{...frozen,manifest:prepared.manifest,liveCalls:0});return;
    }
    if(route==='/api/selection/import'){
     assert(typeof input.raw==='string'&&input.raw.length<12*1024*1024,'Advisor report must be a JSON string under 12 MiB');
     const report=JSON.parse(input.raw);assert(report.mode!=='setup','Use the setup-review importer for setup advice');const summary=adviceSummary(report,report.mode==='rank'?{policy:input.policy,application:input.application,mode:'rank'}:{});
     immutableJson(path.join(runtime,'advice',report.reportHash+'.json'),report);immutable(path.join(runtime,'advice-imports',sha(input.raw)+'.json'),input.raw);send(res,200,{report,summary,liveCalls:0});return;
    }
    if(route==='/api/selection/cache'){
     const dir=path.join(runtime,'advice');let matching=null;
     if(fs.existsSync(dir)){const names=fs.readdirSync(dir).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).sort((a,b)=>fs.statSync(path.join(dir,b)).mtimeMs-fs.statSync(path.join(dir,a)).mtimeMs);
      for(const n of names){try{const report=JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));if(report.mode!==(input.mode??'rank'))continue;const summary=adviceSummary(report,{policy:input.policy,application:input.application,mode:input.mode??'rank'});matching={report,summary};break;}catch{}}
     }send(res,200,matching??{report:null,summary:null,liveCalls:0});return;
    }
    if(route==='/api/selection/plan'||route==='/api/selection/freeze'){
     const prepared=makeAssistedPlan(input.policy,input.application,input.options,input.report??null);
     if(route==='/api/selection/plan'){send(res,200,prepared.manifest);return;}
     const frozen=freezePlan(prepared,path.join(runtime,'plans',prepared.manifest.planHash));send(res,200,{...frozen,manifest:prepared.manifest,liveCalls:0});return;
    }
    if(route==='/api/plan'||route==='/api/prepare'){
     const prepared=makePlan(input.policy,input.options);if(route==='/api/plan'){send(res,200,prepared.manifest);return;}
     const frozen=freezePlan(prepared,path.join(runtime,'plans',prepared.manifest.planHash));send(res,200,{...frozen,manifest:prepared.manifest,liveCalls:0});return;
    }
    if(route==='/api/compile'){
     const policy=validatePolicy(input.policy);let c=CATALOG.find(c=>c.id===input.caseId);
     if(input.custom){assert(Object.hasOwn(input.custom,'material'),'Custom material required');c={id:'custom-preview',sourceVersion:'user-authored-preview',material:input.custom.material,context:input.custom.context??{task:policy.task,expectedRepresentation:'Natural-language task data.',exceptionIds:[],source:{id:'user-supplied',kind:'untrusted data'}}};}
     assert(c,'Unknown case');const compiled=compileCase(policy,c,input.layout??policy.layout);
     send(res,200,{request:compiled.request,receipt:compiled.receipt,wireBytes:compiled.wireBytes,estimatedInputTokens:compiled.estimatedInputTokens,expected:c.annotations?expectedFor(policy,c):null,caseId:c.id,warnings:policyWarnings(policy),liveCalls:0});return;
    }
    if(route==='/api/import-report'){
     const report=importReport(input.raw,{sourceName:input.name??'local import'});immutable(path.join(runtime,'imports',report.sourceHash+'.json'),input.raw);send(res,200,report);return;
    }
    send(res,404,{error:'No such API operation. There is no general model execution endpoint; only confirmed saved advisor plans can run through the local connection.'});return;
   }
   if(req.method!=='GET'){send(res,405,{error:'Method not allowed'});return;}
   const relative=route==='/'?'index.html':decodeURIComponent(route.slice(1));const file=path.resolve(ROOT,'public',relative),base=path.resolve(ROOT,'public')+path.sep;
   assert(file.startsWith(base)&&MIME[path.extname(file)]&&fs.existsSync(file)&&fs.statSync(file).isFile(),'Not found');const real=fs.realpathSync(file);assert(real.startsWith(base),'Path is not allowed');
   res.writeHead(200,{'Content-Type':MIME[path.extname(file)],'Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(e){if(!res.headersSent)send(res,e.message.includes('CSRF')?403:400,{error:e.message});else res.end();}
 });server.on('close',()=>connection.close());server.listen(port,host);return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const p=process.argv.indexOf('--port'),port=p>=0?Number(process.argv[p+1]):8792;assert(Number.isInteger(port)&&port>1023&&port<65536,'Use port 1024–65535');
 const server=startServer({port});server.on('listening',()=>console.log(`Jev Policy Workbench 0.5 — rebuilt\nhttp://127.0.0.1:${port}\nLocal only. No credentials read or paid calls on startup. Advisor calls require explicit confirmation. Ctrl-C stops the workbench and forgets the session key.`));server.on('error',e=>{console.error(e.message);process.exitCode=1;});
}
