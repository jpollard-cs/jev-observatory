import { clone, exactKeys, insist, jsonHash, jsonValue, record, unique } from './core.mjs';

const DIRECT = ['classification','integrity','input_contract','policy_decision','technique_profile','meaning_evidence'];
/** Only developer-authored demonstration labels are projected. Never accepts evaluation gold. */
export function importDemonstrations(corpus) {
  if (corpus === null) return { sourceHash:null, corpus:null, examples:[] };
  record(corpus); jsonValue(corpus);
  if(corpus.schemaVersion==='demonstration-corpus/1'){
    exactKeys(corpus,['schemaVersion','purpose','examples'],'unknown_canonical_corpus_field');
    insist(corpus.purpose==='demonstrations','demonstration_purpose_required');
    insist(Array.isArray(corpus.examples),'examples_array_required');
    const examples=corpus.examples.map((e,i)=>{
      exactKeys(e,['id','family','content','labels'],'unknown_canonical_example_field');
      insist(typeof e.id==='string'&&e.id.length>0,'example_id_required');record(e.content);record(e.labels);
      const labels={};
      for(const [qid,value]of Object.entries(e.labels)){
        if(value===null)continue; // Explicitly unresolved authoring annotation, never false.
        insist(['string','number','boolean'].includes(typeof value),'invalid_authored_example_label',{qid});
        labels[qid]={value,origin:'explicit_demonstration_label'};
      }
      const content={...clone(e.content),...(e.family?{family:e.family}:{}),authoredAnswerProfile:clone(e.labels)};
      return {id:e.id,family:e.family??null,sourcePointer:`/examples/${i}`,content,contentHash:jsonHash(content),labels,originalProfile:clone(e.labels)};
    });
    unique(examples.map(e=>e.id),'duplicate_example_id');
    return {sourceHash:jsonHash(corpus),corpus:clone(corpus),examples};
  }
  insist(corpus.answerProfiles && (Array.isArray(corpus.pairs) || Array.isArray(corpus.examples)), 'unsupported_demonstration_format');
  insist(!(corpus.pairs && corpus.examples), 'ambiguous_demonstration_format');
  const unpacked = corpus.pairs ? corpus.pairs.flatMap((pair,i)=>['a','b'].map(side=>({
    id:`demo-${String(i+1).padStart(3,'0')}-${side}`, pairContext:pair.context??{}, contrast:pair.contrast??null,
    family:pair.family, source:pair[side], sourcePointer:`/pairs/${i}/${side}`,
  }))) : corpus.examples.map((e,i)=>({id:`demo-${String(i+1).padStart(3,'0')}`,pairContext:{},contrast:null,family:e.family??null,source:e,sourcePointer:`/examples/${i}`}));
  const examples = unpacked.map(({id,pairContext,contrast,family,source,sourcePointer})=>{
    record(source); const profile=corpus.answerProfiles[source.answerProfile];
    insist(profile, 'missing_demonstration_profile', {id,profile:source.answerProfile});
    // Keep every authored fact. Remove only its named profile link; resolve it below.
    const sample = clone(source); delete sample.answerProfile;
    const context = {...clone(corpus.defaultContext??{}),...clone(pairContext),...clone(source.context??{})};
    delete sample.context;
    // Display IDs/family tags are authoring annotations, not inferred test labels.
    delete sample.id; delete sample.family;
    const content = {context, ...sample, ...(family?{family}:{}), authoredAnswerProfile:clone(profile)};
    if (contrast) content.contrast=contrast;
    if (corpus.representationReference) content.representationReference=clone(corpus.representationReference);
    const labels = {};
    for (const key of DIRECT) if(Object.hasOwn(profile,key)) labels[key]={value:profile[key],origin:'authored_profile'};
    for (const [key,value] of Object.entries(profile.semanticFindings??{})) labels[key]={value,origin:'authored_semantic_profile'};
    const classification=profile.classification, integrity=profile.integrity;
    // Explicit adapter mappings, documented and tested; uncertainty is never labeled false.
    if(['attack','benign'].includes(classification)) labels.injection_present={value:classification==='attack',origin:'classification_to_injection_v1'};
    if(['poisoned','attempted_only','no_poisoning_evidence'].includes(integrity)) labels.poisoning_evidenced={value:integrity==='poisoned',origin:'integrity_to_poisoning_v1'};
    // No Score labels fabricated from classification, behavior, or a numeric threshold.
    return { id, family, sourcePointer, content, contentHash:jsonHash(content), labels, originalProfile:clone(profile) };
  });
  unique(examples.map(e=>e.id),'duplicate_example_id');
  return {sourceHash:jsonHash(corpus), corpus:clone(corpus), examples};
}
export function examplesForQuestion(bank, question) {
  const assigned=[], unassigned=[];
  for (const e of bank.examples) {
    const annotation=e.labels[question.id];
    const key=annotation===undefined ? null : String(annotation.value);
    if (key !== null && question.criteria.some(c=>c.key===key)) {
      assigned.push({id:e.id,key,content:clone(e.content),origin:annotation.origin,contentHash:e.contentHash});
    } else {
      // Preserved as an explicitly ungraded contextual example, not slipped into "false".
      unassigned.push({id:e.id,reason:annotation?'label_not_in_question_options':'no_definite_authoring_label',
        content:{...clone(e.content),authoredAnswerProfile:clone(e.originalProfile)},contentHash:jsonHash({...clone(e.content),authoredAnswerProfile:clone(e.originalProfile)})});
    }
  }
  return {assigned,unassigned};
}
