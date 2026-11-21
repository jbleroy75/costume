import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {GROUPS} from '../dist/catalog.js';
import {ASSETS,assetKey,normalize,prepareSource,renderPixels} from '../dist/render-engine.js';
const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const width=512,height=768;
async function photo(key){
  const master=await sharp(new URL('../dist/'+ASSETS[key],import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const data=await sharp(master.data,{raw:master.info}).resize(width,height).raw().toBuffer();
  return prepareSource(data,width,height,key);
}
function changedPixels(a,b,left,top,right,bottom){
  let changed=0;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const i=(y*width+x)*4;
    if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>4)changed++;
  }
  return changed;
}
for(const [front,lapel] of [['simple-2-boutons','crantes'],['simple-2-boutons','en-pointe'],['croisee-6-sur-2','en-pointe']]){
  const tailoring={coatFront:front,coatLapel:lapel};
  const config=normalize({tailoring}),vest=normalize({tailoring:{...tailoring,vestEnabled:true}});
  const frontPhoto=await photo(assetKey(config)), triplePhoto=await photo(assetKey(vest));
  const two=renderPixels(frontPhoto,config),three=renderPixels(triplePhoto,vest);
  assert(changedPixels(two,three,220,95,282,202)>170,'waistcoat replaces the visible area of shirt');
  assert.equal(changedPixels(two,three,70,302,440,740),0,'waistcoat preserves the master below the chest');
  const ticket=normalize({...vest,tailoring:{...vest.tailoring,coatPockets:'rabat-droit-poche-ticket-a-rabat'}});
  const withPocket=renderPixels(triplePhoto,ticket);
  assert(changedPixels(three,withPocket,172,239,202,257)>65,'ticket pocket produces new detail on wearer right');
  assert.equal(changedPixels(three,withPocket,300,230,350,259),0,'opposite side remains untouched');
  const dyed=renderPixels(triplePhoto,{...ticket,supplierFabric:'18061-233'});
  assert(changedPixels(dyed,withPocket,240,135,266,165)>50,'supplier dye and stripe reach the waistcoat');
  if(process.env.GARMENT_QA_DIR){
    await sharp(Buffer.from(dyed),{raw:{width,height,channels:4}}).extract({left:103,top:53,width:304,height:250}).resize(608,500).png().toFile(process.env.GARMENT_QA_DIR+'/'+assetKey(vest)+'.png');
  }
}
const fronts=GROUPS.find(group=>group.id==='coatFront').options;
const signatures=new Set(), frontMasters=new Map();
for(const front of fronts){
  const config=normalize({tailoring:{coatFront:front.id}});
  const key=assetKey(config);
  if(!frontMasters.has(key))frontMasters.set(key,await photo(key));
  const pixels=renderPixels(frontMasters.get(key),config);
  signatures.add(createHash('sha256').update(pixels).digest('hex'));
}
assert.equal(signatures.size,fronts.length,'all eleven closures have distinct visible layouts');
console.log('PASS: three waistcoats, eleven closures, ticket placements, source fidelity and supplier fabric composition.');
