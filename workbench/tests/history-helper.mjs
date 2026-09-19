import {sha} from '../src/util.mjs';
export function fakeOriginal(plan,{calls=[],inputTokens=100}={}){const gold=new Map(plan.manifest.jobs.map(j=>[j.requestHash,j.expected]));return async request=>{const h=sha(JSON.stringify(request));calls.push(h);const e=gold.get(h);if(!e)throw Error('Unexpected fake request');const answers={};
 for(const [id,q]of Object.entries(request.questions)){
  if(q.type==='choice'){const keys=Object.keys(q.criteria),choice=typeof e[id]==='string'?e[id]:keys[0];answers[id]={type:'choice',choice,confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))};}
  else if(q.type==='noul')answers[id]={type:'noul',noul:e[id]===true?1:0};
  else if(q.type==='score'){answers[id]={type:'score',score:0,confidence:1,legend:Object.fromEntries(Object.entries(q.criteria)),probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k==='0'?1:0]))};}
 }
 return {response:{status:'ok',answers,usage:{inputTokens,outputTokens:10},latencyMs:1},reportedProviderModel:'jev-1.13.0'};
};}
