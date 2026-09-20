import {esc,button} from './ui.js';
import {isSetupCurrent,languageLabel} from './workflow-model.js';
const label=p=>p.mode==='any'?'Any language':p.allowed.map(languageLabel).join(', ');
export const hasSetupSelection=s=>!!(s.setupPicks?.length||s.setupLanguageChoice);
export const setupApplyLabel=s=>s.setupLanguageChoice?'Apply reviewed settings':'Apply '+s.setupPicks.length+' selected change'+(s.setupPicks.length===1?'':'s');
export function setupLanguageChoices(s,boot){
 if(!s.setupSummary||!isSetupCurrent(s))return '';
 const choice=s.setupLanguageChoice,current=s.policy.languages,offered=boot.modelLanguages?.[s.policy.model]?.options??[];
 const chosen=choice?.mode==='allowlist'?choice.allowed:current.allowed;
 const selected=choice?.mode==='keep_current'?label(current):choice?label(choice):null;
 return `<section class="setup-language-choice" aria-label="Review input languages"><h3>Input languages</h3><p>Current policy: <strong>${esc(label(current))}</strong>. ${s.setupSummary.notes.some(x=>x.field==='languages'&&x.disposition==='default_retained')?'No preference was identified in your description. Review whether this default fits.':'These choices control admitted input, not the language of generated replies.'}</p><div class="actions">${button('Keep '+label(current),'setup-language-keep','small')}${offered.some(x=>x.code==='en')&&!(current.mode==='allowlist'&&current.allowed.length===1&&current.allowed[0]==='en')?button('English only','setup-language-english','small'):''}${current.mode!=='any'?button('Any language','setup-language-any','small'):''}${button('Choose languages','setup-language-choose','small')}</div><p class="fine">Any language removes this language restriction; it does not claim model support or test coverage for every language. Attack and other policy checks still apply.</p>${s.setupLanguageExpanded?`<div class="check-grid">${offered.map(x=>`<label class="check"><input type="checkbox" data-setup-language="${esc(x.code)}" ${chosen.includes(x.code)?'checked':''}><span>${esc(x.label)}</span></label>`).join('')}</div>`:''}${selected?`<p role="status"><strong>Your choice:</strong> ${esc(selected)}. Apply reviewed settings below to use it. ${button('Undo choice','setup-language-clear','small')}</p>`:''}</section>`;
}
