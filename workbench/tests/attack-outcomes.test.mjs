import test from 'node:test';import assert from 'node:assert/strict';
import {attackOutcome,attackOutcomes} from '../public/outcome-model.js';
import {attackOutcomeMarkup,rowOutcomeMarkup,ratioStat} from '../public/outcomes.js';
import {filterRows,mapNodes} from '../public/evidence-model.js';
const row=(classification,decision='block',extra={})=>({id:'example',valid:true,expected:{classification:'attack',policy_decision:'block'},answers:{classification:{choice:classification},policy_decision:{choice:decision}},derivedDisposition:{choice:'block'},...extra});
test('uncertain blocks and benign misclassification are separate; review is not block',()=>{
 const rows=[row('attack'),row('insufficient_evidence'),row('benign'),row('insufficient_evidence','review'),row('benign','allow'),row('attack','block',{valid:false}),row(null),row('attack',null)];
 const counts=attackOutcomes(rows);assert.equal(counts.total,8);assert.equal(counts.blocked,4);assert.equal(counts.recognized_block,1);assert.equal(counts.uncertain_block,1);assert.equal(counts.benign_block,1);assert.equal(counts.review,1);assert.equal(counts.allowed,1);assert.equal(counts.unavailable,2);assert.equal(counts.unclassified_block,1);
 assert.equal(counts.ruleBlocked,7);assert.equal(counts.decisionDisagreements,2);
 assert.equal(filterRows(rows,{filter:'attack_outcome:uncertain_block'}).length,1);
 assert.equal(filterRows(rows,{filter:'attack_outcome:benign_block'}).length,1);
 assert.equal(filterRows(rows,{filter:'misses'}).includes(rows[2]),true);
 assert.match(rowOutcomeMarkup(rows[2]),/incorrectly classified as benign/);
 assert.match(rowOutcomeMarkup(rows[4]),/decisions disagree/);
});
test('inspection, non-attacks and absent expectations do not become blocking failures',()=>{
 for(const expected of [{classification:'attack',policy_decision:'allow'},{classification:'benign',policy_decision:'block'},{classification:'attack'},{}])assert.equal(attackOutcome(row('attack','allow',{expected})),null);
 assert.equal(attackOutcomes([row('attack','block',{valid:false})]).ruleBlocked,0);
 assert.equal(attackOutcome(row('abstain')),'unclassified_block');
});
test('large suites keep complete counts and bounded summary markup',()=>{
 const rows=Array.from({length:10000},(_,i)=>row(i%2?'attack':'insufficient_evidence','block',{id:'case-'+i,rowKey:'row-'+i,group:'group-'+i%100}));
 const counts=attackOutcomes(rows);assert.equal(counts.blocked,10000);assert.equal(counts.uncertain_block,5000);
 assert.ok(attackOutcomeMarkup(rows).length<5000);assert.match(ratioStat('Blocks',10000,20000,'Model decision'),/10,000<\/strong><span>of 20,000/);
 const nodes=mapNodes(rows).nodes;assert.equal(nodes.length,10000);assert.equal(new Set(nodes.map(n=>n.key)).size,10000);assert.ok(nodes.every(n=>Number.isFinite(n.x)));
});
