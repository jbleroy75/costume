import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {CATALOG} from '../dist/catalog-data.js';
import {studioImage,supplierImage} from '../dist/design-assets.js';
let covered=0;
for(const group of CATALOG.groups)for(const [index,option] of group.options.entries()){
 const image=studioImage(group.id,index);
 if(option.image){assert(image,`${group.id}/${option.id} missing generated replacement`);assert(image.startsWith('./assets/studio/'));assert(existsSync(new URL('../dist/'+image.slice(2),import.meta.url)),image);covered++;}
}
assert.equal(covered,221);
const refs = CATALOG.groups.flatMap(g=>g.options.map(o=>supplierImage(g.id,o.id))).filter(Boolean);
assert.equal(refs.length,138);
for(const ref of refs)assert(existsSync(new URL('../dist/'+ref.slice(2),import.meta.url)));
const js=readFileSync(new URL('../dist/catalog.js',import.meta.url),'utf8');
assert(!js.includes('img.src=option.image'));
assert(!js.includes('original||option.image'));assert(!js.includes('positionDiagram'));assert(!js.includes('data:image/svg')); 
assert(!js.includes('showPage'));assert(!existsSync(new URL('../dist/assets/taelson',import.meta.url)));
const html=readFileSync(new URL('../dist/studio.html',import.meta.url),'utf8');assert(!html.includes('catalog-export-json'));assert(!html.includes('catalog-dialog'));
console.log('PASS: 221 illustrated options, 138 supplier references, no full catalogue pages in the interface.');

// Option illustrations are one series: every file is a 480 × 480 WebP that went through
// scripts/standardize-option-assets.py (canvas, backdrop tone, navy), as recorded in its manifest.
{
  const {readdirSync}=await import('node:fs'),{createHash}=await import('node:crypto');
  const folder=new URL('../dist/assets/studio/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('../scripts/option-assets.json',import.meta.url),'utf8'));
  const size=data=>{
    const kind=data.toString('latin1',12,16);
    if(kind==='VP8 ')return [data.readUInt16LE(26)&0x3fff,data.readUInt16LE(28)&0x3fff];
    if(kind==='VP8L'){const bits=data.readUInt32LE(21);return [(bits&0x3fff)+1,((bits>>14)&0x3fff)+1];}
    return [data.readUIntLE(24,3)+1,data.readUIntLE(27,3)+1]; // VP8X
  };
  const files=readdirSync(folder).filter(name=>name.endsWith('.webp'));
  for(const name of files){
    const data=readFileSync(new URL(name,folder));
    assert.deepEqual(size(data),[480,480],`${name} must be 480 × 480`);
    assert.equal(createHash('sha1').update(data).digest('hex'),manifest[name],`${name} is not standardised: run python3 scripts/standardize-option-assets.py`);
  }
  console.log(`PASS: ${files.length} option illustrations, all 480 × 480 and standardised.`);
}
