/** Consumer-owned scope resolver. Material is never used as context or authorization. */
import {sha} from './io.mjs';
const CONTEXT_FIELDS=['task','expectedRepresentation','exceptionIds','source'];
const TASK_FIELDS=['id','description'];
function object(x,name){if(!x||typeof x!=='object'||Array.isArray(x))throw Error(name+'_object_required');}
function keys(x,allowed,name){object(x,name);for(const k of Object.keys(x))if(!allowed.includes(k))throw Error(name+'_unknown_field:'+k);}
function text(x,name){if(typeof x!=='string'||!x.trim())throw Error(name+'_text_required');}
function context(c){keys(c,CONTEXT_FIELDS,'context');if(c.task!==undefined&&c.task!==null){keys(c.task,TASK_FIELDS,'task');text(c.task.id,'task_id');text(c.task.description,'task_description');}
 if(c.expectedRepresentation!==undefined&&c.expectedRepresentation!==null)text(c.expectedRepresentation,'expected_representation');
 if(c.exceptionIds!==undefined){if(!Array.isArray(c.exceptionIds)||c.exceptionIds.some(x=>typeof x!=='string')||new Set(c.exceptionIds).size!==c.exceptionIds.length)throw Error('invalid_exception_ids');}
 if(c.source!==undefined){keys(c.source,['id','kind'],'source');text(c.source.id,'source_id');text(c.source.kind,'source_kind');}}
export function resolveBatch(batch,profile){
 keys(batch,['schemaVersion','policyId','sharedContext','entries'],'batch');
 if(batch.schemaVersion!=='consumer-assessment-batch/1'||batch.policyId!==profile.id)throw Error('batch_policy_binding_mismatch');
 context(batch.sharedContext??{});if(!Array.isArray(batch.entries)||!batch.entries.length)throw Error('entries_required');
 const ids=new Set();
 return batch.entries.map(entry=>{
  keys(entry,['id','context','material'],'entry');text(entry.id,'entry_id');if(ids.has(entry.id))throw Error('duplicate_entry_id');ids.add(entry.id);
  if(!Object.hasOwn(entry,'material'))throw Error('material_required');context(entry.context??{});
  const resolved={},origins={};
  for(const k of CONTEXT_FIELDS){if(Object.hasOwn(entry.context??{},k)){resolved[k]=structuredClone(entry.context[k]);origins[k]='entry';}
   else if(Object.hasOwn(batch.sharedContext??{},k)){resolved[k]=structuredClone(batch.sharedContext[k]);origins[k]='shared';}}
  // Whole-field replacement, never a recursive authorization merge; [] explicitly clears defaults.
  for(const id of resolved.exceptionIds??[])if(!profile.exceptionCatalog.some(x=>x.id===id))throw Error('unknown_exception_id:'+id);
  const eligibleExceptions=profile.exceptionCatalog.filter(x=>profile.enabledExceptionIds.includes(x.id)&&(resolved.exceptionIds??[]).includes(x.id)&&x.taskIds.includes(resolved.task?.id)&&x.operation===profile.operation&&x.path==='material');
  return {id:entry.id,material:structuredClone(entry.material),context:resolved,eligibleExceptions:structuredClone(eligibleExceptions),
   receipt:{schemaVersion:batch.schemaVersion,policyId:profile.id,origins,materialHash:sha(JSON.stringify(entry.material)),contextHash:sha(JSON.stringify(resolved)),
    eligibility:'Host field/task/operation checks only. Semantic applicability still requires the model findings; source text cannot activate an exception.'}};
 });
}
/** Derived disposition; not an attempt to repair semantic findings. Explicit precedence mirrors the policy. */
export function deriveDisposition(policy,answers){
 const get=k=>typeof answers?.[k]==='string'?answers[k]:answers?.[k]?.choice;
 const classification=get('classification'),contract=get('input_contract'),relevance=get('content_relevance');
 if(!['attack','benign','insufficient_evidence'].includes(classification)||!['compliant','violation','insufficient_evidence'].includes(contract)||!['relevant','irrelevant','mixed','insufficient_evidence'].includes(relevance))return {choice:'review',reason:'missing_or_invalid_findings'};
 if(policy.operation==='inspect_for_authorized_analysis')return {choice:'allow',reason:'isolated_inspection_only_no_admission'};
 if(policy.operation!=='admit_as_task_data')return {choice:'review',reason:'unsupported_operation'};
 if(contract==='violation')return {choice:'block',reason:'prohibited_representation'};
 if(classification==='attack')return {choice:'block',reason:'unauthorized_redirection'};
 if(contract==='insufficient_evidence'||classification==='insufficient_evidence')return {choice:'review',reason:'decisive_evidence_unresolved'};
 if(relevance!=='relevant')return {choice:'review',reason:'task_relevance_not_established'};
 return {choice:'allow',reason:'contract_compliant_relevant_no_supported_attack'};
}
