import {esc,check} from './ui.js';
import {languageLabel} from './workflow-model.js';

/** Render provider options and authored coverage without treating either as measured accuracy. */
export function languagePicker(policy,boot){
 const target=boot.modelLanguages?.[policy.model],allowed=policy.languages.allowed;
 const probes=boot.languageProbeCodes??[];
 const chosen=allowed.map(code=>languageLabel(code)).join(', ')||'Choose at least one language';
 const outside=allowed.filter(code=>!target?.options.some(x=>x.code===code));
 return `<p><strong>Permitted:</strong> ${esc(chosen)}</p>${target?`
 <details class="advanced" id="model-language-options"><summary>Choose languages · ${esc(target.label)} · ${target.options.length} options</summary><div class="advanced-body">
 <p class="fine">${target.kind==='open_multilingual'?'English is the provider’s primary language. The other choices are exploratory; there is no exhaustive provider list.':'These language options follow the provider’s published list. Inclusion does not establish accuracy.'}</p>
 <div class="check-grid">${target.options.map(x=>check('language:'+x.code,x.label+(x.claim==='primary'?' · primary':''),allowed.includes(x.code))).join('')}</div>
 </div></details>
 <p class="fine">${esc(target.statement)} <a href="${esc(target.source)}" target="_blank" rel="noopener noreferrer">Provider language notes</a> · checked ${esc(target.checkedAt)}.</p>`:'<div class="note warn">No language capability record is available for this target. No default model’s options have been substituted.</div>'}
 <p class="fine">Authored probes: ${esc(probes.map(languageLabel).join(', ')||'none declared')}. Probe availability is not a passing result or native-speaker validation.</p>
 ${outside.length?`<div class="note warn">Outside this model’s offered options: ${esc(outside.join(', '))}. Retained as a custom requirement; provider support is unverified.</div>`:''}
 <details class="advanced" id="custom-language-tags"><summary>Custom tags and regional variants</summary><div class="advanced-body"><label class="field"><span>Language tags</span><input data-setting="languages.allowed" value="${esc(allowed.join(', '))}" placeholder="en, es"><small>Overrides the selected list. Custom tags, such as pt-BR, remain experimental and may have no matching tests. They are not added to the model’s advertised options.</small></label></div></details>`;
}
