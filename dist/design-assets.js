import {CATALOG} from './catalog-data.js';
import {referenceImages} from './reference-images.js';
export function supplierImage(group, id) {
  if (!referenceImages[group]?.includes(id)) return null;
  return './assets/studio/references/'+group+'-'+id+'.webp';
}
const groups=new Map(CATALOG.groups.map(g=>[g.id,g]));
export function studioImage(group,index){
  const option=groups.get(group)?.options[index];if(!option)return null;
  const reference=supplierImage(group,option.id);
  if(reference && group!=='coatPockets')return reference;
  const prefix={coatFront:'jacket',trouserPleats:'pleat',vestFront:'vest'}[group]||group;
  return `./assets/studio/${prefix}-${index+1}.webp`;
}
