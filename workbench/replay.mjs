#!/usr/bin/env node
/** Original-suite requests are never sent by merely viewing or preparing a plan. */
import fs from 'node:fs';import path from 'node:path';import {parseArgs} from 'node:util';
import {PACKAGE_ROOT} from './src/sources.mjs';import {assert} from './src/util.mjs';
import {makeReplayPlan,freezeReplay,loadReplay} from './src/history/planner.mjs';
import {executeReplay} from './src/history/runner.mjs';import {openAccount} from './src/runner.mjs';
import {immutableJson} from './vendor/admission-v1/io.mjs';
const HELP=`Original evaluation suites · Observatory 0.4
node replay.mjs preview --preset families
node replay.mjs prepare --preset contexts --budget-usd 0.4
node replay.mjs prepare --preset full --budget-usd 0.4 --fit-budget
node replay.mjs prepare --preset all --options settings.json
node replay.mjs run --plan <manifest.json> --confirm <FULL HASH> --project <original project> --live

Presets: families (36), contexts (324), profiles (108), extensions (64), full (15,120), all (15,184).
Filters and whole contrasts can reduce counts. Full matrix is synthetic factor-expanded evidence.
Only run --live contacts TypeSafe. No budget is increased and no original campaign is resumed.
Default replay limit is $0.40; --budget-usd can explicitly select up to the existing $3 shared cap.
Full selection need not fit that budget: unattempted tests remain untested when dispatch stops.
--fit-budget selects a conservatively affordable subset BEFORE freezing. No half-pairs/quartets.
`;
try{
 const [command,...args]=process.argv.slice(2);if(!command||command==='--help'){console.log(HELP);process.exit(0);}
 const {values:v}=parseArgs({args,options:{preset:{type:'string'},options:{type:'string'},families:{type:'string'},'max-calls':{type:'string'},'budget-usd':{type:'string'},'fit-budget':{type:'boolean'},out:{type:'string'},plan:{type:'string'},confirm:{type:'string'},project:{type:'string'},account:{type:'string'},live:{type:'boolean'},limit:{type:'string'}}});
 if(['preview','prepare'].includes(command)){
  const options=v.options?JSON.parse(fs.readFileSync(v.options,'utf8')):{};if(v.preset)options.preset=v.preset;if(v.families)options.families=v.families.split(',');if(v['max-calls'])options.maxCalls=Number(v['max-calls']);if(v['budget-usd'])options.maxUsd=Number(v['budget-usd']);if(v['fit-budget'])options.fitBudget=true;
  const prepared=makeReplayPlan(options),p=prepared.manifest;const frozen=command==='prepare'?freezeReplay(prepared,v.out??path.join(PACKAGE_ROOT,'runtime/original-plans',p.planHash)):{};
  console.log(JSON.stringify({status:p.state,liveCalls:0,planHash:p.planHash,counts:p.counts,budget:p.budget,...frozen},null,2));
 }else if(command==='run'){
  assert(v.plan&&v.confirm,'Supply --plan and full --confirm hash');const prepared=loadReplay(v.plan);assert(v.confirm===prepared.manifest.planHash,'Full plan confirmation does not match');assert(v.live,'No inference requested. Review the plan, then explicitly add --live.');
  const limit=v.limit?Number(v.limit):prepared.manifest.jobs.length;assert(Number.isSafeInteger(limit)&&limit>0&&limit<=prepared.manifest.jobs.length,'Invalid invocation limit');
  const acct=await openAccount({project:v.project,account:v.account});await acct.api.withLock(acct.lock,async()=>{
   if(fs.existsSync(acct.envFile))process.loadEnvFile(acct.envFile);
   const endpoint=acct.api.readEndpoint('jev',{...process.env,JEV_MODEL:'jev-1.13.0',JEV_REQUEST_VERSION:'policy-v4',JEV_INPUT_USD_PER_MILLION:process.env.JEV_INPUT_USD_PER_MILLION??'.042',JEV_OUTPUT_USD_PER_MILLION:process.env.JEV_OUTPUT_USD_PER_MILLION??'0'});
   assert(endpoint.url==='https://api.typesafe.ai/v1/systemone','Only first-party TypeSafe endpoint allowed');assert(endpoint.inputPrice===.042&&endpoint.outputPrice===0,'Prices differ from frozen accounting contract');
   let stopping=false;const stop=()=>{stopping=true;console.log(JSON.stringify({event:'stop_requested',message:'Finish the in-flight call; no automatic retry.'}));};process.on('SIGINT',stop);process.on('SIGTERM',stop);
   immutableJson(path.join(acct.runRoot,'original-evaluation-'+prepared.manifest.planHash.slice(0,20),'approval.json'),{planHash:v.confirm,maximumUsd:prepared.manifest.options.maxUsd,maximumCalls:prepared.manifest.jobs.length,source:'Explicit original replay CLI --live and full hash'});
   const infer=await acct.api.createRichInference(endpoint,{fetchImpl:(url,opt)=>fetch(url,{...opt,signal:AbortSignal.timeout(30000),redirect:'error'})});
   try{const result=await executeReplay(prepared,acct,{infer,limit,shouldStop:()=>stopping,onProgress:e=>console.log(JSON.stringify(e))});console.log(JSON.stringify({status:result.report.status,report:result.path,newCalls:result.dispatchedNow,budget:result.report.budget},null,2));if(result.report.status==='stopped')process.exitCode=1;}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  });
 }else throw Error('Unknown command. '+HELP);
}catch(e){console.error(JSON.stringify({status:'stopped',error:e.message}));process.exitCode=1;}
