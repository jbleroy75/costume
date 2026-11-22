import * as T from './vendor/three.module.min.js';

// Double monk strap shoes for the WebGL studio, modelled from cross-sections along the last: an almond
// toe, a raised heel and toe spring, a separate sole and heel block, a cap-toe seam and two buckled
// straps on the outer side. Units are studio units (1 ≈ 30 cm); the shoe points along +z from its heel.
const L=.98,SIZE=.9;
const lerpCurve=(points,s)=>{
  const next=points.findIndex(p=>p[0]>s),i=next<0?points.length-2:Math.max(0,next-1),[s0,a]=points[i],[s1,b]=points[i+1];
  const t=Math.min(1,Math.max(0,(s-s0)/(s1-s0))),u=t*t*(3-2*t);return a+(b-a)*u;
};
const smooth=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
// Proportions of a men's last (1 unit ≈ 30 cm): heel 7 cm wide, ball 10 cm, rounded almond toe;
// heel counter ~7 cm, instep ~9 cm, toe box ~4 cm. The toe rounds off over its last 14 % in plan and profile.
// almond toe: the last narrows steadily from the ball and only rounds off at the very tip
const toeRound=s=>s<.6?1:Math.pow(Math.max(0,1-Math.pow((s-.6)/.4,2)),.55);
const heelRound=s=>s>.06?1:Math.sqrt(Math.max(0,1-((.06-s)/.06)**2))*.55+.45;
const halfWidth=s=>lerpCurve([[0,.106],[.15,.118],[.34,.122],[.6,.16],[.8,.16],[1,.16]],s)*toeRound(s)*heelRound(s);
// the tip closes like the end of an ellipsoid, in profile as in plan: no vertical fin at the nose
const noseRound=s=>s<.6?1:Math.sqrt(Math.max(0,1-Math.pow((s-.6)/.4,3.2)));
// profile measured on a double monk: high instep under the straps, a toe box about 5 cm tall at the cap
const height=s=>lerpCurve([[0,.19],[.2,.2],[.4,.24],[.55,.22],[.68,.175],[.77,.15],[.9,.122],[1,.1]],s)*noseRound(s);
const underside=s=>.02+.07*(1-smooth(.22,.6,s))+.026*smooth(.8,1,s)**2;

function loft(rings,segments,point){
  const pos=[],idx=[],colors=[];
  for(let r=0;r<=rings;r++){
    const s=r/rings;
    for(let k=0;k<segments;k++){const [p,c]=point(s,2*Math.PI*k/segments);pos.push(...p);colors.push(c,c,c);}
  }
  for(let r=0;r<rings;r++)for(let k=0;k<segments;k++){
    const a=r*segments+k,b=r*segments+(k+1)%segments,c=a+segments,d=b+segments;idx.push(a,c,b,b,c,d);
  }
  // closed ends: a fan over the first and the last ring
  for(const [ring,flip] of [[0,false],[rings,true]]){
    const start=ring*segments,centre=pos.length/3,sum=[0,0,0];
    for(let k=0;k<segments;k++)for(let n=0;n<3;n++)sum[n]+=pos[3*(start+k)+n]/segments;
    pos.push(...sum);colors.push(colors[3*start],colors[3*start],colors[3*start]);
    for(let k=0;k<segments;k++){const a=start+k,b=start+(k+1)%segments;if(flip)idx.push(centre,a,b);else idx.push(centre,b,a);}
  }
  const g=new T.BufferGeometry();g.setIndex(idx);
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();return g;
}
// a point on the upper at length s and angle a (0 = outer side, π/2 = top), lifted off the surface by out
function upperPoint(s,a,out=0){
  const w=halfWidth(s)+out,h=height(s)+out,y0=underside(s);
  const c=Math.cos(a),sn=Math.sin(a);
  return [w*Math.sign(c)*Math.abs(c),sn>0?y0+h*Math.pow(sn,.74+.16*smooth(.5,.95,s)):y0+sn*.004,s*L];
}

function buildShoe(materials){
  const shoe=new T.Group();
  // upper, burnished darker at the toe and the heel
  const upper=new T.Mesh(loft(90,56,(s,a)=>[upperPoint(s,a),1-.28*smooth(.72,1,s)-.18*(1-smooth(0,.16,s))]),materials.leather);
  // sole and heel block: the arch is lifted between the heel and the ball
  const sole=new T.Mesh(loft(70,40,(s,a)=>{
    const w=halfWidth(s)*1.03+.011*Math.min(1,toeRound(s)*2.5),top=underside(s)+.004,arch=smooth(.24,.32,s)*(1-smooth(.5,.6,s));
    const bottom=s<.27?0:arch*(top-.03)+(1-arch)*(.026*smooth(.8,1,s)**2),c=Math.cos(a),sn=Math.sin(a);
    return [[w*Math.sign(c)*Math.pow(Math.abs(c),.88),sn>0?top:bottom,s*L*1.01-.004],1];
  }),materials.sole);
  shoe.add(upper,sole);
  // cap toe with its double row of stitching
  for(const at of [.768,.784]){
    const seam=[];for(let k=0;k<=24;k++)seam.push(new T.Vector3(...upperPoint(at,Math.PI*k/24,.002)));
    shoe.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(seam),40,.0022,6),materials.seam));
  }
  // two wide straps from the inner quarter over the instep; each passes through its buckle on the outer
  // side and ends in a point
  for(const s0 of [.4,.535]){
    const strip=[],idx=[],n=34,half=.031,tip=.1,full=.24,end=Math.PI*.86;
    for(let k=0;k<=n;k++){
      const a=tip+(end-tip)*k/n,w=half*Math.min(1,(a-tip)/(full-tip));
      strip.push(...upperPoint(s0-w,a,.007),...upperPoint(s0+w,a,.007));
      if(k)idx.push(2*k-2,2*k-1,2*k,2*k,2*k-1,2*k+1);
    }
    const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new T.Float32BufferAttribute(strip,3));g.computeVertexNormals();
    shoe.add(new T.Mesh(g,materials.strap));
    // stitched edges of the strap
    for(const side of [-1,1]){
      const edge=[];for(let k=0;k<=18;k++){const a=full+(end-full)*k/18;edge.push(new T.Vector3(...upperPoint(s0+side*(half-.004),a,.0085)));}
      shoe.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(edge),30,.0012,5),materials.seam));
    }
    // buckle: a polished rectangular frame with its prong, on the outer side
    const angle=.4,at=new T.Vector3(...upperPoint(s0,angle,.012)),above=new T.Vector3(...upperPoint(s0,angle+.1,.012));
    const along=new T.Vector3(0,0,1),up=above.clone().sub(at).normalize(),normal=new T.Vector3().crossVectors(up,along).normalize();
    const frame=new T.Mesh(new T.TorusGeometry(.03,.0042,8,4,Math.PI*2).rotateZ(Math.PI/4).scale(1.05,1.25,.7),materials.metal);
    frame.position.copy(at);frame.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(along.clone().negate(),up,normal));
    const prong=new T.Mesh(new T.BoxGeometry(.004,.036,.004),materials.metal);prong.position.copy(at).addScaledVector(normal,.003);prong.quaternion.copy(frame.quaternion);
    shoe.add(frame,prong);
  }
  // no received shadow: under the hem the leather would turn black; the contact shadow grounds the shoe
  shoe.traverse(m=>{if(m.isMesh)m.castShadow=true;});
  return shoe;
}

export function createShoes(scene,reflections=null){
  const materials={
    leather:new T.MeshPhysicalMaterial({vertexColors:true,color:0x40241a,roughness:.36,clearcoat:.6,clearcoatRoughness:.32,sheen:.25,sheenRoughness:.4}),
    sole:new T.MeshStandardMaterial({color:0x1c1512,roughness:.7}),
    seam:new T.MeshStandardMaterial({color:0x1a0f0a,roughness:.6}),
    strap:new T.MeshPhysicalMaterial({color:0x3a2318,roughness:.4,clearcoat:.7,clearcoatRoughness:.25,side:T.DoubleSide}),
    metal:new T.MeshPhysicalMaterial({color:0xc9c3b6,metalness:1,roughness:.22})
  };
  // lofted shells are seen from outside on one foot and mirrored on the other: draw both faces
  materials.leather.side=materials.sole.side=T.DoubleSide;
  for(const key of ['leather','strap','metal','sole'])Object.assign(materials[key],{envMap:reflections,envMapIntensity:key==='metal'?1:key==='sole'?.15:.3});
  const group=new T.Group();scene.add(group);
  // dark socks inside the trouser legs, so the open hems never show the backdrop
  const sock=new T.MeshStandardMaterial({color:0x17181c,roughness:.85});
  for(const side of [-1,1]){
    const m=new T.Mesh(new T.CylinderGeometry(.1,.082,.42,24,1,true),sock);
    m.position.set(side*.345,.3,-.07);group.add(m);
  }
  // feet under the trouser legs (leg centres at ±0.345, slightly behind the front), toes turned out 7°
  for(const side of [-1,1]){
    const shoe=buildShoe(materials),turn=side*.12;
    shoe.rotation.y=turn;
    const heelBack=.13*L*SIZE;shoe.scale.setScalar(SIZE);
    shoe.position.set(side*.345-Math.sin(turn)*heelBack,-.014,-.06-Math.cos(turn)*heelBack);
    if(side<0)shoe.scale.x=-SIZE; // mirrored foot on the left of the picture: buckles stay on the outer sides
    group.add(shoe);
  }
  return {
    group,
    update(rgb){
      // polished black calf, as on the reference pair; dark brown only with warm cloths (brown, beige, olive)
      const warm=rgb[0]>rgb[2]+12;
      const color=warm?0x3a2318:0x131314;
      materials.leather.color.setHex(color);materials.strap.color.setHex(color);
      // socks a shade darker than the cloth, as they are worn with a suit
      sock.color.setRGB(...rgb.map(c=>c/255*.5),T.SRGBColorSpace);
    }
  };
}
