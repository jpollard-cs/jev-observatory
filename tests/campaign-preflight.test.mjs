import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCampaignPreflight } from '../harness/domain/campaign-plan.mjs';

const plan = {
  campaignId: 'frozen',
  planHash: 'a'.repeat(64),
  catalogCases: 2,
  queuedOtherSeeds: 0,
};
const trials = [
  { id: 'smoke:a', phase: 'smoke' },
  { id: 'representation:a', phase: 'representation' },
];
const ledger = {
  reservations: {
    'frozen:smoke:a': { settled: true, chargeNanoUsd: 42 },
    'frozen:representation:a': { settled: true, chargeNanoUsd: 42 },
  },
};
const review = {
  planHash: plan.planHash,
  status: 'ready_for_development_run',
  decisionBy: 'operator_review',
  representationReportHash: 'b'.repeat(64),
  auditdocHash: 'c'.repeat(64),
};

test('heavy-phase preflight requires a review bound to the frozen plan and both source artifacts', () => {
  assert.equal(
    verifyCampaignPreflight({ plan, trials, ledger, review: null }).error.code,
    'campaign_preflight_review_missing_or_unbound',
  );
  assert.equal(
    verifyCampaignPreflight({ plan, trials, ledger, review: { ...review, planHash: 'different' } })
      .tag,
    'error',
  );
  assert.equal(
    verifyCampaignPreflight({ plan, trials, ledger, review: { ...review, auditdocHash: '' } }).tag,
    'error',
  );
  assert.equal(verifyCampaignPreflight({ plan, trials, ledger, review }).tag, 'ok');
});

test('complete smoke and representation outcomes are required without imposing an accuracy threshold', () => {
  const partial = structuredClone(ledger);
  partial.reservations['frozen:representation:a'].settled = false;
  const missing = verifyCampaignPreflight({ plan, trials, ledger: partial, review });
  assert.equal(missing.error.code, 'campaign_preflight_outcomes_incomplete');
  assert.equal(missing.error.context.phase, 'representation');
  assert.equal(
    verifyCampaignPreflight({ plan, trials: trials.slice(0, 1), ledger, review }).tag,
    'error',
  );
  assert.equal(
    verifyCampaignPreflight({ plan, trials, ledger, review: { ...review, measuredAccuracy: 0 } })
      .tag,
    'ok',
  );
});
