import {cpSync,mkdirSync,readdirSync} from 'node:fs';
mkdirSync('dist/client',{recursive:true});
for(const f of readdirSync('dist'))if(!['client','server','.openai'].includes(f))cpSync('dist/'+f,'dist/client/'+f,{recursive:true});
mkdirSync('dist/server',{recursive:true});
cpSync('worker/index.js','dist/server/index.js');
