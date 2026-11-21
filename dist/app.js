import {hydrateFabricCatalogue} from './imported-fabrics.js';
import {fabricPatch} from './fabric-patch.js';
import {volumePixels,reliefCanvas} from './volume-texture.js';
import {loadFabricTile} from './trouser-preview.js';
import {fabricWeight} from './supplier-fabric-data.js';
import {mountPreviewViews} from './preview-views.js';
import {mountMeasurements} from './measurements.js';
import {mountOrder} from './order.js';
import {mountSupplierFabrics} from './supplier-fabrics.js';
import {getSupplierFabric} from './supplier-fabric-data.js';
import {mountEmbroidery} from './embroidery.js';
import {COLORS,FABRICS,PATTERNS,BUTTONS,DEFAULT,ASSETS,normalize,assetKey,prepareSource,renderPixels,upperBodyVariant,paintUpperBody} from './render-engine.js';
import {mountCatalog,normalizeTailoring,getOption,encodeConfiguration,decodeConfiguration} from './catalog.js';
import {mountFlow,STEPS,STEP_LABELS} from './flow.js';
const $=id=>document.getElementById(id);
const all=selector=>Array.from(document.querySelectorAll(selector));
await hydrateFabricCatalogue();
let config=restore(),zoom=1,compare=false,activeTab='fabric',frame=null,renderTicket=0,toastTimer;
let catalog,flow,embroidery,supplierCatalog;
const views=mountPreviewViews(()=>config);
const sources=new Map(),loads=new Map();
const canvas=$('suit'),context=canvas.getContext('2d'),before=$('before'),beforeContext=before.getContext('2d');
const width=768,height=1152;

let studio3d,studioLoad,volumeEnabled=true,lastCloth=[43,49,64];
let bust=new URLSearchParams(location.search).get('vue')==='buste',lastState;
$('bust-view').addEventListener('click',()=>{bust=!bust;studio3d?.bust(bust);syncVolume();});
function syncVolume(){
  const visible=Boolean(studio3d&&volumeEnabled&&!compare);
  $('suit-volume').hidden=!visible;
  $('volume-toggle').setAttribute('aria-pressed',String(visible));
  $('bust-view').hidden=!visible;$('bust-view').setAttribute('aria-pressed',String(bust));
  studio3d?.show(visible);
}
let lastTile=null,swatchCanvas=null,lastRelief=null;
const volumeCanvas=document.createElement('canvas');volumeCanvas.width=768;volumeCanvas.height=1152;
function clothSwatch(){try{swatchCanvas=fabricPatch(lastState,lastTile,swatchCanvas||undefined);return swatchCanvas;}catch{return null;}}
function updateVolume(rgb,state,tile=null,relief=null){
  lastState=state;
  lastCloth=rgb;lastTile=tile;lastRelief=relief;
  if(studio3d){studio3d.update(rgb,state,clothSwatch(),relief);return;}
  if(studioLoad)return;
  studioLoad=import('./suit-volume.js').then(({createStudio})=>{
    studio3d=createStudio($('suit-volume'),volumeCanvas);
    $('volume-toggle').hidden=false;
    studio3d.update(lastCloth,lastState,clothSwatch(),lastRelief);studio3d.bust(bust);studio3d.zoom(zoom);syncVolume();
  }).catch(()=>{volumeEnabled=false;syncVolume();});
}
$('volume-toggle').addEventListener('click',()=>{volumeEnabled=!volumeEnabled;syncVolume();});

function restore() {
  try {
    const value=new URLSearchParams(location.search).get('c');
    if(value) return normalize(decodeConfiguration(value));
    return normalize(JSON.parse(localStorage.getItem('atelier-costume-v1')||'{}'));
  }catch{return normalize({});}
}
function save() {try{localStorage.setItem('atelier-costume-v1',JSON.stringify(config));}catch{} }
function name(list,id) {return list.find(item=>item.id===id)?.name||id;}
function notify(text) {
  $('toast').textContent=text;$('toast').hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);
}
function load(key,state=DEFAULT) {
  const variant=upperBodyVariant(key,state);
  if(sources.has(variant))return Promise.resolve(sources.get(variant));
  if(loads.has(variant))return loads.get(variant);
  const promise=new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=async()=>{
      try{
        const buffer=document.createElement('canvas');buffer.width=width;buffer.height=height;
        const ctx=buffer.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);
        await paintUpperBody(ctx,key,state,width,height);
        const source=prepareSource(ctx.getImageData(0,0,width,height).data,width,height,key);
        sources.set(variant,source);
        if(sources.size>2)sources.delete(sources.keys().next().value);
        resolve(source);
      }catch(error){reject(error);}
    };
    image.onerror=()=>reject(new Error('Le visuel de cette coupe n’a pas pu être chargé.'));
    image.src=ASSETS[key];
  });
  loads.set(variant,promise);
  promise.then(()=>loads.delete(variant),()=>loads.delete(variant));
  return promise;
}
async function render() {
  const ticket=++renderTicket,state={...config},key=assetKey(state);
  if(!sources.has(upperBodyVariant(key,state)))$('loading').hidden=false;
  try {
    const source=await load(key,state);
    if(ticket!==renderTicket)return;
    const tile=await loadFabricTile(state.supplierFabric);
    if(ticket!==renderTicket)return;
    const pixels=renderPixels(source,state,tile);
    context.putImageData(new ImageData(pixels,width,height),0,0);
    let relief=null;
    try{volumeCanvas.getContext('2d').putImageData(new ImageData(volumePixels(pixels,source,state),width,height),0,0);relief=reliefCanvas(source);}
    catch{volumeCanvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);}
    const selectedFabric=getSupplierFabric(state.supplierFabric);
    updateVolume(selectedFabric?.baseRGB||COLORS.find(c=>c.id===state.color).rgb,state,tile,relief);
    const cut=getOption('coatFront',state.tailoring.coatFront).label;
    const pockets=getOption('coatPockets',state.tailoring.coatPockets).label;
    const cloth=selectedFabric?selectedFabric.supplier+' '+selectedFabric.reference+' · '+selectedFabric.patternLabel:name(COLORS,state.color)+' · '+name(PATTERNS,state.pattern);
    const lapel=getOption('coatLapel',state.tailoring.coatLapel).label;
    const vest=state.tailoring.vestEnabled?'Gilet '+getOption('vestFront',state.tailoring.vestFront).label:'Sans gilet';
    canvas.setAttribute('aria-label',[cut,'Revers '+lapel,vest,pockets,cloth].join(' · '));
    $('error-banner').hidden=true;
  }catch(error){
    if(ticket===renderTicket){$('error-banner').textContent=error.message||'Le rendu n’a pas pu être préparé. Rechargez la page pour réessayer.';$('error-banner').hidden=false;}
  }finally{if(ticket===renderTicket)$('loading').hidden=true;}
}
function queueRender() {
  if(frame)cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{frame=null;render();});
}
function update(part) {
  if(['color','fabric','pattern'].some(k=>Object.hasOwn(part,k)))part={...part,supplierFabric:null};
  views.front();
  const tailoring={...normalizeTailoring(config.tailoring),...part.tailoring};
  if(!part.tailoring){
    if(part.closure)tailoring.coatFront=part.closure==='double'?'croisee-6-sur-2':'simple-2-boutons';
    if(part.lapel)tailoring.coatLapel=part.lapel==='notch'?'crantes':'en-pointe';
    if(part.buttons)tailoring.catalogButtons='boutons-actuels';
  }
  config=normalize({...config,...part,tailoring});save();updateControls();queueRender();
}
function updateControls() {
  for(const type of ['color','fabric','pattern']){
    for(const button of all(`[data-${type}]`)) {
      const selected=button.dataset[type]===config[type];button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    }
  }
  $('color-label').textContent=name(COLORS,config.color);
  $('fabric-label').textContent=name(FABRICS,config.fabric);
  $('pattern-label').textContent=name(PATTERNS,config.pattern);
  $('fabric-description').textContent=FABRICS.find(x=>x.id===config.fabric).detail;
  document.documentElement.style.setProperty('--fabric-color',COLORS.find(x=>x.id===config.color).hex);
  $('pattern-adjustments').hidden=config.pattern==='solid';
  $('pattern-scale').value=Math.round(config.patternScale*100);$('scale-value').textContent=`${Math.round(config.patternScale*100)} %`;
  $('pattern-contrast').value=Math.round(config.contrast*100);$('contrast-value').textContent=config.contrast<.35?'Discret':config.contrast>.65?'Marqué':'Équilibré';
  const supplier=getSupplierFabric(config.supplierFabric);
  $('live-summary').textContent=`${name(FABRICS,config.fabric)} · ${name(COLORS,config.color)} · ${name(PATTERNS,config.pattern)}`;
  $('footer-fabric').textContent=`${name(COLORS,config.color)} / ${name(FABRICS,config.fabric)}`;
  if(supplier){$('live-summary').textContent=`${supplier.supplier} ${supplier.reference} · ${supplier.colorName} · ${supplier.patternLabel}`;$('footer-fabric').textContent=`${supplier.reference} · ${fabricWeight(supplier)}`;}
  const tailoring=normalizeTailoring(config.tailoring,config);
  $('footer-style').textContent=`${getOption('coatFront',tailoring.coatFront).label} · ${getOption('coatLapel',tailoring.coatLapel).label}`;
  const selectedButtons=getOption('catalogButtons',tailoring.catalogButtons);
  const rows=[['Matière',name(FABRICS,config.fabric)],['Couleur',name(COLORS,config.color)],['Motif',name(PATTERNS,config.pattern)],['Veste',getOption('coatFront',tailoring.coatFront).label],['Revers',getOption('coatLapel',tailoring.coatLapel).label],['Gilet',tailoring.vestEnabled?'Avec gilet':'Sans gilet'],['Boutons',selectedButtons.id==='boutons-actuels'?name(BUTTONS,config.buttons):selectedButtons.label]];
  if(supplier)rows.splice(0,3,['Tissu fournisseur',`${supplier.supplier} ${supplier.reference}`],['Couleur / motif',`${supplier.colorName} · ${supplier.patternLabel}`],['Composition indiquée',supplier.compositionCode],['Poids indiqué',`${fabricWeight(supplier)}`]);
  $('recap').replaceChildren(...rows.map(([label,value])=>{const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;div.append(dt,dd);return div;}));
  catalog?.refresh();
  flow?.refresh();
  embroidery?.refresh();
  supplierCatalog?.refresh();
}
function openTab(id,focus=false) {
  if(!STEPS.includes(id))return;
  views.front();
  const switching=activeTab!==id;activeTab=id;
  views.trousers.step(id==='trousers');
  for(const button of all('[data-tab]')){
    const current=button.dataset.tab===id;button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;
    $(`panel-${button.dataset.tab}`).hidden=!current;
  }
  if(focus)$(`tab-${id}`).focus();
  if(switching&&matchMedia('(max-width:760px)').matches){
    const panel=document.querySelector('.configuration');
    panel.scrollTop=document.querySelector('.tabs').offsetTop-panel.offsetTop;
    const tab=document.querySelector('#tab-'+id);
    tab.parentElement.scrollLeft=tab.offsetLeft-tab.parentElement.clientWidth/2+tab.offsetWidth/2;
  }else if(switching&&matchMedia('(max-width:1023px)').matches){const behavior=matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth';document.querySelector('.tabs').scrollIntoView({block:'start',behavior});$(`tab-${id}`).scrollIntoView({inline:'center',block:'nearest',behavior});}
  if(switching) history.replaceState(null,'','#'+id);
  const index=STEPS.indexOf(id);
  $('flow-progress').textContent=`Étape ${index+1} sur ${STEPS.length} · ${STEP_LABELS[index]}`;
}
function setZoom(value) {
  zoom=Math.round(Math.max(1,Math.min(2.2,value))*10)/10;
  for(const target of [canvas,before])target.style.transform=`scale(${zoom})`;
  studio3d?.zoom(zoom);
  $('zoom-reset').textContent=`${Math.round(zoom*100)} %`;
  $('zoom-out').disabled=zoom===1;$('zoom-in').disabled=zoom>=2.2;
}
async function toggleComparison() {
  compare=!compare;syncVolume();
  $('compare').setAttribute('aria-pressed',String(compare));
  for(const id of ['compare-layer','compare-control','comparison-labels'])$(id).hidden=!compare;
  if(compare){try{const source=await load('single_notch');beforeContext.putImageData(new ImageData(new Uint8ClampedArray(source.data),width,height),0,0);}catch{notify('La comparaison n’a pas pu être chargée.');compare=false;syncVolume();$('compare').setAttribute('aria-pressed','false');for(const id of ['compare-layer','compare-control','comparison-labels'])$(id).hidden=true;}}
}
async function download() {
  const button=$('download');if(button.disabled)return;button.disabled=true;
  const state={...config};
  try{
    const trousers=await views.trousers.exportCanvas(state);
    let result=trousers;
    if(!result&&studio3d&&volumeEnabled&&!compare&&!document.querySelector('.preview').classList.contains('angle-active'))result=$('suit-volume');
    if(!result){
      const source=await load(assetKey(state),state);
      result=document.createElement('canvas');result.width=width;result.height=height;
      result.getContext('2d').putImageData(new ImageData(renderPixels(source,state,await loadFabricTile(state.supplierFabric)),width,height),0,0);
    }
    const blob=await new Promise(resolve=>result.toBlob(resolve,'image/png'));if(!blob)throw new Error('Le téléchargement n’a pas pu être préparé.');
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    const piece=trousers?'pantalon-'+state.tailoring.trouserPleats:'costume-'+(state.closure==='double'?'croise':'simple');
    const fabric=state.supplierFabric||state.color+'-'+state.pattern;
    link.href=url;link.download=piece+'-'+fabric+'.png';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);notify('Votre rendu est prêt.');
  }catch(error){notify(error.message||'Le téléchargement n’a pas pu être préparé.');}
  finally{button.disabled=false;}
}
async function copyLink() {
  const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('c',encodeConfiguration({...config,tailoring:{...config.tailoring,measurements:{}}}));
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(url.href);
    else{const input=document.createElement('textarea');input.value=url.href;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();const copied=document.execCommand('copy');input.remove();if(!copied)throw new Error('Copie indisponible');}
    notify('Lien de votre création copié.');
  }catch{notify('La copie est indisponible dans ce navigateur.');}
}
function buildOptions() {
  $('colors').innerHTML=COLORS.map(x=>`<button class="color-choice" data-color="${x.id}" aria-pressed="false" title="${x.name}"><span class="swatch" style="--swatch:${x.hex}" aria-hidden="true"></span><span>${x.name}</span></button>`).join('');
  $('fabrics').innerHTML=FABRICS.map(x=>`<button class="fabric-choice" data-fabric="${x.id}" aria-pressed="false" title="${x.weight}"><span class="fabric-swatch ${x.id}" aria-hidden="true"><img src="./assets/studio/fabric-${x.id}.webp" alt="" loading="lazy"></span>${x.name}</button>`).join('');
  $('patterns').innerHTML=PATTERNS.map(x=>`<button class="pattern-choice" data-pattern="${x.id}" aria-pressed="false"><span class="pattern-swatch ${x.id}" aria-hidden="true"><img src="./assets/studio/pattern-${x.id}.webp" alt="" loading="lazy"></span>${x.name}</button>`).join('');
}
config=normalize({...config,tailoring:normalizeTailoring(config.tailoring,config)});
buildOptions();catalog=mountCatalog({getConfig:()=>config,update,notify,views});flow=mountFlow(()=>config);embroidery=mountEmbroidery({getConfig:()=>config,update,views});supplierCatalog=mountSupplierFabrics({getConfig:()=>config,update,notify,drawJacketSample});const model=new URLSearchParams(location.search).get('modele');
if(model==='droit'||model==='croise'){
  update({closure:model==='croise'?'double':'single',lapel:model==='croise'?'peak':'notch',color:'navy',pattern:'solid',fabric:'worsted'});
  history.replaceState(null,'',location.pathname+location.hash);
}
mountOrder(()=>config);
mountMeasurements(config.tailoring.measurements,(key,value)=>{
  const measurements={...config.tailoring.measurements,[key]:value};
  config=normalize({...config,tailoring:{...config.tailoring,measurements}});save();catalog.refresh();
});
updateControls();openTab(STEPS.includes(location.hash.slice(1))?location.hash.slice(1):'fabric');
for(const type of ['color','fabric','pattern'])for(const button of all(`[data-${type}]`))button.addEventListener('click',()=>update({[type]:button.dataset[type]}));
for(const button of all('[data-tab]')){
  button.addEventListener('click',()=>openTab(button.dataset.tab));
  button.addEventListener('keydown',event=>{
    const tabs=STEPS,index=tabs.indexOf(activeTab);let next;
    if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];else if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];else if(event.key==='Home')next=tabs[0];else if(event.key==='End')next=tabs[tabs.length-1];
    if(next){event.preventDefault();openTab(next,true);}
  });
}
for(const button of all('[data-next]'))button.addEventListener('click',()=>openTab(button.dataset.next,true));
$('pattern-scale').addEventListener('input',event=>update({patternScale:Number(event.target.value)/100}));
$('pattern-contrast').addEventListener('input',event=>update({contrast:Number(event.target.value)/100}));
$('compare').addEventListener('click',toggleComparison);
$('compare-slider').addEventListener('input',event=>$('compare-layer').style.clipPath=`inset(0 ${100-Number(event.target.value)}% 0 0)`);
$('zoom-in').addEventListener('click',()=>setZoom(zoom+.3));$('zoom-out').addEventListener('click',()=>setZoom(zoom-.3));$('zoom-reset').addEventListener('click',()=>setZoom(1));
$('download').addEventListener('click',download);$('export-mini').addEventListener('click',download);$('copy-link').addEventListener('click',copyLink);
$('reset').addEventListener('click',()=>{config=normalize({...DEFAULT,tailoring:normalizeTailoring()});save();document.querySelector('#measure-fields').reset();history.replaceState(null,'',location.pathname);updateControls();setZoom(1);openTab('fabric');if(compare)toggleComparison();queueRender();notify('Retour au costume bleu marine.');});
render();

for(const next of document.querySelectorAll('[data-next="review"]')) next.addEventListener('click',event=>{
  if(!document.querySelector('#measure-fields').reportValidity()){event.stopImmediatePropagation();openTab('mesures');}
},true);
document.querySelector('#print-sheet').addEventListener('click',async()=>{
  const dossier=document.querySelector('#print-dossier');
  const title=document.createElement('h1');title.textContent='Atelier. — Fiche de confection';
  const illustration=document.createElement('img');
  const source=await load(assetKey(config),config);
  const output=document.createElement('canvas');output.width=width;output.height=height;
  output.getContext('2d').putImageData(new ImageData(renderPixels(source,config,await loadFabricTile(config.supplierFabric)),width,height),0,0);
  illustration.src=output.toDataURL();illustration.alt='Aperçu indicatif du costume';
  dossier.replaceChildren(title,illustration);
  for(const id of ['recap','catalog-recap']){
    const list=document.createElement('dl');
    for(const row of document.getElementById(id).children) list.append(row.cloneNode(true));
    dossier.append(list);
  }
  await illustration.decode();window.print();
});

const detailButton=document.getElementById('selected-detail');
const detailDialog=document.getElementById('detail-zoom');
detailButton.addEventListener('click',()=>{
  const title=detailButton.querySelector('strong').textContent;
  document.getElementById('detail-title').textContent=title;
  const picture=document.getElementById('detail-picture');
  picture.src=detailButton.querySelector('img').src;
  picture.alt=title;
  detailDialog.showModal();
});
detailDialog.addEventListener('click',event=>{if(event.target===detailDialog)detailDialog.close();});

async function drawJacketSample(fabricId) {
  const state={...config,supplierFabric:fabricId};
  const source=await load(assetKey(state),state);
  const sample=document.createElement('canvas');
  sample.width=width;sample.height=height;
  sample.getContext('2d').putImageData(new ImageData(renderPixels(source,state,await loadFabricTile(state.supplierFabric)),width,height),0,0);
  return sample;
}
