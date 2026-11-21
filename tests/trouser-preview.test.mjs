import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {prepareSource,renderPixels} from '../dist/render-engine.js';
import {constructTrousers} from '../dist/trouser-preview.js';
const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
async function photo(side){
 const {data,info}=await sharp(new URL('../dist/assets/trousers/'+side+'.webp',import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 return prepareSource(data,info.width,info.height,'trouser');
}
function changed(a,b){let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])>2)changed++;return changed;}
const front=await photo('front'),rear=await photo('back');
const base={trouserFrontPockets:'poches-inclinees',waistExtension:'prolongement-pointu'};
const variants=['sans-pince','une-pince-inversee','deux-pinces-inversees'].map(trouserPleats=>constructTrousers(front,{...base,trouserPleats},false));
assert(changed(variants[0].data,variants[1].data)>700);
assert(changed(variants[1].data,variants[2].data)>400);
for(const source of variants)assert.equal(Buffer.compare(Buffer.from(source.data.subarray(260*front.width*4)),front.data.subarray(260*front.width*4)),0);
const back1=constructTrousers(rear,{trouserBackPockets:'droite-passepoil-double'},true);
const back2=constructTrousers(rear,{trouserBackPockets:'gauche-passepoil-double'},true);
assert(changed(back1.data,back2.data)>200);
const waist=constructTrousers(front,{...base,waistExtension:'ceinture-croisee-gurkha',waistAdjustment:'pattes-de-serrage'},false);
assert(changed(variants[0].data,waist.data)>400);
const striped=renderPixels(variants[2],{supplierFabric:'18061-233'});
assert(changed(striped,variants[2].data)>30000);
if(process.env.GARMENT_QA_DIR){
 for(const [i,src] of [...variants,back1,waist].entries()){
  await sharp(Buffer.from(src.data),{raw:{width:src.width,height:src.height,channels:4}}).extract({left:147,top:8,width:342,height:220}).png().toFile(process.env.GARMENT_QA_DIR+'/pants-'+i+'.png');
 }
}
console.log('PASS: matched photographic trouser fronts with 0/1/2 pleats, isolated detail regions, left/right back pockets, waistband/adjustment and selected fabric.');
