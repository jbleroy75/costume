import {classify,families,photos} from './cloth-import.js';
import {SUPPLIER_FABRICS} from './supplier-fabric-data.js';
const $=id=>document.getElementById(id);
const pending=[],patterns={solid:'Uni',pinstripe:'Rayures',windowpane:'Carreaux',other:'Autre motif'};
const say=msg=>{$('status').textContent=msg;};
const blob=(canvas,type)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Encodage impossible.')),type,.91));
const el=tag=>document.createElement(tag);
const select=values=>{const box=el('select');for(const [id,title] of Object.entries(values))box.add(new Option(title,id));return box;};
function field(text,input){const label=el('label');label.append(text,input);return label;}
async function prepare(file){
  if(file.size>28e6)throw Error('Photo de plus de 28 Mo.');
  const bitmap=await createImageBitmap(file),preview=el('canvas');
  const ratio=Math.min(1,850/Math.max(bitmap.width,bitmap.height));
  preview.width=Math.max(1,Math.round(bitmap.width*ratio));preview.height=Math.max(1,Math.round(bitmap.height*ratio));
  preview.getContext('2d').drawImage(bitmap,0,0,preview.width,preview.height);bitmap.close();
  const photo=await blob(preview,'image/jpeg');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  const article=el('article'),original=el('img'),swatch=el('img'),controls=el('div'),note=el('small');
  const reference=el('input'),family=select(Object.fromEntries(families.map(x=>[x,x]))),pattern=select(patterns);
  reference.value=file.name.replace(/\.[^.]+$/,'');reference.maxLength=60;
  original.src=URL.createObjectURL(photo);original.alt=file.name;swatch.className='texture';swatch.alt='Texture utilisée pour le costume';
  controls.className='controls';controls.append(field('Référence',reference),field('Couleur',family),field('Motif',pattern),note);
  article.append(original,swatch,controls);
  const item={article,photo,hash,reference,family,pattern,note,name:file.name,tile:null};
  async function crop(x,y){
    const token=Symbol();item.token=token;
    const c=el('canvas');c.width=384;c.height=160;
    const width=Math.max(1,Math.min(preview.width*.78,preview.height*.75*2.4)),height=width/2.4;
    const left=Math.max(0,Math.min(preview.width-width,x*preview.width-width/2));
    const top=Math.max(0,Math.min(preview.height-height,y*preview.height-height/2));
    const ctx=c.getContext('2d');ctx.drawImage(preview,left,top,width,height,0,0,384,160);
    const info=classify(ctx.getImageData(0,0,384,160).data,384,160);
    const tile=await blob(c,'image/webp');
    if(tile.type!=='image/webp')throw Error('Ce navigateur ne peut pas produire la texture WebP.');
    if(item.token!==token)return;
    if(swatch.src)URL.revokeObjectURL(swatch.src);
    swatch.src=URL.createObjectURL(tile);item.tile=tile;item.rgb=info.rgb;family.value=info.family;pattern.value=info.pattern;
  }
  await crop(.5,.2);
  original.onclick=async e=>{if(busy)return;const rect=original.getBoundingClientRect();item.ready=crop((e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height);await item.ready;};
  $('rows').append(article);pending.push(item);
}
let busy=false;
function lock(state){busy=state;$('publish').disabled=state||!pending.length;$('files').disabled=state;}
async function receive(files){
  if(busy)return;
  lock(true);const errors=[];
  try{
    for(const file of files)try{
      for await(const photo of photos(file))try{await prepare(photo);say(pending.length+' tissus préparés');}catch(e){errors.push(photo.name+' · '+e.message);}
    }catch(e){errors.push(file.name+' · '+e.message);}
    say(pending.length+' fiches à vérifier.'+(errors.length?' '+errors.join(' / '):''));
  }finally{lock(false);$('files').value='';}
}
$('files').onchange=e=>receive(Array.from(e.target.files));
$('drop').ondragover=e=>e.preventDefault();
$('drop').ondrop=e=>{e.preventDefault();receive(Array.from(e.dataTransfer.files));};
$('publish').onclick=async()=>{
  const supplier=$('supplier').value.trim(),collection=$('collection').value.trim();
  if(!supplier||!collection){say('Renseigne le fournisseur et la collection.');return;}
  lock(true);let added=0,existing=0;
  try{
    for(const item of [...pending]){
      try{
        await item.ready;
        const ref=item.reference.value.trim();
        const known=SUPPLIER_FABRICS.find(f=>f.reference.toLowerCase()===ref.toLowerCase()&&f.supplier.toLowerCase()===supplier.toLowerCase());
        if(known){existing++;item.note.textContent='Référence déjà au catalogue';}
        else{
          const data=new FormData();
          for(const [k,v] of Object.entries({supplier,collection,reference:ref,pattern:item.pattern.value,family:item.family.value,rgb:item.rgb.join(','),hash:item.hash,sourceName:item.name,preview:item.photo,tile:item.tile}))data.append(k,v);
          const response=await fetch('/api/admin/cloth',{method:'POST',body:data});
          const result=await response.json();if(!response.ok)throw Error(result.error||'Échec de publication');
          result.existing?existing++:added++;item.note.textContent=result.existing?'Déjà publié':'Publié';
        }
        pending.splice(pending.indexOf(item),1);item.article.querySelectorAll('input,select').forEach(e=>e.disabled=true);item.article.querySelector('img').onclick=null;
      }catch(e){item.note.textContent=e.message;}
    }
    say(added+' ajoutés · '+existing+' déjà présents · '+pending.length+' à vérifier.');
  }finally{lock(false);}
};
try{
  const result=await fetch('/api/admin/cloth');
  if(!result.ok||!(await result.json()).admin)throw Error();
  $('panel').hidden=false;say('Photos JPEG, PNG, WebP ou archive ZIP.');
}catch{say('L’import nécessite une connexion au compte administrateur.');}
