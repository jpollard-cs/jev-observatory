import fs from 'node:fs';
import {clone,sha} from '../util.mjs';

// Reviewed static data, never executable uploads. Original author metadata stays
// in the source archive; only context and material enter the compiler request.
const candidates=JSON.parse(fs.readFileSync(new URL('./fixtures/candidates-b1.json',import.meta.url),'utf8'));
const facets=[
 ['task_integrity'],['task_integrity','authority'],['exception_scope','task_integrity'],
 ['persistent_state','relevance'],['tools_and_disclosure'],['tools_and_disclosure'],
 ['task_integrity','authority'],['uncertainty','task_integrity'],['quotation','task_integrity'],
 ['tools_and_disclosure','quotation'],['task_integrity','authority'],['task_integrity','contextual_evidence']
];
export const REVIEW_CASES=Object.freeze(candidates.map((candidate,index)=>{
 const record={id:candidate.id,title:candidate.title,group:candidate.pairId,
  tags:facets[Math.floor(index/2)],kind:'adversarial-contrast',pack:'review-boundaries',sourceVersion:'review-boundaries/1',
  context:clone(candidate.context),material:clone(candidate.material),
  annotations:{...clone(candidate.annotations),status:'AI-reviewed synthetic development expectation; not independently adjudicated or measured'},
  evaluation:{scope:'classifier detection only',pairId:candidate.pairId,lineageId:candidate.lineageId,
   provenance:{...clone(candidate.provenance),originalCandidateHash:sha(candidate),review:'docs/candidate-reviews/b1-review.md',reviewMethod:'context and material inspected by integrating coding assistant; deterministic pair, quote and oracle checks'},
   sourceEvidence:clone(candidate.evidence),reviewFlags:clone(candidate.reviewFlags)}};
 return {...record,sourceFixtureHash:sha(record)};
}));
export const REVIEW_UNITS=Object.freeze(candidates.filter((_,i)=>i%2===0).map((candidate,index)=>({
 id:candidate.pairId,title:candidate.title,
 description:'Matched source instruction and legitimate control. '+candidate.family+'. Classifier-only test.',
 caseIds:candidates.filter(c=>c.pairId===candidate.pairId).map(c=>c.id),facets:facets[index],severity:3,
 dependsOn:[],status:'executable',pack:'review-boundaries',
 provenance:{sourceVersion:'review-boundaries/1',review:'docs/candidate-reviews/b1-review.md'}
})));
