/** Deterministic display geometry. No learned embedding and no invented observations. */
export const ATLAS_PALETTE={match:'#76efd3',false_alarm:'#ffca72',miss:'#ff719b',disagreement:'#b6a1ff',unavailable:'#8196b4',not_run:'#8bbcff'};
export function atlasHash(s){let n=2166136261;for(const ch of String(s)){n^=ch.codePointAt(0);n=Math.imul(n,16777619);}return (n>>>0)/4294967295;}
export function atlasObserved(row,field){if(!row.valid)return null;const a=row.answers?.[field];return typeof a==='string'?a:a?.choice??(Number.isFinite(a?.noul)?a.noul>=.5:null);}
export function atlasStatus(row,field='classification'){
 if(row.isCatalog)return 'not_run';if(!row.valid)return 'unavailable';
 const e=row.expected?.[field],a=atlasObserved(row,field);
 if(e===undefined||a===null)return 'unavailable';
 if(field==='classification'){if(e==='attack'&&a!=='attack')return 'miss';if(e==='benign'&&a==='attack')return 'false_alarm';}
 return e===a?'match':'disagreement';
}
export const atlasKey=row=>row.rowKey??[row.conditionId??'',row.id,row.repeat??1].join('::');
export function atlasFields(rows){return [...new Set(rows.flatMap(r=>Object.keys(r.expected??{})))].filter(k=>rows.some(r=>['string','boolean'].includes(typeof r.expected?.[k])));}
export function atlasGeometry(rows,{layout='constellations',field='classification'}={}){
 const families=[...new Set(rows.map(r=>r.group||r.family||'Unspecified'))].sort();
 const fi=new Map(families.map((f,i)=>[f,i]));const counts={};
 const buckets=new Map();for(const r of rows){const f=r.group||r.family||'Unspecified';if(!buckets.has(f))buckets.set(f,[]);buckets.get(f).push(r);}
 const centers=families.map((family,i)=>{const angle=i/Math.max(1,families.length)*Math.PI*2+.32;const radius=205+34*Math.sin(i*2.7);return {family,x:Math.cos(angle)*radius,y:Math.sin(i*1.7)*45,z:Math.sin(angle)*radius,count:buckets.get(family).length};});
 const values=[...new Set(rows.map(r=>String(r.expected?.[field]??'ungraded')))].sort();
 const finite=rows.filter(r=>Number.isFinite(r.usage?.inputTokens)&&Number.isFinite(r.latencyMs)&&Number.isFinite(r.answers?.classification?.probabilities?.attack));
 const maxTokens=Math.max(1,...finite.map(r=>r.usage.inputTokens)),maxLatency=Math.max(1,...finite.map(r=>r.latencyMs));
 const ordinal=new Map();const nodes=rows.map((row,i)=>{
  const key=atlasKey(row),family=row.group||row.family||'Unspecified',gi=fi.get(family),group=centers[gi],within=ordinal.get(family)??0;ordinal.set(family,within+1);
  const status=atlasStatus(row,field);counts[status]=(counts[status]??0)+1;
  const a=within*2.3999632+atlasHash(key)*.3,radius=18+Math.sqrt(within+1)*Math.min(7,56/Math.sqrt(group.count)),v=(atlasHash(key+'height')-.5)*56;
  let x=group.x+Math.cos(a)*radius,z=group.z+Math.sin(a)*radius,y=group.y+v;
  let available=true;
  if(layout==='outcomes'){
   const lane=values.indexOf(String(row.expected?.[field]??'ungraded')),angle=lane/Math.max(1,values.length)*Math.PI*2+.5;
   const rr=20+atlasHash(key)*95;x=Math.cos(angle)*160+Math.cos(a)*rr;z=Math.sin(angle)*160+Math.sin(a)*rr;y=(atlasHash(key+'vertical')-.5)*190;
  }else if(layout==='signal'){
   const p=row.answers?.classification?.probabilities?.attack,t=row.usage?.inputTokens,l=row.latencyMs;
   available=row.valid&&Number.isFinite(p)&&Number.isFinite(t)&&Number.isFinite(l);
   if(available){x=(p-.5)*530;y=(.5-Math.log1p(l)/Math.log1p(maxLatency))*220;z=(Math.log1p(t)/Math.log1p(maxTokens)-.5)*400;}
  }
  return {key,row,family,groupIndex:gi,status,x,y,z,available,index:i,color:ATLAS_PALETTE[status]};
 });
 return {nodes,groups:centers,values,counts,field,layout,metricRanges:{maxTokens,maxLatency},omitted:nodes.filter(n=>!n.available).length};
}
export function atlasRelated(nodes,key){const current=nodes.find(n=>n.key===key);if(!current)return [];
 const row=current.row;return nodes.filter(n=>n.key!==key&&(row.pairId?n.row.pairId===row.pairId:(n.row.caseId??n.row.id)===(row.caseId??row.id))).map(n=>n.key);
}
