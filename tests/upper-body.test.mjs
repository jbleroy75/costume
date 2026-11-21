import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {CATALOG} from '../dist/catalog-data.js';
import {ASSETS,assetKey,normalize,prepareSource,renderPixels} from '../dist/render-engine.js';
import {upperBodyLayers,upperBodyVariant} from '../dist/upper-body.js';

const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const file=relative=>new URL('../dist/'+relative,import.meta.url).pathname;
const source=(key,state)=>upperBodyLayers(key,state).map(id=>({input:file('assets/bodice/'+id+'.webp'),left:308,top:82}));
const options=id=>CATALOG.groups.find(group=>group.id===id).options;
const hash=data=>createHash('sha256').update(data).digest('hex');
const fronts=['simple-2-boutons','croisee-6-sur-2'];
for(const front of fronts){
  for(const group of ['coatLapel','vestFront']){
    const fingerprints=new Set();
    for(const option of options(group)){
      const state=normalize({tailoring:{coatFront:front,vestEnabled:true,[group]:option.id}});
      const key=assetKey(state);
      const layers=source(key,state);
      for(const layer of layers)assert(existsSync(layer.input),layer.input);
      const detail=await sharp(file(ASSETS[key])).composite(layers).png().toBuffer();
      const crop=await sharp(detail).extract({left:308,top:82,width:400,height:324}).raw().toBuffer();
      fingerprints.add(hash(crop));
    }
    assert.equal(fingerprints.size,options(group).length,front+' '+group+' must produce distinct visible images');
  }
}
const state=normalize({supplierFabric:'18061-233',tailoring:{coatFront:fronts[1],coatLapel:'chale-carre',vestEnabled:true,vestFront:'encolure-u-croise-bas-pointu'}});
const key=assetKey(state),master=file(ASSETS[key]),layers=source(key,state);
assert.equal(layers.length,2);
assert.notEqual(upperBodyVariant(key,state),key);
const raw=await sharp(master).composite(layers).png().toBuffer();
const buffer=await sharp(raw).resize(384,576).ensureAlpha().raw().toBuffer();
const base=prepareSource(buffer,384,576,key);
const dyed=renderPixels(base,state);
assert.notEqual(hash(dyed),hash(buffer));
const outside=await sharp(raw).extract({left:0,top:410,width:1024,height:1100}).raw().toBuffer();
const original=await sharp(master).ensureAlpha().extract({left:0,top:410,width:1024,height:1100}).raw().toBuffer();
assert.equal(hash(outside),hash(original),'buttons, pockets and trousers outside the collar crop must be preserved');
console.log('PASS: 12 lapels and 12 waistcoat fronts have distinct images on both closures; overlays combine with supplier dye and leave the lower silhouette intact.');
