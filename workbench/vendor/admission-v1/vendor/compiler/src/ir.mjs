import { VERSION, clone, exactKeys, identifier, insist, jsonHash, jsonValue, orderedObject, record, unique } from './core.mjs';
import { assembleGuidance, decomposeGuidance, validateGuidance } from './guidance.mjs';
import { importDemonstrations } from './examples.mjs';

const KIND = {choice:'categorical',noul:'boolean-proposition',score:'ordinal-rubric'};
export const NATIVE_TYPE = Object.fromEntries(Object.entries(KIND).map(([k,v])=>[v,k]));
const STATE_KEYS=['classifierGuide','policy','trustedContext','material','demonstrations'];
function entry(v) { insist(v===null||typeof v==='string'||typeof v==='object','invalid_description'); jsonValue(v); }
export function importJevRequest(request) {
  exactKeys(request,['model','state','questions'],'unknown_request_field'); jsonValue(request);
  insist(typeof request.model==='string'&&request.model.length>0,'model_required');
  exactKeys(request.state,STATE_KEYS,'unknown_state_field');
  for(const k of STATE_KEYS.slice(0,4)) insist(Object.hasOwn(request.state,k),'missing_state_field',{key:k});
  record(request.state.policy,'policy_object_required'); record(request.state.trustedContext,'trusted_context_object_required');
  record(request.questions,'questions_object_required');
  const judgments=Object.entries(request.questions).map(([id,q])=>{
    identifier(id); exactKeys(q,['type','instructions','criteria'],'unsupported_question_property');
    insist(Object.hasOwn(KIND,q.type),'unsupported_primitive',{id,type:q.type});
    insist(Object.hasOwn(q,'instructions'),'question_instructions_missing',{id}); entry(q.instructions);
    const hasCriteria=Object.hasOwn(q,'criteria');
    insist(q.type==='noul'||hasCriteria,'criteria_required',{id});
    let criteria=[];
    if(hasCriteria){
      if(q.type==='score') {
        insist(Array.isArray(q.criteria)&&q.criteria.length>=2,'score_requires_ordered_levels',{id});
        criteria=q.criteria.map((value,i)=>({key:String(i),description:clone(value)}));
      } else {
        record(q.criteria,'criteria_object_required');
        const keys=Object.keys(q.criteria);
        if(q.type==='noul') insist(keys.length===2 && keys.includes('true')&&keys.includes('false'),'noul_true_false_required',{id});
        else insist(keys.length>=2,'choice_requires_two_options',{id});
        criteria=Object.entries(q.criteria).map(([key,value])=>({key,description:clone(value)}));
      }
      for(const c of criteria)entry(c.description);
    }
    return {id,kind:KIND[q.type],instructions:clone(q.instructions),criteria,hasCriteria,
      dependsOn:[], requiredGuideBlocks:[], originalFieldOrder:Object.keys(q)};
  });
  insist(judgments.length>0,'questions_empty');
  const document={
    schemaVersion:VERSION,
    policyPack:{guidance:decomposeGuidance(request.state.classifierGuide),judgments,
      demonstrations:importDemonstrations(request.state.demonstrations??null)},
    caseInput:{configuration:clone(request.state.policy),trustedContext:clone(request.state.trustedContext),material:clone(request.state.material)},
    compatibility:{model:request.model,topLevelOrder:Object.keys(request),stateOrder:Object.keys(request.state)},
    provenance:{importer:'jev-workspace/1',sourceRequestHash:jsonHash(request)},
  };
  validateDocument(document);
  insist(jsonHash(renderLegacy(document))===jsonHash(request),'legacy_round_trip_failed');
  return document;
}
export function validateDocument(doc) {
  exactKeys(doc,['schemaVersion','policyPack','caseInput','compatibility','provenance'],'unknown_ir_field');
  insist(doc.schemaVersion===VERSION,'unsupported_ir_version'); jsonValue(doc);
  exactKeys(doc.policyPack,['guidance','judgments','demonstrations'],'unknown_policy_pack_field');
  exactKeys(doc.caseInput,['configuration','trustedContext','material'],'evaluation_metadata_in_case_input');
  record(doc.caseInput.configuration); record(doc.caseInput.trustedContext);
  exactKeys(doc.compatibility,['model','topLevelOrder','stateOrder'],'unknown_compatibility_field');
  insist(typeof doc.compatibility.model==='string'&&doc.compatibility.model.length>0,'model_required');
  insist(JSON.stringify([...doc.compatibility.topLevelOrder].sort())===JSON.stringify(['model','questions','state']),'invalid_top_level_order');
  const stateKeys=doc.compatibility.stateOrder;
  unique(stateKeys,'duplicate_state_binding');
  insist(STATE_KEYS.slice(0,4).every(k=>stateKeys.includes(k))&&stateKeys.every(k=>STATE_KEYS.includes(k)),'invalid_state_bindings');
  insist(stateKeys.includes('demonstrations')===(doc.policyPack.demonstrations.corpus!==null),'demonstration_state_binding_mismatch');
  insist(Array.isArray(doc.policyPack.judgments),'judgments_array_required');
  validateGuidance(doc.policyPack.guidance);
  const js=doc.policyPack.judgments, ids=js.map(q=>q.id);
  insist(js.length>0,'questions_empty');unique(ids,'duplicate_question');
  for(const q of js){
    exactKeys(q,['id','kind','instructions','criteria','hasCriteria','dependsOn','requiredGuideBlocks','originalFieldOrder'],'unknown_judgment_field');
    identifier(q.id); insist(Object.hasOwn(NATIVE_TYPE,q.kind),'unsupported_judgment_kind');
    insist(Array.isArray(q.criteria)&&Array.isArray(q.dependsOn)&&Array.isArray(q.requiredGuideBlocks),'invalid_judgment_arrays');
    insist(typeof q.hasCriteria==='boolean','criteria_presence_flag_required');
    const requiredFields=q.hasCriteria?['criteria','instructions','type']:['instructions','type'];
    insist(JSON.stringify([...q.originalFieldOrder].sort())===JSON.stringify(requiredFields),'invalid_question_field_order');
    if(!q.hasCriteria)insist(q.criteria.length===0,'unexpected_criteria');
    entry(q.instructions); unique(q.criteria.map(c=>c.key),'duplicate_option');
    for(const c of q.criteria)entry(c.description);
    if(q.kind==='categorical')insist(q.hasCriteria&&q.criteria.length>=2,'choice_requires_two_options');
    if(q.kind==='ordinal-rubric')insist(q.hasCriteria&&q.criteria.length>=2&&q.criteria.every((c,i)=>c.key===String(i)),'score_levels_not_contiguous');
    if(q.kind==='boolean-proposition'&&q.hasCriteria)insist(q.criteria.length===2&&q.criteria.some(c=>c.key==='true')&&q.criteria.some(c=>c.key==='false'),'noul_true_false_required');
    for(const dep of q.dependsOn)insist(ids.includes(dep),'missing_dependency',{question:q.id,dependency:dep});
    for(const block of q.requiredGuideBlocks)insist(doc.policyPack.guidance.blocks.some(b=>b.id===block),'missing_required_guide_block',{block});
  }
  const visiting=new Set(),visited=new Set();
  function visit(id){insist(!visiting.has(id),'cyclic_question_dependencies');if(visited.has(id))return;visiting.add(id);for(const dep of js.find(q=>q.id===id).dependsOn)visit(dep);visiting.delete(id);visited.add(id);}
  ids.forEach(visit);
  const bank=doc.policyPack.demonstrations;
  insist(jsonHash(bank.corpus)===jsonHash(null)||jsonHash(bank.corpus)===bank.sourceHash,'demonstration_source_hash_mismatch');
  // Reimport deterministically so a stale content/labels bank cannot disagree with the authored source.
  insist(jsonHash(importDemonstrations(bank.corpus))===jsonHash(bank),'demonstration_projection_mismatch');
}
export function nativeQuestion(q) {
  const values={type:NATIVE_TYPE[q.kind],instructions:clone(q.instructions)};
  if(q.hasCriteria) values.criteria=q.kind==='ordinal-rubric'?q.criteria.map(c=>clone(c.description)):orderedObject(q.criteria.map(c=>[c.key,clone(c.description)]));
  return orderedObject(q.originalFieldOrder.map(k=>[k,values[k]]));
}
export function renderLegacy(doc) {
  const {caseInput:c,policyPack:p}=doc;
  const values={classifierGuide:assembleGuidance(p.guidance),policy:clone(c.configuration),trustedContext:clone(c.trustedContext),material:clone(c.material)};
  if(p.demonstrations.corpus!==null)values.demonstrations=clone(p.demonstrations.corpus);
  const top={model:doc.compatibility.model,state:orderedObject(doc.compatibility.stateOrder.map(k=>[k,values[k]])),questions:orderedObject(p.judgments.map(q=>[q.id,nativeQuestion(q)]))};
  return orderedObject(doc.compatibility.topLevelOrder.map(k=>[k,top[k]]));
}
/** Model-neutral content identity; excludes provider selector, run ID and test annotations. */
export function assessmentHash(doc) {
  return jsonHash({policyPack:doc.policyPack,caseInput:doc.caseInput});
}
