import {clone,assert,exactKeys} from './util.mjs';
import {languageOptionsForModel} from './model-capabilities.mjs';

/** An explicit owner decision, separate from model advice and limited to input languages. */
export function reviewLanguageChoice(policy,choice){
 exactKeys(choice,['mode','allowed'],'Owner language choice');
 assert(['keep_current','allowlist','any'].includes(choice.mode),'Invalid owner language mode');
 const before=clone(policy.languages);let after=clone(before);
 if(choice.mode==='allowlist'){
  const offered=languageOptionsForModel(policy.model)?.options??[];
  assert(Array.isArray(choice.allowed)&&choice.allowed.length>0&&new Set(choice.allowed).size===choice.allowed.length&&choice.allowed.every(code=>offered.some(x=>x.code===code)),'Choose languages offered for the target model');
  after={...before,mode:'allowlist',allowed:[...choice.allowed]};
 }else{
  assert(choice.allowed===undefined,'Unexpected language list');
  if(choice.mode==='any')after={...before,mode:'any',allowed:[]};
 }
 return {source:'owner',choice:clone(choice),before,after,resolvedFields:['languages']};
}
