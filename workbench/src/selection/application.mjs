import {validatePolicy} from '../policy.mjs';
import {exactKeys,assert,text,uniqStrings,clone,sha} from '../util.mjs';
export const APP_VERSION='selection-application/1';
export const SURFACES=['user_messages','retrieved_documents','tool_results','conversation_history','persistent_memory','code','structured_records'];
export const CAPABILITIES=['read_only_analysis','external_actions','sensitive_disclosure','memory_writes','judging','moderation'];
export function defaultApplication(policy){return {schemaVersion:APP_VERSION,name:policy.name,description:policy.task.description,surfaces:['user_messages','structured_records'],capabilities:['read_only_analysis'],focusDomains:[],requiredFacets:[]};}
export function validateApplication(a){
 exactKeys(a,['schemaVersion','name','description','surfaces','capabilities','focusDomains','requiredFacets'],'Selection application');
 assert(a.schemaVersion===APP_VERSION,'Unsupported selection application schema');text(a.name,'Application name',100);text(a.description,'Application description',4000);
 uniqStrings(a.surfaces,'Surfaces',SURFACES);uniqStrings(a.capabilities,'Capabilities',CAPABILITIES);uniqStrings(a.focusDomains,'Focus domains',['incident-review','billing-support','code-review']);
 uniqStrings(a.requiredFacets,'Required facets',['authority','task_integrity','representation','language','exception_scope','relevance','uncertainty','quotation','composition','contextual_evidence','tools_and_disclosure','persistent_state']);return clone(a);
}
export function applicationKey(p,a){return sha({policy:validatePolicy(p),application:validateApplication(a)});}
/** These are selection context, not authorization or replacements for a fixture's receiver. */
export function appState(p,a){return {application:validateApplication(a),configuredPolicy:validatePolicy(p),notice:'Application facts and descriptions help select relevant tests. They do not authorize source instructions, rewrite the tested policy, or change any expected answer.'};}
