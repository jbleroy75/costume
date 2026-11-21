import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {COLORS,FABRICS,PATTERNS,BUTTONS,DEFAULT,ASSETS,normalize,assetKey,prepareSource,renderPixels} from '../dist/render-engine.js';
import {GROUPS,normalizeTailoring} from '../dist/catalog.js';
const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qa=path.join('/workspace/scratch/af049406d271','suit-render-qa');
await mkdir(qa,{recursive:true});
const sources={};
const width=768,height=1152;
for(const [key,file] of Object.entries(ASSETS)) {
  const {data,info}=await sharp(path.join(root,'dist',file)).resize(width,height).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);
  sources[key]=prepareSource(data,width,height,key);
  assert.deepEqual(Buffer.from(renderPixels(sources[key],DEFAULT)),data,`${key}: default preserves the master image`);
}
assert.equal(assetKey(normalize({closure:'double',lapel:'notch'})),'double_peak');
assert.deepEqual(normalize({closure:'unknown',color:'magenta',pattern:'bad',buttons:'invalid',contrast:'bad'}),DEFAULT);
assert.equal(normalize({patternScale:99,contrast:-20}).patternScale,1.6);
assert.equal(normalize({patternScale:99,contrast:-20}).contrast,.15);
const pixel=(data,x,y)=>Array.from(data.slice((Math.floor(y*height)*width+Math.floor(x*width))*4,(Math.floor(y*height)*width+Math.floor(x*width))*4+4));
const colorDiff=(a,b)=>a.slice(0,3).reduce((sum,n,i)=>sum+Math.abs(n-b[i]),0);
let cases=0;
for(const [key,source] of Object.entries(sources)) {
  for(const color of COLORS)for(const pattern of PATTERNS) {
    const config={...DEFAULT,color:color.id,pattern:pattern.id,closure:key.startsWith('double')?'double':'single',lapel:key.endsWith('peak')?'peak':'notch'};
    const output=renderPixels(source,config);
    assert.equal(output.length,source.data.length);
    for(const [x,y] of [[.02,.02],[.98,.5],[.5,.075],[.5,.12]]) assert.deepEqual(pixel(output,x,y),pixel(source.data,x,y),`${key}/${color.id}/${pattern.id}: background and white shirt remain unchanged`);
    for(let i=3;i<output.length;i+=4) assert.equal(output[i],255,'opaque export stays opaque');
    if(color.id!=='navy')assert.ok(colorDiff(pixel(output,.42,.4),pixel(source.data,.42,.4))>10,`${key}/${color.id}: dye visibly changes jacket`);
    cases++;
  }
  for(const fabric of FABRICS) {
    const result=renderPixels(source,{...DEFAULT,fabric:fabric.id});
    if(fabric.id!=='worsted')assert.notDeepEqual(Buffer.from(result),Buffer.from(source.data),`${fabric.id}: material changes the fabric`);
  }
  for(const button of BUTTONS) {
    const result=renderPixels(source,{...DEFAULT,buttons:button.id});
    if(button.id!=='horn')assert.notDeepEqual(Buffer.from(result),Buffer.from(source.data),`${button.id}: front buttons change`);
    assert.deepEqual(pixel(result,.5,.12),pixel(source.data,.5,.12),'button finish leaves white shirt unchanged');
  }
}
const examples=[['single_notch',{...DEFAULT,color:'sand',fabric:'linen',pattern:'solid'},'sable-lin'],['single_peak',{...DEFAULT,color:'gray',fabric:'flannel',pattern:'glen'},'gris-prince-de-galles'],['double_peak',{...DEFAULT,closure:'double',lapel:'peak',color:'navy',fabric:'worsted',pattern:'pinstripe',buttons:'dark'},'croise-rayures']];
const pearl=GROUPS.find(g=>g.id==='catalogButtons').options.find(o=>o.code==='WY-33');
const pearlOutput=renderPixels(sources.single_notch,{...DEFAULT,tailoring:normalizeTailoring({catalogButtons:pearl.id})});
assert.deepEqual(pixel(pearlOutput,.42,.4),pixel(sources.single_notch.data,.42,.4),'changing only a catalog button preserves the original fabric');
assert.deepEqual(pixel(pearlOutput,.5,.12),pixel(sources.single_notch.data,.5,.12),'catalog button dye does not affect the shirt');
assert.notDeepEqual(Buffer.from(pearlOutput),Buffer.from(sources.single_notch.data),'catalog button colors affect the visible buttons');
for(const [key,config,name] of examples) {
  const result=renderPixels(sources[key],config);
  await sharp(Buffer.from(result),{raw:{width,height,channels:4}}).png().toFile(path.join(qa,`${name}.png`));
}
// All referenced static files and DOM IDs must exist before packaging.
const html=await readFile(path.join(root,'dist/studio.html'),'utf8');
const app=await readFile(path.join(root,'dist/app.js'),'utf8');
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
for(const match of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(match[1]),`missing DOM target: ${match[1]}`);
assert.equal(ids.size,[...html.matchAll(/\bid="([^"]+)"/g)].length,'DOM IDs are unique');
for(const asset of Object.values(ASSETS)) assert.ok((await readFile(path.join(root,'dist',asset))).length>0);
console.log(`PASS: ${cases} color/pattern combinations on ${Object.keys(ASSETS).length} photographic bases; materials, buttons, untouched shirt/background, default fidelity, assets and DOM references. QA examples: ${qa}`);
