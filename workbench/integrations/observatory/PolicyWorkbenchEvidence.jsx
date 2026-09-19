import React from 'react';
/** Optional additive section: pass output of projectAdmissionEvidence through existing Data-app data bindings. */
export default function PolicyWorkbenchEvidence({evidence,onInspect}){
 if(!evidence?.conditions)return null;
 const score=x=>x?`${x.correct}/${x.valid??x.scored}`:'—';
 return <section aria-label="Policy workbench evidence">
  <header><h2>Policy workbench evidence</h2><p>{evidence.protocol} · {evidence.recordedCalls} recorded calls</p></header>
  <p>Attack detection, representation compliance, and admission are different judgments. These observations do not validate a new policy draft.</p>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>Condition</th><th>Attacks detected</th><th>Semantic false alarms</th><th>Representation</th><th>Native disposition</th><th>Code disposition</th></tr></thead>
   <tbody>{evidence.conditions.map(c=><tr key={c.id}><td>{onInspect?<button onClick={()=>onInspect(c.id)}>{c.title}</button>:c.title}</td><td>{c.detected}/{c.attacks}</td><td>{c.falseAlarms}/{c.benign}</td><td>{score(c.contract)}</td><td>{score(c.nativeDecision)}</td><td>{score(c.derivedDecision)}</td></tr>)}</tbody>
  </table></div>
  {evidence.caveats.map(x=><p key={x}><small>{x}</small></p>)}
  <details><summary>Evidence identity</summary><pre>{JSON.stringify({sourceHash:evidence.sourceHash,planHash:evidence.planHash},null,2)}</pre></details>
 </section>;
}
