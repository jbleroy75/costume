import {buttonPositions} from './coat-details.js';

// The 3D studio draws real buttons, so the buttons painted into the front render are removed from its
// texture: each button pixel takes the cloth a little above it (same stripe, same shading), or beside
// it for the cuff buttons, which are stacked vertically.
export function volumePixels(pixels,source,state){
  const {width,height,buttonMask,mask}=source,out=new Uint8ClampedArray(pixels);
  const hide=new Uint8Array(width*height),scale=width/512;
  for(let n=0;n<hide.length;n++)if(buttonMask[n]>.03)hide[n]=1;
  // grow the mask by four pixels to take the button's shadow and rim
  for(let pass=0;pass<4;pass++){
    const grown=new Uint8Array(hide);
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const n=y*width+x;
      if(!hide[n]&&(hide[n-1]||hide[n+1]||hide[n-width]||hide[n+width]))grown[n]=1;
    }
    hide.set(grown);
  }
  // buttons drawn by the preview at the chosen positions: just their disc, no shadow to take
  for(const [bx,by] of buttonPositions(state)){
    const cx=bx*scale,cy=by*scale,r=6*scale;
    for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
      if(x>=0&&y>=0&&x<width&&y<height&&(x-cx)**2+(y-cy)**2<=r*r)hide[y*width+x]=1;
    }
  }
  // the buttonhole beside each button stays in the texture
  for(const [bx,by] of buttonPositions(state)){
    const cx=bx*scale,cy=by*scale;
    for(let y=Math.floor(cy-2.4*scale);y<=cy+2.4*scale;y++)for(let x=Math.ceil(cx+5.4*scale);x<=cx+17*scale;x++)if(x>=0&&y>=0&&x<width&&y<height)hide[y*width+x]=0;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const n=y*width+x;if(!hide[n])continue;
    const cuff=y/height>.38;
    const tries=cuff?[[x<width/2?14:-14,0],[x<width/2?24:-24,0],[0,-16]]:[[0,-16],[0,-26],[0,-38],[0,16],[0,26],[14,10],[-14,10]];
    // first pass takes cloth only: a button at the top of the opening must not be filled with shirt
    for(const cloth of [true,false])for(const [dx,dy] of tries){
      const sx=x+Math.round(dx*scale/1.5),sy=y+Math.round(dy*scale/1.5);
      if(sx<0||sy<0||sx>=width||sy>=height||hide[sy*width+sx])continue;
      if(cloth&&mask&&mask[sy*width+sx]<.6)continue;
      if(out[4*n+3]===254)break;
      const a=4*n,b=4*(sy*width+sx);out[a]=pixels[b];out[a+1]=pixels[b+1];out[a+2]=pixels[b+2];out[a+3]=254;break;
    }
  }
  for(let n=3;n<out.length;n+=4)out[n]=255;
  // soften the patch: the copied cloth meets its surroundings without a crenellated edge
  for(let pass=0;pass<2;pass++){
    const from=new Uint8ClampedArray(out);
    for(let y=3;y<height-3;y++)for(let x=3;x<width-3;x++){
      if(!hide[y*width+x])continue;
      for(let c=0;c<3;c++){
        let sum=0;
        for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)sum+=from[4*((y+dy)*width+x+dx)+c];
        out[4*(y*width+x)+c]=sum/49;
      }
    }
  }
  return out;
}

// Relief from the photograph's own shading (master luminance, independent of the chosen cloth):
// local contrast only, so lapel edges, pocket flaps, darts and folds catch the moving studio light.
const reliefs=new WeakMap();
export function reliefCanvas(source){
  if(reliefs.has(source))return reliefs.get(source);
  const {width,height,light,mask}=source,blur=new Float32Array(light.length),tmp=new Float32Array(light.length),R=9;
  for(let y=0;y<height;y++){let s=0;for(let x=-R;x<width+R;x++){s+=light[y*width+Math.min(width-1,Math.max(0,x))];if(x-2*R-1>=-R)s-=light[y*width+Math.min(width-1,Math.max(0,x-2*R-1))];if(x-R>=0&&x-R<width)tmp[y*width+x-R]=s/(2*R+1);}}
  for(let x=0;x<width;x++){let s=0;for(let y=-R;y<height+R;y++){s+=tmp[Math.min(height-1,Math.max(0,y))*width+x];if(y-2*R-1>=-R)s-=tmp[Math.min(height-1,Math.max(0,y-2*R-1))*width+x];if(y-R>=0&&y-R<height)blur[(y-R)*width+x]=s/(2*R+1);}}
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),img=ctx.createImageData(width,height);
  for(let n=0;n<light.length;n++){
    const v=128+Math.max(-110,Math.min(110,(light[n]-blur[n])*2.2))*Math.min(1,mask[n]*1.5+.25);
    img.data[4*n]=img.data[4*n+1]=v;img.data[4*n+3]=255;
    // blue channel: the studio backdrop of the photograph (bright, outside the cloth), so the 3D view can
    // dress the parts of a leg or a sleeve that overhang the photographed outline instead of showing it
    img.data[4*n+2]=mask[n]<.08&&source.data[4*n]+source.data[4*n+1]+source.data[4*n+2]>450?255:0;
  }
  ctx.putImageData(img,0,0);reliefs.set(source,canvas);return canvas;
}
