import {getOption} from './catalog.js';
import {drawTrousers} from './trouser-preview.js';

const interiorGroups=new Set(['suspenderButtons','waistGrip']);

export function mountTrouserView(getConfig) {
  const preview=document.querySelector('.preview');
  const canvas=document.getElementById('trouser-canvas');
  const controls=document.getElementById('trouser-camera');
  const status=document.getElementById('trouser-status');
  const perspective=document.getElementById('trouser-perspective');
  const caption=document.getElementById('trouser-caption');
  const buttons=[...controls.querySelectorAll('[data-frame]')];
  let active=false, groupId='trouserPleats', mode='full', version=0;

  function setMode(next) {
    mode=next;
    const token=++version;
    const isolated=active&&mode!=='suit';
    for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.frame===mode));
    preview.classList.toggle('trouser-active',isolated);
    document.getElementById('suit').setAttribute('aria-hidden',String(isolated));
    document.getElementById('trouser-scene').hidden=!isolated;
    canvas.classList.toggle('detail-photo',mode==='close');
    status.hidden=true;
    if(!isolated)return;
    const config=getConfig();
    const inside=interiorGroups.has(groupId)&&mode==='close';
    const back=groupId==='trouserBackPockets';
    perspective.textContent=inside?'Intérieur de ceinture':mode==='close'?'Détail du pantalon':back?'Pantalon de dos':'Pantalon de face';
    const detail=getOption(groupId,config.tailoring[groupId]);
    caption.textContent=inside?(groupId==='waistGrip'?'Bande antiglisse':'Boutons de bretelles')+' · '+detail.label:detail.label;
    canvas.setAttribute('aria-label',[perspective.textContent,caption.textContent,mode==='close'?'gros plan':'en pied'].join(' · '));
    canvas.setAttribute('aria-busy','true');
    canvas.removeAttribute('data-ready');
    drawTrousers(canvas,config,{groupId,zoom:mode==='close'}).then(()=>{if(token===version)canvas.dataset.ready='true';}).catch(()=>{
      if(token!==version)return;
      status.textContent='Le pantalon n’a pas pu être chargé. Sélectionnez à nouveau la vue pour réessayer.';
      status.hidden=false;
    }).finally(()=>{if(token===version)canvas.removeAttribute('aria-busy');});
  }
  for(const button of buttons)button.addEventListener('click',()=>setMode(button.dataset.frame));
  return {
    step(open){
      active=open;controls.hidden=!open;
      if(open)groupId='trouserPleats';
      setMode(open?'full':'suit');
    },
    focus(group) {
      if(!active)return;
      groupId=group.id;
      setMode('close');
    },
    async exportCanvas(config){
      if(!active||mode==='suit')return null;
      const result=document.createElement('canvas');
      await drawTrousers(result,config,{groupId,zoom:mode==='close'});
      return result;
    }
  };
}
