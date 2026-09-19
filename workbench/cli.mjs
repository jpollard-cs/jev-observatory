#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {preset,validatePolicy} from './src/policy.mjs';
import {makePlan} from './src/planner.mjs';
import {freezePlan,loadPrepared,ROOT} from './src/storage.mjs';
import {openAccount,executePrepared,initAccount} from './src/runner.mjs';
import {assert} from './src/util.mjs';
import {immutableJson} from './vendor/admission-v1/io.mjs';
const HELP=`Jev Policy Workbench 0.1 — local-first experimental tooling

node cli.mjs prepare --policy policy.json --tier bronze --budget-usd 0.15 --token-budget 3000000
node cli.mjs run --plan runtime/plans/<hash>/manifest.json --confirm <full-plan-hash> --project /path/to/jev-redteam --live
node cli.mjs run ... --live --limit 12                 Bound the invocation; resume with the same plan
node cli.mjs init-account --directory /path/to/new-account --cap-usd 1
node cli.mjs run ... --account /path/to/new-account --live

No command except run with --live calls a provider. Local UI accepts an optional server-session API key for explicitly confirmed advisor calls only.
Existing project mode preserves its shared $3 ledger and historical holds.
Standalone accounts must be explicitly initialized; they are never substituted for an existing project.
Keep TYPESAFE_API_KEY in the account/project .env or the process environment, not in a policy or report.
`;
try{
 const [command,...args]=process.argv.slice(2);if(!command||command==='--help'){console.log(HELP);process.exit(0);}
 const {values:v}=parseArgs({args,options:{policy:{type:'string'},preset:{type:'string'},tier:{type:'string'},'budget-usd':{type:'string'},'token-budget':{type:'string'},seed:{type:'string'},layout:{type:'string'},out:{type:'string'},plan:{type:'string'},confirm:{type:'string'},project:{type:'string'},account:{type:'string'},live:{type:'boolean'},limit:{type:'string'},directory:{type:'string'},'cap-usd':{type:'string'}}});
 if(command==='prepare'){
  const policy=v.policy?validatePolicy(JSON.parse(fs.readFileSync(v.policy,'utf8'))):preset(v.preset??'strict');
  const options={tier:v.tier??'bronze',maxUsd:Number(v['budget-usd']??.15),maxInputTokens:Number(v['token-budget']??3000000),seed:v.seed??'workbench-1',layouts:v.layout==='both'||!v.layout?['question','criteria']:[v.layout]};
  const prepared=makePlan(policy,options),saved=freezePlan(prepared,v.out??path.join(ROOT,'runtime/plans',prepared.manifest.planHash));
  console.log(JSON.stringify({status:prepared.manifest.state,liveCalls:0,...saved,counts:prepared.manifest.counts,budget:prepared.manifest.budget,warnings:prepared.manifest.coverage.gaps},null,2));
 }else if(command==='init-account'){
  assert(v.directory&&v['cap-usd'],'Specify --directory and --cap-usd');console.log(JSON.stringify({account:initAccount(v.directory,Number(v['cap-usd'])),liveCalls:0}));
 }else if(command==='run'){
  assert(v.plan&&v.confirm,'Run requires --plan and --confirm');const prepared=loadPrepared(v.plan);assert(v.confirm===prepared.manifest.planHash,'Confirmation must match the full frozen plan hash');
  assert(v.live,'No inference requested. Add --live only after reviewing the frozen plan and budget.');
  const limit=v.limit===undefined?prepared.jobs.length:Number(v.limit);assert(Number.isSafeInteger(limit)&&limit>0&&limit<=prepared.jobs.length,'Invalid invocation limit');
  const account=await openAccount({project:v.project,account:v.account});
  await account.api.withLock(account.lock,async()=>{
   // Loading credentials is intentionally after explicit plan and source checks.
   if(fs.existsSync(account.envFile))process.loadEnvFile(account.envFile);
   const endpoint=account.api.readEndpoint('jev',{...process.env,JEV_MODEL:'jev-1.13.0',JEV_REQUEST_VERSION:'policy-v4',JEV_INPUT_USD_PER_MILLION:process.env.JEV_INPUT_USD_PER_MILLION??'.042',JEV_OUTPUT_USD_PER_MILLION:process.env.JEV_OUTPUT_USD_PER_MILLION??'0'});
   assert(endpoint.url==='https://api.typesafe.ai/v1/systemone','Only the first-party TypeSafe endpoint is allowed');assert(endpoint.inputPrice===.042&&endpoint.outputPrice===0,'Configured prices differ from the frozen accounting contract');
   let stopping=false;const stop=()=>{stopping=true;console.log(JSON.stringify({event:'stop_requested',message:'Waiting for the current request to finish; no retry will be sent.'}));};process.on('SIGINT',stop);process.on('SIGTERM',stop);
   const infer=await account.api.createRichInference(endpoint,{fetchImpl:(url,opt)=>fetch(url,{...opt,signal:AbortSignal.timeout(30000),redirect:'error'})});
   immutableJson(path.join(account.runRoot,'policy-workbench-'+prepared.manifest.planHash.slice(0,20),'approval.json'),{planHash:v.confirm,maximumUsd:prepared.manifest.options.maxUsd,maximumInputTokens:prepared.manifest.options.maxInputTokens,maximumCalls:prepared.jobs.length,source:'Explicit CLI --live and full plan hash confirmation'});
   try{const result=await executePrepared(prepared,account,{infer,limit,shouldStop:()=>stopping,onProgress:e=>console.log(JSON.stringify(e))});console.log(JSON.stringify({status:result.report.status,newCalls:result.dispatchedNow,report:result.path,budget:result.report.budget},null,2));if(result.report.status==='stopped')process.exitCode=1;}
   finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  });
 }else throw Error('Unknown command. '+HELP);
}catch(e){console.error(JSON.stringify({status:'stopped',error:e.message}));process.exitCode=1;}
