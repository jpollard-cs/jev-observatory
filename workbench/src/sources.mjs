import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha} from './util.mjs';
export const PACKAGE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function executionSources(){const root=PACKAGE_ROOT,names=['package.json','cli.mjs','selection.mjs'];function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const n=dir+'/'+e.name;if(e.isDirectory()){if(!['validation','docs','tests','examples'].includes(e.name))walk(n);}else if(/\.(mjs|json|md)$/.test(n))names.push(n);}}for(const dir of ['src','vendor'])walk(dir);names.push('data/context-cases.json');return Object.fromEntries(names.sort().map(n=>[n,sha(fs.readFileSync(path.join(root,n)))]));}
