import {createHash} from 'node:crypto';
export const clone = x=>structuredClone(x);
export const sha = x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:canonical(x)).digest('hex');
export function canonical(x){ if(x===null||typeof x!=='object')return JSON.stringify(x); if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'; }
export function assert(ok,message){if(!ok)throw new Error(message);}
export const utf8=x=>Buffer.byteLength(typeof x==='string'?x:JSON.stringify(x),'utf8');
export function exactKeys(x,keys,name){assert(x&&typeof x==='object'&&!Array.isArray(x),`${name}: expected object`);for(const k of Object.keys(x))assert(keys.includes(k),`${name}: unsupported field ${k}`);}
export function text(x,name,max=4000){assert(typeof x==='string'&&x.trim().length>0&&x.length<=max,`${name}: expected 1–${max} characters`);}
export function enumValue(x,values,name){assert(values.includes(x),`${name}: expected ${values.join(' | ')}`);}
export function uniqStrings(x,name,allowed=null){assert(Array.isArray(x)&&x.every(v=>typeof v==='string')&&new Set(x).size===x.length,`${name}: expected unique strings`);if(allowed)for(const v of x)enumValue(v,allowed,name);}
export function median(xs){if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
export const label=x=>typeof x==='string'?x:x?.choice;
export function deepDiff(a,b,prefix=''){if(canonical(a)===canonical(b))return [];if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return [{path:prefix||'/',before:a??null,after:b??null}];return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>deepDiff(a[k],b[k],prefix+'/'+k));}
