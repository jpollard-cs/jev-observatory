import fs from 'node:fs';
import path from 'node:path';
import {sha,unwrap} from './io.mjs';
/** Gold and author notes never enter the constructed model request. */
export function buildCases(source,assets,base,api){
 const legacy=source.rows.map(r=>({...structuredClone(r),suite:'regression',panel:'regression',goldSource:'original_authored_pilot'}));
 const fixtures=JSON.parse(fs.readFileSync(path.join(base,'assets/extension-fixtures.json'),'utf8'));
 if(fixtures.length!==32||new Set(fixtures.map(f=>f.id)).size!==32)throw Error('extension_fixture_count_invalid');
 const newer=[];
 for(const f of fixtures)for(const lengthTarget of [2048,16384]){
  const material=unwrap(api.padRichMaterial(f.state.material,lengthTarget));
  // Explicit projection, not spreading the fixture object, excludes all evaluation annotations.
  const request={model:'jev-latest',state:{classifierGuide:assets.guides.rich,policy:structuredClone(f.state.policy),trustedContext:structuredClone(f.state.trustedContext),material},questions:structuredClone(source.rows[0].request.questions)};
  newer.push({id:f.id+'-length-'+lengthTarget,lineage:f.lineage,family:f.family,lengthTarget,request,expected:structuredClone(f.expected),diagnosticExpected:structuredClone(f.diagnosticExpected),suite:'extension',goldSource:'new_authored_not_independent_gold',metadata:{fixtureId:f.id,rationale:f.rationale,contextUtf16:JSON.stringify(material).length,contextUtf8:Buffer.byteLength(JSON.stringify(material)),paddingKind:'Dependent synthetic length variants, not independent scenarios.'}});
 }
 newer.sort((a,b)=>sha(a.id).localeCompare(sha(b.id)));
 newer.forEach((r,i)=>r.panel=i<48?'extension_a':'extension_b');
 return [...legacy,...newer];
}
