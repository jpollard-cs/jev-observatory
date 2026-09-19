import {clone,insist,record} from './core.mjs';

function number(value,min,max){insist(typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max,'answer_number_out_of_range');}
export function normalizeJevResponse(response,judgments){
 record(response);record(response.answers);
 insist(Object.keys(response.answers).length===judgments.length,'answer_count_mismatch');
 return {origin:'native_jev',model:response.model??null,raw:clone(response),answers:Object.fromEntries(judgments.map(q=>{
  const a=response.answers[q.id];insist(a,'answer_missing',{id:q.id});
  const t={categorical:'choice','boolean-proposition':'noul','ordinal-rubric':'score'}[q.kind];insist(a.type===t,'answer_primitive_mismatch',{id:q.id});
  let value;
  if(t==='noul'){number(a.noul,0,1);value=a.noul;}
  else{
   record(a.probabilities);const keys=q.criteria.map(c=>c.key);
   insist(Object.keys(a.probabilities).length===keys.length&&keys.every(k=>Object.hasOwn(a.probabilities,k)),'probability_keys_mismatch');
   for(const x of Object.values(a.probabilities))number(x,0,1);
   insist(Math.abs(Object.values(a.probabilities).reduce((s,x)=>s+x,0)-1)<=0.03,'probabilities_not_normalized');
   number(a.confidence,0,1);
   if(t==='choice'){insist(keys.includes(a.choice),'choice_outside_schema');insist(a.probabilities[a.choice]>=Math.max(...Object.values(a.probabilities))-1e-8,'choice_not_maximum');value=a.choice;}
   else{number(a.score,0,keys.length-1);value=a.score;}
  }
  return [q.id,{kind:q.kind,value,probabilitySemantics:t==='noul'?'provider_yes_probability':'provider_option_distribution',raw:clone(a)}];
 }))};
}
export function normalizeGenerativeAnswer(text,judgments){
 let result;try{result=JSON.parse(text);}catch{throw Error('generative_answer_not_strict_json');}
 record(result);insist(Object.keys(result).length===1&&Object.hasOwn(result,'answers'),'generative_answer_shape');record(result.answers);
 insist(Object.keys(result.answers).length===judgments.length,'answer_count_mismatch');
 const answers={};
 for(const q of judgments){
  const value=result.answers[q.id];
  if(q.kind==='categorical')insist(q.criteria.some(c=>c.key===value),'choice_outside_schema');
  else number(value,0,q.kind==='boolean-proposition'?1:q.criteria.length-1);
  answers[q.id]={kind:q.kind,value,probabilitySemantics:q.kind==='boolean-proposition'?'generated_numeric_judgment_not_native_posterior':'not_supplied',raw:clone(value)};
 }
 return {origin:'generated_json',model:null,raw:result,answers};
}
