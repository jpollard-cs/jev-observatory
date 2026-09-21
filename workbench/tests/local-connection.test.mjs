import {UNITS} from '../src/selection/registry.mjs';
import {CATALOG} from '../src/catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {once} from 'node:events';
import {startServer} from '../server.mjs';
import {createLocalConnection,JEV_ENDPOINT,credentialSafeFetch} from '../src/local-connection.mjs';
import {preset,validatePolicy} from '../src/policy.mjs';import {defaultApplication} from '../src/selection/application.mjs';
import {makeAdvisorPlan,freezeAdvisorPlan} from '../src/selection/advisor.mjs';
import {makePlan,validateOptions} from '../src/planner.mjs';import {makeAssistedPlan} from '../src/selection/planner.mjs';
import {replayOptions} from '../src/history/catalog.mjs';import {makeReplayPlan} from '../src/history/planner.mjs';
import {initAccount} from '../src/runner.mjs';
import {fakeInference,fakeReport} from './advisor-fixture.mjs';
const KEY='TEST_ONLY_NOT_A_REAL_PROVIDER_KEY_041';
function setup(t,{infer,clock}={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jwb-local-')),runtime=path.join(dir,'runtime'),account=path.join(dir,'account');let calls=0;
 const connection=createLocalConnection({runtime,now:clock??Date.now,inferFactory:async({key,endpoint})=>{assert.equal(key,KEY);assert.equal(endpoint,JEV_ENDPOINT);return async q=>{calls++;return (infer??fakeInference())(q);};}});
 t.after(()=>{connection.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,runtime,account,connection,calls:()=>calls,connect:(extra={})=>connection.connect({source:'paste',apiKey:KEY,accountKind:'standalone',directory:account,createAccount:true,accountLimitUsd:3,...extra}),prepare:()=>{const p=makeAdvisorPlan(preset(),defaultApplication(preset()));freezeAdvisorPlan(p,path.join(runtime,'advisor-plans',p.manifest.planHash));return p;}};}
async function finish(connection,id){for(let i=0;i<180;i++){const state=connection.runStatus(id);if(state.status!=='running')return state;await new Promise(r=>setTimeout(r,25));}throw Error('Simulated advisor timed out');}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('paste setup is offline, session memory only, and no raw key is returned',async t=>{const x=setup(t),s=await x.connect();assert.equal(x.calls(),0);assert.equal(s.connected,true);assert.equal(s.providerVerified,false);assert.equal(s.account.maximumUsd,3);assert.ok(!JSON.stringify(s).includes(KEY));for(const f of files(x.dir))assert.ok(!fs.readFileSync(f,'utf8').includes(KEY),f);await x.connection.forget();assert.equal((await x.connection.status()).connected,false);});
test('missing selected project never falls back to another account',async t=>{const x=setup(t);await assert.rejects(()=>x.connect({accountKind:'project',directory:path.join(x.dir,'missing'),createAccount:false}),/does not exist/);assert.equal(fs.existsSync(x.account),false);});
test('standalone account requires explicit initialization and preserves old limit',async t=>{const x=setup(t);await assert.rejects(()=>x.connect({createAccount:false}),/not initialized/);await x.connect({accountLimitUsd:1});await x.connect({accountLimitUsd:500});assert.equal((await x.connection.status()).account.maximumUsd,1);});
test('larger standalone authorization is explicit; invalid key makes no account',async t=>{const x=setup(t);await assert.rejects(()=>x.connect({apiKey:'bad key'}),/without whitespace/);assert.equal(fs.existsSync(x.account),false);assert.equal((await x.connect({accountLimitUsd:50})).account.maximumUsd,50);});
test('selected env reads only key, not commands or endpoint configuration',async t=>{const x=setup(t);initAccount(x.account,3);fs.writeFileSync(path.join(x.account,'.env'),`TYPESAFE_API_KEY=${KEY}\nJEV_BASE_URL=https://evil.example\nOTHER_SECRET=not_to_be_returned\nEVIL=$(touch ${x.dir}/executed)\n`);const s=await x.connect({source:'env_file',apiKey:undefined,createAccount:false});assert.equal(s.connected,true);assert.equal(s.endpoint,JEV_ENDPOINT);assert.ok(!JSON.stringify(s).includes('OTHER_SECRET'));assert.equal(fs.existsSync(path.join(x.dir,'executed')),false);assert.equal(x.calls(),0);});
test('short key, arbitrary endpoint and unsupported credential options rejected',async t=>{const x=setup(t);await assert.rejects(()=>x.connect({apiKey:'short'}));await assert.rejects(()=>x.connect({endpoint:'https://evil.example'}));await assert.rejects(()=>x.connect({source:'upload'}));});
test('saving and authorizing a plan never calls provider; confirmation expires',async t=>{let now=1000;const x=setup(t,{clock:()=>now});await x.connect();const p=x.prepare(),a=await x.connection.authorize({planHash:p.manifest.planHash});assert.equal(x.calls(),0);now=a.expiresAt+1;await assert.rejects(()=>x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true}),/expired/);assert.equal(x.calls(),0);});
test('forget invalidates an unspent confirmation',async t=>{const x=setup(t);await x.connect();const p=x.prepare(),a=await x.connection.authorize({planHash:p.manifest.planHash});await x.connection.forget();await assert.rejects(()=>x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true}));assert.equal(x.calls(),0);});
test('missing confirmation and mismatched plan cannot spend',async t=>{const x=setup(t);await x.connect();const p=x.prepare(),a=await x.connection.authorize({planHash:p.manifest.planHash});await assert.rejects(()=>x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:false}));await assert.rejects(()=>x.connection.run({token:a.token,planHash:'f'.repeat(64),confirmPaid:true}));assert.equal(x.calls(),0);});
test('Batched simulated advisor completes, accounts once, caches and never persists key',async t=>{const x=setup(t);await x.connect();const p=x.prepare(),a=await x.connection.authorize({planHash:p.manifest.planHash});const started=await x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true});await assert.rejects(()=>x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true}));const done=await finish(x.connection,started.id);assert.equal(done.status,'complete',done.error);assert.equal(x.calls(),Math.ceil(UNITS.length/6));assert.equal(done.report.rows.length,Math.ceil(UNITS.length/6));assert.equal((await x.connection.status()).account.knownUsageUsd,Math.ceil(UNITS.length/6)*100*42/1e9);assert.equal((await x.connection.status()).providerVerified,true);for(const f of files(x.dir))assert.ok(!fs.readFileSync(f,'utf8').includes(KEY),f);});
test('reconfirming a completed exact advisor plan reuses evidence, not paid calls',async t=>{const x=setup(t);await x.connect();const p=x.prepare();for(let i=0;i<2;i++){const a=await x.connection.authorize({planHash:p.manifest.planHash}),start=await x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true});assert.equal((await finish(x.connection,start.id)).status,'complete');}assert.equal(x.calls(),Math.ceil(UNITS.length/6));});
test('account cap checked independently of a larger planning budget',async t=>{const x=setup(t);await x.connect({accountLimitUsd:.000001});const p=x.prepare();await assert.rejects(()=>x.connection.authorize({planHash:p.manifest.planHash}),/cannot reserve/);assert.equal(x.calls(),0);});
test('transport failure stops at one request, retains uncertain hold, no retry',async t=>{const x=setup(t,{infer:async()=>{throw Error(KEY);}});await x.connect();const p=x.prepare(),a=await x.connection.authorize({planHash:p.manifest.planHash}),start=await x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true}),done=await finish(x.connection,start.id);assert.equal(done.status,'stopped');assert.equal(x.calls(),1);assert.ok((await x.connection.status()).account.heldUsd>0);assert.ok(!JSON.stringify(done).includes(KEY));});
test('plan hash input cannot choose arbitrary filesystem path',async t=>{const x=setup(t);await x.connect();await assert.rejects(()=>x.connection.authorize({planHash:'../../.env'}));});
test('large budgets saturate useful current coverage, never add extra tests',()=>{const p=preset(),a=defaultApplication(p);for(const budget of [5,50,1000]){const plain=makePlan(p,{tier:'gold',maxUsd:budget,maxInputTokens:null}).manifest,assisted=makeAssistedPlan(p,a,{tier:'gold',maxUsd:budget,maxInputTokens:null}).manifest;for(const m of [plain,assisted]){assert.equal(m.counts.selectedCases,CATALOG.length);assert.equal(m.counts.physicalRequests,CATALOG.length*2);assert.equal(m.budget.completeCatalogInBudget,true);assert.ok(m.budget.unusedUsd>budget-1);}}});
test('negative, NaN, infinity and overflow budgets rejected, not clamped',()=>{for(const maxUsd of [-1,0,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>validateOptions({maxUsd}));assert.equal(validateOptions({maxUsd:1000}).maxUsd,1000);});
test('original full definitions accept budget above old execution cap',()=>{assert.equal(replayOptions({maxUsd:100}).maxUsd,100);const p=makeReplayPlan({preset:'families',maxUsd:100}).manifest;assert.equal(p.counts.selectedCells,36);assert.equal(p.budget.completeCatalogInBudget,true);});
test('inactive extension controls do not block an extension suite',()=>{const o=replayOptions({preset:'extensions',suite:'extensions',lengths:[],arms:[],profiles:[],outputs:[],seeds:[],positions:[],families:[],maxUsd:50});assert.equal(o.suite,'extensions');assert.deepEqual(o.families,[]);});
test('disabled language allowlist ignored, active invalid list still rejected',()=>{const p=preset();p.languages={mode:'any',scope:'natural_language_content',allowed:['not a valid tag']};assert.deepEqual(validatePolicy(p).languages.allowed,[]);p.languages.mode='allowlist';assert.throws(()=>validatePolicy(p));});
test('tagging can prepare with incomplete irrelevant policy/app, ranking cannot',()=>{assert.equal(makeAdvisorPlan({name:''},{},{mode:'tag',maxUsd:.05,maxInputTokens:2000000}).manifest.status,'prepared_offline');assert.throws(()=>makeAdvisorPlan({name:''},{},{mode:'rank'}));});
test('connection routes require origin, CSRF, strict schema and small body',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jwb-conn-http-')),server=startServer({port:0,runtime:dir});await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port,b=await(await fetch(base+'/api/bootstrap')).json();
 const post=(route,data,headers={})=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','Origin':base,'X-Workbench-Token':b.csrf,...headers},body:JSON.stringify(data)});
 assert.equal((await post('connection/connect',{}, {Origin:'https://evil.example'})).status,403);assert.equal((await post('connection/authorize',{}, {'X-Workbench-Token':'wrong'})).status,403);
 assert.equal((await fetch(base+'/api/connection',{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(base+'/api/bootstrap',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await post('connection/connect',{source:'x',apiKey:'a'.repeat(10000)})).status,400);assert.equal((await fetch(base+'/api/connection')).status,200);
 assert.equal((await post('connection/run',{planHash:'f'.repeat(64),confirmPaid:true})).status,400);
});

test('fixed credential transport refuses arbitrary destinations before fetching',async()=>{
 let called=0;const send=credentialSafeFetch(KEY,async()=>{called++;return new Response('{}');});
 await assert.rejects(()=>send('https://example.org/steal'),/fixed TypeSafe/);assert.equal(called,0);
});
test('credential transport disables redirects and masks echoed secrets',async()=>{
 let opts;const send=credentialSafeFetch(KEY,async(url,o)=>{assert.equal(url,JEV_ENDPOINT);opts=o;return new Response(JSON.stringify({text:KEY}));});
 const response=await send(JEV_ENDPOINT,{method:'POST',redirect:'follow'});assert.equal(opts.redirect,'error');assert.ok(opts.signal);assert.ok(!(await response.text()).includes(KEY));
 const denied=await credentialSafeFetch(KEY,async()=>new Response(KEY,{status:401}))(JEV_ENDPOINT);assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{error:'provider_request_rejected'});
});
test('credential transport stops an oversized stream without exposing its body',async()=>{
 let cancelled=false;const response=new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}));
 const result=await credentialSafeFetch(KEY,async()=>response)(JEV_ENDPOINT);assert.equal(result.status,502);assert.equal(cancelled,true);
});
test('cached completion does not verify a newly entered credential',async t=>{
 const x=setup(t);await x.connect();const p=x.prepare(),a=await x.connection.authorize({planHash:p.manifest.planHash}),start=await x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true});await finish(x.connection,start.id);
 await x.connect({createAccount:false});assert.equal((await x.connection.status()).providerVerified,false);
 const again=await x.connection.authorize({planHash:p.manifest.planHash}),resumed=await x.connection.run({token:again.token,planHash:again.planHash,confirmPaid:true});await finish(x.connection,resumed.id);
 assert.equal(x.calls(),Math.ceil(UNITS.length/6));assert.equal((await x.connection.status()).providerVerified,false);
});
test('invalid provider response cannot mark the credential verified',async t=>{
 const x=setup(t,{infer:fakeInference({model:'another-model'})});await x.connect();const p=x.prepare(),a=await x.connection.authorize({planHash:p.manifest.planHash}),start=await x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true});await finish(x.connection,start.id);assert.equal((await x.connection.status()).providerVerified,false);assert.equal(x.calls(),1);
});
test('forget during a request stops subsequent calls but retains the billed observation',async t=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const x=setup(t,{infer:async req=>{await gate;return fakeInference()(req);}});await x.connect();const p=x.prepare(),a=await x.connection.authorize({planHash:p.manifest.planHash}),start=await x.connection.run({token:a.token,planHash:a.planHash,confirmPaid:true});
 for(let i=0;i<80&&x.calls()===0;i++)await new Promise(r=>setTimeout(r,10));assert.equal(x.calls(),1);await x.connection.forget();release();await finish(x.connection,start.id);
 const status=await x.connection.status();assert.equal(status.connected,false);assert.equal(status.providerVerified,false);assert.equal(x.calls(),1);assert.ok(status.account.knownUsageUsd>0);
});
test('advisor cache accepts equivalent compact and pretty imports without replacing source evidence',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jwb-cache-format-')),server=startServer({port:0,runtime:dir});await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,boot=await(await fetch(base+'/api/bootstrap')).json(),policy=preset(),application=defaultApplication(policy),prepared=makeAdvisorPlan(policy,application),report=await fakeReport(prepared);
 for(const raw of [JSON.stringify(report,null,2)+'\n',JSON.stringify(report)]){const r=await fetch(base+'/api/selection/import',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Workbench-Token':boot.csrf},body:JSON.stringify({policy,application,raw})});assert.equal(r.status,200,await r.clone().text());}
 assert.equal(fs.readdirSync(path.join(dir,'advice')).length,1);assert.equal(fs.readdirSync(path.join(dir,'advice-imports')).length,2);
});
