#!/usr/bin/env node
/** Bounded, interleaved experiment; imports only hash-verified existing project contracts. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {setTimeout as delay, setImmediate as yieldToEventLoop} from 'node:timers/promises';
import {sha,readJson,jsonText,immutable,immutableJson,replaceJson,replaceText,readLedgerEvents,contracts,packageHashes,verifyProject,unwrap} from './io.mjs';
import {PROTOCOL,REQUIRED_MODEL,BUNDLE_CAP_NANO,CONDITIONS,TOTAL_CALLS,loadAssets,compileConsumerEntry,fixtureBatch} from './variants.mjs';
import {reportBundle,markdownReport} from './results.mjs';
const PACKAGE=path.dirname(fileURLToPath(import.meta.url));
const now=()=>new Date().toISOString();
const bytes=x=>Buffer.byteLength(x,'utf8');
const keyOf=(v,id)=>v.stageId+':'+id;
const jobId=(variant,id)=>variant+':'+id;

export async function createLab({project,base=PACKAGE,store,ledgerDirectory}={}) {
  if(!project) throw Error('project_required');
  const root=path.resolve(project),pkg=path.resolve(base),api=await contracts(root,pkg);
  const output=store??path.join(root,'runs',PROTOCOL),ledgerBase=ledgerDirectory??path.join(root,'runs/rich-restart-budget-v1');
  const assets=loadAssets(pkg),anchor=readJson(path.join(pkg,'assets/historical-token-anchors.json'));
  const controlAnchors=readJson(path.join(pkg,'assets/control-anchors.json'));
  const requests=new Map();
  const source=unwrap(api.buildRichPilotPlan({templateText:fs.readFileSync(path.join(root,'policies/prompt-injection-policy-template.md'),'utf8'),model:'jev-latest'}));

  if(source.rows.length!==48 || source.templateHash!==sha(assets.guides.rich)) throw Error('rich_control_source_mismatch');
  for(const r of source.rows) if(sha(JSON.stringify(r.request))!==anchor[r.id]?.requestHash) throw Error('historical_reference_request_mismatch');
  const cases=source.rows.map(r=>({...structuredClone(r),suite:'legacy',panel:'legacy'}));
  for(const f of assets.fixtures)for(const paddingChars of [0,4096])cases.push({id:f.id+'__pad'+paddingChars,fixtureId:f.id,family:f.family,suite:'consumer',panel:'consumer',paddingChars,realism:f.realism,rationale:f.rationale,expectedByPolicy:f.expectedByPolicy,contextPlacement:f.contextPlacement});
  const receipts=new Map();
  function buildPlan() {
    const packageFiles=packageHashes(pkg),sourceFiles=verifyProject(root,pkg);
    const identity=sha(JSON.stringify({protocol:PROTOCOL,packageFiles,sourceFiles}));
    const definitions=[];
    for(const condition of CONDITIONS){
      const selected=cases.filter(c=>c.suite===(condition.kind==='legacy'?'legacy':'consumer'));
      for(let i=0;i<selected.length;i+=48)definitions.push({...condition,conditionId:condition.id,id:condition.id+'__panel'+(i/48+1),caseIds:selected.slice(i,i+48).map(c=>c.id)});
    }
    let forecastTokens=0,planningNano=0;
    const variants=definitions.map(def=>{
      const v={...def,stageId:'rich-'+sha(identity+':'+def.id).slice(0,24),maximumStageNanoUsd:300_000_000};
      v.rows=def.caseIds.map(id=>{
        const c=cases.find(c=>c.id===id);let body,receipt=null,estimate;
        if(def.kind==='legacy'){
          const r=structuredClone(c.request);r.state.classifierGuide=structuredClone(assets.guides[def.guide]);body=JSON.stringify(r);
          if(sha(body)!==controlAnchors[def.conditionId][c.id].requestHash)throw Error('historical_control_changed');
          estimate=controlAnchors[def.conditionId][c.id].inputTokens;
        }else{
          const fixture=assets.fixtures.find(f=>f.id===c.fixtureId),policy=assets.policies.find(p=>p.id===def.policyId);
          const compiled=compileConsumerEntry(fixtureBatch(fixture,policy),policy,0,assets,def.layout,c.paddingChars);
          body=compiled.jobs[0].body;receipt=compiled.receipt;receipts.set(jobId(def.id,c.id),receipt);
          estimate=bytes(body)/3; // Planning only; actual provider usage settles every reservation.
        }
        requests.set(jobId(def.id,c.id),body);
        return {id:c.id,requestHash:sha(body),requestBytes:bytes(body),reservationNanoUsd:(bytes(body)+256)*42,estimatedInputTokens:estimate,receiptHash:receipt?sha(JSON.stringify(receipt)):null};
      });
      v.maximumRequests=v.rows.length;v.planningReservationNanoUsd=v.rows.reduce((s,r)=>s+r.reservationNanoUsd,0);
      v.tokenForecast=v.rows.reduce((s,r)=>s+r.estimatedInputTokens,0);v.maxRequestBytes=Math.max(...v.rows.map(r=>r.requestBytes));
      if(v.maximumRequests>48||v.planningReservationNanoUsd>300e6)throw Error('stage_preflight_exceeds_limit');
      forecastTokens+=v.tokenForecast;planningNano+=v.planningReservationNanoUsd;return v;
    });
    const schedule=[],seen=new Set();
    function add(v,r){const k=jobId(v.id,r.id);if(!seen.has(k)){schedule.push({variant:v.id,id:r.id});seen.add(k);}}
    // Twelve largest consumer requests first: acceptance/capacity smoke stage, no outcome-based routing.
    for(const condition of CONDITIONS.filter(c=>c.kind==='consumer')){
      const largest=variants.filter(v=>v.conditionId===condition.id).flatMap(v=>v.rows.map(r=>({v,r}))).sort((a,b)=>b.r.requestBytes-a.r.requestBytes||a.r.id.localeCompare(b.r.id));
      for(const {v,r} of largest.slice(0,2))add(v,r);
    }
    for(const [i,c]of cases.entries()){
      const eligible=variants.filter(v=>v.rows.some(r=>r.id===c.id)),shift=i%eligible.length;
      for(const v of [...eligible.slice(shift),...eligible.slice(0,shift)])add(v,v.rows.find(r=>r.id===c.id));
    }
    if(schedule.length!==TOTAL_CALLS)throw Error('planned_call_count_mismatch');
    const core={protocol:PROTOCOL,sourceFiles,packageFiles,maximumRequests:TOTAL_CALLS,bundleCapNanoUsd:BUNDLE_CAP_NANO,requiredProviderModel:REQUIRED_MODEL,model:'jev-latest',variants,schedule,
      cases:cases.map(({request,...r})=>r),
      design:{conditions:CONDITIONS,legacyControls:2,unchangedLegacyCalls:96,newScenarioContextCombinations:32,consumerPaddingChars:[0,4096],newConsumerCalls:384,maximumCalls:TOTAL_CALLS,
        semantics:'New consumer policy experiment, not a lossless rewrite of the rich guide. Compare strict/contextual within each layout. Inspection differs in both operation and representation contract.',
        placementContrast:'Same fixed per-proposition examples and policy/context/material; only examples in instructions versus under the criterion differ.',
        contextResolution:'Whole-field entry overrides of shared consumer context. Explicit empty exceptionIds clears defaults; source claims never enter resolution. Separate HTTP request per entry; shared-state multi-entry inference NOT tested.',
        labels:'New, explicit authored expectation matrices; no Promptfoo or model grading. Legacy labels unchanged. Payloads do not receive evaluated-case gold.',
        scopePair:'mixed-authorized and shared-context-equivalent share material and resolved context; they are dependent repeat observations.',
        padding:'0 or 4096 inert characters in consumer benchmarkPadding, not added source instructions. These variants are not independent scenarios.',
        ordinaryCoverage:'Ordinary-style examples are synthetic usability probes, not production-traffic false-positive estimates.',
        admission:'Native decision and deterministic disposition over the same saved findings are reported separately. Neither forwards data to a real agent.',
        smokeCalls:12,providerVersion:REQUIRED_MODEL,demonstrationCount:Object.values(assets.examples).reduce((n,x)=>n+x.length,0)},
      planning:{inputUsdPerMillion:.042,outputUsdPerMillion:0,allRequestReservationUsd:planningNano/1e9,estimatedUsageUsd:forecastTokens*42/1e9,
        forecastMethod:'Historical measured input tokens for unchanged legacy controls; serialized bytes/3 for new consumer requests. Not a vendor tokenizer or invoice.',
        contextGuard:'New payload <=56000 bytes and state+longest question <=28000 bytes; conservative screen only. First 12 requests exercise largest shapes. Provider acceptance and tokens remain unmeasured until live.',
        minimumPriorKnownUsageNanoUsd:1273317318,maximumBundleUsd:.40,maximumSharedUsd:3}};
    return {...core,planHash:sha(JSON.stringify(core))};
  }
  const computed=buildPlan();
  const variantById=new Map(computed.variants.map(v=>[v.id,v]));
  const rowByKey=new Map(computed.variants.flatMap(v=>v.rows.map(r=>[jobId(v.id,r.id),r])));
  const requestFile=hash=>path.join(output,'requests',hash+'.json');
  const recordDir=(variant,id)=>path.join(output,'records',sha(jobId(variant,id)));
  function checkSources() {
    if(JSON.stringify(packageHashes(pkg))!==JSON.stringify(computed.packageFiles))throw Error('experiment_sources_changed');
    verifyProject(root,pkg);
  }
  function loadPlan() {
    const plan=readJson(path.join(output,'manifest.json')),{planHash,...core}=plan;
    if(sha(JSON.stringify(core))!==planHash || planHash!==computed.planHash)throw Error('manifest_or_source_binding_mismatch');
    return plan;
  }
  function prepare() {
    checkSources();
    for(const body of requests.values())immutable(requestFile(sha(body)),body);
    for(const [name,guide] of Object.entries(assets.guides))immutable(path.join(output,'prompts',name+(typeof guide==='string'?'.md':'.json')),typeof guide==='string'?guide:jsonText(guide));
    immutableJson(path.join(output,'prompts','consumer-policies.json'),assets.policies);
    immutableJson(path.join(output,'prompts','judgment-examples.json'),assets.examples);
    immutable(path.join(output,'prompts','admission-guide.md'),assets.guide);
    for(const [key,receipt]of receipts)immutableJson(path.join(output,'receipts',sha(key)+'.json'),receipt);
    immutableJson(path.join(output,'manifest.json'),computed);
    return computed;
  }
  function account(){return unwrap(api.replayRichLedger(readLedgerEvents(ledgerBase)));}
  function append(event,ledger) {
    const e={...event,sequence:ledger.sequence+1},next=unwrap(api.applyRichEvent(ledger,e));
    immutable(path.join(ledgerBase,String(e.sequence).padStart(10,'0')+'.json'),JSON.stringify(e)+'\n');
    return next;
  }
  function baseRequest(variant,id) {
    const v=variantById.get(variant),planned=rowByKey.get(jobId(variant,id));
    if(!v||!planned)throw Error('unknown_job');
    const body=fs.readFileSync(requestFile(planned.requestHash),'utf8');
    if(sha(body)!==planned.requestHash || bytes(body)!==planned.requestBytes)throw Error('frozen_request_changed');
    const req=JSON.parse(body);
    if(JSON.stringify(req)!==body || req.model!==computed.model)throw Error('frozen_wire_changed');
    return req;
  }
  function readSaved(variant,id,reservation) {
    const dir=recordDir(variant,id),file=path.join(dir,'response.json');
    if(!fs.existsSync(file))return null;
    const rawText=fs.readFileSync(file,'utf8'),evidence=JSON.parse(rawText),rawHash=sha(rawText);
    if(evidence.key!==reservation.key || evidence.requestHash!==reservation.requestHash ||
        (reservation.settled && rawHash!==reservation.settlement.rawHash))throw Error('saved_response_binding_mismatch');
    const body=fs.readFileSync(requestFile(reservation.requestHash),'utf8');
    if(sha(body)!==reservation.requestHash || bytes(body)+256!==reservation.reservationNanoUsd/42)throw Error('saved_request_binding_mismatch');
    const request=JSON.parse(body),response=evidence.response;
    if(!response || typeof response!=='object')throw Error('invalid_saved_envelope');
    const validation=response.status==='ok'?api.validateNativeAnswers(response.answers,request,{distributionPolicy:'bounded_rounding'}):null;
    const validUsage=Number.isSafeInteger(response.usage?.inputTokens)&&response.usage.inputTokens>=0&&
      Number.isSafeInteger(response.usage?.outputTokens)&&response.usage.outputTokens>=0;
    const reported=evidence.reportedProviderModel;
    const valid=validation?.tag==='ok' && validUsage && reported===REQUIRED_MODEL;
    const error=validation?.tag==='error'?validation.error.code:response.status!=='ok'?response.error??'provider_failure':!validUsage?'usage_unavailable':reported!==REQUIRED_MODEL?'provider_version_mismatch':null;
    return {evidence,request,rawHash,observation:{valid,status:valid?'ok':'invalid_response',error,
      answers:response.answers??null,usage:response.usage??null,inputTokens:response.usage?.inputTokens??null,
      latencyMs:response.latencyMs??null,receivedAt:evidence.receivedAt,providerModel:reported??null,
      source:{variant,stageId:variantById.get(variant).stageId,requestHash:reservation.requestHash,rawHash,key:reservation.key},
      validation:validation?.tag==='ok'?validation.value:null}};
  }
  function stateSnapshot({recover=false}={}) {
    let ledger=account();const observations=new Map();
    // Independent saved records first. This also finalizes durable responses after a process interruption.
    for(const v of computed.variants)for(const row of v.rows) {
      const key=keyOf(v,row.id),reservation=ledger.reservations[key];if(!reservation)continue;
      if(reservation.requestHash!==row.requestHash)throw Error('resume_request_mismatch');
      const saved=readSaved(v.id,row.id,reservation);
      if(!saved) {
        if(reservation.settled)throw Error('settled_response_missing');
        observations.set(jobId(v.id,row.id),{valid:false,status:'unknown_dispatch',error:'uncertain_dispatch_no_automatic_retry',source:{key,requestHash:reservation.requestHash},usage:null});continue;
      }
      observations.set(jobId(v.id,row.id),saved.observation);
      if(!reservation.settled&&recover)ledger=append({type:'settle',key,requestHash:reservation.requestHash,rawHash:saved.rawHash,
        usage:saved.observation.usage,providerModel:saved.observation.providerModel,failed:!saved.observation.valid,recordedAt:now()},ledger);
    }
    return {ledger,observations};
  }
  function report({recover=false,write=true,externalStop=null}={}) {
    loadPlan();const snapshot=stateSnapshot({recover});
    const r=reportBundle({plan:computed,...snapshot});
    const nextJob=computed.schedule.find(j=>!snapshot.ledger.reservations[keyOf(variantById.get(j.variant),j.id)]);
    if(!r.stopReason&&nextJob&&bundleUsage(snapshot.ledger)+rowByKey.get(jobId(nextJob.variant,nextJob.id)).reservationNanoUsd>BUNDLE_CAP_NANO){r.status='stopped';r.stopReason='bundle_budget_envelope_exhausted';}
    if(externalStop&&r.status!=='complete'&&!r.stopReason){r.stopReason=externalStop;r.status='stopped';}
    if(write){replaceJson(path.join(output,'report.json'),r);replaceText(path.join(output,'report.md'),markdownReport(r));}
    return r;
  }
  function bundleUsage(ledger) {
    return computed.variants.reduce((s,v)=>{
      const a=ledger.stages[v.stageId];return s+(a?.knownNanoUsd??0)+(a?.heldNanoUsd??0);
    },0);
  }
  function ownHalt(ledger,observations) {
    return ledger.haltedReason || computed.variants.map(v=>ledger.stages[v.stageId]?.haltedReason).find(Boolean) ||
      [...observations.values()].find(o=>!o.valid)?.error || null;
  }
  // Programmatic callers must hold the same exclusive project lock as main().
  async function execute({infer,limit=TOTAL_CALLS,concurrency=2,intervalMs=300,progress=()=>{},shouldStop=()=>false}={}) {
    if(typeof infer!=='function')throw Error('infer_required');
    if(!Number.isSafeInteger(limit)||limit<1||limit>TOTAL_CALLS)throw Error('invalid_invocation_limit');
    if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>4)throw Error('invalid_concurrency');
    if(!Number.isSafeInteger(intervalMs)||intervalMs<0)throw Error('invalid_dispatch_interval');
    checkSources();loadPlan();
    let {ledger,observations}=stateSnapshot({recover:true});
    const initialHalt=ownHalt(ledger,observations);if(initialHalt)throw Error(initialHalt);
    const pending=computed.schedule.filter(job=>!ledger.reservations[keyOf(variantById.get(job.variant),job.id)]);
    let dispatchedNow=0,stopReason=null,nextStart=0;
    const inFlight=new Set();
    const started=Date.now();
    async function dispatch(job,request,body) {
      const v=variantById.get(job.variant),key=keyOf(v,job.id),requestHash=sha(body);
      let evidence;
      try { evidence=await infer(request); }
      catch { evidence={response:{status:'error',error:'uncaught_transport_exception',usage:null},reportedProviderModel:null,httpResponse:null}; }
      const complete={...evidence,key,requestHash,variant:v.id,caseId:job.id,receivedAt:now()};
      const text=JSON.stringify(complete)+'\n';
      immutable(path.join(recordDir(v.id,job.id),'response.json'),text);
      const saved=readSaved(v.id,job.id,ledger.reservations[key]);
      ledger=append({type:'settle',key,requestHash,rawHash:saved.rawHash,usage:saved.observation.usage,
        providerModel:saved.observation.providerModel,failed:!saved.observation.valid,recordedAt:now()},ledger);
      observations.set(jobId(v.id,job.id),saved.observation);
      stopReason=stopReason||ownHalt(ledger,observations);
      progress({event:'response',variant:v.id,caseId:job.id,valid:saved.observation.valid,
        error:saved.observation.error,latencyMs:saved.observation.latencyMs,
        completedNativeCalls:observations.size,plannedNativeCalls:TOTAL_CALLS,
        localBundleCommittedUsd:bundleUsage(ledger)/1e9,
        localRestartCommittedUsd:(ledger.knownNanoUsd+ledger.heldNanoUsd)/1e9});
    }
    let fatal=null;
    const heartbeat=setInterval(()=>progress({event:'waiting',elapsedSeconds:Math.round((Date.now()-started)/1000),inFlight:inFlight.size,dispatchedThisInvocation:dispatchedNow,completedNativeCalls:observations.size,remainingPlanned:pending.length}),5000);
    heartbeat.unref();
    try {
      while(pending.length||inFlight.size) {
        stopReason=stopReason||ownHalt(ledger,observations);
        if(shouldStop()&&!stopReason)stopReason='operator_stop_after_inflight_settle';
        if(fatal||stopReason||dispatchedNow>=limit) {
          // No new work is eligible. Drain this fixed set once rather than spinning on
          // settled promises; every outstanding response must reach durable settlement.
          await Promise.allSettled([...inFlight]);
          break;
        }
        if(inFlight.size>=concurrency){await Promise.race(inFlight);continue;}
        const index=pending.length?0:-1;
        if(index<0){if(inFlight.size){await Promise.race(inFlight);continue;}throw Error('unresolved_dependency_deadlock');}
        if(Date.now()<nextStart){await delay(Math.min(nextStart-Date.now(),50));continue;}
        const job=pending[index],v=variantById.get(job.variant);
        const request=baseRequest(v.id,job.id);
        const body=JSON.stringify(request),reservationNanoUsd=(bytes(body)+256)*42,key=keyOf(v,job.id);
        if(bundleUsage(ledger)+reservationNanoUsd>BUNDLE_CAP_NANO){stopReason='bundle_budget_envelope_exhausted';continue;}
        // Synchronous durable commit inside the event loop: no await between ledger read/update/write.
        // One process holds the shared project lock, including all workers and previous harnesses.
        ledger=append({type:'reserve',key,stageId:v.stageId,requestHash:sha(body),reservationNanoUsd,recordedAt:now(),experimentPlanHash:computed.planHash},ledger);
        pending.splice(index,1);dispatchedNow++;nextStart=Date.now()+intervalMs;
        progress({event:'dispatch',variant:v.id,caseId:job.id,requestBytes:bytes(body),dispatchedThisInvocation:dispatchedNow,totalPlanned:TOTAL_CALLS});
        const p=dispatch(job,request,body).catch(e=>{fatal=e;}).finally(()=>inFlight.delete(p));inFlight.add(p);
        // Give signal handlers and transport timers an opportunity to run even when
        // a test/local transport resolves immediately and the start interval is zero.
        await yieldToEventLoop();
      }
      if(fatal)throw fatal;
    } finally {clearInterval(heartbeat);await Promise.allSettled(inFlight);}
    const result=report({externalStop:stopReason});
    return {status:result.status,stopReason:result.stopReason,dispatchedNow,validCalls:result.validCalls,report:path.join(output,'report.json')};
  }
  async function main(argv=process.argv.slice(2)) {
    const {values}=parseArgs({args:argv,options:{project:{type:'string'},live:{type:'boolean'},prepare:{type:'boolean'},status:{type:'boolean'},report:{type:'boolean'},help:{type:'boolean'},limit:{type:'string'},concurrency:{type:'string'},'max-cost-usd':{type:'string'},'min-interval-ms':{type:'string'}}});
    if(values.help){console.log(HELP);return;}
    if([values.live,values.prepare,values.status,values.report].filter(Boolean).length>1)throw Error('select_one_mode');
    const limit=values.limit===undefined?TOTAL_CALLS:Number(values.limit),concurrency=values.concurrency===undefined?2:Number(values.concurrency),intervalMs=values['min-interval-ms']===undefined?300:Number(values['min-interval-ms']);
    if(!Number.isSafeInteger(limit)||limit<1||limit>TOTAL_CALLS||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>4||!Number.isSafeInteger(intervalMs)||intervalMs<300)throw Error('invalid_execution_settings');
    if(values['max-cost-usd']!==undefined&&Number(values['max-cost-usd'])!==.40)throw Error('bundle_cap_fixed_at_040_requires_new_plan_to_change');
    await api.withLock(path.join(root,'runs/.rich-restart.lock'),async()=>{
      prepare();
      const pre=report({recover:!!values.live});
      console.log(JSON.stringify({event:'preflight',status:pre.status,project:root,output,planHash:computed.planHash,
        plannedCalls:TOTAL_CALLS,conditions:CONDITIONS.length,concurrency,minDispatchIntervalMs:intervalMs,
        bundleCapUsd:.40,sharedRestartCapUsd:3,roughForecastUsd:computed.planning.estimatedUsageUsd,
        allCallsByteReservationConventionUsd:computed.planning.allRequestReservationUsd,
        observedLocalBudget:pre.budget,credentialsRead:false}));
      if(!values.live){console.log(JSON.stringify({event:'offline_ready',noApiCalls:true,report:path.join(output,'report.json')}));return;}
      if(pre.status==='complete'){console.log(JSON.stringify({event:'already_complete',newApiCalls:0}));return;}
      if(pre.stopReason)throw Error(pre.stopReason);
      const ledger=account();
      if(!fs.existsSync(ledgerBase)||ledger.knownNanoUsd<computed.planning.minimumPriorKnownUsageNanoUsd)throw Error('shared_ledger_missing_prior_completed_spend_do_not_reset');
      const remainingBundle=BUNDLE_CAP_NANO-bundleUsage(ledger);
      if(ledger.knownNanoUsd+ledger.heldNanoUsd+remainingBundle>3e9)throw Error('insufficient_remaining_shared_budget_for_bundle_cap');
      // Credentials stay on the user's machine and are not shell-sourced or copied into artifacts.
      const envFile=path.join(root,'.env');if(fs.existsSync(envFile))process.loadEnvFile(envFile);
      const endpoint=api.readEndpoint('jev',{...process.env,JEV_MODEL:computed.model,JEV_REQUEST_VERSION:'policy-v4',
        JEV_INPUT_USD_PER_MILLION:process.env.JEV_INPUT_USD_PER_MILLION??'.042',JEV_OUTPUT_USD_PER_MILLION:process.env.JEV_OUTPUT_USD_PER_MILLION??'0'});
      if(endpoint.url!=='https://api.typesafe.ai/v1/systemone')throw Error('endpoint_not_original_first_party_typesafe');
      if(endpoint.inputPrice!==.042||endpoint.outputPrice!==0)throw Error('configured_pricing_differs_from_frozen_ledger');
      immutableJson(path.join(output,'approval.json'),{planHash:computed.planHash,authority:'Explicit --live invocation of the predeclared consumer admission experiment',maximumCalls:TOTAL_CALLS,maximumBundleUsd:.40,maximumSharedRestartUsd:3});
      let stop=false;
      const interrupt=()=>{stop=true;console.log(JSON.stringify({event:'stop_requested',message:'No new requests; waiting for in-flight responses to settle safely.'}));};
      process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
      try {
        const infer=await api.createRichInference(endpoint,{fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(30000),redirect:'error'})});
        const done=await execute({infer,limit,concurrency,intervalMs,progress:e=>console.log(JSON.stringify(e)),shouldStop:()=>stop});
        console.log(JSON.stringify({event:'finished',...done}));
        if(done.status==='stopped')process.exitCode=1;
      } catch(e) {report({externalStop:e.message});throw e;}
      finally {process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
    });
  }
  return {plan:computed,root,output,ledgerBase,api,prepare,loadPlan,report,account,execute,baseRequest,stateSnapshot,main};
}
const HELP=`Jev consumer admission lab v1 — offline unless --live is supplied.
  bash run.sh --prepare          Freeze policy matrix, requests and receipts; no credentials or API calls.
  bash run.sh --live --limit 12  Technical smoke check of 12 largest new payloads, normal resumable pause.
  bash run.sh --live             Run/resume remaining jobs: max 480 calls, $0.40 inside existing $3 ledger.
  bash run.sh --status           Rebuild the local report without paid calls.
  --project /path/to/jev-redteam Override default original directory.
  --concurrency 1..4             Default 2; at least 300 ms between request starts.
No installer, npm, automatic retries, policy overwrite, or production admission enforcement.
Keep .env in the ORIGINAL project; do not reset the shared ledger or remove uncertain dispatches.`;
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  if(process.argv.includes('--help')) console.log(HELP);
  else {
    const args=process.argv.slice(2),at=args.indexOf('--project');
    const project=at>=0?args[at+1]:process.env.JEV_PROJECT_DIR??path.join(os.homedir(),'Documents/Codex/2026-09-16/i-g/outputs/jev-redteam');
    createLab({project}).then(lab=>lab.main(args)).catch(e=>{console.error(JSON.stringify({event:'stopped',error:e.message}));process.exitCode=1;});
  }
}
