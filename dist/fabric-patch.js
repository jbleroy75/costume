import {renderPixels} from './render-engine.js';

// A flat swatch of the selected cloth, rendered by the same engine as the front view so that colour,
// weave, pattern and pattern scale match exactly. The 3D studio tiles it over the back and sides.
// Width 768 keeps the engine's pixel unit (width/1024) identical to the 768 × 1152 front render.
export const PATCH_WIDTH=768,PATCH_HEIGHT=384;
const MASTER_NAVY=[43,49,64],FLAT_LIGHT=48;

export function fabricPatch(state,tile,canvas=document.createElement('canvas')){
  const width=PATCH_WIDTH,height=PATCH_HEIGHT,count=width*height;
  const data=new Uint8ClampedArray(count*4),grain=new Float32Array(count);
  for(let n=0;n<count;n++){
    data.set(MASTER_NAVY,n*4);data[n*4+3]=255;grain[n]=n%width;
  }
  const source={data,width,height,key:'single_notch',mask:new Float32Array(count).fill(1),
    light:new Float32Array(count).fill(FLAT_LIGHT),buttonMask:new Float32Array(count),grain,weaveGrain:grain};
  const {tailoring,...cloth}=state||{};
  const pixels=renderPixels(source,cloth,tile);
  canvas.width=width;canvas.height=height;
  canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
  return canvas;
}
