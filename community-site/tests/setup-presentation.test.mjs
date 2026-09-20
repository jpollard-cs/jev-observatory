import test from 'node:test';
import assert from 'node:assert/strict';
import { preset } from '../../workbench/src/policy.mjs';
import { defaultApplication } from '../../workbench/src/selection/application.mjs';
import { setupFollowup } from '../../workbench/public/guided.js';
import { draftStamp, isSetupCurrent } from '../../workbench/public/workflow-model.js';

function pendingEnglish() {
  const policy = preset();
  policy.languages.allowed = ['es'];
  const application = { ...defaultApplication(policy), description: 'English only.' };
  return {
    policy,
    application,
    setupPicks: ['languages'],
    setupInputStamp: draftStamp(policy, application),
    setupSummary: {
      notes: [],
      suggestions: [
        {
          id: 'languages',
          title: 'Declared language list',
          changes: [
            { target: 'policy', path: ['languages', 'allowed'], before: ['es'], after: ['en'] },
          ],
          reason: 'Requested language.',
          consequence: 'Replaces the allowed languages.',
          signal: {
            uncertain: false,
            note: 'Synthetic fixture.',
            confidence: 1,
            probabilities: { english: 1 },
          },
        },
      ],
    },
  };
}

test('an English proposal appears before the still-Spanish applied policy, without another reveal step', () => {
  const state = pendingEnglish(),
    html = setupFollowup(state);
  assert.ok(html.indexOf('id="setup-suggestions"') < html.indexOf('Your contract at a glance'));
  assert.match(html, /<small>Current<\/small>Spanish \(es\)/);
  assert.match(html, /<small>Proposed<\/small>English \(en\)/);
  assert.match(html, /<h3>Spanish<\/h3>/);
  assert.doesNotMatch(html, /data-action="review-setup-suggestions"/);
  assert.deepEqual(state.policy.languages.allowed, ['es']);
});

test('preparing a newer request cannot make an older summary applicable', () => {
  const state = pendingEnglish();
  state.application.description = 'German only.';
  state.setupRequestStamp = draftStamp(state.policy, state.application);
  assert.equal(isSetupCurrent(state), false);
  const html = setupFollowup(state);
  assert.match(html, /suggestions are stale and cannot be applied/);
  assert.match(html, /<small>At generation<\/small>Spanish \(es\)/);
  assert.match(html, /data-setup-pick="languages"[^>]*disabled/);
  assert.match(html, /data-action="setup-apply" disabled/);
});

test('applied policy snapshot changes only with an accepted policy update', () => {
  const state = pendingEnglish();
  state.policy.languages.allowed = ['en'];
  state.setupSummary = null;
  state.setupTransaction = { unresolvedNotes: [], unappliedSuggestions: [] };
  const html = setupFollowup(state);
  assert.match(html, /Changes applied/);
  assert.match(html, /<h3>English<\/h3>/);
  assert.doesNotMatch(html, /<h3>Spanish<\/h3>/);
});

test('unspecified language review names the retained default and provides a usable continuation',()=>{
 const state=pendingEnglish();state.policy.languages.allowed=['en'];state.setupInputStamp=draftStamp(state.policy,state.application);state.setupPicks=[];
 state.setupSummary={suggestions:[],notes:[{field:'languages',title:'Declared language list',disposition:'default_retained',text:'No input-language requirement was identified.'}]};
 const html=setupFollowup(state,{modelLanguages:{[state.policy.model]:{options:[{code:'en',label:'English'},{code:'es',label:'Spanish'}]}}});
 assert.match(html,/Current policy: <strong>English/);assert.match(html,/Keep English/);assert.match(html,/Any language/);assert.match(html,/Choose languages/);assert.match(html,/Continue with current settings/);
 assert.doesNotMatch(html,/Apply 0|Language requirement needs manual review/);
 state.setupLanguageChoice={mode:'any'};
 assert.match(setupFollowup(state),/Apply reviewed settings/);assert.deepEqual(state.policy.languages.allowed,['en']);
});

test('an in-flight apply stamp changes when the owner changes choices or the advice report',async()=>{
 const {setupReviewStamp}=await import('../../workbench/public/workflow-model.js');
 const state=pendingEnglish();state.setupReport={reportHash:'report-one'};state.setupLanguageChoice=null;
 const stamp=setupReviewStamp(state);
 for(const mutate of [s=>s.setupPicks=[],s=>s.setupLanguageChoice={mode:'any'},s=>s.setupReport={reportHash:'report-two'},s=>s.application.description='Changed']){
  const newer=structuredClone(state);mutate(newer);assert.notEqual(setupReviewStamp(newer),stamp);
 }
 assert.equal(setupReviewStamp(structuredClone(state)),stamp);
});
