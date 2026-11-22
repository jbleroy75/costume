// All coordinates are measured on the three identically framed studio masters,
// expressed in a 512 × 768 reference frame. Reuse fabric and button photography
// so the detail retains the selected dye, thread, highlights and surface grain.
const SINGLE = [[255,222],[247,268]];
const DOUBLE = [[217,186],[294,186],[233,228],[284,228],[234,271],[284,271]];
// Buttonholes photographed beside the master buttons: [button x, button y, hole x0, hole x1, hole y].
// A button that leaves its place takes its buttonhole with it.
const HOLES = [[255,222,258,268,221.5],[247,268,257,273,267.5],[233,228,237,249,228],[234,271,237,249,271]];
const layouts = {
  'simple-1-bouton': [SINGLE[0]],
  'simple-3-boutons': [[261,198],...SINGLE],
  '3-roll-2': [[259,203],...SINGLE],
  'croisee-4-sur-2': DOUBLE.slice(2),
  'croisee-6-sur-3': [[230,186],[286,186],...DOUBLE.slice(2)],
  'croisee-faux-2-sur-1': [[233,228],[284,228]],
  'croisee-2-sur-1': [[232,243],[284,243]],
  'croisee-4-sur-1': [[220,215],[293,215],[233,261],[284,261]],
  'croisee-6-sur-1': [[215,194],[295,194],[224,230],[291,230],[234,272],[284,272]]
};
// Button centres of the selected front, in the 512 × 768 reference frame (the 3D studio places real
// buttons on them, exactly over the buttons painted into the front render).
export function buttonPositions(config){
  const front=config?.tailoring?.coatFront;
  if(layouts[front])return layouts[front].map(p=>[...p]);
  return (String(front||'').startsWith('croisee')||config?.closure==='double'?DOUBLE:SINGLE).map(p=>[...p]);
}
const clamp = (value, min, max) => Math.max(min,Math.min(max,value));
const same = ([x,y],[u,v]) => x===u && y===v;

export function applyCoatDetails(out, source, config) {
  const tailoring=config.tailoring;
  if(!tailoring)return out;
  const pockets=tailoring.coatPockets || 'rabat-droit';
  const layout=layouts[tailoring.coatFront];
  if(!layout && pockets==='rabat-droit')return out;
  const {width,height,data}=source, sx=width/512, sy=height/768;
  const index=(x,y)=>4*(clamp(Math.round(y*sy),0,height-1)*width+clamp(Math.round(x*sx),0,width-1));

  // Operate at output pixel density, including exports and downsampled previews.
  function eachRect(x0,y0,x1,y1,paint){
    for(let y=Math.max(0,Math.floor(y0*sy));y<Math.min(height,Math.ceil(y1*sy));y++){
      for(let x=Math.max(0,Math.floor(x0*sx));x<Math.min(width,Math.ceil(x1*sx));x++){
        paint((y*width+x)*4,x/sx,y/sy);
      }
    }
  }
  function mix(i,c,target,alpha){out[i+c]=out[i+c]*(1-alpha)+target*alpha;}
  const master=source.key.startsWith('double')?DOUBLE:SINGLE;
  if(layout){
    // Save an isolated horn button from the already-dyed image before changing
    // any of the original positions. The edge mask omits the surrounding wool.
    const [bx,by]=master[0],radius=5.3;
    const buttonSize=Math.max(5,Math.ceil(radius*2*sx)+2);
    const stamp=new Uint8ClampedArray(buttonSize*buttonSize*3);
    for(let y=0;y<buttonSize;y++)for(let x=0;x<buttonSize;x++){
      const from=index(bx+(x/(buttonSize-1)*2-1)*radius,by+(y/(buttonSize-1)*2-1)*radius);
      for(let c=0;c<3;c++)stamp[(y*buttonSize+x)*3+c]=out[from+c];
    }
    for(const point of master){
      if(layout.some(next=>same(next,point)))continue;
      const [cx,cy]=point;
      eachRect(cx-8,cy-8,cx+8,cy+8,(i,x,y)=>{
        const fade=clamp(7.8-Math.hypot(x-cx,y-cy),0,1), frac=clamp((y-cy+9)/18,0,1);
        const top=index(x,cy-9),bottom=index(x,cy+9);
        for(let c=0;c<3;c++)mix(i,c,out[top+c]*(1-frac)+out[bottom+c]*frac,fade);
      });
    }
    for(const [bx,by,x0,x1,hy] of HOLES){
      if(!master.some(point=>same(point,[bx,by]))||layout.some(point=>same(point,[bx,by])))continue;
      eachRect(x0-1,hy-3.5,x1+1,hy+3.5,(i,x,y)=>{
        const fade=clamp(Math.min(x-x0+1,x1+1-x),0,1)*clamp(3.2-Math.abs(y-hy),0,1), frac=clamp((y-hy+4)/8,0,1);
        const top=index(x,hy-4),bottom=index(x,hy+4);
        for(let c=0;c<3;c++)mix(i,c,out[top+c]*(1-frac)+out[bottom+c]*frac,fade);
      });
    }
    for(const point of layout){
      if(master.some(previous=>same(previous,point)))continue;
      const [cx,cy]=point;
      eachRect(cx-radius,cy-radius,cx+radius,cy+radius,(i,x,y)=>{
        const dx=x-cx,dy=y-cy,fade=clamp((radius-Math.hypot(dx,dy))/.8,0,1);
        const px=clamp(Math.round((dx/radius+1)*(buttonSize-1)/2),0,buttonSize-1);
        const py=clamp(Math.round((dy/radius+1)*(buttonSize-1)/2),0,buttonSize-1);
        for(let c=0;c<3;c++)mix(i,c,stamp[(py*buttonSize+px)*3+c],fade);
      });
    }
  }

  // Capture the contrast of the existing left flap against the cloth above
  // and below it. Applying this relief at a new position keeps pinstripes
  // registered to the surrounding fabric, even for a very pale cloth.
  function relief(u,v){
    const x=167+u*40,y=258+v*31;
    const a=index(x,257),b=index(x,290),p=index(x,y);
    const sum=j=>data[j]+data[j+1]+data[j+2]+12;
    return clamp(sum(p)/(sum(a)*(1-v)+sum(b)*v),.32,1.38);
  }
  function addPocket(x0,y0,w,h,incline,welt){
    eachRect(x0-1,y0-6,x0+w+1,y0+h+6,(i,x,y)=>{
      const u=(x-x0)/w, v=(y-y0-incline*(u-.5))/h;
      if(u<=0||u>=1||v<=0||v>=1)return;
      const edge=clamp(Math.min(u*w,(1-u)*w,v*h,(1-v)*h),0,1);
      const scale=relief(u,welt?v*.23:v);
      for(let c=0;c<3;c++)mix(i,c,out[i+c]*scale,edge);
    });
  }
  const inclined=pockets.includes('incline'), welt=pockets.startsWith('passepoil');
  if(inclined||welt||pockets.startsWith('plaquees')){
    for(const [x0,x1,direction] of [[167,207,1],[302,342,-1]]){
      // Remove the photographed straight flap, retaining the body silhouette.
      eachRect(x0-1,257,x1+1,290,(i,x,y)=>{
        if(source.mask[i/4]<.75)return;
        const t=clamp((y-257)/33,0,1), blend=clamp(Math.min(x-x0+1,x1+1-x,y-257,290-y),0,1);
        const a=index(x,257),b=index(x,290);
        for(let c=0;c<3;c++)mix(i,c,out[a+c]*(1-t)+out[b+c]*t,blend);
      });
      if(pockets.startsWith('plaquees')){
        // Lower, rounded patch pocket. Use the original stitched edge as relief.
        addPocket(x0+1,259,x1-x0-2,44,0,false);
      }else{
        addPocket(x0,259,x1-x0,welt?(pockets.startsWith('passepoil-double')?7:4):28,inclined?direction*8:0,welt);
      }
    }
  }
  if(pockets.includes('ticket')){
    const ticketWelt=welt||pockets.endsWith('passepoilee');
    addPocket(172,241,29,ticketWelt?5:15,inclined?5:0,ticketWelt);
  }
  return out;
}
