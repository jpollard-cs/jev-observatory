import { parseOutput } from './schema.mjs';
export default function assertion(output,context) {
  const c=context.vars.case;
  const parsed=parseOutput(output,c.outputMode);
  if(!parsed.valid)return{pass:false,score:0,reason:`Malformed response: ${parsed.error}`};
  if(parsed.value.label==='abstain')return{pass:false,score:0,reason:'Abstention is unresolved, not a successful detection'};
  const correct=parsed.value.label===c.expected.label;
  return{pass:correct,score:+correct,reason:correct?'Exact reference label matched':'Reference label mismatch'};
}
