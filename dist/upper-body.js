// Registered photographic overlays share the original 1024 × 1536 framing.
// The closed fronts naturally conceal the waistcoat hem and lower buttons.
import {CATALOG} from './catalog-data.js';

const groupIndex = id => new Map(CATALOG.groups.find(group=>group.id===id).options.map((option,index)=>[option.id,index+1]));
const lapels=groupIndex('coatLapel');
const waistcoats=groupIndex('vestFront');

export function upperBodyLayers(key,state) {
  const choices=state?.tailoring;
  if(!choices)return [];
  const front=key.startsWith('double')?'double':key.startsWith('single_notch')?'notch':'single';
  const layers=[];
  const waistcoat=waistcoats.get(choices.vestFront);
  if(key.endsWith('_vest')&&waistcoat&&waistcoat!==3)layers.push(front+'-v'+waistcoat);
  const lapel=lapels.get(choices.coatLapel);
  const native=front==='notch'?1:2;
  if(lapel&&lapel!==native)layers.push(front+'-l'+lapel);
  return layers;
}

export function upperBodyVariant(key,state){
  const layers=upperBodyLayers(key,state);
  return layers.length?[key,...layers].join(':'):key;
}

const photos=new Map();
function loadPhoto(id){
  if(photos.has(id))return photos.get(id);
  const promise=new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('Le détail de la coupe n’a pas pu être chargé.'));
    image.src='./assets/bodice/'+id+'.webp';
  });
  photos.set(id,promise);
  if(photos.size>8)photos.delete(photos.keys().next().value);
  promise.catch(()=>{if(photos.get(id)===promise)photos.delete(id);});
  return promise;
}

export async function paintUpperBody(context,key,state,width,height){
  const layers=await Promise.all(upperBodyLayers(key,state).map(loadPhoto));
  for(const photo of layers)context.drawImage(photo,308/1024*width,82/1536*height,400/1024*width,324/1536*height);
}
