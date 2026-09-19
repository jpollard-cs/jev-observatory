import { ok, err } from '../domain/result.mjs';
const ORIGIN='http://127.0.0.1:8767';
const ALLOWED=new Set(['/health','/v1/models','/apply-template','/tokenize','/v1/chat/completions']);
/** Loopback-only transport; captures raw response before interpretation, no retries. */
export function createLocalQwenTransport({fetchImpl=fetch,now=()=>performance.now()}={}){
  return {async exchange(route,body,timeoutMs=30000){
    if(!ALLOWED.has(route))return err('local_qwen_route_not_allowed');
    const started=now();
    try{
      const response=await fetchImpl(ORIGIN+route,{method:body===undefined?'GET':'POST',redirect:'error',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeoutMs)});
      const bodyText=await response.text();
      return ok({httpStatus:response.status,bodyText,latencyMs:now()-started});
    }catch(error){return err(error.name==='TimeoutError'?'timeout':'transport_error',{context:{latencyMs:now()-started}});}
  }};
}
