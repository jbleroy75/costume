import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {ASSETS,prepareSource,renderPixels} from '../dist/render-engine.js';
import {SUPPLIER_FABRICS} from '../dist/supplier-fabric-data.js';
import {garmentGeometry} from '../dist/suit-volume.js';
import {rasterSuit} from '../dist/suit-raster.js';
import {repeats} from '../dist/weave-repeats.js';
const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const parts=[['leg'],['leg',true],['body'],['sleeve'],['sleeve',true],['collar']].map(args=>garmentGeometry(...args));
const file=path=>new URL('../dist/'+path,import.meta.url).pathname;
const digest=x=>createHash('sha256').update(x).digest('hex');
const tiles=new Map();
for(const f of SUPPLIER_FABRICS){
  const img=sharp(file(f.image.replace('.jpg','-weave.webp'))),meta=await img.metadata();
  const pitch=repeats[f.id],w=pitch?pitch*Math.floor(meta.width/pitch):meta.width;
  const result=await img.extract({left:0,top:0,width:w,height:meta.height}).resize(Math.round(w/4),Math.round(meta.height/4)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  tiles.set(f.id,{...result.info,data:result.data,periodic:Boolean(pitch)});
}
const qa=process.env.SUIT_CONTACT_DIR;
if(qa)mkdirSync(qa,{recursive:true});
for(const [key,path] of Object.entries(ASSETS)){
  const w=192,h=288,pw=90,ph=164;
  const base=await sharp(file(path)).resize(w,h).ensureAlpha().raw().toBuffer();
  const source=prepareSource(base,w,h,key),hashes=new Set(),thumbs=[];
  for(const [i,f] of SUPPLIER_FABRICS.entries()){
    const cloth=renderPixels(source,{supplierFabric:f.id},tiles.get(f.id));
    const args=[parts,cloth,w,h,pw,ph];
    const front=rasterSuit(...args,0,1,f.baseRGB),turned=rasterSuit(...args,.45,1,f.baseRGB);
    assert.notEqual(digest(front),digest(turned),key+' '+f.id+' rotation');
    hashes.add(digest(turned));
    if(qa)thumbs.push({input:Buffer.from(turned),raw:{width:pw,height:ph,channels:4},left:(i%14)*pw,top:Math.floor(i/14)*ph});
  }
  assert.equal(hashes.size,SUPPLIER_FABRICS.length,key+' distinct fabrics');
  if(qa)await sharp({create:{width:14*pw,height:Math.ceil(thumbs.length/14)*ph,channels:4,background:'#ece9e4'}}).composite(thumbs).jpeg().toFile(qa+'/'+key+'.jpg');
  console.log(key+': '+hashes.size+' distinct textured suits rendered at two angles');
}
