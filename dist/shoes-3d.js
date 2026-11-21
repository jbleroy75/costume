import * as T from './vendor/three.module.min.js';

// Double monk strap shoes for the WebGL studio, modelled from cross-sections along the last: an almond
// toe, a raised heel and toe spring, a separate sole and heel block, a cap-toe seam and two buckled
// straps on the outer side. Units are studio units (1 ≈ 30 cm); the shoe points along +z from its heel.
const L=.98;
const lerpCurve=(points,s)=>{
  const i=Math.min(points.length-2,Math.max(0,points.findIndex(p=>p[0]>s)-1)),[s0,a]=points[i],[s1,b]=points[i+1];
  const t=Math.min(1,Math.max(0,(s-s0)/(s1-s0))),u=t*t*(3-2*t);return a+(b-a)*u;
};
const smooth=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
// Proportions of a men's last (1 unit ≈ 30 cm): heel 7 cm wide, ball 10 cm, rounded almond toe;
// heel counter ~7 cm, instep ~9 cm, toe box ~4 cm. The toe rounds off over its last 14 % in plan and profile.
const toeRound=s=>s<.86?1:Math.sqrt(Math.max(0,1-((s-.86)/.14)**2));
const heelRound=s=>s>.06?1:Math.sqrt(Math.max(0,1-((.06-s)/.06)**2))*.55+.45;
const halfWidth=s=>lerpCurve([[0,.112],[.15,.122],[.34,.128],[.62,.168],[.8,.158],[.9,.135],[1,.1]],s)*toeRound(s)*heelRound(s);
const height=s=>lerpCurve([[0,.2],[.2,.225],[.4,.265],[.55,.215],[.68,.165],[.82,.13],[.92,.12],[1,.1]],s)*(.25+.75*toeRound(s));
const underside=s=>.032+.068*(1-smooth(.22,.6,s))+.03*smooth(.82,1,s)**2;

function loft(rings,segments,point){
  const pos=[],idx=[],colors=[];
  for(let r=0;r<=rings;r++){
    const s=r/rings;
    for(let k=0;k<segments;k++){const [p,c]=point(s,2*Math.PI*k/segments);pos.push(...p);colors.push(c,c,c);}
  }
  for(let r=0;r<rings;r++)for(let k=0;k<segments;k++){
    const a=r*segments+k,b=r*segments+(k+1)%segments,c=a+segments,d=b+segments;idx.push(a,c,b,b,c,d);
  }
  const g=new T.BufferGeometry();g.setIndex(idx);
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();return g;
}
// a point on the upper at length s and angle a (0 = outer side, π/2 = top), lifted off the surface by out
function upperPoint(s,a,out=0){
  const w=halfWidth(s)+out,h=height(s)+out,y0=underside(s);
  const c=Math.cos(a),sn=Math.sin(a);
  return [w*Math.sign(c)*Math.pow(Math.abs(c),.8),sn>0?y0+h*Math.pow(sn,.42):y0+sn*.004,s*L];
}

function buildShoe(materials){
  const shoe=new T.Group();
  // upper, burnished darker at the toe and the heel
  const upper=new T.Mesh(loft(90,56,(s,a)=>[upperPoint(s,a),1-.28*smooth(.72,1,s)-.18*(1-smooth(0,.16,s))]),materials.leather);
  // sole and heel block: the arch is lifted between the heel and the ball
  const sole=new T.Mesh(loft(70,40,(s,a)=>{
    const w=halfWidth(s)*1.06+.007,top=underside(s)+.004,arch=smooth(.24,.32,s)*(1-smooth(.5,.6,s));
    const bottom=s<.27?0:arch*(top-.03)+(1-arch)*(.03*smooth(.82,1,s)**2),c=Math.cos(a),sn=Math.sin(a);
    return [[w*Math.sign(c)*Math.pow(Math.abs(c),.35),sn>0?top:bottom,s*L*1.01-.004],1];
  }),materials.sole);
  shoe.add(upper,sole);
  // cap-toe seam
  const seam=[];for(let k=0;k<=24;k++)seam.push(new T.Vector3(...upperPoint(.79,Math.PI*k/24,.003)));
  shoe.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(seam),40,.0035,6),materials.seam));
  // two straps from the inner quarter over the instep, buckled on the outer side
  for(const s0 of [.37,.45]){
    const strip=[],idx=[],n=26,half=.017;
    for(let k=0;k<=n;k++){
      const a=.28+(Math.PI*.86-.28)*k/n;
      strip.push(...upperPoint(s0-half,a,.008),...upperPoint(s0+half,a,.008));
      if(k)idx.push(2*k-2,2*k-1,2*k,2*k,2*k-1,2*k+1);
    }
    const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new T.Float32BufferAttribute(strip,3));g.computeVertexNormals();
    const strap=new T.Mesh(g,materials.strap);shoe.add(strap);
    // buckle: a small polished frame with its prong, on the outer side
    const at=new T.Vector3(...upperPoint(s0,.26,.013)),next=new T.Vector3(...upperPoint(s0,.34,.013));
    const normal=new T.Vector3(Math.cos(.26),Math.sin(.26)*.8,0).normalize();
    const buckle=new T.Mesh(new T.TorusGeometry(.019,.0042,8,4,Math.PI*2).scale(1,1.45,.6),materials.metal);
    buckle.position.copy(at);buckle.lookAt(at.clone().add(normal));buckle.rotateZ(Math.PI/4);
    const prong=new T.Mesh(new T.BoxGeometry(.003,.03,.003),materials.metal);prong.position.copy(at);prong.lookAt(next.clone().add(normal));
    shoe.add(buckle,prong);
  }
  shoe.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});
  return shoe;
}

export function createShoes(scene,reflections=null){
  const materials={
    leather:new T.MeshPhysicalMaterial({vertexColors:true,color:0x3a2318,roughness:.36,clearcoat:.85,clearcoatRoughness:.2,sheen:.25,sheenRoughness:.4}),
    sole:new T.MeshStandardMaterial({color:0x1c1512,roughness:.7}),
    seam:new T.MeshStandardMaterial({color:0x1a0f0a,roughness:.6}),
    strap:new T.MeshPhysicalMaterial({color:0x3a2318,roughness:.4,clearcoat:.7,clearcoatRoughness:.25,side:T.DoubleSide}),
    metal:new T.MeshPhysicalMaterial({color:0xc9c3b6,metalness:1,roughness:.22})
  };
  for(const key of ['leather','strap','metal','sole'])Object.assign(materials[key],{envMap:reflections,envMapIntensity:key==='metal'?1:key==='sole'?.15:.32});
  const group=new T.Group();scene.add(group);
  // dark socks inside the trouser legs, so the open hems never show the backdrop
  const sock=new T.MeshStandardMaterial({color:0x17181c,roughness:.85});
  for(const side of [-1,1]){
    const m=new T.Mesh(new T.CylinderGeometry(.118,.112,.5,24,1,true),sock);
    m.position.set(side*.345,.25,-.06);group.add(m);
  }
  // feet under the trouser legs (leg centres at ±0.345, slightly behind the front), toes turned out 7°
  for(const side of [-1,1]){
    const shoe=buildShoe(materials),turn=side*.12;
    shoe.rotation.y=turn;
    const heelBack=.2*L;
    shoe.position.set(side*.345-Math.sin(turn)*heelBack,-.014,-.06-Math.cos(turn)*heelBack);
    if(side<0)shoe.scale.x=-1; // mirrored foot on the left of the picture: buckles stay on the outer sides
    group.add(shoe);
  }
  return {
    group,
    update(rgb){
      // black shoes with black, charcoal and dark grey cloth; dark brown otherwise
      const lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],grey=Math.max(...rgb)-Math.min(...rgb)<14;
      const color=grey&&lum<75?0x161414:0x3a2318;
      materials.leather.color.setHex(color);materials.strap.color.setHex(color);
    }
  };
}
