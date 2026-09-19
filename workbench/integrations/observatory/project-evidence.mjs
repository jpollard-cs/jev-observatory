/** Additive data projection for the original Observatory. Never run a model or publish here. */
import {importReport} from '../../src/report.mjs';
export function projectAdmissionEvidence(raw){
 const r=importReport(raw);
 return {schemaVersion:'observatory-workbench-evidence/1',protocol:r.protocol,sourceHash:r.sourceHash,planHash:r.planHash,status:r.status,recordedCalls:r.validCalls,
  caveats:['Authored development labels, not independently adjudicated ground truth.','Inspecting an attack is not permission to admit or execute it.','Padding/repetitions are dependent observations.','This report does not validate a subsequently edited policy.'],
  conditions:r.conditions.map(c=>({id:c.id,title:c.title,policyId:c.policyId,layout:c.layout,observations:c.summary.valid,attacks:c.summary.attackDetection.attacks,detected:c.summary.attackDetection.detected,falseAlarms:c.summary.attackDetection.falseAlarms,benign:c.summary.attackDetection.benign,contract:c.summary.metrics.input_contract??null,nativeDecision:c.summary.metrics.policy_decision??null,derivedDecision:c.summary.derivedDisposition,inputTokens:c.summary.inputTokens})),
  comparisonMeaning:'Compare like policy, source catalog and operating mode. Do not rank unlike contracts by one blended pass percentage.'};
}
