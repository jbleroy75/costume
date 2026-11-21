import * as T from './vendor/three.module.min.js';
import {buttonPositions} from './coat-details.js';
import {BUTTONS} from './render-engine.js';
import {getOption} from './catalog.js';

// Real buttons for the WebGL studio: a turned profile (rim, dished face, four thread holes), placed on the
// garment surface and tilted to its slope. Positions come from the catalogue layouts, so they sit exactly
// on the buttons of the front render; cuff buttons follow the sleeve options.

// Half-profile of a suit button, in units of its radius: x = distance from the axis, y = height.
const PROFILE=[[0,.2],[.42,.17],[.6,.22],[.8,.33],[.93,.33],[1,.22],[.97,.06],[.85,0],[0,0]];
function buttonGeometry(){
  const g=new T.LatheGeometry(PROFILE.map(([x,y])=>new T.Vector2(x,y)).reverse(),40);
  g.computeVertexNormals();return g;
}
const HOLE=new T.CircleGeometry(.085,14).rotateX(-Math.PI/2);

function finish(state){
  const tailoring=state?.tailoring;
  const pick=tailoring?getOption('catalogButtons',tailoring.catalogButtons):null;
  if(pick?.rgb){
    const name=(pick.label||'')+' '+(pick.id||'');
    const metal=/argent|or-|or |métal|metal|embl|doré|dore|laiton|bronze|cuivre|acier/i.test(name);
    return {rgb:pick.rgb,metal,nacre:pick.family==='Nacre'};
  }
  const own=BUTTONS.find(b=>b.id===state?.buttons)||BUTTONS[0];
  const rgb=own.rgb||[92,64,44]; // horn of the studio photographs
  return {rgb,metal:own.id==='silver',nacre:false};
}

export function createButtons(scene,surface){
  const group=new T.Group();scene.add(group);
  const geometry=buttonGeometry();
  const material=new T.MeshPhysicalMaterial({roughness:.32,clearcoat:.9,clearcoatRoughness:.18});
  const holes=new T.MeshStandardMaterial({color:0x140f0b,roughness:.9});
  let signature='';
  function add(position,normal,radius){
    const button=new T.Group();
    const body=new T.Mesh(geometry,material);body.castShadow=true;body.receiveShadow=true;button.add(body);
    for(const [x,z] of [[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2]]){
      const hole=new T.Mesh(HOLE,holes);hole.position.set(x,.181,z);button.add(hole);
    }
    button.scale.setScalar(radius);
    button.position.copy(position);
    button.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal.normalize());
    group.add(button);
  }
  return {
    group,
    update(state){
      const look=finish(state);
      material.color.setRGB(...look.rgb.map(c=>c/255),T.SRGBColorSpace);
      material.metalness=look.metal?.9:0;material.roughness=look.metal?.25:.32;
      material.iridescence=look.nacre?.7:0;material.iridescenceIOR=1.45;
      const tailoring=state?.tailoring||{};
      const key=JSON.stringify([buttonPositions(state),state?.closure,tailoring.coatLapel,tailoring.sleeveDesign,tailoring.sleeveSpacing,tailoring.sleeveAlignment]);
      if(key===signature)return;
      signature=key;
      group.clear();
      // Front: reference frame 512 × 768 → studio frame 384 × 576 (× 0.75).
      const raised=state?.closure==='double'&&tailoring.coatLapel==='en-pointe';
      for(const [x,y] of buttonPositions(state)){
        const at=surface.front(x*.75,y*.75,raised);
        add(at.position,at.normal,.034);
      }
      // Cuffs: four buttons on the outer back of each sleeve, from 2.5 cm above the hem.
      const count=String(tailoring.sleeveDesign||'4-boutons').startsWith('4-boutons')?4:0;
      const kissing=tailoring.sleeveSpacing==='jointifs-kissing',slanted=tailoring.sleeveAlignment==='incline';
      for(const mirror of [false,true])for(let k=0;k<count;k++){
        const at=surface.cuff(255-k*(kissing?3.6:4.6),k*(slanted?.1:0),mirror);
        add(at.position,at.normal,.02);
      }
    }
  };
}
