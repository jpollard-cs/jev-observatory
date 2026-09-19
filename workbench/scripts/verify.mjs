import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {sha,assert} from '../src/util.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try {const manifest=JSON.parse(fs.readFileSync(path.join(root,'file-manifest.json'),'utf8'));let checked=0;
 for(const [name,expected] of Object.entries(manifest.files)){const file=path.resolve(root,name);assert(file.startsWith(root+path.sep),'Invalid manifest path');assert(fs.existsSync(file),'Missing release file: '+name);assert(sha(fs.readFileSync(file))===expected,'Changed release file: '+name);checked++;}
 console.log(JSON.stringify({status:'verified',version:manifest.version,filesChecked:checked,liveCalls:0,note:'Checksums establish equality to this release manifest, not independent provider execution or an external signature.'},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
