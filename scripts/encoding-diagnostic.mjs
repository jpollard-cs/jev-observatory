import fs from 'node:fs';import path from 'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{parseArgs}from'node:util';
import{writeCampaignFile,withCampaignLock}from'./campaign.mjs';
import{loadRichPilotPlan,richDiskPorts,createRichInference}from'./rich-pilot.mjs';
import{runRichPilot,replayRichLedger,richBudgetStatus}from'../harness/application/rich-pilot-run.mjs';
import{buildEncodingDiagnostic,ENCODING_PROTOCOL,ENCODING_LIMITS}from'../harness/domain/encoding-diagnostic.mjs';
import{unwrap}from'../harness/domain/result.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),directory=path.join(root,'runs',ENCODING_PROTOCOL),ledgerDirectory=path.join(root,'runs/rich-restart-budget-v1');
const events=()=>fs.readdirSync(ledgerDirectory).filter(n=>n.endsWith('.json')).sort().map(n=>JSON.parse(fs.readFileSync(path.join(ledgerDirectory,n),'utf8')));
export async function main(argv=process.argv.slice(2)){
 const{values}=parseArgs({args:argv,options:{prepare:{type:'boolean'},live:{type:'boolean'},'max-requests':{type:'string'},'max-cost-usd':{type:'string'}}});
 if([values.prepare,values.live].filter(Boolean).length!==1)throw Error('choose_diagnostic_prepare_or_live');
 if(values.live&&(values['max-requests']!=='32'||Number(values['max-cost-usd'])!==0.20))throw Error('diagnostic_explicit_caps_required');
 await withCampaignLock(path.join(root,'runs/.rich-restart.lock'),async()=>{
  const frozen=unwrap(buildEncodingDiagnostic({templateText:fs.readFileSync(path.join(root,'policies/prompt-injection-policy-template.md'),'utf8')}));
  if(values.prepare){
   for(const[hash,body]of Object.entries(frozen.bodies))writeCampaignFile(path.join(directory,'requests',hash+'.json'),body);
   writeCampaignFile(path.join(directory,'manifest.json'),JSON.stringify(frozen.plan,null,2)+'\n');
   const review={status:'approved_for_bounded_diagnostic',planHash:frozen.plan.planHash,templateHash:frozen.plan.templateHash,decisionBy:'operator_review',authority:'User: do it, after Qwen comparison and targeted failure diagnostic proposal.',limits:ENCODING_LIMITS,checks:['32 complete factorial cells','Full approved guide unchanged','Offline Morse/acrostic recovery matches authored plaintext','Recovery alternatives absent from classification requests','Identical state within classification/recovery twins','No few-shot examples, external inference decoder, retry, output repair or post-hoc tuning'],independentHumanReviewed:false,priceSource:frozen.plan.priceSource};
   writeCampaignFile(path.join(root,'data/encoding-diagnostic-review.json'),JSON.stringify(review,null,2)+'\n');
   console.log(JSON.stringify({status:'prepared',planned:32,planHash:frozen.plan.planHash,reservationUsd:frozen.plan.plannedReservationNanoUsd/1e9,maximumStageCostUsd:0.20}));return;
  }
  const plan=loadRichPilotPlan(directory),review=JSON.parse(fs.readFileSync(path.join(root,'data/encoding-diagnostic-review.json'),'utf8'));
  if(plan.planHash!==frozen.plan.planHash||review.planHash!==plan.planHash||review.status!=='approved_for_bounded_diagnostic'||plan.rows.length!==32||plan.plannedReservationNanoUsd>200000000)throw Error('diagnostic_review_or_plan_mismatch');
  const history=events(),ledger=unwrap(replayRichLedger(history));
  if(ledger.knownNanoUsd+ledger.heldNanoUsd+plan.plannedReservationNanoUsd>3000000000)throw Error('diagnostic_restart_budget_insufficient');
  if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
  const{readEndpoint}=await import('../harness/provider.mjs');
  const endpoint=readEndpoint('jev',{...process.env,JEV_MODEL:plan.model,JEV_REQUEST_VERSION:'policy-v4',JEV_INPUT_USD_PER_MILLION:'0.042',JEV_OUTPUT_USD_PER_MILLION:'0'});
  const result=unwrap(await runRichPilot({plan,events:history,limit:32},richDiskPorts(directory,ledgerDirectory,{infer:await createRichInference(endpoint),progress:r=>console.log(JSON.stringify(r))})));
  console.log(JSON.stringify({protocol:ENCODING_PROTOCOL,...result}));
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({status:'stopped',error:error.message}));process.exitCode=1;});
