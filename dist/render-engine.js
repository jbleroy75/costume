export {upperBodyVariant,paintUpperBody} from "./upper-body.js";
import {applyCoatDetails} from './coat-details.js';
import {getSupplierFabric} from './supplier-fabric-data.js';
import {normalizeTailoring,getOption} from './catalog.js';
export const COLORS = [
  {id:'navy', name:'Bleu marine', rgb:[43,49,64], hex:'#2b3140'},
  {id:'charcoal', name:'Anthracite', rgb:[54,55,57], hex:'#363739'},
  {id:'black', name:'Noir', rgb:[24,25,27], hex:'#18191b'},
  {id:'gray', name:'Gris perle', rgb:[127,129,132], hex:'#7f8184'},
  {id:'taupe', name:'Taupe', rgb:[140,125,109], hex:'#8c7d6d'},
  {id:'sand', name:'Sable', rgb:[190,173,148], hex:'#bead94'},
  {id:'cream', name:'Écru', rgb:[218,211,193], hex:'#dad3c1'},
  {id:'brown', name:'Chocolat', rgb:[81,58,46], hex:'#513a2e'},
  {id:'olive', name:'Vert olive', rgb:[71,77,59], hex:'#474d3b'},
  {id:'burgundy', name:'Bordeaux', rgb:[94,43,51], hex:'#5e2b33'}
];
export const FABRICS = [
  {id:'worsted', name:'Laine peignée', detail:'Un grain fin, un tombé net.', weight:'Lisse et structurée'},
  {id:'flannel', name:'Flanelle', detail:'Une surface douce et légèrement duveteuse.', weight:'Mate et texturée'},
  {id:'linen', name:'Lin', detail:'Une trame visible, naturellement irrégulière.', weight:'Trame aérée'},
  {id:'twill', name:'Sergé', detail:'Un tissage diagonal discret.', weight:'Texture diagonale'}
];
export const PATTERNS = [
  {id:'solid', name:'Uni'}, {id:'pinstripe', name:'Fines rayures'},
  {id:'windowpane', name:'Carreaux'}, {id:'glen', name:'Prince-de-Galles'},
  {id:'herringbone', name:'Chevrons'}
];
export const BUTTONS = [
  {id:'horn', name:'Corne brune', hex:'#68523b'},
  {id:'dark', name:'Corne noire', hex:'#272525', rgb:[37,35,34]},
  {id:'light', name:'Corne claire', hex:'#b29973', rgb:[178,153,115]},
  {id:'silver', name:'Métal argenté', hex:'#aeb0b3', rgb:[171,175,179]}
];
export const DEFAULT = Object.freeze({closure:'single',lapel:'notch',color:'navy',fabric:'worsted',pattern:'solid',buttons:'horn',patternScale:1,contrast:0.5});
export const ASSETS = Object.freeze({single_notch:'./assets/simple-notch.png',single_peak:'./assets/simple-peak.png',double_peak:'./assets/double-peak.png',
  single_notch_vest:'./assets/silhouettes/simple-notch-gilet.webp',
  single_peak_vest:'./assets/silhouettes/simple-peak-gilet.webp',
  double_peak_vest:'./assets/silhouettes/double-peak-gilet.webp'});
export function normalize(input={}) {
  const value={...DEFAULT};
  for (const [key,choices] of Object.entries({closure:['single','double'],lapel:['notch','peak'],color:COLORS.map(x=>x.id),fabric:FABRICS.map(x=>x.id),pattern:PATTERNS.map(x=>x.id),buttons:BUTTONS.map(x=>x.id)})) {
    if (choices.includes(input[key])) value[key]=input[key];
  }
  for (const [key,min,max] of [['patternScale',0.6,1.6],['contrast',0.15,0.85]]) {
    const number=Number(input[key]);
    if (Number.isFinite(number)) value[key]=Math.min(max,Math.max(min,number));
  }
  if (value.closure==='double') value.lapel='peak';
  if(input.tailoring&&typeof input.tailoring==='object'){
    value.tailoring=normalizeTailoring(input.tailoring,value);
    // Catalog choices are the single source of truth. Preview fields are derived
    // from them, so stored configurations cannot expose contradictory selectors.
    const front=getOption('coatFront',value.tailoring.coatFront);
    value.closure=front.original.startsWith('Double-Breasted')?'double':'single';
    value.lapel=value.closure==='double'||value.tailoring.coatLapel!=='crantes'?'peak':'notch';
  }
  if(getSupplierFabric(input.supplierFabric))value.supplierFabric=input.supplierFabric;
  return value;
}
export const assetKey = config => `${config.closure}_${config.closure==='double'?'peak':config.lapel}${config.tailoring?.vestEnabled?'_vest':''}`;
const clamp = (v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const smooth = (lo,hi,v)=>{const t=clamp((v-lo)/(hi-lo),0,1);return t*t*(3-2*t);};
const luminance=(r,g,b)=>r*0.2126+g*0.7152+b*0.0722;
const modulo=(a,b)=>((a%b)+b)%b;
const line=(v,period,width)=>1-smooth(width,width+0.85,Math.min(modulo(v,period),period-modulo(v,period)));
function hash(x,y) {
  let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295-0.5;
}

// The masks are inferred from the navy master photographs at runtime. Whites,
// background and warm horn buttons stay outside the fabric recoloring mask.
export function prepareSource(data,width,height,key) {
  const mask=new Float32Array(width*height);
  const light=new Float32Array(mask.length);
  const buttonMask=new Float32Array(mask.length);
  const centers=key.startsWith('double')?[[.425,.242],[.575,.242],[.456,.298],[.555,.298],[.456,.354],[.555,.354]]:[[.499,.288],[.484,.350]];
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const n=y*width+x,i=n*4,r=data[i],g=data[i+1],b=data[i+2];
    const l=luminance(r,g,b);light[n]=l;
    mask[n]=smooth(1.6,6.2,b-r*.75-g*.25)*(1-smooth(140,188,l));
    const nx=x/width,ny=y/height;
    let front=false;
    for(const [cx,cy] of centers) if(((nx-cx)**2+((ny-cy)*height/width)**2)<.014**2) {front=true;break;}
    const cuff=ny>.407&&ny<.46&&(nx<.26||nx>.73);
    if(front||cuff) buttonMask[n]=smooth(.5,5.5,r-b)*(1-smooth(125,165,l));
  }
  // Piece coordinates for the photographed double-breasted master. The lapel
  // grain turns with the folded cloth instead of crossing the entire image.
  const grain=new Float32Array(mask.length),weaveGrain=new Float32Array(mask.length);
  const inside=(x,y,points)=>{let hit=false;for(let a=0,b=points.length-1;a<points.length;b=a++){const [ax,ay]=points[a],[bx,by]=points[b];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)hit=!hit;}return hit;};
  const left=[[.344,.108],[.395,.112],[.370,.105],[.432,.062],[.446,.113],[.497,.214],[.476,.248],[.405,.184]];
  const right=[[.559,.061],[.624,.105],[.599,.111],[.648,.107],[.609,.160],[.550,.222],[.446,.292],[.497,.214]];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const n=y*width+x,nx=x/width,ny=y/height;
    let u=x;
    if(ny<.47&&nx<.335)u=x+(y-height*.28)*.10;
    else if(ny<.47&&nx>.665)u=x-(y-height*.28)*.10;
    if(key.startsWith('double_peak')){
      if(inside(nx,ny,left))u=x-(y-height*.13)*.43;
      else if(inside(nx,ny,right))u=x+(y-height*.13)*.53;
    }
    grain[n]=u;
    if(key.startsWith('single')||key.startsWith('double')){
      // Work in the coordinates of the studio photograph. Sleeve seams lean
      // outwards at the shoulder and curve back in at the waist.
      const px=nx*384,py=ny*576,dx=Math.abs(px-192);
      const sleeveEdge=62+8*Math.pow((py-161)/105,2);
      const jacket=py<282;
      const sleeve=jacket&&dx>sleeveEdge;
      const side=px<192?-1:1;
      if(sleeve){
        const t=clamp((py-58)/205,0,1);
        u=(dx-73-12*Math.sin(t*1.57))*1.17+side*2;
      }else if(jacket){
        const waist=Math.exp(-((py-178)**2)/3800);
        u=dx*(1+.09*waist)+2*Math.sin((py-80)/95)+side*3;
        if(inside(nx,ny,left))u=px-(py-72)*.46;
        if(inside(nx,ny,right))u=px+(py-72)*.52;
      }else{
        const t=clamp((py-282)/258,0,1);
        const legCenter=34+2*Math.sin(t*2);
        const across=dx-legCenter;
        u=across*(1+.23*t)+.007*across*Math.abs(across)+side*2;
      }
      u*=width/384;
    }
    weaveGrain[n]=u;
  }
  return {data,width,height,key,mask,light,buttonMask,grain,weaveGrain};
}

export function renderPixels(source,input,tile=null) {
  const config=normalize(input);
  const supplier=getSupplierFabric(config.supplierFabric);
  if(supplier){config.pattern='pinstripe';config.fabric='twill';}
  const {data,width,height,mask,light,buttonMask,grain}=source;
  const out=new Uint8ClampedArray(data);
  const catalogButton=config.tailoring?getOption('catalogButtons',config.tailoring.catalogButtons):null;
  const originalFabric=!supplier&&config.color==='navy'&&config.fabric==='worsted'&&config.pattern==='solid';
  if(originalFabric&&config.buttons==='horn'&&!catalogButton?.rgb) return applyCoatDetails(out,source,config);
  const color=supplier?.baseRGB||COLORS.find(x=>x.id===config.color).rgb;
  const button=catalogButton?.rgb?catalogButton:BUTTONS.find(x=>x.id===config.buttons);
  const isLight=luminance(...color)>115;
  const unit=width/1024;
  const period=(config.pattern==='pinstripe'?27:config.pattern==='glen'?37:config.pattern==='herringbone'?22:81)*unit*config.patternScale*(supplier?.stripePitch??1);
  const warpX=new Float32Array(height);
  for(let y=0;y<height;y++) warpX[y]=(Math.sin(y/(92*unit))*1.5+Math.sin(y/(231*unit))*2)*unit;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const n=y*width+x,i=n*4,m=mask[n];
    if(m>.002&&!originalFabric) {
      const l=light[n];
      // Keep the master garment's shadows and highlights while changing dye.
      const shade=clamp(Math.pow((l+1)/49,.86),.08,2.3);
      // Continuous coordinates avoid artificial rectangular seams. Tiny offsets
      // from the source shading suggest drape without claiming a physical UV map.
      const neighbor=light[y*width+Math.min(width-1,x+3)]-light[y*width+Math.max(0,x-3)];
      const u=(grain?.[n]??x)+warpX[y]+clamp(neighbor,-25,25)*.065*unit,v=y;
      let texture=0;
      if(config.fabric==='flannel') texture=hash(x,y)*.075+hash(x>>2,y>>2)*.025;
      else if(config.fabric==='linen') texture=hash(x,y)*.055+((x%4===0||y%5===0)?-.04:.01)+hash(x>>3,y>>2)*.035;
      else if(config.fabric==='twill') texture=(modulo(x+y,5)<1?.035:-.009)+hash(x,y)*.03;
      let pattern=0;
      if(config.pattern==='pinstripe') {
        // Fine woven thread: soft coverage, tiny interruptions, shaded by cloth.
        const distance=Math.min(modulo(u,period),period-modulo(u,period));
        pattern=Math.exp(-.5*(distance/Math.max(.32,.48*unit*(supplier?.stripeWidth??1)))**2);
        pattern*=.83+hash(x,y)*.28;
      }
      else if(config.pattern==='windowpane') pattern=Math.max(line(u,period,.8*unit),line(v,period*1.2,.8*unit));
      else if(config.pattern==='glen') {
        const fine=Math.max(line(u,period/6,.4*unit),line(v,period/6,.4*unit))*.26;
        pattern=fine+Math.max(line(u,period,2*unit),line(v,period,2*unit))*.6;
        pattern+=Math.max(line(u+period/3,period,.8*unit),line(v+period/3,period,.8*unit))*.18;
      } else if(config.pattern==='herringbone') {
        const direction=(Math.floor(u/(period/2))%2===0)?1:-1;
        pattern=line(v+direction*u*.68,4.5*unit,.55*unit)*.42;
      }
      const tone=(isLight?-.42:.54)*config.contrast*pattern;
      let j00,j10,j01,j11,fx,fy;
      if(tile){
        const scale=1.65/unit;
        const tx=((source.weaveGrain?.[n]??u)+clamp(neighbor,-14,14)*.018*unit)*scale;
        const ty=y*scale;
        const x0=Math.floor(tx),y0=Math.floor(ty);
        fx=tx-x0;fy=ty-y0;
        const wrap=(k,size,repeat)=>{
          if(repeat)return modulo(k,size);
          const m=modulo(k,size*2);
          return m<size?m:2*size-1-m;
        };
        const ax=wrap(x0,tile.width,tile.periodic),bx=wrap(x0+1,tile.width,tile.periodic);
        const ay=wrap(y0,tile.height,false)*tile.width,by=wrap(y0+1,tile.height,false)*tile.width;
        j00=4*(ay+ax);j10=4*(ay+bx);j01=4*(by+ax);j11=4*(by+bx);
      }
      for(let ch=0;ch<3;ch++) {
        const mix=supplier?pattern*(.17+config.contrast*.20)*(supplier.stripeStrength??1)*smooth(5,32,l):0;
        const yarn=tile?((1-fx)*tile.data[j00+ch]+fx*tile.data[j10+ch])*(1-fy)
          +((1-fx)*tile.data[j01+ch]+fx*tile.data[j11+ch])*fy:0;
        const dyed=tile?clamp(yarn*shade+Math.max(0,l-30)*.12,0,255):supplier?clamp(color[ch]*shade*(1+texture)*(1-mix)+supplier.stripeRGB[ch]*shade*mix,0,250):clamp(color[ch]*shade*(1+texture+tone)+(isLight?0:pattern*config.contrast*17),0,250);
        out[i+ch]=data[i+ch]*(1-m)+dyed*m;
      }
    }
    const bm=buttonMask[n];
    if(button.rgb&&bm>.001) {
      const shade=clamp(light[n]/72,.2,1.65);
      for(let ch=0;ch<3;ch++) out[i+ch]=out[i+ch]*(1-bm)+clamp(button.rgb[ch]*shade,0,250)*bm;
    }
  }
  return applyCoatDetails(out,source,config);
}
