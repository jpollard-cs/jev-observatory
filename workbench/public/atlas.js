import {esc,fmt} from './ui.js';
import {atlasGeometry,atlasFields,atlasStatus,atlasObserved,atlasKey,atlasHash,atlasRelated,ATLAS_PALETTE} from './atlas-data.js';
const readable=s=>String(s??'Not supplied').replaceAll('_',' ');
const labels={match:'Agreement',false_alarm:'False alarms',miss:'Missed attacks',disagreement:'Other differences',unavailable:'Not scored',not_run:'Not run'};
export function orbitMarkup(condition){
 const rows=condition.rows,catalog=rows.some(r=>r.isCatalog),fields=atlasFields(rows),field=fields.includes('classification')?'classification':fields[0]??'decision';
 const g=atlasGeometry(rows,{field});
 return `<section class="atlas-card card" id="outcome-atlas" data-catalog="${catalog}" aria-label="Outcome atlas"><header class="atlas-heading"><div><div class="eyebrow">${catalog?(condition.id==='selected-policy-tests'?'Selected policy coverage':'Original evaluation universe'):'Outcome atlas / live canvas'}</div><h2>${catalog?'Chart the unexplored.':'Every signal has a story.'}</h2></div><div class="atlas-heading-actions"><span class="atlas-live-indicator">${catalog?'CATALOG · UNMEASURED':'RECORDED EVIDENCE'}</span><button class="atlas-icon" id="atlas-expand" aria-label="Expand atlas" title="Expand the atlas; Escape returns">⛶</button></div></header>
 <div class="atlas-control-strip"><div class="atlas-layouts" role="group" aria-label="Atlas layout"><button data-atlas-layout="constellations" aria-pressed="true">Constellations</button><button data-atlas-layout="outcomes" aria-pressed="false">Outcome islands</button><button data-atlas-layout="signal" aria-pressed="false" ${catalog?'disabled':''}>Measured signal</button></div><label class="atlas-field">Color by <select id="atlas-field" aria-label="Atlas judgment">${fields.map(f=>`<option value="${esc(f)}" ${f===field?'selected':''}>${esc(readable(f))}</option>`).join('')}</select></label></div>
 <div class="atlas-stage" id="atlas-stage"><canvas id="evidence-orbit" tabindex="0" role="group" aria-label="Interactive three-dimensional evidence atlas. Drag to orbit, scroll to zoom, arrow keys to select a point, Enter to inspect. ${catalog?'Hollow points are unrun catalog cells, not measured outcomes.':''}" aria-describedby="atlas-description"></canvas>
 <div class="atlas-hud atlas-hud-left" aria-hidden="true"><span>OBS / ${catalog?'LIBRARY':'SIGNAL'}</span><strong id="atlas-visible-count">${fmt(rows.length)}</strong><small>${catalog?'unrun evaluation cells':'mapped test rows'}</small></div>
 <div class="atlas-hud atlas-hud-right" aria-hidden="true"><span>DISPLAY COORDINATES</span><small id="atlas-layout-caption">Family constellations</small><small>Not a semantic embedding</small></div>
 <div id="atlas-hover" class="atlas-hover" hidden></div>
 <div class="atlas-pinned" id="atlas-pinned" hidden aria-live="polite"></div>
 <div class="atlas-stage-bottom"><span id="atlas-shortcut">Drag to orbit · scroll to zoom · select a signal</span><div><button class="atlas-icon" id="atlas-zoom-out" aria-label="Zoom out">−</button><button class="atlas-icon" id="atlas-zoom-in" aria-label="Zoom in">+</button><button class="atlas-icon" id="atlas-reset" aria-label="Reset atlas view">↺</button></div></div></div>
 <div class="atlas-bottom"><div class="atlas-status-filters" id="atlas-filters" role="group" aria-label="Filter by result">${Object.entries(g.counts).map(([k,n])=>`<button data-atlas-status="${k}" aria-pressed="false"><i style="background:${ATLAS_PALETTE[k]}"></i>${labels[k]} <b>${n}</b></button>`).join('')}</div><div class="atlas-bottom-actions"><button class="btn small" id="atlas-next-interest">${catalog?'Next family':'Next difference'}</button><button class="btn small" id="orbit-motion" aria-pressed="true">Pause orbit</button><button class="btn small" id="atlas-export">Save image</button></div></div>
 <div class="atlas-explanation" id="atlas-description"><span id="atlas-data-explanation">${catalog?'Hollow points are catalog definitions, not outcomes.':'One point per test row. Color compares the selected judgment with its authored expectation; unrun rows have no predictions.'} Constellations group families; distances are display choices. The background stars are decoration.</span><span class="atlas-keyboard-help">← → select · Enter inspect · Esc clear</span><span id="atlas-announcement" class="sr-only" role="status" aria-live="polite"></span></div></section>`;
}
export function mountOrbit(condition,{animate=true,onInspect}={}){
 const root=document.getElementById('outcome-atlas'),canvas=document.getElementById('evidence-orbit');if(!canvas)return ()=>{};
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return ()=>{};
 const rows=condition.rows,catalog=rows.some(r=>r.isCatalog),fields=atlasFields(rows),fieldSelect=root.querySelector('#atlas-field');
 let field=fieldSelect.value||fields[0]||'decision',layout='constellations',geom=atlasGeometry(rows,{field,layout});
 let width=1000,height=540,dpr=1,disposed=false,frame=0,last=0,visible=true,dirty=true,spin=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches,reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let yaw=.34,pitch=.62,zoom=1,yawTo=yaw,pitchTo=pitch,zoomTo=zoom,focus={x:0,y:0,z:0},target={x:0,y:0,z:0},selected=null,hover=null,filter=null,drag=null,moved=false,screen=[],geometryStart=null,geometryTime=0;
 const fieldNames={classification:'attack judgment',policy_decision:'operation decision',decision:'native decision',integrity:'integrity',judge_verdict:'judge verdict'};
 const stage=root.querySelector('#atlas-stage'),pin=root.querySelector('#atlas-pinned'),tip=root.querySelector('#atlas-hover'),announce=root.querySelector('#atlas-announcement');
 const listeners=[];const listen=(el,event,fn,opts)=>{el.addEventListener(event,fn,opts);listeners.push(()=>el.removeEventListener(event,fn,opts));};
 const stars=Array.from({length:560},(_,i)=>({u:atlasHash(i+'u'),v:atlasHash(i+'v'),a:.10+atlasHash(i+'a')*.35,r:atlasHash(i+'r')>.985?1.25:.35+atlasHash(i+'s')*.45}));
 const glows=new Map();function sprite(color){if(glows.has(color))return glows.get(color);const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,color);g.addColorStop(.11,color+'e0');g.addColorStop(.28,color+'50');g.addColorStop(1,color+'00');x.fillStyle=g;x.fillRect(0,0,64,64);glows.set(color,c);return c;}
 function project(x,y,z){x-=focus.x;y-=focus.y;z-=focus.z;const xx=x*Math.cos(yaw)-z*Math.sin(yaw),zz=x*Math.sin(yaw)+z*Math.cos(yaw),yy=y*Math.cos(pitch)-zz*Math.sin(pitch),depth=y*Math.sin(pitch)+zz*Math.cos(pitch),scale=Math.min(width/820,height/560)*zoom*720/(860+depth);return {x:width*.5+xx*scale,y:height*.50+yy*scale,depth,s:scale};}
 function resize(){const rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';dirty=true;}
 function line(points,stroke,lineWidth=1){ctx.beginPath();points.forEach((p,i)=>{const v=project(...p);i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y);});ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
 function backdrop(){ctx.fillStyle='#030916';ctx.fillRect(0,0,width,height);
  const pools=[[.49,.49,.51,'#114976'],[.31,.38,.32,'#442474'],[.72,.55,.35,'#063d50']];
  for(const [x,y,r,color]of pools){const g=ctx.createRadialGradient(width*x,height*y,0,width*x,height*y,Math.max(width,height)*r);g.addColorStop(0,color+'8a');g.addColorStop(.35,color+'3d');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);}
  for(const s of stars){ctx.globalAlpha=s.a;ctx.fillStyle='#c4d6ff';ctx.beginPath();ctx.arc((s.u*width+yaw*9+width)%width,s.v*height,s.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
 }
 function draw(time){
  ctx.setTransform(dpr,0,0,dpr,0,0);backdrop();
  const t=geometryStart?Math.min(1,(time-geometryTime)/650):1,ease=t*t*(3-2*t);
  for(const radius of [115,220,315])line(Array.from({length:101},(_,i)=>{const a=i/100*Math.PI*2;return [Math.cos(a)*radius,0,Math.sin(a)*radius];}),'#5884b522',.8);
  line([[-330,0,0],[330,0,0]],'#668ac016',.7);line([[0,0,-330],[0,0,330]],'#668ac016',.7);
  // A subtle central reference light is decoration, never a data observation.
  const core=project(0,0,0);if(layout!=='signal'){ctx.globalAlpha=.5;ctx.drawImage(sprite('#a8c9ff'),core.x-37,core.y-37,74,74);ctx.globalAlpha=1;}
  screen=[];
  for(const n of geom.nodes){if(!n.available)continue;const old=geometryStart?.get(n.key);const xx=old?old.x+(n.x-old.x)*ease:n.x,yy=old?old.y+(n.y-old.y)*ease:n.y,zz=old?old.z+(n.z-old.z)*ease:n.z;const p=project(xx,yy,zz);if(p.x<-30||p.x>width+30||p.y<-30||p.y>height+30)continue;screen.push({...p,node:n,dim:filter&&filter!==n.status,radius:Math.max(2.4,Math.min(6,4.4*p.s))});}
  screen.sort((a,b)=>b.depth-a.depth);
  if(layout==='constellations'&&geom.nodes.length<1800){
   for(const g of geom.groups){const children=screen.filter(p=>p.node.family===g.family).slice(0,32);if(children.length<2)continue;ctx.strokeStyle='#9db6ea1a';ctx.lineWidth=.6;ctx.beginPath();for(let i=1;i<children.length;i++){ctx.moveTo(children[i-1].x,children[i-1].y);ctx.lineTo(children[i].x,children[i].y);}ctx.stroke();}
  }
  const selectedPoint=screen.find(p=>p.node.key===selected),related=new Set(selected?atlasRelated(geom.nodes,selected):[]);
  if(selectedPoint){for(const p of screen.filter(x=>related.has(x.node.key)).slice(0,80)){ctx.strokeStyle='#d1bcff66';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(selectedPoint.x,selectedPoint.y);ctx.quadraticCurveTo((p.x+selectedPoint.x)/2,(p.y+selectedPoint.y)/2-40,p.x,p.y);ctx.stroke();}}
  for(const p of screen){
   const n=p.node,hot=n.key===selected||n.key===hover,isRelated=related.has(n.key),radius=hot?Math.max(5,p.radius*1.5):geom.nodes.length>1800?Math.max(1.25,Math.min(2.35,p.radius*.46)):p.radius;
   ctx.globalAlpha=p.dim?.06:Math.max(.42,Math.min(1,1-p.depth/1100));
   if(!catalog){const sz=(hot?48:geom.nodes.length>1800?12:26)*Math.max(.65,p.s);ctx.drawImage(sprite(n.color),p.x-sz/2,p.y-sz/2,sz,sz);ctx.fillStyle=hot?'#ffffff':n.color;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();}
   else{ctx.strokeStyle=hot?'#ffffff':n.color;ctx.lineWidth=hot?1.7:.9;ctx.beginPath();ctx.arc(p.x,p.y,geom.nodes.length>1800?Math.max(1.05,radius*.7):radius,0,Math.PI*2);ctx.stroke();}
   if(hot||isRelated){ctx.strokeStyle=hot?'#e2eaff':'#c8abed';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,radius+5,0,Math.PI*2);ctx.stroke();}
   else if(!p.dim&&['miss','false_alarm'].includes(n.status)&&geom.nodes.length<1500){ctx.strokeStyle=n.color+'7c';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(p.x,p.y,radius+4+(spin&&!reduced.matches?Math.sin(time/720+n.index)*1.4:0),0,Math.PI*2);ctx.stroke();}
  }ctx.globalAlpha=1;
  if(layout==='constellations'&&zoom<1.7){ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';const labelBoxes=[];
   for(const g of geom.groups){const p=project(g.x,g.y-54,g.z);if(p.x<25||p.x>width-25||p.y<55||p.y>height-50)continue;const text=readable(g.family).slice(0,34),box={x:p.x-text.length*3,y:p.y-10,w:text.length*6,h:16};if(labelBoxes.some(b=>box.x<b.x+b.w+6&&box.x+box.w>b.x-6&&box.y<b.y+b.h+6&&box.y+box.h>b.y-6))continue;labelBoxes.push(box);ctx.lineWidth=4;ctx.strokeStyle='#071329';ctx.strokeText(text,p.x,p.y);ctx.fillStyle='#a7bddd';ctx.fillText(text,p.x,p.y);}}
  if(layout==='outcomes'){ctx.textAlign='center';ctx.font='12px ui-monospace, monospace';geom.values.forEach((v,i)=>{const a=i/Math.max(1,geom.values.length)*Math.PI*2+.5,p=project(Math.cos(a)*160,-140,Math.sin(a)*160);ctx.fillStyle='#c1c8ef';ctx.fillText(readable(v).toUpperCase(),p.x,p.y);});}
  if(layout==='signal'){line([[-265,110,-200],[265,110,-200]],'#92aec177');ctx.fillStyle='#bfcee4';ctx.font='11px ui-monospace, monospace';ctx.textAlign='left';ctx.fillText('X  attack-option probability 0 → 1',20,height-72);ctx.fillText('Y  latency (log) · Z  input tokens (log)',20,height-55);}
  if(t===1)geometryStart=null;
  root.querySelector('#atlas-visible-count').textContent=fmt(geom.nodes.filter(n=>n.available&&(!filter||filter===n.status)).length);
  canvas.dataset.nodeCount=String(geom.nodes.length);canvas.dataset.visibleCount=String(screen.filter(p=>!p.dim).length);canvas.dataset.omitted=String(geom.omitted);canvas.dataset.selectedKey=selected??'';dirty=false;
 }
 function tick(t){if(disposed)return;if(visible&&!document.hidden&&t-last>33){const elapsed=Math.min(80,t-last);if(spin&&!drag&&!selected&&!hover&&!reduced.matches)yawTo+=elapsed*.00005;
  const moving=Math.abs(yaw-yawTo)+Math.abs(pitch-pitchTo)+Math.abs(zoom-zoomTo)+Math.abs(focus.x-target.x)+Math.abs(focus.y-target.y)+Math.abs(focus.z-target.z)>.001;
  if(moving){yaw+=(yawTo-yaw)*.16;pitch+=(pitchTo-pitch)*.16;zoom+=(zoomTo-zoom)*.16;for(const k of ['x','y','z'])focus[k]+=(target[k]-focus[k])*.12;}
  if(dirty||moving||geometryStart||(spin&&!reduced.matches))draw(t);last=t;
 }frame=requestAnimationFrame(tick);}
 function setRunning(){const b=root.querySelector('#orbit-motion');b.textContent=spin?'Pause orbit':'Animate orbit';b.setAttribute('aria-pressed',String(spin));}
 function repaintFilters(){const filters=root.querySelector('#atlas-filters');filters.innerHTML=Object.entries(geom.counts).map(([k,n])=>`<button data-atlas-status="${k}" aria-pressed="${filter===k}"><i style="background:${ATLAS_PALETTE[k]}"></i>${labels[k]} <b>${n}</b></button>`).join('');}
 function updateGeometry(){geometryStart=new Map(geom.nodes.map(n=>[n.key,n]));geometryTime=performance.now();geom=atlasGeometry(rows,{layout,field});selected=null;hover=null;pin.hidden=true;tip.hidden=true;filter=null;target={x:0,y:0,z:0};dirty=true;repaintFilters();root.querySelector('#atlas-layout-caption').textContent=layout==='constellations'?'Family constellations':layout==='outcomes'?'Authored outcome islands':'Measured probability / time / size';root.querySelector('#atlas-data-explanation').textContent=layout==='signal'?`Only real recorded metrics. ${geom.omitted} observations lack one or more required measurements and are omitted from this layout. Probability is not calibrated correctness.`:`${catalog?'Unrun cells—not observed outcomes.':'One point per test row; colors compare '+(fieldNames[field]??readable(field))+' to the authored answer.'} Positions organize ${layout==='constellations'?'families':'expected outcomes'}; distance is not semantic. Background stars are decorative.`;}
 function choose(key){selected=key;const n=geom.nodes.find(n=>n.key===key);if(!n){pin.hidden=true;target={x:0,y:0,z:0};dirty=true;return;}
  const r=n.row,expected=r.expected?.[field],actual=atlasObserved(r,field),p=r.answers?.[field]?.probabilities?.[r.answers?.[field]?.choice];
  pin.innerHTML=`<button id="atlas-unpin" class="atlas-unpin" aria-label="Clear selected observation">×</button><div class="eyebrow">${catalog?'UNMEASURED CATALOG CELL':labels[n.status]}</div><strong>${esc(r.caseId??r.id)}</strong><span>${esc(readable(n.family))}</span><div class="atlas-values"><div><small>Expected ${esc(readable(field))}</small><b>${esc(readable(expected))}</b></div><div><small>${catalog?'Execution':'Observed'}</small><b>${catalog?'Not run':esc(readable(actual??'Unavailable'))}</b></div></div>${Number.isFinite(p)?`<div class="atlas-probability"><i style="width:${p*100}%;background:${n.color}"></i></div><small>Selected-option value ${p.toFixed(2)} · not correctness confidence</small>`:''}<button id="atlas-focus" class="btn small">Fly closer</button><button id="atlas-inspect" class="btn primary small">${catalog?'Inspect exact test':'Open recorded evidence'} ↗</button>`;
  pin.hidden=false;announce.textContent=`${r.caseId??r.id}. Expected ${readable(expected)}. ${catalog?'Not run.':'Observed '+readable(actual??'Unavailable')+'.'}`;dirty=true;
 }
 function closest(e){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let best=null,dist=160;for(const p of screen){if(p.dim)continue;const d=(x-p.x)**2+(y-p.y)**2;if(d<dist){best=p;dist=d;}}return best;}
 listen(root,'click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.atlasLayout){layout=b.dataset.atlasLayout;root.querySelectorAll('[data-atlas-layout]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));updateGeometry();}
  else if(b.dataset.atlasStatus){filter=filter===b.dataset.atlasStatus?null:b.dataset.atlasStatus;repaintFilters();dirty=true;choose(null);}
  else if(b.id==='orbit-motion'){spin=!spin;setRunning();dirty=true;}
  else if(b.id==='atlas-reset'){yawTo=.34;pitchTo=.62;zoomTo=1;filter=null;choose(null);repaintFilters();}
  else if(b.id==='atlas-zoom-in')zoomTo=Math.min(3.8,zoomTo*1.18);
  else if(b.id==='atlas-zoom-out')zoomTo=Math.max(.5,zoomTo/1.18);
  else if(b.id==='atlas-unpin')choose(null);
  else if(b.id==='atlas-focus'&&selected){const n=geom.nodes.find(n=>n.key===selected);target={x:n.x,y:n.y,z:n.z};zoomTo=2;dirty=true;}
  else if(b.id==='atlas-next-interest'){let ns=catalog?geom.groups.map(g=>geom.nodes.find(n=>n.family===g.family)):geom.nodes.filter(n=>['false_alarm','miss','disagreement'].includes(n.status));ns=ns.filter(n=>n.available);if(ns.length){const i=ns.findIndex(n=>n.key===selected);choose(ns[(i+1)%ns.length].key);}else announce.textContent='No differences for this judgment.';}
  else if(b.id==='atlas-inspect'&&selected)onInspect?.(selected);
  else if(b.id==='atlas-expand'){root.classList.toggle('atlas-expanded');b.setAttribute('aria-label',root.classList.contains('atlas-expanded')?'Close expanded atlas':'Expand atlas');resize();}
  else if(b.id==='atlas-export'){draw(performance.now());canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='observatory-atlas.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
 });
 listen(fieldSelect,'change',()=>{field=fieldSelect.value;updateGeometry();});
 listen(canvas,'pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw:yawTo,pitch:pitchTo,shift:e.shiftKey};moved=false;canvas.setPointerCapture(e.pointerId);});
 listen(canvas,'pointermove',e=>{if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;yawTo=drag.yaw+dx*.006;pitchTo=Math.max(-1.25,Math.min(1.25,drag.pitch+dy*.004));dirty=true;return;}
  const hit=closest(e);hover=hit?.node.key??null;canvas.style.cursor=hit?'pointer':'grab';tip.hidden=!hit;
  if(hit){tip.innerHTML=`<strong>${esc(hit.node.row.caseId??hit.node.row.id)}</strong><span>${esc(labels[hit.node.status])} · ${esc(readable(hit.node.family))}</span>`;const rect=canvas.getBoundingClientRect();tip.style.left=Math.max(10,Math.min(width-270,e.clientX-rect.left+15))+'px';tip.style.top=Math.max(90,Math.min(height-100,e.clientY-rect.top-48))+'px';}dirty=true;
 });
 listen(canvas,'pointerup',e=>{if(!moved){const hit=closest(e);choose(hit?.node.key??null);}drag=null;});listen(canvas,'pointercancel',()=>{drag=null;});listen(canvas,'pointerleave',()=>{hover=null;tip.hidden=true;dirty=true;});
 listen(canvas,'wheel',e=>{e.preventDefault();zoomTo=Math.max(.5,Math.min(3.8,zoomTo*Math.exp(-e.deltaY*.001)));},{passive:false});
 listen(canvas,'dblclick',e=>{const hit=closest(e);if(hit)onInspect?.(hit.node.key);});
 listen(canvas,'keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const candidates=geom.nodes.filter(n=>n.available&&(!filter||n.status===filter));if(!candidates.length)return;const i=candidates.findIndex(n=>n.key===selected),step=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;choose(candidates[(i+step+candidates.length)%candidates.length].key);}
  if(e.key==='Enter'&&selected){e.preventDefault();onInspect?.(selected);}if(e.key==='+'||e.key==='=')zoomTo=Math.min(3.8,zoomTo*1.15);if(e.key==='-')zoomTo=Math.max(.5,zoomTo/1.15);
 });
 listen(document,'keydown',e=>{if(e.key==='Escape'){if(root.classList.contains('atlas-expanded')){root.classList.remove('atlas-expanded');resize();}else choose(null);}});
 listen(reduced,'change',()=>{if(reduced.matches)spin=false;setRunning();dirty=true;});
 const ro=new ResizeObserver(resize);ro.observe(stage);const io=new IntersectionObserver(xs=>{visible=xs[0]?.isIntersecting??true;if(visible)dirty=true;});io.observe(root);
 canvas.atlasSnapshot=()=>({nodes:geom.nodes.length,layout,field,filter,selected,omitted:geom.omitted,spinning:spin,points:screen.filter(p=>!p.dim).map(p=>({key:p.node.key,x:p.x,y:p.y,status:p.node.status})),width,height,camera:{yaw,pitch,zoom,focus}});
 resize();setRunning();draw(performance.now());frame=requestAnimationFrame(tick);
 return ()=>{disposed=true;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();for(const off of listeners)off();delete canvas.atlasSnapshot;root.classList.remove('atlas-expanded');};
}
