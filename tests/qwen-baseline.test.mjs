import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildRichPilotPlan} from '../harness/domain/rich-pilot-request.mjs';
import {mapRichToQwen,validateQwenText,parseUniqueJson,QWEN_FIELDS,QWEN_MODEL,observeQwenExchange} from '../harness/domain/qwen-baseline.mjs';
import {createLocalQwenTransport} from '../harness/adapters/local-qwen-http.mjs';
const source=buildRichPilotPlan({templateText:fs.readFileSync(new URL('../policies/prompt-injection-policy-template.md',import.meta.url),'utf8')}).value.rows[0].request;
const valid=Object.fromEntries(Object.entries(QWEN_FIELDS).map(([k,v])=>[k,v==='boolean'?false:v[0]]));
test('mapping preserves exact source content and keeps material in data role',()=>{
 const before=JSON.stringify(source),m=mapRichToQwen(source);assert.equal(m.tag,'ok');assert.equal(JSON.stringify(source),before);
 const system=JSON.parse(m.value.request.messages[0].content.split('\n\n').slice(1).join('\n\n'));
 for(const key of ['classifierGuide','policy','trustedContext'])assert.deepEqual(system[key],source.state[key]);
 assert.deepEqual(system.questions,source.questions);assert.deepEqual(JSON.parse(m.value.request.messages[1].content),{material:source.state.material});
 assert.equal(m.value.request.response_format,undefined);assert.equal(m.value.request.cache_prompt,false);
 const changed=structuredClone(source);changed.state.classifierGuide+='x';assert.equal(mapRichToQwen(changed).tag,'error');
});
test('strict output rejects duplicate keys, fences, coercion, extra keys and invalid enums',()=>{
 assert.deepEqual(validateQwenText(JSON.stringify(valid)).value,valid);
 for(const text of ['```json\n'+JSON.stringify(valid)+'\n```',JSON.stringify({...valid,extra:1}),JSON.stringify({...valid,injection_present:0}),JSON.stringify({...valid,classification:'safe'}),JSON.stringify({...valid,interference_scope:1.5}),'{"classification":"attack",'+JSON.stringify(valid).slice(1)])assert.equal(validateQwenText(text).tag,'error');
 assert.equal(parseUniqueJson('{"a":{"b":1,"b":2}}').tag,'error');assert.equal(parseUniqueJson('{"a":"x\\\"y","b":[{"a":2},true]}').tag,'ok');
});
test('valid answer is not rescued from truncation, wrong model or reasoning',()=>{
 const response={model:QWEN_MODEL,choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(valid)}}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}};
 const observe=data=>observeQwenExchange({tag:'ok',value:{httpStatus:200,bodyText:JSON.stringify(data),latencyMs:100}});
 assert.equal(observe(response).valid,true);
 assert.equal(observe({...response,model:'other'}).valid,false);
 const cutoff=structuredClone(response);cutoff.choices[0].finish_reason='length';assert.equal(observe(cutoff).valid,false);
 const thinking=structuredClone(response);thinking.choices[0].message.reasoning_content='reason';assert.equal(observe(thinking).valid,false);
});
test('local port does not redirect, authenticate, retry or allow arbitrary destinations',async()=>{
 let calls=0;const t=createLocalQwenTransport({fetchImpl:async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:8767/health');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);throw Error('offline');}});
 assert.equal((await t.exchange('https://example.com')).tag,'error');assert.equal(calls,0);
 assert.equal((await t.exchange('/health')).tag,'error');assert.equal(calls,1);
});
