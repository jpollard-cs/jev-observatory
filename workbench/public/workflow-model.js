/** Presentation state, not an authorization or security score. */
export const STEPS=[{id:'describe',label:'Describe',nav:'start'},{id:'rules',label:'Review rules',nav:'policy'},{id:'tests',label:'Choose tests',nav:'planner'},{id:'run',label:'Authorize run',nav:'review'},{id:'results',label:'Inspect results',nav:'evidence'}];
export const draftStamp=(policy,application)=>JSON.stringify({policy,application});
export const appStamp=application=>JSON.stringify(application);
export function workflowStatus(s){
 const j=s.journey??{},described=j.description===appStamp(s.application),rules=described&&j.rules===draftStamp(s.policy,s.application);
 const saved=!!s.frozen&&s.frozen.manifest?.state==='prepared_offline';
 const matched=saved&&s.evidence?.planHash===s.frozen.planHash;
 const run=matched&&(s.evidence.dispatched>0||s.evidence.validCalls>0);
 const complete=run&&s.evidence.status==='complete'&&s.evidence.validCalls===s.evidence.requestedCalls;
 const done={describe:described,rules,tests:saved,run,results:complete},setupCount=[described,rules,saved].filter(Boolean).length;
 return {done,setupCount,run,complete,matched,next:STEPS.find(x=>!done[x.id])??STEPS.at(-1),description:'Setup progress only. Archived experiments do not validate this draft.'};
}
export function isSetupCurrent(s){return !!s.setupInputStamp&&s.setupInputStamp===draftStamp(s.policy,s.application);}
export function languageLabel(code){
 try{return new Intl.DisplayNames(['en'],{type:'language'}).of(code)??code;}catch{return code;}
}
export function setupLanguageReview(s){
 const summary=isSetupCurrent(s)?s.setupSummary:null;
 const notes=summary?.notes??s.setupTransaction?.unresolvedNotes??[];
 if(notes.some(n=>(n.field==='languages'||n.field==='language_scope')&&n.disposition!=='default_retained'))return 'manual';
 const suggestions=summary?.suggestions??s.setupTransaction?.unappliedSuggestions??[];
 return suggestions.some(x=>x.id==='languages'||x.id==='language_scope')?(summary?'pending':'manual'):null;
}
export function estimatedBudgetView(b){
 if(!b)return null;const budget=b.requestedUsd??b.maxUsd,selected=b.selectedReservationUsd??b.reservationUsd;
 return {budget,selected,forecast:b.estimatedUsd,unused:Math.max(0,budget-selected),complete:!!b.completeCatalogInBudget,fraction:budget>0?Math.min(1,selected/budget):0};
}

/** Binds an apply response to the exact owner choices that were reviewed. */
export const setupReviewStamp=s=>JSON.stringify({draft:draftStamp(s.policy,s.application),reportHash:s.setupReport?.reportHash,selected:s.setupPicks,languageChoice:s.setupLanguageChoice});
