import fs from 'node:fs';
import { readEndpoint,infer,reservationUsd,requestPayload } from './provider.mjs';
import { buildMessages } from './prompt.mjs';
import { parseOutput } from './schema.mjs';
import { hash,design } from './corpus.mjs';
const budget = { attempts:0,reserved:0 };
export default class JevProvider {
  constructor(options={}) { this.alias=options.config?.alias || 'jev'; }
  id(){return `model-only:${this.alias}`;}
  async callApi(prompt,context={}) {
    if(process.env.JEV_BENCHMARK_LIVE!=='1') return {error:'Live inference disabled. Run the documented bounded wrapper with --live.'};
    const maxRequests=Number(process.env.JEV_BENCHMARK_MAX_REQUESTS),maxCost=Number(process.env.JEV_BENCHMARK_MAX_COST_USD);
    if(!Number.isInteger(maxRequests)||maxRequests<1||!Number.isFinite(maxCost)||maxCost<=0) return {error:'Explicit request and USD caps are required'};
    const c=context.vars?.case;
    if(!c?.id || !c.context || !c.expected) return {error:'Reviewed corpus case required; exploration generation must be reviewed and imported before evaluation'};
    let endpoint;try{endpoint=readEndpoint(this.alias);}catch(error){return {error:error.message};}
    const messages=requestPayload(endpoint,c,design.maxOutputTokens),reservation=reservationUsd(endpoint,messages,design.maxOutputTokens);
    if(budget.attempts>=maxRequests||budget.reserved+reservation>maxCost)return{error:'Live budget exhausted'};
    budget.attempts++;budget.reserved+=reservation;
    const result=await infer({endpoint,caseItem:c,outputMode:c.outputMode,maxOutputTokens:design.maxOutputTokens,timeoutMs:design.timeoutMs});
    const parsed=result.status==='ok'?parseOutput(result.output,c.outputMode):null;
    const runId=process.env.JEV_BENCHMARK_RUN_ID || 'promptfoo';
    const row={runId,model:this.alias,configuredModel:endpoint.model,transport:endpoint.transport,constrainedOutput:endpoint.constrainedOutput,repeat:0,attempt:budget.attempts,case:c,inputChars:JSON.stringify(messages).length,inputUtf8Bytes:Buffer.byteLength(JSON.stringify(messages)),requestHash:hash(JSON.stringify(messages)),...result,parsed};
    const rawPath=process.env.JEV_BENCHMARK_RAW_PATH;
    if(rawPath)fs.appendFileSync(rawPath,JSON.stringify(row)+'\n');
    if(result.usage && ((endpoint.transport!=='typesafe_systemone' && result.usage.outputTokens>design.maxOutputTokens) || (result.usage.inputTokens*endpoint.inputPrice+result.usage.outputTokens*endpoint.outputPrice)/1e6>reservation))budget.attempts=maxRequests;
    if(result.status!=='ok')return{error:result.error};
    return{output:result.output,tokenUsage:result.usage?{prompt:result.usage.inputTokens,completion:result.usage.outputTokens,total:result.usage.totalTokens}:undefined,metadata:{inputChars:row.inputChars,modelOnly:true,constrainedOutput:endpoint.constrainedOutput}};
  }
}
