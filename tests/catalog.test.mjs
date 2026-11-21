import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {GROUPS,normalizeTailoring,getOption,configurationRows,encodeConfiguration,decodeConfiguration} from '../dist/catalog.js';
import {normalize,DEFAULT,assetKey} from '../dist/render-engine.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.equal(GROUPS.length,25);
assert.equal(GROUPS.reduce((sum,g)=>sum+g.options.length,0),221);
const counts={coatFront:11,coatLapel:12,buttonholePosition:11,buttonholeStyle:15,coatPockets:12,monogramFont:12,catalogButtons:61,waistExtension:8,trouserBackPockets:8,trouserFrontPockets:5,vestFront:12,vestCollar:9,vestPockets:12};
for(const [key,count] of Object.entries(counts))assert.equal(GROUPS.find(g=>g.id===key).options.length,count,key);
for(const group of GROUPS){
  assert.ok(getOption(group.id,group.default),'default exists');
  assert.equal(new Set(group.options.map(option=>option.id)).size,group.options.length,`${group.id}: unique option identifiers`);
  for(const option of group.options){assert.ok(option.original);if(option.image)assert.ok((await readFile(path.join(root,'dist',option.image))).length>200,`${group.id}: reference image exists`);}
}
const fonts=GROUPS.find(g=>g.id==='monogramFont').options.map(o=>o.original);
assert.deepEqual(fonts,['Embroidery Font 1','Embroidery Font 2','Embroidery Font 3','Embroidery Font 4','Embroidery Font 5','Embroidery Font 6','Embroidery Font 8','Embroidery Font 10','Embroidery Font 12','Embroidery Font 15','Embroidery Font 23','Embroidery Font 103']);
const buttons=GROUPS.find(g=>g.id==='catalogButtons').options;
assert.equal(buttons.filter(o=>o.family==='Classique').length,30);
assert.equal(buttons.filter(o=>o.family==='Nacre').length,29);
assert.equal(buttons.filter(o=>o.code==='DD-15').length,2,'same manufacturer code in different collections stays distinguishable');
const bad=normalizeTailoring({coatFront:'missing',vestEnabled:'true',lapelCustomWidth:'-2',monogramText:'Élodie\u0000 李',liningReference:123});
assert.equal(bad.coatFront,'simple-2-boutons');assert.equal(bad.vestEnabled,false);assert.equal(bad.lapelCustomWidth,'');assert.equal(bad.monogramText,'Élodie 李');assert.equal(bad.liningReference,'');
const tailoring=normalizeTailoring({vestEnabled:true,coatFront:'croisee-6-sur-3',lapelWidth:'largeur-personnalisee',lapelCustomWidth:'10.5',coatLapel:'chale-carre',buttonholeStyle:'milanaise-zm012',monogramText:'Léonie & JB 李',monogramFont:'police-103',threadColor:'Champagne',liningReference:'Paisley bordeaux',customNotes:'Boutons jointifs, références à confirmer.'});
const config=normalize({...DEFAULT,closure:'double',tailoring});
assert.deepEqual(decodeConfiguration(encodeConfiguration(config)),config,'UTF-8 share links preserve accents and non-Latin text');
assert.deepEqual(decodeConfiguration(btoa(JSON.stringify(DEFAULT))),DEFAULT,'existing share links remain valid');
const migrated=normalizeTailoring(undefined,{closure:'double',lapel:'peak'});
assert.equal(migrated.coatFront,'croisee-6-sur-2','existing double-breasted creations migrate to the matching catalog closure');
assert.equal(migrated.coatLapel,'en-pointe');
const conflict=normalize({closure:'double',lapel:'peak',tailoring:{coatFront:'simple-2-boutons',coatLapel:'crantes'}});
assert.equal(assetKey(conflict),'single_notch','catalog selection resolves conflicting old preview fields');
for(const front of GROUPS.find(g=>g.id==='coatFront').options){
  const state=normalize({...DEFAULT,tailoring:{coatFront:front.id}});
  assert.equal(state.closure,front.original.startsWith('Double-Breasted')?'double':'single','each catalog closure drives the matching preview family');
  assert.equal(state.tailoring.coatFront,front.id,'precise manufacturer choice is preserved');
}
const rows=configurationRows(config);
assert.ok(rows.some(r=>r.field==='Fermeture de la veste'&&r.reference==='Double-Breasted 6 On 3'));
assert.ok(rows.some(r=>r.field==='Largeur des revers'&&r.value==='10.5 cm'));
assert.ok(rows.some(r=>r.field.startsWith('Inscription')&&r.value.includes('Police 103')));
assert.ok(rows.some(r=>r.category==='Gilet'&&r.field==='Col et revers du gilet'));
assert.ok(!configurationRows(DEFAULT).some(r=>r.field==='Col et revers du gilet'),'unselected vest is excluded from the order sheet');
const html=await readFile(path.join(root,'dist/studio.html'),'utf8');const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const js=await readFile(path.join(root,'dist/catalog.js'),'utf8');
for(const match of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(match[1]),`missing catalog DOM target ${match[1]}`);
for(const field of ['liningReference','customNotes','lapelCustomWidth'])assert.ok(ids.has(`catalog-${field}`));
console.log('PASS: 25 sections, 221 choices, 221 studio images; selections, vest exclusion, custom width, UTF-8 sharing and export fields.');
