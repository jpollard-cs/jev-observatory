import test from 'node:test';
import assert from 'node:assert/strict';
import {languageOptionsForModel,modelLanguageCatalog} from '../src/model-capabilities.mjs';
import {setupFieldsForModel,setupLanguageLists,setupRequest} from '../src/setup.mjs';
import {preset,validatePolicy} from '../src/policy.mjs';
import {defaultApplication} from '../src/selection/application.mjs';
import {LANGUAGE_PROBE_CODES} from '../src/catalog.mjs';
import {languagePicker} from '../public/languages.js';
import {makeAdvisorPlan,verifyAdvisorPlan} from '../src/selection/advisor.mjs';

const fixture={
 'fixture-italian':{label:'Test-only Italian target',languages:{
  kind:'enumerated',supported:['it'],primary:['it'],statement:'Test fixture, not a real provider claim.',
  source:'https://example.invalid/languages',checkedAt:'2026-09-19',
 }},
};

test('target capability resolution cannot inherit another model’s options',()=>{
 assert.equal(languageOptionsForModel('unknown'),null);
 assert.equal(languageOptionsForModel('__proto__'),null);
 const view=languageOptionsForModel('fixture-italian',fixture);
 assert.deepEqual(view.options.map(x=>x.code),['it']);
 assert.deepEqual(setupLanguageLists('fixture-italian',fixture),{italian:['it']});
 const criteria=setupFieldsForModel('fixture-italian',fixture).find(x=>x.id==='languages').criteria;
 assert.ok(criteria.italian);
 assert.equal(criteria.english,undefined);
 assert.equal(criteria.english_spanish,undefined);
 const p={...preset(),model:'fixture-italian',languages:{mode:'allowlist',allowed:['es'],scope:'natural_language_content'}};
 const html=languagePicker(p,{modelLanguages:{'fixture-italian':view},languageProbeCodes:[]});
 assert.match(html,/data-setting="language:it"/);
 assert.doesNotMatch(html,/data-setting="language:(es|en)"/);
 assert.match(html,/Outside this model’s offered options: es/);
 assert.deepEqual(p.languages.allowed,['es']); // Viewing never silently changes an imported contract.
 assert.throws(()=>validatePolicy(p),/reviewed Jev/); // Metadata is not an execution adapter.
});

test('open multilingual claims remain exploratory and separate from authored coverage',()=>{
 const p=preset(),view=languageOptionsForModel(p.model);
 assert.equal(view.kind,'open_multilingual');
 assert.equal(view.options.length,36);
 for(const code of ['es','ja','ko','zh','ar','hi','sw','vi'])assert.equal(view.options.find(x=>x.code===code).claim,'exploratory');
 assert.equal(view.options.find(x=>x.code==='en').claim,'primary');
 assert.deepEqual([...LANGUAGE_PROBE_CODES].sort(),['de','en','es','fr']);
 const html=languagePicker(p,{modelLanguages:modelLanguageCatalog(),languageProbeCodes:LANGUAGE_PROBE_CODES});
 assert.match(html,/no exhaustive provider list/);
 assert.match(html,/not a passing result or native-speaker validation/);
 assert.match(languagePicker({...p,model:'unknown'},{modelLanguages:modelLanguageCatalog()}),/No default model’s options/);
});

test('the paid request and frozen provenance bind the target’s language vocabulary',()=>{
 const p=preset(),a=defaultApplication(p),prepared=makeAdvisorPlan(p,a,{mode:'setup',maxUsd:.01});
 assert.deepEqual(prepared.jobs[0].request.state.targetLanguageCapabilities,languageOptionsForModel(p.model));
 assert.ok(prepared.manifest.sourceFiles['src/model-capabilities.mjs']);
 assert.equal(prepared.manifest.catalogSource,'reviewed-setup-options/4');
 assert.equal(verifyAdvisorPlan(prepared.manifest).manifest.planHash,prepared.manifest.planHash);
 assert.deepEqual(Object.keys(setupRequest(p,a).request.questions.languages.criteria).filter(k=>!['any_language','manual_review','keep_current','insufficient_evidence','not_specified','output_language_only'].includes(k)),Object.keys(setupLanguageLists(p.model)));
 assert.ok(prepared.jobs[0].wireBytes<50000);
 assert.equal(prepared.manifest.liveCalls,0);
});
