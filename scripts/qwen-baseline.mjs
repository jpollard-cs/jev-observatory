import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadRichPilotPlan } from './rich-pilot.mjs';
import { writeCampaignFile, withCampaignLock } from './campaign.mjs';
import { unwrap } from '../harness/domain/result.mjs';
import { QWEN_PROTOCOL,QWEN_MODEL,QWEN_SETTINGS,QWEN_FIELDS,qwenHash,mapRichToQwen,observeQwenExchange,parseUniqueJson } from '../harness/domain/qwen-baseline.mjs';
import { createLocalQwenTransport } from '../harness/adapters/local-qwen-http.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original=path.join(root,'runs/rich-template-pilot-v1');
const directory=path.join(root,'runs',QWEN_PROTOCOL);
const work=path.resolve(root,'../../work/qwen-unsloth');
const now=()=>new Date().toISOString();
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>writeCampaignFile(file,JSON.stringify(value,null,2)+'\n');
const artifacts=['harness/domain/qwen-baseline.mjs','harness/adapters/local-qwen-http.mjs','scripts/qwen-baseline.mjs'];
const codePins=()=>Object.fromEntries(artifacts.map(file=>[file,qwenHash(fs.readFileSync(path.join(root,file),'utf8'))]));
const exchangeData=result=>{
 if(result.tag==='error')return result;
 if(result.value.httpStatus!==200)return {tag:'error',error:{code:`local_http_${result.value.httpStatus}`}};
 return parseUniqueJson(result.value.bodyText);
};
async function identity(transport){
 unwrap(exchangeData(await transport.exchange('/health')));
 const models=unwrap(exchangeData(await transport.exchange('/v1/models')));
 if(models.data?.length!==1||models.data[0].id!==QWEN_MODEL)throw Error('local_model_identity_mismatch');
 return models;
}
async function prepare(transport){
 await identity(transport);
 const source=loadRichPilotPlan(original);
 const setup=read(path.join(root,'data/local-unsloth-setup.json'));
 const session=read(path.join(work,'server-runs/rich-baseline-v1/server-session.json'));
 const rows=[];
 for(const row of source.rows){
  const sourceBody=fs.readFileSync(path.join(original,'requests',row.requestHash+'.json'),'utf8');
  if(qwenHash(sourceBody)!==row.requestHash)throw Error('original_request_hash_mismatch');
  const mapped=unwrap(mapRichToQwen(JSON.parse(sourceBody)));
  const rendered=unwrap(exchangeData(await transport.exchange('/apply-template',mapped.request)));
  if(typeof rendered.prompt!=='string')throw Error('local_template_render_failed');
  const tokenized=unwrap(exchangeData(await transport.exchange('/tokenize',{content:rendered.prompt,add_special:true,parse_special:true})));
  if(!Array.isArray(tokenized.tokens)||!tokenized.tokens.every(Number.isSafeInteger))throw Error('local_tokenization_failed');
  const requestHash=qwenHash(mapped.request);
  writeCampaignFile(path.join(directory,'requests',requestHash+'.json'),JSON.stringify(mapped.request));
  writeCampaignFile(path.join(directory,'rendered',requestHash+'.txt'),rendered.prompt);
  rows.push({id:row.id,lineage:row.lineage,family:row.family,lengthTarget:row.lengthTarget,expected:row.expected,
   originalRequestHash:row.requestHash,requestHash,renderedPromptHash:qwenHash(rendered.prompt),inputTokens:tokenized.tokens.length,
   supported:tokenized.tokens.length+QWEN_SETTINGS.max_tokens<=32768,
   sourceFieldHashes:mapped.sourceFieldHashes,questionsHash:mapped.questionsHash});
 }
 const firstShort=rows.find(r=>r.lengthTarget===1024&&r.supported);
 const largest=rows.filter(r=>r.supported).sort((a,b)=>b.inputTokens-a.inputTokens)[0];
 const core={protocolVersion:QWEN_PROTOCOL,sourcePlanHash:source.planHash,templateHash:source.templateHash,model:QWEN_MODEL,
  repository:setup.repository,revision:setup.revision,quantization:setup.quantization,modelFiles:setup.modelFiles,runtime:setup.runtime,
  embeddedTemplateHash:setup.ggufHeaderPreflight?.chatTemplateSha256??'see_pinned_GGUF_inventory',
  serverCommand:session.command,codePins:codePins(),generation:QWEN_SETTINGS,contextTokens:32768,concurrency:1,timeoutMs:600000,
  schemaMode:'unconstrained_generated_json',cachePolicy:'cache_prompt:false; cache RAM disabled; no context shifting',
  order:'Original frozen dispatch order, unchanged',maximumEvaluationCalls:48,maximumCompatibilityCalls:2,
  smokeIds:[firstShort.id,largest.id],rows,
  authorization:'User said do it after the proposed Qwen comparison and bounded failure diagnostic; existing full guide remains unchanged.',
  limitations:['Eight dependent development lineages, not a held-out ranking.','Qwen joint generated JSON differs from Jev independent native judgments.','Local uncached timing and Jev API timing have different serving conditions.','Setup/compatibility attempts are separate; no retries, output repair or external detector.']};
 const plan={...core,planHash:qwenHash(core)};
 write(path.join(directory,'manifest.json'),plan);
 console.log(JSON.stringify({status:'prepared',planHash:plan.planHash,cases:rows.length,supported:rows.filter(r=>r.supported).length,minInputTokens:Math.min(...rows.map(r=>r.inputTokens)),maxInputTokens:Math.max(...rows.map(r=>r.inputTokens)),smokeIds:plan.smokeIds}));
}
function loadPlan(){
 const plan=read(path.join(directory,'manifest.json'));const {planHash,...core}=plan;
 if(qwenHash(core)!==planHash||JSON.stringify(plan.codePins)!==JSON.stringify(codePins()))throw Error('qwen_plan_or_code_changed');
 return plan;
}
async function dispatch(plan,row,phase,transport){
 const folder=path.join(directory,phase,qwenHash(row.id));
 const complete=path.join(folder,'record.json');
 if(fs.existsSync(complete))return read(complete);
 const body=fs.readFileSync(path.join(directory,'requests',row.requestHash+'.json'),'utf8');
 if(qwenHash(body)!==row.requestHash)throw Error('qwen_frozen_request_changed');
 fs.mkdirSync(folder,{recursive:true});
 const claim=path.join(folder,'dispatch.json');
 // A claim with no response denotes unknown dispatch, never a retry.
 if(fs.existsSync(claim))throw Error('qwen_incomplete_dispatch_not_retried');
 fs.writeFileSync(claim,JSON.stringify({id:row.id,planHash:plan.planHash,requestHash:row.requestHash,startedAt:now(),phase}),{flag:'wx'});
 let exchange=null,observation;
 if(!row.supported)observation={status:'unsupported_length',valid:false,answers:null,usage:null,error:'input_plus_output_exceeds_context'};
 else{
  exchange=await transport.exchange('/v1/chat/completions',JSON.parse(body),plan.timeoutMs);
  write(path.join(folder,'exchange.json'),exchange);
  observation=observeQwenExchange(exchange);
 }
 const record={id:row.id,phase,planHash:plan.planHash,requestHash:row.requestHash,renderedPromptHash:row.renderedPromptHash,
  inputTokensPreflight:row.inputTokens,finishedAt:now(),...observation,
  tokenCountMatches:observation.usage?.prompt_tokens===row.inputTokens,
  cachedTokens:observation.usage?.prompt_tokens_details?.cached_tokens??null,
  exchangeHash:exchange===null?null:qwenHash(exchange)};
 write(complete,record);
 return record;
}
async function run(plan,phase,transport){
 await identity(transport);
 if(phase==='evaluation'){
  const compatibility=plan.smokeIds.map(id=>read(path.join(directory,'compatibility',qwenHash(id),'record.json')));
  if(compatibility.some(r=>!r.valid||!r.tokenCountMatches||r.cachedTokens!==0))throw Error('qwen_exact_request_compatibility_failed');
 }
 const rows=phase==='compatibility'?plan.rows.filter(r=>plan.smokeIds.includes(r.id)):plan.rows;
 let count=0;
 for(const row of rows){
  const r=await dispatch(plan,row,phase,transport);count++;
  console.log(JSON.stringify({phase,completed:count,total:rows.length,id:row.id,status:r.status,latencyMs:r.latencyMs,inputTokens:r.usage?.prompt_tokens,cachedTokens:r.cachedTokens}));
  if(['transport_error','http_error','envelope_error','usage_error'].includes(r.status))throw Error('qwen_infrastructure_failure_stop');
  if(r.usage&&(!r.tokenCountMatches||r.cachedTokens!==0))throw Error('qwen_runtime_protocol_mismatch');
 }
 console.log(JSON.stringify({status:'complete',phase,completed:count}));
}
export async function main(argv=process.argv.slice(2)){
 const {values}=parseArgs({args:argv,options:{prepare:{type:'boolean'},smoke:{type:'boolean'},live:{type:'boolean'},'max-requests':{type:'string'}}});
 if([values.prepare,values.smoke,values.live].filter(Boolean).length!==1)throw Error('choose_qwen_prepare_smoke_or_live');
 if(values.live&&values['max-requests']!=='48')throw Error('qwen_explicit_48_call_cap_required');
 if(values.smoke&&values['max-requests']!=='2')throw Error('qwen_explicit_2_call_cap_required');
 await withCampaignLock(path.join(root,'runs/.qwen-baseline.lock'),async()=>{
  const transport=createLocalQwenTransport();
  if(values.prepare)await prepare(transport);else await run(loadPlan(),values.smoke?'compatibility':'evaluation',transport);
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({status:'stopped',error:error.message}));process.exitCode=1;});
