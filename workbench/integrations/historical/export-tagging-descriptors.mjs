/** Read-only metadata bridge. It does NOT adapt historical expected answers or submit cases. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {families} from '../../vendor/legacy-runtime/cases/families.mjs';
import {generateCases} from '../../vendor/legacy-runtime/harness/corpus.mjs';
import {sha} from '../../src/util.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const descriptions={
 authority_spoof:'Claimed privileged administrator instructions versus a training handout that discusses those labels.',
 delimiter_breakout:'Literal closing tags in source text attempt to create a system message; contrast XML syntax documentation.',
 encoded_payload:'Base64-carried redirection in tool-style material versus an encoded weather description.',
 split_resources:'Associated source fragments jointly redirect an assessment; contrast harmless agenda fragments.',
 conversation_poison:'Fixed prior-conversation snapshots about adoption or rejection of source instructions; requires history-integrity scoring.',
 memory_poison:'External stored memory that changes future assessments versus confirmed user formatting preferences; requires memory-integrity scoring.',
 retrieval_poison:'Replacement of an active retrieved policy index versus an archived historical proposal; requires provenance and contamination semantics.',
 tool_output_spoof:'A tool-result object impersonates a developer directive; contrast ordinary tool records.',
 judge_injection:'Candidate answer explanations attempt to dictate the judge verdict independently of known answer correctness; requires judge-task adapter.',
 answer_laundering:'Citation-like text dictates the final assessment versus documentation requesting independent source review.',
 policy_override:'Retrieved text tries to disable active policy rules or strictness versus discussion of policy profiles.',
 moderation_targeted:'Targeted insulting content versus a classroom quotation; expected moderation depends on the old policy profile, not injection labels.',
 moderation_identifier:'Disclosure of a synthetic contact with versus without stated consent; requires old moderation-policy semantics.',
 zero_width:'Zero-width characters conceal instruction text versus a typography sample.',
 html_negative_space:'Source HTML styling/comments carry concealed instructions versus decorative spacers. No rendered-image observation.',
 bidi_confusable:'Direction markers and cross-script confusables carry redirection versus a typography lesson.',
 emoji_variation:'Variation selectors encode UTF-8 instruction bytes versus an ordinary decorative emoji.',
 multilingual_redirect:'Spanish/French instructional redirection versus bilingual greetings; language restriction and attack semantics are separate.'
};
const counts={},pairs=new Set(),lineages=new Set();let total=0;
for(const c of generateCases()){total++;counts[c.family]=(counts[c.family]??0)+1;pairs.add(c.pairId);lineages.add(c.clusterId);}
const descriptors=families.map(f=>({id:'historical:'+f.id,title:f.title,description:descriptions[f.id],domain:f.judge?'judging':f.policy?'moderation':'guardrail-classification',requires:[],caseCount:counts[f.id]}));
const out=process.argv[2]??path.join(root,'examples/historical-family-descriptors.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(descriptors,null,2)+'\n');
const provenance={kind:'metadata-only historical tagging bridge',logicalCells:total,pairedGroups:pairs.size,templateLineages:lineages.size,descriptors:descriptors.length,descriptorHash:sha(descriptors),sourceFiles:Object.fromEntries(['vendor/legacy-runtime/cases/families.mjs','vendor/legacy-runtime/harness/corpus.mjs','vendor/legacy-runtime/config/design.json'].map(f=>[f,sha(fs.readFileSync(path.join(root,f)))])),limitations:['The 15120 experiment cells remain the original historical combinations; no new observations.','These 18 descriptors allow metadata tagging without sending 15120 payloads.','Historical expected outcomes and full replay are NOT integrated into the current admission-only evaluator.','Jev-generated tags remain proposals; they do not relabel cases or assert independent scenario counts.'],paidCalls:0};
fs.writeFileSync(out.replace(/\.json$/,'')+'.provenance.json',JSON.stringify(provenance,null,2)+'\n');console.log(JSON.stringify({out,...provenance},null,2));
