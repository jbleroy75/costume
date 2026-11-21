import {renderPixels} from './render-engine.js';

// A flat swatch of the selected cloth, rendered by the same engine as the front view so that colour,
// weave, pattern and pattern scale match exactly. The 3D studio tiles it over the back and sides.
// It is as tall as the 768 × 1152 front render and uses its pixel unit, so horizontal lines of a check
// sit at exactly the same heights on the back as on the front; 384 px across cover half a jacket.
export const PATCH_WIDTH=384,PATCH_HEIGHT=1152,FRONT_UNIT=768/1024;
const MASTER_NAVY=[43,49,64],FLAT_LIGHT=48;

export function fabricPatch(state,tile,canvas=document.createElement('canvas')){
  const width=PATCH_WIDTH,height=PATCH_HEIGHT,count=width*height;
  const data=new Uint8ClampedArray(count*4),grain=new Float32Array(count);
  for(let n=0;n<count;n++){
    data.set(MASTER_NAVY,n*4);data[n*4+3]=255;grain[n]=n%width;
  }
  const source={data,width,height,unit:FRONT_UNIT,key:'single_notch',mask:new Float32Array(count).fill(1),
    light:new Float32Array(count).fill(FLAT_LIGHT),buttonMask:new Float32Array(count),grain,weaveGrain:grain};
  const {tailoring,...cloth}=state||{};
  const pixels=renderPixels(source,cloth,tile);
  canvas.width=width;canvas.height=height;
  canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
  return canvas;
}
