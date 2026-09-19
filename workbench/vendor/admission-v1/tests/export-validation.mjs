import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createLab} from '../lab.mjs';import {loadAssets,fixtureBatch,compileConsumerEntry} from '../variants.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),assets=loadAssets(base);
const lab=await createLab({project:process.env.JEV_TEST_PROJECT,base,store:process.env.JEV_TEST_OUTPUT});lab.prepare();
const bodies=lab.plan.variants.filter(v=>v.kind==='consumer').flatMap(v=>v.rows.map(r=>lab.baseRequest(v.id,r.id)));
const batches=assets.policies.flatMap(p=>assets.fixtures.map(f=>fixtureBatch(f,p)));
fs.writeFileSync(path.join(base,'validation/schema-inputs.json'),JSON.stringify({policies:assets.policies,batches,requests:bodies}));
fs.writeFileSync(path.join(base,'validation/plan-summary.json'),JSON.stringify({planHash:lab.plan.planHash,requests:lab.plan.maximumRequests,conditions:lab.plan.design.conditions,planning:lab.plan.planning,
 consumerMinimumWireBytes:Math.min(...bodies.map(x=>Buffer.byteLength(JSON.stringify(x)))),consumerMaximumWireBytes:Math.max(...bodies.map(x=>Buffer.byteLength(JSON.stringify(x)))),
 maximumStatePlusLongestQuestionBytes:Math.max(...bodies.map(x=>Buffer.byteLength(JSON.stringify(x.state))+Math.max(...Object.values(x.questions).map(q=>Buffer.byteLength(JSON.stringify(q)))))),
 contextContentCombinations:assets.fixtures.length,uniqueSourceMaterials:new Set(assets.fixtures.map(x=>JSON.stringify(x.material))).size,
 semanticLabels:assets.fixtures.reduce((a,x)=>(a[x.expectedByPolicy.contextual.classification]=(a[x.expectedByPolicy.contextual.classification]??0)+1,a),{}),
 ordinaryStyleSynthetic:assets.fixtures.filter(x=>x.realism==='ordinary_style_synthetic').length,liveCalls:0},null,2)+'\n');
fs.mkdirSync(path.join(base,'examples'),{recursive:true});
const f=assets.fixtures.find(x=>x.id==='mixed-authorized'),p=assets.policies.find(x=>x.id==='contextual');
fs.writeFileSync(path.join(base,'examples/consumer-batch.json'),JSON.stringify(fixtureBatch(f,p),null,2)+'\n');
const compiled=compileConsumerEntry(fixtureBatch(f,p),p,0,assets,'criteria');
fs.writeFileSync(path.join(base,'examples/criterion-local-request.json'),JSON.stringify(compiled.jobs[0].payload,null,2)+'\n');
fs.writeFileSync(path.join(base,'examples/criterion-local-receipt.json'),JSON.stringify(compiled.receipt,null,2)+'\n');
