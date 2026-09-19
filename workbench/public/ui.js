export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=x=>Number(x??0).toLocaleString('en-US');
export const money=x=>'$'+Number(x??0).toFixed(Number(x??0)<.01?4:3);
export const pretty=x=>JSON.stringify(x,null,2);
export const badge=(s,kind='neutral')=>`<span class="pill ${esc(kind)}">${esc(s)}</span>`;
export const val=x=>typeof x==='string'?x:x?.choice??'—';
export const stat=(label,value,sub)=>`<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`;
export const option=(value,label,selected)=>`<option value="${esc(value)}" ${selected===value?'selected':''}>${esc(label)}</option>`;
export const code=x=>`<pre class="code">${esc(typeof x==='string'?x:pretty(x))}</pre>`;
export const check=(name,label,checked,disabled=false)=>`<label class="check ${disabled?'disabled':''}"><input type="checkbox" data-setting="${esc(name)}" ${checked?'checked':''} ${disabled?'disabled':''}><span>${esc(label)}</span></label>`;
export const button=(text,action,cls='')=>`<button class="btn ${cls}" data-action="${esc(action)}">${esc(text)}</button>`;
export function download(name,obj){const b=new Blob([typeof obj==='string'?obj:pretty(obj)+'\n'],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
export function toast(text){const t=document.getElementById('toast');t.textContent=text;t.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.style.display='none',4500);}

export function answerDisplay(x){if(x==null)return 'unavailable';if(typeof x==='string')return x;if(x.choice!==undefined)return x.choice;if(Number.isFinite(x.noul))return x.noul+' (Noul)';if(Number.isFinite(x.score))return x.score+' (Score)';return JSON.stringify(x);}
