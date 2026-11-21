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
