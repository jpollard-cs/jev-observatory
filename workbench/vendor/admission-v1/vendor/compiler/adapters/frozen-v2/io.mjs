import {sha256} from '../../src/core.mjs';
export const sha=sha256;
export const unwrap=x=>{if(x.tag==='error')throw Error(x.error.code);return x.value;};
