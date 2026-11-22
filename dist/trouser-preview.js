import {repeats} from './weave-repeats.js';
import {getSupplierFabric} from './supplier-fabric-data.js';
import {CATALOG} from './catalog-data.js';
import {prepareSource,renderPixels} from './render-engine.js';

const groups=new Map(CATALOG.groups.filter(g=>g.category==='trousers').map(g=>[g.id,g]));
const renders=new WeakMap(), pictures=new Map();
const prepared=new WeakMap();
const fullPhoto='./assets/trousers/';
const interiorGroups=new Set(['suspenderButtons','waistGrip']);
const choiceIndex=(group,id)=>Math.max(0,groups.get(group).options.findIndex(o=>o.id===id));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const gauss=v=>Math.exp(-v*v*.5);

function loadPhoto(url){
  if(pictures.has(url))return pictures.get(url);
  const ready=new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Impossible de charger le pantalon.'));
    img.src=url;
  });
  pictures.set(url,ready);
  ready.catch(()=>pictures.delete(url));
  return ready;
}

// Master measurements are expressed in a 320 × 426 photographic frame.
export function constructTrousers(source,tailoring,back){
  const {width,height}=source;
  const data=new Uint8ClampedArray(source.data), grain=new Float32Array(source.grain);
  const scale=width/320, backId=choiceIndex('trouserBackPockets',tailoring.trouserBackPockets);
  const pleats=choiceIndex('trouserPleats',tailoring.trouserPleats);
  const frontPocket=choiceIndex('trouserFrontPockets',tailoring.trouserFrontPockets);
  const extension=choiceIndex('waistExtension',tailoring.waistExtension);
  const tab=tailoring.waistAdjustment==='pattes-de-serrage';
  const grainOffset=(x,y)=>Math.sin(y/55+x/30)*1.4;
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const n=py*width+px,x=px/scale,y=py/scale;
    grain[n]=px+grainOffset(x,y)*scale;
    if(y<8||y>112||source.mask[n]<.65)continue;
    const center=back?160:158, side=x<center?-1:1, u=Math.abs(x-center);
    let shade=1,metal=0,button=0;
    if(!back){
      for(let fold=0;fold<pleats;fold++){
        const length=fold?44:65, v=(y-27)/length;
        if(v<0||v>=1)continue;
        const line=fold?46:34;
        const distance=u-line-(4+fold)*Math.sin(v*Math.PI/2);
        const strength=Math.pow(1-v,.8)*clamp(v*48,0,1);
        const opening=(.7+Math.sin(v*Math.PI)*1.2);
        shade+=strength*(.36*gauss((distance+2.2)/1.45)-.86*gauss((distance-.55)/opening)-.13*gauss((distance-3.3)/2.3));
        grain[n]+=side*scale*strength*1.75*gauss(distance/2.8);
      }
      if(frontPocket!==0){
        const v=(y-26)/44;
        if(v>0&&v<1){
          const pos=frontPocket===1?50+18*v:61+7*v;
          const d=u-pos;
          const edge=clamp(Math.min(v,1-v)*15,0,1);
          shade+=edge*(-.64*gauss(d/.65)+.20*gauss((d+1.25)/.75));
          if(frontPocket===3||frontPocket===4)shade+=edge*(-.42*gauss((d+2.2)/.5)+.13*gauss((d+1.6)/.5));
          if(frontPocket===4)shade-=edge*.39*gauss((d+4)/.5);
        }
      }
      // Project each waistband construction onto the curved waistband of the master.
      const bandY=13+.00038*u*u;
      const uy=y-bandY, ux=x-center;
      const rows=extension===3||extension>=6?2:1;
      for(let row=0;row<rows;row++){
        const offset=rows===2?row*6:0,cy=rows===2?3+offset:6;
        const length=extension===4?43:extension>=5?38:23;
        const radius=rows===2?2.7:4.7;
        if(ux>=-3&&ux<length+2){
          const end=extension===0||extension>=5?radius*Math.max(0,(ux-length+7)/7):extension===1?radius*(1-Math.sqrt(Math.max(0,1-(clamp((ux-length+5)/5,0,1))**2))):0;
          const edge=Math.max(Math.abs(uy-cy)-(radius-end),ux-length,-ux-3);
          shade+=.12*gauss((edge+1)/.45)-.46*gauss(edge/.6);
        }
        // Buckled straps (multi-hole side strap, Gurkha) close with their buckle and carry no button;
        // the Neapolitan double tab buttons near its root, the other extensions near their tip.
        const buckled=extension===5||extension===6;
        const bd=Math.hypot(ux-(extension===7?12:length-6),uy-cy);
        if(!buckled&&bd<2.15)button=Math.max(button,clamp((2.15-bd)*3,0,1));
        if(extension===5)for(const hole of [18,23,28])shade-=.55*gauss(Math.hypot(ux-hole,uy-cy)/.7);
        if(buckled){
          const bx=extension===6?(row?11:9):10,ax=Math.abs(ux-bx),ay=Math.abs(uy-cy);
          if(ax<3.2&&ay<radius)metal=Math.max(metal,clamp(1-Math.abs(Math.max(ax-2.5,ay-radius+.7)),0,1));
        }
      }
    }else{
      const hasPocket=backId<2||backId>=5||(backId===4?side===-1:side===1);
      if(hasPocket&&u>11&&u<52){
        const v=(u-11)/41, baseline=52-v*2;
        const fade=clamp(Math.min(v,1-v)*40,0,1), d=y-baseline;
        shade+=fade*(-.78*gauss(d/.9)+.26*gauss((d+1.25)/.65));
        if([0,2,3,4,6].includes(backId))shade+=fade*(-.33*gauss((d+2.4)/.55)+.18*gauss((d+1.8)/.6));
        if(backId===7)shade+=fade*(-.60*gauss((d-6-(1-Math.abs(v*2-1))*5)/.75));
        if(![3,5,6].includes(backId)){
          const rad=Math.hypot(u-32,d-(backId===7?7:4));
          button=clamp((1.95-rad)*3,0,1);
        }
      }
    }
    if(!tab){
      for(const loop of [36,58]){
        const ly=(y-12.5)/16;
        if(ly>0&&ly<1){
          const off=u-loop-ly*.8;
          shade+=.20*gauss((off+1.4)/.65)-.49*gauss((off-1.2)/.7);
        }
      }
    }else if(!back&&extension!==5&&extension!==6&&u>42&&u<62){
      const d=y-(21+.09*(u-42));
      shade+=.16*gauss((d+1.8)/.55)-.47*gauss((d-1.8)/.68);
      if(u>47&&u<52&&Math.abs(d)<3)metal=Math.max(metal,clamp(1-Math.abs(Math.max(Math.abs(u-49.5)-1.8,Math.abs(d)-2.4)),0,1));
    }
    if(shade!==1||metal||button){
      for(let ch=0;ch<3;ch++){
        const i=n*4+ch;const fabric=data[i]*clamp(shade,.17,1.55);
        const horn=([60,46,34][ch]+(x+y)%1*8);
        data[i]=(fabric*(1-button)+horn*button)*(1-metal)+[171,162,145][ch]*metal;
      }
    }
  }
  // Recalculate lighting after geometry so folds remain visible with every cloth.
  const surface=prepareSource(data,width,height,'trouser');
  surface.grain=grain;surface.buttonMask.fill(0);
  return surface;
}

function workCanvas(width,height){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
}
function photographicSource(img){
  if(prepared.has(img))return prepared.get(img);
  const temp=workCanvas(img.naturalWidth,img.naturalHeight),ctx=temp.getContext('2d');
  ctx.drawImage(img,0,0);
  const base=prepareSource(ctx.getImageData(0,0,temp.width,temp.height).data,temp.width,temp.height,'trouser');
  if(img.src.includes('/assets/trousers/'))prepared.set(img,base);
  return base;
}

const weaveTiles=new WeakMap();
function readTile(img){
  if(weaveTiles.has(img))return weaveTiles.get(img);
  const ctx=workCanvas(img.width,img.height).getContext('2d');
  ctx.drawImage(img,0,0);
  const tile=ctx.getImageData(0,0,img.width,img.height);
  weaveTiles.set(img,tile);
  return tile;
}

// The jacket render reads this tile every ~2.2 px across, while a pinstripe is about 1 px wide: as the
// grain drifts down the garment the samples alternately hit and miss the thread, cutting it into dashes.
// Pre-filtering to the sampling step across (triangle, ±2 px) and along the stripe (yarn floats, ±4 px)
// keeps one continuous, slightly softer thread.
export function smoothAlongStripes(data,width,height,periodic=false){
  const pass=(weights,dx,dy,size,wrap)=>{
    const copy=new Uint8ClampedArray(data),reach=(weights.length-1)/2,total=weights.reduce((a,b)=>a+b,0);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let ch=0;ch<3;ch++){
      let sum=0;
      for(let k=-reach;k<=reach;k++){
        const xx=wrap(x+k*dx,width),yy=wrap(y+k*dy,height);
        sum+=weights[k+reach]*copy[4*(yy*width+xx)+ch];
      }
      data[4*(y*width+x)+ch]=sum/total;
    }
  };
  const mirror=(v,size)=>{const m=((v%(2*size))+2*size)%(2*size);return m<size?m:2*size-1-m;};
  const repeat=(v,size)=>((v%size)+size)%size;
  pass([1,2,3,2,1],1,0,width,periodic?repeat:mirror);
  pass([1,2,3,4,5,4,3,2,1],0,1,height,mirror);
  // Filtering spreads the thread over ~2 px; restore its contrast against the cloth's mean colour.
  const mean=[0,0,0],count=width*height;
  for(let n=0;n<count;n++)for(let ch=0;ch<3;ch++)mean[ch]+=data[4*n+ch]/count;
  for(let n=0;n<count;n++)for(let ch=0;ch<3;ch++)data[4*n+ch]=mean[ch]+(data[4*n+ch]-mean[ch])*1.8;
  return data;
}

const jacketTiles=new WeakMap();
export async function loadFabricTile(id){
  const cloth=getSupplierFabric(id);
  if(!cloth)return null;
  const img=await loadPhoto((cloth.texture||cloth.image.replace('.jpg','-weave.webp')));
  if(!jacketTiles.has(img)){
    const pitch=repeats[id];
    const sourceWidth=pitch?pitch*Math.floor(img.width/pitch):img.width;
    const canvas=workCanvas(Math.round(sourceWidth/4),Math.round(img.height/4));
    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,0,0,sourceWidth,img.height,0,0,canvas.width,canvas.height);
    const sample=ctx.getImageData(0,0,canvas.width,canvas.height);
    if(cloth.pattern==='pinstripe')smoothAlongStripes(sample.data,sample.width,sample.height,Boolean(pitch));
    jacketTiles.set(img,{width:sample.width,height:sample.height,data:sample.data,periodic:Boolean(pitch)});
  }
  return jacketTiles.get(img);
}

function mirror(value,size){
  const period=2*size;
  const position=((value%period)+period)%period;
  return Math.min(position,period-position,size-1);
}

export function drapeWeave(source,tile,close){
  const {width,height,data,mask,light,grain}=source;
  const out=new Uint8ClampedArray(data);
  const scale=close?1.8:6;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const n=y*width+x,coverage=mask[n];
    if(coverage<.005)continue;
    const i=n*4,l=light[n];
    const clothX=close?x-y*.075:grain[n];
    const u=Math.floor(mirror((clothX+(l-35)*(close?.11:.025))*scale,tile.width));
    const v=Math.floor(mirror(y*scale,tile.height));
    const j=(v*tile.width+u)*4;
    // Cloth supplies the dye and yarn. The garment photograph supplies folds,
    // seam shadows and fine surface detail, leaving hardware outside the mask.
    const exposure=clamp(Math.pow((l+2)/43,.85),.08,2.1);
    for(let c=0;c<3;c++)out[i+c]=data[i+c]*(1-coverage)+tile.data[j+c]*exposure*coverage;
  }
  return out;
}

export async function drawTrousers(canvas,config,{groupId='trouserPleats',zoom=false}={}){
  const token=(renders.get(canvas)||0)+1;renders.set(canvas,token);
  const t=config.tailoring||{};
  const back=groupId==='trouserBackPockets',inside=zoom&&interiorGroups.has(groupId);
  const photoGroup=groupId==='trouserPleats'?'pleat':groupId;
  const url=zoom?'./assets/studio/'+photoGroup+'-'+(choiceIndex(groupId,t[groupId])+1)+'.webp':fullPhoto+(back?'back':'front')+'.webp';
  const supplier=!inside&&getSupplierFabric(config.supplierFabric);
  const [img,weave]=await Promise.all([loadPhoto(url),supplier?loadPhoto((supplier.texture||supplier.image.replace('.jpg','-weave.webp'))):null]);
  if(renders.get(canvas)!==token)return;
  const base=photographicSource(img);
  const source=zoom?base:constructTrousers(base,t,back);
  // Only apply fabric settings from the suit. Jacket pockets/buttons do not belong here.
  const pixels=weave?drapeWeave(source,readTile(weave),zoom):renderPixels(source,{...config,buttons:'horn',tailoring:undefined});
  const result=workCanvas(source.width,source.height);
  result.getContext('2d').putImageData(new ImageData(pixels,source.width,source.height),0,0);
  const box=zoom?[0,0,source.width,source.height]:[106,0,428,852];
  canvas.width=box[2];canvas.height=box[3];
  canvas.getContext('2d').drawImage(result,...box,0,0,canvas.width,canvas.height);
}
