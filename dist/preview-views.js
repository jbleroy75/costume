import {mountTrouserView} from './trouser-view-controls.js';
import {studioImage} from './design-assets.js';
import {fontStyle} from './embroidery.js';

export function mountPreviewViews(getConfig) {
  const trousers=mountTrouserView(getConfig);
  const preview=document.querySelector('.preview');
  const scene=document.getElementById('angle-scene');
  const picture=scene.querySelector('img');
  const stitch=scene.querySelector('.angle-stitch');
  const caption=scene.querySelector('figcaption');
  const back=document.getElementById('return-front');
  const toolbar=document.querySelector('.preview-toolbar');
  function front() {
    scene.hidden=true;
    back.hidden=true;
    toolbar.hidden=false;
    preview.classList.remove('angle-active');
    document.getElementById('selected-detail').hidden=true;
  }
  function show(image,label,inscription) {
    document.getElementById('selected-detail').hidden=true;
    picture.src=image;picture.alt=label;
    caption.textContent=label;
    stitch.hidden=!inscription;
    if(inscription){
      stitch.textContent=inscription.text;
      stitch.style.font=fontStyle(inscription.font);
      stitch.style.color=inscription.color;
      stitch.style.top=inscription.location==='trouser-waist'?'18%':inscription.location==='jacket-neck'?'42%':'45%';
    }
    scene.hidden=false;back.hidden=false;toolbar.hidden=true;
    preview.classList.add('angle-active');
  }
  back.addEventListener('click',front);
  return {
    front,
    trousers,
    group(group,option) {
      const angles={coatVents:'Dos de la veste',lining:'Intérieur de la veste',vestBack:'Dos du gilet',vestBelt:'Dos du gilet',};
      if(group.category==='trousers'){
        front();trousers.focus(group);return true;
      }
      if(!angles[group.id]){front();return false;}
      show(studioImage(group.id,group.options.indexOf(option)),angles[group.id]+' · '+option.label);
      return true;
    },
    embroidery(location,entry) {
      if(!entry.enabled){front();return;}
      show('./assets/studio/embroidery-place-'+location.asset+'.webp',location.label,entry);
    }
  };
}
