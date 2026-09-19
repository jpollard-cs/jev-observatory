/** TEST ONLY: injects synthetic inference; cannot contact the model provider. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {startServer} from '../../server.mjs';import {fakeInference} from '../../tests/advisor-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jwb-browser-fake-'));let calls=0;
const server=startServer({port:0,runtime:path.join(dir,'runtime'),connectionOptions:{inferFactory:async()=>async q=>{calls++;fs.writeFileSync(path.join(dir,'calls.json'),JSON.stringify({simulated:true,calls}));return fakeInference()(q);}}});
server.on('listening',()=>console.log(JSON.stringify({base:'http://127.0.0.1:'+server.address().port,dir,synthetic:true})));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>{fs.rmSync(dir,{recursive:true,force:true});process.exit(0);});});
