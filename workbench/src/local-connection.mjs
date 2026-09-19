/** Single-user loopback credential boundary. No key is written to disk or returned. */
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {assert,exactKeys,sha} from './util.mjs';
import {openAccount,initAccount} from './runner.mjs';
import {loadAdvisorPlan,adviceSummary} from './selection/advisor.mjs';
import {executeAdvisor} from './selection/runner.mjs';
import {immutableJson,readLedgerEvents,unwrap} from '../vendor/admission-v1/io.mjs';
export const JEV_ENDPOINT='https://api.typesafe.ai/v1/systemone';
function validateKey(key){
 assert(typeof key==='string'&&key.length>=8&&key.length<=4096&&/^[\x21-\x7e]+$/.test(key),'Enter the API key only: 8–4096 printable characters, without whitespace');
 return key;
}
function envKey(file){
 const st=fs.statSync(file);assert(st.isFile()&&st.size<=65536,'The selected .env must be a file under 64 KiB');
 const env=parseEnv(fs.readFileSync(file,'utf8'));
 const key=env.TYPESAFE_API_KEY||env.JEV_API_KEY;assert(key,'No TYPESAFE_API_KEY or JEV_API_KEY was found in the selected .env');
 return validateKey(key);
}
/** Fixed-destination transport. Never record credentials echoed by an HTTP response. */
export function credentialSafeFetch(apiKey,fetchImpl=globalThis.fetch){
 return async(url,options={})=>{
  assert(String(url)===JEV_ENDPOINT,'Only the fixed TypeSafe HTTPS endpoint is permitted');
  try{
   const response=await fetchImpl(JEV_ENDPOINT,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});
   // Drain a bounded stream; do not buffer an unbounded error or model response.
   let size=0;const chunks=[],reader=response.body?.getReader();
   if(reader){for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw Error('Provider response exceeds local limit');}chunks.push(value);}}
   const text=Buffer.concat(chunks).toString('utf8').split(apiKey).join('[REDACTED_CREDENTIAL]');
   const body=response.ok?text:'{"error":"provider_request_rejected"}';
   return new Response(body,{status:response.status,headers:{'content-type':'application/json'}});
  }catch{return new Response('{"error":"provider_transport_error"}',{status:502,headers:{'content-type':'application/json'}});}
 };
}
export function createLocalConnection({runtime,defaultAccount,inferFactory=null,now=Date.now}={}){
 let key=null,acct=null,source=null,generation=0,verified=false,running=null,stopRequested=false;
 const approvals=new Map();
 async function accountStatus(){
  if(!acct)return null;
  const ledger=unwrap(acct.api.replayRichLedger(readLedgerEvents(acct.ledgerDir)));
  return {kind:acct.kind,path:acct.root,maximumUsd:acct.maxNano/1e9,knownUsageUsd:ledger.knownNanoUsd/1e9,heldUsd:ledger.heldNanoUsd/1e9,
   availableUsd:Math.max(0,(acct.maxNano-ledger.knownNanoUsd-ledger.heldNanoUsd)/1e9),historyComplete:ledger.knownNanoUsd>=acct.minimumPriorNano,haltedReason:ledger.haltedReason??null,
   isProviderBalance:false};
 }
 async function status(){return {connected:key!==null,storage:key?'local-server-memory':null,source,providerVerified:verified,endpoint:JEV_ENDPOINT,account:await accountStatus(),run:running?{id:running.id,status:running.status,completed:running.completed,total:running.total,error:running.error}:null,
  notice:'Single-user local process. Reloading a tab keeps the key; stopping the server forgets it. This does not protect against local malware, a compromised browser, or malicious same-origin code.'};}
 async function connect(input){
  assert(!running||running.status!=='running','Wait for the active advisor run to finish before changing the connection');
  exactKeys(input,['source','apiKey','accountKind','directory','createAccount','accountLimitUsd'],'Connection');
  assert(['paste','env_file','environment'].includes(input.source),'Unknown credential source');
  assert(['project','standalone'].includes(input.accountKind),'Choose an existing project or standalone account');
  assert(typeof input.directory==='string'&&path.isAbsolute(input.directory)&&input.directory.length<4096,'Choose an absolute account/project directory');
  const dir=path.resolve(input.directory);
  // A missing explicitly selected project never falls back to a new account.
  if(input.accountKind==='project'){assert(fs.existsSync(dir),'The selected project does not exist; no fallback account was created');assert(!input.createAccount,'An existing project account cannot be reset or created by this form');}
  else if(!fs.existsSync(path.join(dir,'account.json'))){assert(input.createAccount===true,'Account is not initialized. Explicitly approve creation or select an existing account');}
  // Validate/extract credentials before making any account write.
  const nextKey=input.source==='paste'?validateKey(input.apiKey):input.source==='env_file'?envKey(path.join(dir,'.env')):validateKey(process.env.TYPESAFE_API_KEY||process.env.JEV_API_KEY);
  if(input.accountKind==='standalone'&&!fs.existsSync(path.join(dir,'account.json')))initAccount(dir,input.accountLimitUsd??3);
  const next=await openAccount(input.accountKind==='project'?{project:dir}:{account:dir});
  key=nextKey;acct=next;source=input.source;generation++;verified=false;approvals.clear();
  return status();
 }
 async function forget(){stopRequested=true;key=null;source=null;verified=false;generation++;approvals.clear();return status();}
 function close(){stopRequested=true;key=null;source=null;approvals.clear();}
 async function authorize(input){
  exactKeys(input,['planHash'],'Advisor authorization');assert(key&&acct,'Connect a local API key and account first');
  assert(!running||running.status!=='running','An advisor run is already in progress');
  assert(/^[a-f0-9]{64}$/.test(input.planHash),'Invalid plan identity');
  const planPath=path.join(runtime,'advisor-plans',input.planHash,'manifest.json');const prepared=loadAdvisorPlan(planPath),m=prepared.manifest;
  assert(m.status==='prepared_offline','This metadata plan does not fit its own budget');
  const status=await accountStatus();assert(status.historyComplete,'Existing project history is missing; do not reset the shared ledger');assert(!status.haltedReason,'The shared ledger requires reconciliation');
  assert(status.availableUsd+1e-12>=m.budget.reservationUsd,'The account cannot reserve this advisor run. Choose a smaller plan; the planning budget never raises the account limit');
  const token=randomBytes(32).toString('hex'),expiresAt=now()+300000;
  approvals.clear();approvals.set(token,{planPath,planHash:m.planHash,generation,expiresAt});
  return {token,expiresAt,planHash:m.planHash,mode:m.options.mode,model:m.model,requests:prepared.jobs.length,maxUsd:m.options.maxUsd,
   forecastUsd:m.budget.estimatedUsd,reservationUsd:m.budget.reservationUsd,endpoint:JEV_ENDPOINT,account:status,
   dataDisclosure:m.options.mode==='setup'?'Your application description, declared surfaces/capabilities, current policy draft and predefined setup questions will be sent to TypeSafe. No evaluated-case gold, test material, account paths, budgets or API key is included in the model state.':m.options.mode==='rank'?'The configured policy, application description, and catalog group descriptions will be sent to TypeSafe. No evaluated-case gold or raw customer records are added.':'Catalog group descriptions and the fixed tagging taxonomy will be sent to TypeSafe. No application description or evaluation labels are added.',
   confirmation:'This authorizes this exact metadata plan only, not evaluation runs, policy changes, or extra retries.'};
 }
 async function run(input){
  exactKeys(input,['token','planHash','confirmPaid'],'Advisor execution');assert(input.confirmPaid===true,'Explicit paid confirmation required');
  const approval=approvals.get(input.token);assert(approval&&approval.planHash===input.planHash&&approval.generation===generation&&approval.expiresAt>now(),'Confirmation expired, used, or changed. Review the exact plan again');
  assert(key&&acct,'Connection was forgotten');assert(!running||running.status!=='running','An advisor run is already in progress');
  approvals.delete(input.token); // One-use even if subsequent transport fails. Never automatic retry.
  const runAccount=acct,runKey=key,runGeneration=generation,prepared=loadAdvisorPlan(approval.planPath);
  running={id:randomBytes(16).toString('hex'),planHash:approval.planHash,status:'running',completed:0,total:prepared.jobs.length,report:null,error:null};stopRequested=false;
  const current=running;
  (async()=>{
   try{
    await runAccount.api.withLock(runAccount.lock,async()=>{
     let infer;
     if(inferFactory)infer=await inferFactory({api:runAccount.api,key:runKey,endpoint:JEV_ENDPOINT}); // injected only by Node tests, not HTTP input
     else{
      const endpoint=runAccount.api.readEndpoint('jev',{TYPESAFE_API_KEY:runKey,JEV_MODEL:'jev-1.13.0',JEV_REQUEST_VERSION:'policy-v4',JEV_INPUT_USD_PER_MILLION:'.042',JEV_OUTPUT_USD_PER_MILLION:'0'});
      assert(endpoint.url===JEV_ENDPOINT,'Unexpected provider endpoint');
      infer=await runAccount.api.createRichInference(endpoint,{fetchImpl:credentialSafeFetch(runKey)});
     }
     const approvalFile=path.join(runAccount.runRoot,'catalog-advisor-'+approval.planHash.slice(0,20),'browser-approval-'+current.id+'.json');
     immutableJson(approvalFile,{planHash:approval.planHash,maximumUsd:prepared.manifest.options.maxUsd,maximumCalls:prepared.jobs.length,purpose:prepared.manifest.options.mode,source:'Explicit one-use local-browser confirmation',at:new Date(now()).toISOString()});
     const result=await executeAdvisor(prepared,runAccount,{infer,shouldStop:()=>stopRequested,onProgress:e=>{current.completed=e.completed??current.completed;current.event=e.event;if(e.event==='advisor_response'&&e.valid&&generation===runGeneration&&key!==null)verified=true;}});
     current.report=result.report;current.reportPath=result.path;current.dispatchedNow=result.dispatchedNow;current.completed=result.report.rows.length;current.status=result.report.status;
     if(result.report.status==='complete'||result.report.status==='partial'){
      // Cache only validated, fully accounted advice. Not a registry mutation.
      adviceSummary(result.report);immutableJson(path.join(runtime,result.report.mode==='setup'?'setup-advice':'advice',result.report.reportHash+'.json'),result.report);
     }
    });
   }catch(e){current.status='stopped';current.error=String(e.message??'Local advisor failed').split(runKey).join('[REDACTED_CREDENTIAL]');}
  })();
  return {id:current.id,status:'running',planHash:current.planHash};
 }
 function runStatus(id){assert(running&&running.id===id,'Unknown local advisor run');return {...running};}
 function stop(id){assert(running&&running.id===id,'Unknown local advisor run');stopRequested=true;return {status:'stop_requested',message:'The in-flight request may finish and remain billable. No later request will start.'};}
 return {status,connect,forget,authorize,run,runStatus,stop,close};
}
