import {assert,sha} from '../util.mjs';
/** Weighted coverage/knapsack heuristic. No claim of optimality or statistical assurance. */
export function allocateUnits(units,{required=[],maxNano,maxTokens,seed='selection-1',explorationShare=.15,targetUnits=units.length,signals={}}){
 assert(Number.isSafeInteger(maxNano)&&maxNano>=0&&Number.isSafeInteger(maxTokens)&&maxTokens>=0,'Integer budget limits required');
 assert(Number.isFinite(explorationShare)&&explorationShare>=0&&explorationShare<=.5,'Exploration share must be 0–0.5');
 assert(Number.isSafeInteger(targetUnits)&&targetUnits>=0,'Invalid unit target');
 const map=new Map(units.map(u=>[u.id,u]));assert(map.size===units.length,'Duplicate unit IDs');
 const jobMap=new Map();for(const u of units){assert(Array.isArray(u.jobs),'Unit job list required');for(const j of u.jobs){assert(Number.isSafeInteger(j.nano)&&j.nano>=0&&Number.isSafeInteger(j.tokens)&&j.tokens>=0,'Invalid job cost');if(jobMap.has(j.id))assert(jobMap.get(j.id).nano===j.nano&&jobMap.get(j.id).tokens===j.tokens,'Shared job costs disagree');jobMap.set(j.id,j);}}
 function closure(id,visiting=new Set(),out=new Set()){assert(map.has(id),'Missing unit dependency '+id);assert(!visiting.has(id),'Cyclic unit dependency');if(out.has(id))return out;visiting.add(id);for(const d of map.get(id).dependsOn??[])closure(d,visiting,out);visiting.delete(id);out.add(id);return out;}
 const closures=new Map(units.map(u=>[u.id,[...closure(u.id)]]));
 const req=[...new Set(required.flatMap(id=>{assert(map.has(id),'Required unit absent '+id);return closures.get(id);} ))];
 let cost=0,tokens=0;const selected=new Set(),paid=new Set(),selection=[],covered=new Map();
 function marginal(ids){const addedUnits=ids.filter(id=>!selected.has(id)),js=new Map();for(const id of addedUnits)for(const j of map.get(id).jobs)if(!paid.has(j.id))js.set(j.id,j);return {units:addedUnits,jobs:[...js.keys()],nano:[...js.values()].reduce((n,j)=>n+j.nano,0),tokens:[...js.values()].reduce((n,j)=>n+j.tokens,0)};}
 const minimum=marginal(req);
 if(minimum.nano>maxNano||minimum.tokens>maxTokens)return {state:'insufficient_budget',selection:[],selectedUnitIds:[],selectedJobIds:[],costNano:0,tokens:0,minimum:{nano:minimum.nano,tokens:minimum.tokens},missingMandatory:req,excluded:units.map(u=>({unitId:u.id,reason:'Mandatory coverage cannot fit; no partial mandatory suite dispatched'})),exploration:{targetNano:0,spentNano:0,units:0},unused:{nano:maxNano,tokens:maxTokens}};
 function add(ids,lane,explanation){const m=marginal(ids);for(const id of m.units){const local=marginal([id]); // Account dependencies individually; jobs are globally deduplicated.
  selected.add(id);for(const j of map.get(id).jobs){if(!paid.has(j.id)){paid.add(j.id);cost+=j.nano;tokens+=j.tokens;}}
  for(const f of map.get(id).facets??[])covered.set(f,(covered.get(f)??0)+1);
  selection.push({unitId:id,lane,reason:explanation,mandatory:req.includes(id),addedJobs:local.jobs.length,reservedNano:local.nano,reservedTokens:local.tokens,signal:signals[id]??null});
 }return m;}
 add(req,'mandatory','Owner-defined invariant or configured critical boundary; model scores cannot remove this.');
 targetUnits=Math.max(targetUnits,selected.size);
 const exploreTarget=Math.floor((maxNano-cost)*explorationShare);let explorationSpent=0,explorationUnits=0;
 const shuffled=units.filter(u=>!selected.has(u.id)).sort((a,b)=>sha(seed+':explore:'+a.id).localeCompare(sha(seed+':explore:'+b.id)));
 // Independent seeded exploration does not inspect model scores or prior test outcomes.
 for(const u of shuffled){if(explorationSpent>=exploreTarget||selected.size>=targetUnits)break;const m=marginal(closures.get(u.id));
  if(cost+m.nano>maxNano||tokens+m.tokens>maxTokens)continue;
  if(explorationSpent+m.nano>exploreTarget&&explorationUnits>0)continue;
  add(closures.get(u.id),'exploration','Seeded independent coverage; not selected by Jev relevance.');explorationSpent+=m.nano;explorationUnits++;
 }
 const score=(u,m)=>{const fresh=(u.facets??[]).reduce((n,f)=>n+1/(1+(covered.get(f)??0)),0);const s=signals[u.id]??{weight:.65,uncertain:true};return ((1+fresh)*(u.severity??2)*(0.5+s.weight)+(s.uncertain?.3:0))/Math.sqrt(Math.max(1,m.tokens));};
 const remaining=new Set(units.filter(u=>!selected.has(u.id)).map(u=>u.id));
 // Linear-ish full-catalog fast path: when every remaining unit fits, no knapsack choice is needed.
 const all=marginal([...remaining]);
 if(targetUnits>=units.length&&cost+all.nano<=maxNano&&tokens+all.tokens<=maxTokens){
  const order=[...remaining].map(id=>({id,value:score(map.get(id),marginal(closures.get(id))),tie:sha(seed+':rank:'+id)})).sort((a,b)=>b.value-a.value||a.tie.localeCompare(b.tie));
  for(const x of order)add(closures.get(x.id),'ranked','All remaining compatible groups fit; relevance determines order, not exclusion.');
  remaining.clear();
 }

 while(remaining.size&&selected.size<targetUnits){let best=null;for(const id of remaining){if(selected.has(id)){remaining.delete(id);continue;}const u=map.get(id),m=marginal(closures.get(id));if(cost+m.nano>maxNano||tokens+m.tokens>maxTokens)continue;const value=score(u,m),tie=sha(seed+':rank:'+id);if(!best||value>best.value||value===best.value&&tie<best.tie)best={id,m,value,tie};}
  if(!best)break;add(closures.get(best.id),'ranked','Marginal coverage × bounded relevance and severity per square-root token cost; whole group and dependencies.');for(const id of best.m.units)remaining.delete(id);
 }
 const excluded=units.filter(u=>!selected.has(u.id)).map(u=>{const m=marginal(closures.get(u.id));return {unitId:u.id,reason:selected.size>=targetUnits?'Outside selected tier target':'No whole dependency-closed unit fits remaining budget',marginalNano:m.nano,marginalTokens:m.tokens,signal:signals[u.id]??null};});
 return {state:excluded.length?(selected.size>=targetUnits?'prepared_offline':'budget_limited'):'prepared_offline',selection,selectedUnitIds:[...selected],selectedJobIds:[...paid],costNano:cost,tokens,minimum:{nano:minimum.nano,tokens:minimum.tokens},missingMandatory:[],excluded,exploration:{targetNano:exploreTarget,spentNano:explorationSpent,units:explorationUnits},unused:{nano:maxNano-cost,tokens:maxTokens-tokens}};
}
