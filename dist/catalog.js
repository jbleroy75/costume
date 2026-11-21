import {fabricWeight} from './supplier-fabric-data.js';
import {getSupplierFabric} from './supplier-fabric-data.js';
import {normalizeEmbroidery,LOCATIONS,fontStyle} from './embroidery.js';
import {studioImage,supplierImage} from './design-assets.js';
import {CATALOG} from './catalog-data.js';
import {measurements, normalizeMeasurements} from './measurements.js';
export {CATALOG};
export const CATEGORIES=[{id:'coat',label:'Veste'},{id:'trousers',label:'Pantalon'},{id:'vest',label:'Gilet'},{id:'finish',label:'Finitions'}];
export const GROUPS=CATALOG.groups;
const byId=new Map(GROUPS.map(group=>[group.id,group]));
export function getOption(groupId,optionId){return byId.get(groupId)?.options.find(option=>option.id===optionId);}
export function normalizeTailoring(input={},preview={}) {
  const result={};
  if(!input||typeof input!=='object')input={};
  for(const group of GROUPS){
    let fallback=group.default;
    if(group.id==='coatFront'&&preview.closure==='double')fallback='croisee-6-sur-2';
    if(group.id==='coatLapel'&&(preview.lapel==='peak'||preview.closure==='double'))fallback='en-pointe';
    result[group.id]=getOption(group.id,input[group.id])?input[group.id]:fallback;
  }
  result.measurements=normalizeMeasurements(input.measurements);
  result.vestEnabled=input.vestEnabled===true;
  result.embroidery=normalizeEmbroidery(input.embroidery,{...input,monogramFont:result.monogramFont});
  for(const [field,max] of [['liningReference',160],['monogramText',40],['threadColor',60],['customNotes',1000]]){
    result[field]=typeof input[field]==='string'?input[field].replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';
  }
  const width=Number(input.lapelCustomWidth);
  result.lapelCustomWidth=Number.isFinite(width)&&width>=4&&width<=20?String(Math.round(width*10)/10):'';
  return result;
}
export function configurationRows(config) {
  const selections=normalizeTailoring(config.tailoring,config);
  const rows=[];
  const supplier=getSupplierFabric(config.supplierFabric);
  if(supplier)rows.push({category:'Tissu',field:'Référence fournisseur',value:`${supplier.supplier} ${supplier.reference}`},{category:'Tissu',field:'Couleur / motif',value:`${supplier.colorName} · ${supplier.patternLabel}`},{category:'Tissu',field:'Composition indiquée',value:supplier.compositionCode},{category:'Tissu',field:'Poids indiqué',value:`${fabricWeight(supplier)}`});
  for(const category of CATEGORIES){
    if(category.id==='vest'&&!selections.vestEnabled)continue;
    for(const group of GROUPS.filter(group=>group.category===category.id)){
      if(group.id==='monogramFont')continue;
      const option=getOption(group.id,selections[group.id]);
      let value=option.label;
      if(group.id==='lapelWidth'&&selections[group.id]==='largeur-personnalisee')value=selections.lapelCustomWidth?`${selections.lapelCustomWidth} cm`:'Personnalisée — largeur à préciser';
      if(group.id==='catalogButtons'&&selections[group.id]==='boutons-actuels')value=config.buttons==='horn'?'Corne':config.buttons==='black'?'Noir':config.buttons==='metal'?'Métal':config.buttons;
      rows.push({category:category.label,field:group.title,value,reference:option.original,code:option.code||null,sourcePage:group.page});
    }
  }
  rows.push({category:'Gilet',field:'Costume trois pièces',value:selections.vestEnabled?'Avec gilet':'Sans gilet',sourcePage:11});
  for(const [field,label,page] of [['liningReference','Doublure souhaitée',null],['customNotes','Instructions complémentaires',null]])if(selections[field])rows.push({category:'Finitions',field:label,value:selections[field],sourcePage:page});
  for(const entry of selections.embroidery){if(!entry.enabled||!entry.text.trim()||(entry.location==='vest-left'&&!selections.vestEnabled))continue;const location=LOCATIONS.find(l=>l.id===entry.location);rows.push({category:'Finitions',field:`Inscription · ${location.label}`,value:`${entry.text} · ${getOption('monogramFont',entry.font).label} · fil ${entry.color}`});}
  for(const [key,label] of measurements) {
    if(selections.measurements[key]) rows.push({category:'Mesures',field:label,value:selections.measurements[key]+' cm'});
  }
  return rows;
}
export function encodeConfiguration(config){return btoa(Array.from(new TextEncoder().encode(JSON.stringify(config)),byte=>String.fromCharCode(byte)).join(''));}
export function decodeConfiguration(value){
  const raw=atob(value);
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,char=>char.charCodeAt(0))));}
  catch{return JSON.parse(raw);}
}

export function mountCatalog({getConfig,update,notify,views}) {
  const $=id=>document.getElementById(id);
  let active='coat',search='';
  const host=$('catalog-groups');
  const controls=new Map(),summaries=new Map();
  const order={coat:['coatFront','coatLapel','lapelWidth','coatPockets','buttonholePosition','buttonholeStyle','sleeveDesign','sleeveAlignment','sleeveSpacing','coatVents'],trousers:['trouserPleats','trouserFrontPockets','trouserBackPockets','waistAdjustment','waistExtension','suspenderButtons','waistGrip'],vest:['vestFront','vestCollar','vestPockets','vestBack','vestBelt'],finish:['catalogButtons','lining','monogramFont']};
  for(const category of CATEGORIES){
    const section=document.createElement('section');section.dataset.category=category.id;section.className='catalog-category';section.hidden=category.id!==active;
    const ordered=GROUPS.filter(group=>group.category===category.id&&group.id!=='monogramFont').sort((a,b)=>order[category.id].indexOf(a.id)-order[category.id].indexOf(b.id));
    for(const [index,group] of ordered.entries()){
      const details=document.createElement('details');details.className='catalog-group';details.dataset.group=group.id;details.open=index===0;
      const summary=document.createElement('summary');const title=document.createElement('span'),chosen=document.createElement('small');title.textContent=group.title;summary.append(title,chosen);summaries.set(group.id,chosen);details.append(summary);
      if(group.id==='buttonholePosition'){const guide=document.createElement('div');guide.className='placement-guide';const image=document.createElement('img');image.dataset.positionGuide='true';image.alt='Emplacement des boutonnières sur les revers';const note=document.createElement('p');note.textContent='Les boutonnières se trouvent sur les revers, près du col. Gauche et droite désignent les côtés de la personne qui porte la veste : sa gauche apparaît à droite sur cette vue de face.';guide.append(image,note);details.append(guide);}
      if(['suspenderButtons','waistGrip','sleeveAlignment','sleeveSpacing','lapelWidth'].includes(group.id)){const note=document.createElement('p');note.className='detail-help';note.textContent={suspenderButtons:'Six boutons cousus à l’intérieur de la ceinture pour attacher les bretelles.',waistGrip:'Une bande intérieure aide à maintenir la chemise en place.',sleeveAlignment:'La ligne des quatre boutons est droite ou légèrement inclinée.',sleeveSpacing:'Les boutons sont espacés ou se touchent légèrement.',lapelWidth:'La largeur se mesure du bord extérieur du revers à sa ligne de pli.'}[group.id];details.append(note);}
      if(group.category==='trousers')summary.addEventListener('click',()=>{
        if(!details.open)views.trousers.focus(group);
      });
      const grid=document.createElement('div');grid.className='catalog-options'+(group.id==='catalogButtons'?' buttons-catalog-grid':'');grid.setAttribute('role','group');grid.setAttribute('aria-label',group.title);
      for(const [optionIndex,option] of group.options.entries()){
        const button=document.createElement('button');button.className='catalog-choice';button.type='button';button.dataset.choice=option.id;button.dataset.group=group.id;
        button.dataset.search=`${group.title} ${option.label} ${option.original} ${option.code||''}`.toLocaleLowerCase('fr');button.setAttribute('aria-pressed','false');
        const original=studioImage(group.id,optionIndex);
        if(supplierImage(group.id,option.id)===original)button.classList.add('supplier-reference');
        if(original){const img=document.createElement('img');img.src=original;img.alt='';img.loading='lazy';img.decoding='async';button.append(img);if(original)button.classList.add('studio-choice');}
        if(original){const badge=document.createElement('i');badge.className='choice-check';badge.textContent='✓';badge.setAttribute('aria-hidden','true');button.append(badge);} 
        const label=document.createElement('span');label.textContent=option.label;button.append(label);
        if(option.family){const family=document.createElement('small');family.textContent=option.family;button.append(family);}
        button.addEventListener('click',()=>choose(group,option));grid.append(button);
      }
      if(group.id==='catalogButtons')addButtonFilter(details,grid,group.options);
      details.append(grid);
      if(group.id==='lapelWidth')details.append($('custom-width-row'));
      section.append(details);controls.set(group.id,{details,grid});
    }
    host.append(section);
  }
  function choose(group,option){
    const current=getConfig();const tailoring={...normalizeTailoring(current.tailoring),[group.id]:option.id};const part={tailoring};
    if(group.id==='coatFront')part.closure=option.original.startsWith('Double')?'double':'single';
    if(group.id==='coatLapel')part.lapel=option.id==='crantes'?'notch':'peak';
    if(group.category==='vest')tailoring.vestEnabled=true;
    update(part);
    if(views.group(group,option))return;
    const reference=supplierImage(group.id,option.id);
    const detail=document.getElementById('selected-detail');
    detail.hidden=!reference;
    if(reference){
      detail.querySelector('img').src=reference;
      detail.querySelector('strong').textContent=option.label;
      detail.setAttribute('aria-label','Agrandir le détail : '+option.label);
    }
  }
  function filter(){
    for(const [id,{details,grid}] of controls){let count=0;for(const button of grid.children){const matches=!search||button.dataset.search.includes(search);button.hidden=!matches;if(matches)count++;}details.hidden=count===0;if(search&&count)details.open=true;}
    for(const section of host.children)section.hidden=search?!Array.from(section.children).some(details=>!details.hidden):section.dataset.category!==active;
    $('catalog-empty').hidden=Array.from(host.children).some(section=>!section.hidden);
  }
  for(const button of document.querySelectorAll('[data-category-tab]'))button.addEventListener('click',()=>{active=button.dataset.categoryTab;search='';$('catalog-search').value='';for(const tab of document.querySelectorAll('[data-category-tab]')){tab.setAttribute('aria-pressed',String(tab===button));}filter();});
  $('catalog-search').addEventListener('input',event=>{search=event.target.value.trim().toLocaleLowerCase('fr');filter();});
  for(const field of ['liningReference','customNotes','lapelCustomWidth'])$(`catalog-${field}`).addEventListener('input',event=>{
    const part={...normalizeTailoring(getConfig().tailoring),[field]:event.target.value};update({tailoring:part});
  });
  $('catalog-vestEnabled').addEventListener('change',event=>update({tailoring:{...normalizeTailoring(getConfig().tailoring),vestEnabled:event.target.checked}}));
  function refresh(){
    const tailoring=normalizeTailoring(getConfig().tailoring);
    for(const group of GROUPS.filter(g=>g.id!=='monogramFont')){
      const {grid}=controls.get(group.id);const option=getOption(group.id,tailoring[group.id]);summaries.get(group.id).textContent=option.label;
      if(group.id==='buttonholePosition'){const guide=controls.get(group.id).details.querySelector('[data-position-guide]');guide.src=studioImage(group.id,group.options.indexOf(option));}
      for(const button of grid.children){const selected=button.dataset.choice===option.id;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}
    }
    for(const field of ['liningReference','customNotes','lapelCustomWidth']){const input=$(`catalog-${field}`);if(document.activeElement!==input)input.value=tailoring[field];}
    $('catalog-vestEnabled').checked=tailoring.vestEnabled;
    $('custom-width-row').hidden=tailoring.lapelWidth!=='largeur-personnalisee';
    $('catalog-count').textContent=`${GROUPS.reduce((n,g)=>n+g.options.length,0)} choix de personnalisation`;
    $('catalog-choice-count').textContent=tailoring.vestEnabled?'Configuration trois pièces':'Configuration deux pièces';
    const rows=configurationRows(getConfig());$('catalog-recap').replaceChildren(...rows.map(row=>{const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=row.field;dd.textContent=row.value;div.append(dt,dd);return div;}));
    $('view-caption').textContent=getSupplierFabric(getConfig().supplierFabric)?'Teinte / rayures · aperçu indicatif':'Vue de face · aperçu simplifié';
  }
  function downloadSheet(){
    const config=getConfig(),rows=configurationRows(config);
    const labels={color:{navy:'Bleu marine',charcoal:'Anthracite',black:'Noir'},fabric:{worsted:'Laine peignée',flannel:'Flanelle',linen:'Lin',twill:'Sergé'}};
    const supplier=getSupplierFabric(config.supplierFabric);
    const basic=supplier?[]:[['Couleur',labels.color[config.color]||config.color],['Matière',labels.fabric[config.fabric]||config.fabric],['Motif',config.pattern]];
    const content=['ATELIER — MA COMPOSITION','',...basic.map(([k,v])=>`${k} : ${v}`),'',...[{id:'fabric',label:'Tissu'},...CATEGORIES,{label:'Mesures'}].flatMap(category=>{const items=rows.filter(row=>row.category===category.label);return items.length?[category.label.toUpperCase(),...items.map(row=>`${row.field} : ${row.value}`),'']:[];})].join('\n');
    const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='atelier-ma-composition.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);notify('Fiche de composition téléchargée.');
  }
  $('catalog-export-txt').addEventListener('click',downloadSheet);
  return {refresh};
}

function addButtonFilter(details,grid,options) {
  const family=option=>{
    if(option.family==='Nacre')return 'Nacre';
    if(/corne|bois/i.test(option.label))return 'Corne et bois';
    if(/argent|or poli|or mat|emblème/i.test(option.label))return 'Aspect métal';
    return option.code?'Autres classiques':'Choix du tailleur';
  };
  const search=document.createElement('input');
  search.type='search';search.placeholder='Chercher une référence ou une couleur';
  search.setAttribute('aria-label','Rechercher un bouton');
  const select=document.createElement('select');
  select.setAttribute('aria-label','Famille de boutons');
  for(const name of ['Toutes les familles','Corne et bois','Aspect métal','Nacre','Autres classiques','Choix du tailleur']){
    select.add(new Option(name,name==='Toutes les familles'?'':name));
  }
  const bar=document.createElement('div');bar.className='button-filters';bar.append(select,search);
  const message=document.createElement('p');message.setAttribute('role','status');
  function filter(){
    let count=0;
    options.forEach((option,index)=>{
      const show=(!select.value||family(option)===select.value)&&option.label.toLocaleLowerCase('fr').includes(search.value.trim().toLocaleLowerCase('fr'));
      grid.children[index].hidden=!show;if(show)count++;
    });
    message.textContent=count?count+' choix':'Aucun bouton pour cette recherche.';
  }
  select.addEventListener('change',filter);search.addEventListener('input',filter);
  bar.append(message);details.append(bar);filter();
}
