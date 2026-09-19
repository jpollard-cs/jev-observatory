#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {parseArgs} from 'node:util';
import {preset,validatePolicy} from './src/policy.mjs';
import {defaultApplication,validateApplication} from './src/selection/application.mjs';
import {makeAdvisorPlan,freezeAdvisorPlan,loadAdvisorPlan,adviceSummary} from './src/selection/advisor.mjs';
import {executeAdvisor} from './src/selection/runner.mjs';
import {makeAssistedPlan} from './src/selection/planner.mjs';
import {ROOT,freezePlan} from './src/storage.mjs';import {openAccount} from './src/runner.mjs';
import {immutableJson} from './vendor/admission-v1/io.mjs';import {assert} from './src/util.mjs';
const HELP=`Jev Workbench 0.5 rebuilt — reviewed setup and coverage advice

node selection.mjs prepare --mode rank --policy policy.json --application application.json
node selection.mjs prepare --mode tag --policy policy.json [--catalog descriptors.json]
node selection.mjs prepare --mode setup --policy policy.json --application application.json --budget-usd .01
node selection.mjs run --plan <manifest.json> --confirm <full hash> --project <jev-redteam> --live
node selection.mjs summarize --report <advisor-report.json>
node selection.mjs evaluate --policy policy.json --application application.json --advice <advisor-report.json> --budget-usd .15 --tier budget

prepare and evaluate freeze plans but make no calls. Only run with --live can invoke Jev.
evaluate uses advice for relevance, never expected labels; then prints a separate evaluation command.
Without --advice, evaluate uses a visibly deterministic neutral fallback.
Tags are reviewable proposals, not automatically promoted registry changes.
Setup reports must be imported in Start here; they do not serve as coverage rankings.
`;
try{const [cmd,...args]=process.argv.slice(2);if(!cmd||cmd==='--help'){console.log(HELP);process.exit(0);}
 const {values:v}=parseArgs({args,options:{mode:{type:'string'},catalog:{type:'string'},policy:{type:'string'},preset:{type:'string'},application:{type:'string'},out:{type:'string'},plan:{type:'string'},confirm:{type:'string'},project:{type:'string'},account:{type:'string'},live:{type:'boolean'},limit:{type:'string'},report:{type:'string'},advice:{type:'string'},'budget-usd':{type:'string'},'token-budget':{type:'string'},tier:{type:'string'},layout:{type:'string'},seed:{type:'string'}}});
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
 if(['prepare','evaluate'].includes(cmd)){
  const p=v.policy?validatePolicy(read(v.policy)):preset(v.preset??'strict'),a=v.application?validateApplication(read(v.application)):defaultApplication(p);
  if(cmd==='prepare'){const prepared=makeAdvisorPlan(p,a,{mode:v.mode??'rank',maxUsd:Number(v['budget-usd']??.02),maxInputTokens:Number(v['token-budget']??500000)},v.catalog?read(v.catalog):null),saved=freezeAdvisorPlan(prepared,v.out??path.join(ROOT,'runtime/advisor-plans',prepared.manifest.planHash));console.log(JSON.stringify({status:prepared.manifest.status,...saved,calls:prepared.jobs.length,budget:prepared.manifest.budget,liveCalls:0,command:`node selection.mjs run --plan "${saved.planPath}" --confirm ${saved.planHash} --project "/path/to/jev-redteam" --live`},null,2));}
  else{const report=v.advice?read(v.advice):null,prepared=makeAssistedPlan(p,a,{tier:v.tier??'budget',maxUsd:Number(v['budget-usd']??.15),maxInputTokens:Number(v['token-budget']??3000000),layouts:!v.layout||v.layout==='both'?['question','criteria']:[v.layout],seed:v.seed??'coverage-advisor-1'},report),saved=freezePlan(prepared,v.out??path.join(ROOT,'runtime/plans',prepared.manifest.planHash));console.log(JSON.stringify({status:prepared.manifest.state,...saved,counts:prepared.manifest.counts,budget:prepared.manifest.budget,coverage:prepared.manifest.coverage,liveCalls:0,command:`node cli.mjs run --plan "${saved.planPath}" --confirm ${saved.planHash} --project "/path/to/jev-redteam" --live`},null,2));}
 }else if(cmd==='summarize'){assert(v.report,'--report required');console.log(JSON.stringify(adviceSummary(read(v.report)),null,2));}
 else if(cmd==='run'){
  assert(v.plan&&v.confirm,'--plan and --confirm required');const prepared=loadAdvisorPlan(v.plan);assert(prepared.manifest.planHash===v.confirm,'Full plan hash confirmation required');assert(v.live,'Offline only; add --live after reviewing the exact advisor request and budget');assert(prepared.manifest.status==='prepared_offline','Advisor minimum cannot fit budget');
  const limit=v.limit===undefined?prepared.jobs.length:Number(v.limit);assert(Number.isSafeInteger(limit)&&limit>0&&limit<=prepared.jobs.length,'Invalid invocation limit');
  const acct=await openAccount({project:v.project,account:v.account});await acct.api.withLock(acct.lock,async()=>{
   if(fs.existsSync(acct.envFile))process.loadEnvFile(acct.envFile);
   const endpoint=acct.api.readEndpoint('jev',{...process.env,JEV_MODEL:'jev-1.13.0',JEV_REQUEST_VERSION:'policy-v4',JEV_INPUT_USD_PER_MILLION:process.env.JEV_INPUT_USD_PER_MILLION??'.042',JEV_OUTPUT_USD_PER_MILLION:process.env.JEV_OUTPUT_USD_PER_MILLION??'0'});
   assert(endpoint.url==='https://api.typesafe.ai/v1/systemone','Only TypeSafe endpoint allowed');assert(endpoint.inputPrice===.042&&endpoint.outputPrice===0,'Pricing differs from frozen account convention');
   let stopping=false;const stop=()=>{stopping=true;console.log('{"event":"stop_requested_no_retry"}');};process.on('SIGINT',stop);process.on('SIGTERM',stop);
   const infer=await acct.api.createRichInference(endpoint,{fetchImpl:(url,opt)=>fetch(url,{...opt,redirect:'error',signal:AbortSignal.timeout(30000)})});
   immutableJson(path.join(acct.runRoot,'catalog-advisor-'+v.confirm.slice(0,20),'approval.json'),{planHash:v.confirm,maximumUsd:prepared.manifest.options.maxUsd,maximumCalls:prepared.jobs.length,purpose:prepared.manifest.options.mode,source:'Explicit CLI confirmation and --live'});
   try{const r=await executeAdvisor(prepared,acct,{infer,limit,shouldStop:()=>stopping,onProgress:e=>console.log(JSON.stringify(e))});console.log(JSON.stringify({status:r.report.status,report:r.path,newCalls:r.dispatchedNow,budget:r.report.budget},null,2));if(r.report.status==='stopped')process.exitCode=1;}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  });
 }else throw Error('Unknown command. '+HELP);
}catch(e){console.error(JSON.stringify({status:'stopped',error:e.message}));process.exitCode=1;}
