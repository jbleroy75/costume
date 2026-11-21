import {rasterSuit} from './suit-raster.js';
import {PATCH_WIDTH,PATCH_HEIGHT} from './fabric-patch.js';
import * as T from './vendor/three.module.min.js';

// Cross sections measured in the shared 384 × 576 studio frame.
// Each ring stores its height, left edge, right edge and front-to-centre depth.
const profiles={
  collar:[[27,183,199,6],[29,176,206,12],[34,170,212,15],[42,168,214,16],[54,170,212,15],[64,174,208,11]],
  body:[[37,167,215,13],[43,160,222,18],[50,145,236,22],[58,126,254,28],[64,115,267,29],[79,116,266,35],[100,122,259,38],[126,127,255,38],[146,130,251,35],[174,134,248,32],[198,130,251,33],[224,126,255,36],[253,123,258,38],[274,122,260,38],[280,128,254,37]],
  sleeve:[[63,112,119,6],[68,109,124,11],[82,105,129,15],[109,99,130,17],[145,93,126,18],[175,91,123,17],[200,89,121,16],[239,88,119,15],[257,88,119,15],[263,90,118,14]],
  leg:[[267,131,194,25],[278,128,194,26],[294,129,191,25],[311,131,185,23],[340,133,181,21],[400,136,176,18],[490,137,175,17],[536,139,173,17],[541,142,171,15]]
};

// Tailoring volume added to the WebGL geometry, in frame pixels along z (positive = towards the front).
// Only depth changes, so the front photograph keeps its exact place on screen.
const bell=(v,at,width)=>Math.exp(-(((v-at)/width)**2));
function shape(part,y,across,radius,cs){
  const back=Math.max(0,-cs);
  if(part==='sleeve'){
    // Arms hang with a slight forward pitch and the forearm bends forward from the elbow.
    const t=Math.min(1,Math.max(0,(y-63)/200)),forearm=Math.log1p(Math.exp((t-.5)/.06))*.12;
    const elbow=back*bell(y,168,14)*1.6; // a soft fold where the elbow bends
    return 2.2*t+12*forearm-elbow;
  }
  if(part==='body'){
    // Back: shoulder blades, suppressed waist, and the skirt falling away to the vents;
    // two faint drape folds run from the blades towards the waist.
    const folds=back>.35?Math.sin((Math.abs(across)-.32*(y-120))/4.2)*bell(y,165,30)*bell(Math.abs(across),28,18)*.9:0;
    return -back*(3.2*bell(y,112,24)-3*bell(y,182,22)+1.8*bell(y,262,22))-folds*back;
  }
  if(part==='leg'){
    // Trousers: seat below the jacket, calf, and shallow creases behind the knee.
    const knee=Math.sin(y/3.1)*bell(y,404,12)*.7;
    return -back*(7.5*bell(y,292,24)+2.2*bell(y,452,38)-knee);
  }
  return 0;
}

// detail > 1 densifies rings and segments for the WebGL studio; the CPU fallback keeps detail 1.
export function garmentGeometry(part,reflected=false,detail=1){
  const rows=profiles[part],pos=[],uv=[],idx=[],surface=[];
  const segments=Math.round(64*detail);
  const rings=[];
  // Detailed (WebGL) geometry follows a Catmull-Rom curve through the measured sections, so the
  // surface has no crease at each section; the CPU fallback keeps the original straight segments.
  const curve=(p0,p1,p2,p3,t)=>.5*(2*p1+(p2-p0)*t+(2*p0-5*p1+4*p2-p3)*t*t+(3*p1-p0-3*p2+p3)*t*t*t);
  for(let k=0;k<rows.length-1;k++){
    const a=rows[k],b=rows[k+1],steps=Math.ceil((b[0]-a[0])*detail/3);
    const before=rows[Math.max(0,k-1)],after=rows[Math.min(rows.length-1,k+2)];
    for(let j=0;j<steps;j++){
      const t=j/steps;
      rings.push(detail>1?a.map((v,i)=>i?curve(before[i],v,b[i],after[i],t):v+(b[i]-v)*t):a.map((v,i)=>v+(b[i]-v)*t));
    }
  }
  rings.push(rows.at(-1));
  const front=[],uvFabric=[],panel=[];
  for(const [y,l,r,depth] of rings){
    const center=reflected?382-(l+r)/2:(l+r)/2,radius=(r-l)/2;
    // The photograph is reliable on the front; the sides and back receive tiled cloth instead.
    // Neck and shirt cuffs read the same all round, so they keep the photograph everywhere.
    const neck=part==='collar'&&y<44,cuff=part==='sleeve'&&y>=252;
    const ringStart=pos.length/3;
    for(let i=0;i<=segments;i++){
      const a=i*2*Math.PI/segments-Math.PI,cs=Math.cos(a),sn=Math.sin(a);
      const x=center+radius*sn;
      let z=depth*cs;
      if(detail>1)z+=shape(part,y,x-center,radius,cs);
      if(part==='leg')z+=2.3*Math.exp(-sn*sn/.045)*Math.max(0,cs);
      if(part==='body')z+=2.8*Math.exp(-Math.pow((Math.abs(x-191)-(150-y)*.31)/5,2))*Math.max(0,cs);
      if(part==='collar')z-=3;
      if(part==='leg')z-=6;
      pos.push((x-191)/100,(542-y)/100,z/100);
      uv.push((center+(x-center)*.985)/384,1-y/576);
      surface.push(i/segments,(542-y)/180);
      // Behind the neck the jacket collar rises over the shirt: only its top edge keeps the photograph.
      const t=Math.min(1,Math.max(0,(cs-.2)/.2));
      front.push(cuff||(neck&&(cs>=0||y<34))?1:t*t*(3-2*t));
      panel.push(part==='body'?1:0);
    }
    // Cloth coordinates in world units (one scale everywhere): arc length measured from the back centre
    // in both directions, so stripes run straight down the back and continue unbroken across the side
    // seams, as a tailor matches them. The two directions meet at the front centre, under the photograph.
    const step=i=>{const a=3*(ringStart+i),b=3*(ringStart+i-1);return Math.hypot(pos[a]-pos[b],pos[a+2]-pos[b+2]);};
    const arc=new Float32Array(segments+1),half=segments/2;
    for(let i=1;i<=half;i++)arc[i]=arc[i-1]+step(i);
    for(let i=segments-1;i>half;i--)arc[i]=arc[i+1]-step(i+1);
    const shift=(reflected?7:0)+(part==='sleeve'?3:0);
    // Swatch coordinates: 200 render px per unit across; rows match the front render (2 px per frame px).
    for(let i=0;i<=segments;i++)uvFabric.push((arc[i]+shift)*200/PATCH_WIDTH,1-2*y/PATCH_HEIGHT);
  }
  const geo=new T.BufferGeometry();
  for(const front of [true,false]){
    const start=idx.length;
    for(let row=0;row<rings.length-1;row++)for(let i=0;i<segments;i++){
      if((Math.cos((i+.5)*2*Math.PI/segments-Math.PI)>=0)!==front)continue;
      const n=row*(segments+1)+i,b=n+segments+1;
      idx.push(n,b,n+1,n+1,b,b+1);
    }
    geo.addGroup(start,idx.length-start,front?0:1);
  }
  geo.setIndex(idx);
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setAttribute('uv1',new T.Float32BufferAttribute(surface,2));
  geo.setAttribute('front',new T.Float32BufferAttribute(front,1));
  geo.setAttribute('uvFabric',new T.Float32BufferAttribute(uvFabric,2));
  geo.setAttribute('panel',new T.Float32BufferAttribute(panel,1));
  geo.computeVertexNormals();
  return geo;
}

// Traces on the peak-lapel master, from the gorge to the fastening.
// A row runs from the roll line to the outer edge of the facing.
const facings=[
  [[40,166,165],[53,169,149],[60,170,145],[62,171,153],[63,171,135],[79,175,145],[100,182,155],[123,190,170],[141,182,181.6]],
  [[39,216,217],[53,213,233],[59,212,239],[62,211,231],[63,211,247],[81,206,237],[105,199,221],[129,189,205],[151,177,188],[167,171,171.5]]
];

function chestDepth(x,y){
  const rows=profiles.body;
  const n=rows.findIndex(row=>row[0]>=y);
  const a=rows[Math.max(0,n-1)],b=rows[n<0?rows.length-1:n];
  const t=(y-a[0])/(b[0]-a[0]||1);
  const [l,r,d]=[1,2,3].map(i=>a[i]+(b[i]-a[i])*t);
  const cos=Math.sqrt(Math.max(0,1-((2*x-l-r)/(r-l))**2));
  return cos*(d+2.8*Math.exp(-(((Math.abs(x-191)-(150-y)*.31)/5)**2)));
}

export function tailoredPanel(rows,rolled){
  const positions=[],uv=[],indices=[],columns=14;
  function vertex(y,start,end,j){
    const t=j/columns,x=start+(end-start)*t;
    const taper=Math.min(1,Math.abs(end-start)/12);
    const lift=rolled?(.75+5.4*Math.sin(Math.PI*t*.78)+1.4*t)*taper:.85+t*1.35;
    const z=chestDepth(x,y)+lift+.4;
    positions.push((x-191)/100,(542-y)/100,z/100);
    uv.push(x/384,1-y/576);
  }
  const lines=[];
  for(let n=1;n<rows.length;n++){
    const a=rows[n-1],b=rows[n],steps=Math.ceil((b[0]-a[0])/2);
    for(let i=0;i<steps;i++)lines.push(a.map((v,k)=>v+(b[k]-v)*i/steps));
  }
  lines.push(rows.at(-1));
  for(const [y,l,r] of lines)for(let j=0;j<=columns;j++)vertex(y,l,r,j);
  const triangle=(a,b,c)=>{if(rows[0][1]<rows[0][2])indices.push(a,b,c);else indices.push(a,c,b);};
  for(let i=1;i<lines.length;i++)for(let j=0;j<columns;j++){
    const a=(i-1)*(columns+1)+j,b=a+columns+1;triangle(a,b,a+1);triangle(a+1,b,b+1);
  }
  const topCount=indices.length;
  for(let i=0;i<lines.length;i++){
    const n=i*(columns+1)+columns,k=positions.length/3;
    positions.push(positions[3*n],positions[3*n+1],positions[3*n+2]-.016);
    uv.push(uv[n*2],uv[n*2+1]);
    if(i){const prev=n-columns-1;triangle(prev,k-1,n);triangle(n,k-1,k);}
  }
  const geo=new T.BufferGeometry();geo.userData.raisedFacing=true;geo.setIndex(indices);geo.addGroup(0,topCount,0);geo.addGroup(topCount,indices.length-topCount,1);
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setAttribute('front',new T.Float32BufferAttribute(new Float32Array(positions.length/3).fill(1),1));
  geo.setAttribute('uvFabric',new T.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
  geo.setAttribute('panel',new T.Float32BufferAttribute(new Float32Array(positions.length/3),1));
  geo.computeVertexNormals();return geo;
}

export function doubleFrontDetails(){
  const overlap=[[165,209,171],[188,212,170],[220,214,170],[250,218,170],[276,215,171]];
  return [tailoredPanel(overlap,false),...facings.map(rows=>tailoredPanel(rows,true))];
}


// Radial studio gradient, drawn once into a small canvas.
function gradientTexture(stops,size=512,grain=0){
  const c=document.createElement('canvas');c.width=c.height=size;
  const g=c.getContext('2d'),r=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  for(const [at,color] of stops)r.addColorStop(at,color);
  g.fillStyle=r;g.fillRect(0,0,size,size);
  if(grain){ // a little noise hides 8-bit banding in the large backdrop gradient
    const img=g.getImageData(0,0,size,size),d=img.data;
    for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*grain;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}
    g.putImageData(img,0,0);
  }
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

// Back of the jacket: centre-back seam from collar to hem, and the vents chosen in the catalogue
// (object space: x across, y up, z < 0 behind). Seams are a pressed line with a soft shadow beside it.
const BACK_SEAMS=`vec4 photoTexel=texture2D(map,vMapUv);
vec4 clothTexel=texture2D(clothMap,vCloth);
diffuseColor*=mix(clothTexel,photoTexel,vFront);
float behind=vPanel*(1.0-vFront)*smoothstep(-0.02,-0.08,vObject.z);
float hem=step(2.62,vObject.y)*(1.0-step(3.16,vObject.y));
float centre=behind*(1.0-smoothstep(0.003,0.009,abs(vObject.x)))*step(2.62,vObject.y)*(1.0-step(4.74,vObject.y));
float centreVent=hem*float(vents==1);
float lap=behind*centreVent*smoothstep(0.03,0.0,vObject.x)*step(0.0,vObject.x)*0.18;
float sides=behind*hem*float(vents>=2)*(1.0-smoothstep(0.003,0.009,abs(abs(vObject.x)-0.47)));
float sideLap=behind*hem*float(vents>=2)*smoothstep(0.03,0.0,0.47-abs(vObject.x))*step(abs(vObject.x),0.47)*0.18;
float strap=behind*float(vents==3)*step(2.86,vObject.y)*(1.0-step(2.92,vObject.y))*(1.0-smoothstep(0.03,0.04,abs(abs(vObject.x)-0.47)));
diffuseColor.rgb*=1.0-0.42*max(centre*(1.0+0.4*centreVent),sides*1.3)-lap-sideLap;
diffuseColor.rgb*=1.0-0.16*strap+0.10*strap*smoothstep(2.88,2.9,vObject.y);`;

export function createStudio(host,original){
  let renderer;
  try{renderer=new T.WebGLRenderer({canvas:host,antialias:true,alpha:false,preserveDrawingBuffer:true});}catch{renderer=null;}
  const software=renderer?null:host.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cpuPixels,rgb=[43,49,64];
  if(renderer){
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    renderer.setClearColor(0xe9e5de);
  }
  const scene=new T.Scene(),fov=15,camera=new T.PerspectiveCamera(fov,1,.5,200);
  const texture=new T.CanvasTexture(original);texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=renderer?Math.min(16,renderer.capabilities.getMaxAnisotropy()):1;
  // Wool reads as cloth thanks to a soft sheen on grazing angles; the photo keeps its own folds and shadows.
  const photo=new T.MeshPhysicalMaterial({map:texture,roughness:.9,metalness:0,sheen:.22,sheenRoughness:.5});
  // Back and sides: the selected cloth, tiled at the scale of the front render (200 canvas px per unit).
  const cloth=new T.CanvasTexture(document.createElement('canvas'));
  cloth.colorSpace=T.SRGBColorSpace;cloth.wrapS=cloth.wrapT=T.MirroredRepeatWrapping;
  cloth.anisotropy=texture.anisotropy;
  const vents={value:2};
  photo.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{clothMap:{value:cloth},vents});
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nattribute float front;\nattribute float panel;\nattribute vec2 uvFabric;\nvarying float vFront;\nvarying float vPanel;\nvarying vec2 vCloth;\nvarying vec3 vObject;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvFront=front;vPanel=panel;vCloth=uvFabric;vObject=position;');
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nuniform sampler2D clothMap;\nuniform int vents;\nvarying float vFront;\nvarying float vPanel;\nvarying vec2 vCloth;\nvarying vec3 vObject;')
      .replace('#include <map_fragment>',BACK_SEAMS);
  };
  const side=new T.MeshStandardMaterial({roughness:.95});
  const garment=new T.Group();scene.add(garment);
  const detail=renderer?2:1;
  for(const [part,mirror] of [['leg',false],['leg',true],['body',false],['sleeve',false],['sleeve',true],['collar',false]]){
    const mesh=new T.Mesh(garmentGeometry(part,mirror,detail),renderer?photo:[photo,side]);mesh.castShadow=true;mesh.receiveShadow=true;garment.add(mesh);
  }
  const details=doubleFrontDetails().map(geometry=>{
    const mesh=new T.Mesh(geometry,[photo,side]);mesh.castShadow=true;mesh.receiveShadow=true;garment.add(mesh);return mesh;
  });
  // Lighting: soft fill, a high key light, and two rim lights that draw the silhouette out of the backdrop.
  scene.add(new T.HemisphereLight(0xfbf8f3,0xbfb8b2,1.55));
  const key=new T.DirectionalLight(0xfff4e8,2.3);key.position.set(-3.2,8,5);key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(2048,2048);key.shadow.normalBias=.012;key.shadow.bias=-.0003;
  key.target.position.y=2.4;scene.add(key,key.target);
  for(const [x,color,power] of [[4.2,0xfffaf3,1.2],[-4.2,0xfff4e6,.95]]){
    const rim=new T.DirectionalLight(color,power);rim.position.set(x,5.5,-5.5);rim.target.position.y=2.4;scene.add(rim,rim.target);
  }
  // Seamless studio backdrop, floor shadow and a soft contact shadow under the feet.
  const backdrop=new T.Mesh(new T.PlaneGeometry(60,60),new T.MeshBasicMaterial({map:gradientTexture([[0,'#f6f3ee'],[.45,'#ede9e2'],[1,'#dcd6cc']],512,3),depthWrite:false}));
  backdrop.position.set(0,3,-9);scene.add(backdrop);
  const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.ShadowMaterial({opacity:.07}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.018;floor.receiveShadow=true;scene.add(floor);
  const contact=new T.Mesh(new T.PlaneGeometry(2.1,.9),new T.MeshBasicMaterial({map:gradientTexture([[0,'rgba(30,26,22,.5)'],[.35,'rgba(30,26,22,.24)'],[.7,'rgba(30,26,22,.07)'],[1,'rgba(30,26,22,0)']],256),transparent:true,depthWrite:false}));
  contact.rotation.x=-Math.PI/2;contact.position.set(.03,-.012,.02);scene.add(contact);

  const LIMIT=renderer&&!reduced?Infinity:.62,REST=.11,TURN=2*Math.PI;
  const view={yaw:REST,half:2.83,center:2.55},goal={...view};
  let bust=false,zoom=1,active=false,drag=null,velocity=0,frame=0,last=0,introduced=false,lastMove=0,intro=null;
  const framing=()=>{goal.half=bust?1.40:2.83;goal.center=bust?3.96:2.55;};
  function paint(){
    if(!active||!host.clientHeight||!host.clientWidth)return;
    const w=host.clientWidth,h=host.clientHeight;
    if(!renderer){
      if(!cpuPixels)return;
      const ratio=Math.min(1.4,1100/Math.max(w,h));
      const sw=Math.max(1,Math.round(w*ratio)),sh=Math.max(1,Math.round(h*ratio));
      if(host.width!==sw||host.height!==sh){host.width=sw;host.height=sh;}
      const frame=rasterSuit(garment.children.filter(m=>m.visible).map(m=>m.geometry),cpuPixels,original.width,original.height,sw,sh,view.yaw,zoom,rgb,bust);
      software.putImageData(new ImageData(frame,sw,sh),0,0);
      return;
    }
    renderer.setSize(w,h,false);
    const half=Math.max(view.half,1.23*h/w)/zoom,distance=half/Math.tan(fov*Math.PI/360);
    camera.aspect=w/h;camera.updateProjectionMatrix();
    camera.position.set(0,view.center+.04*distance,distance);camera.lookAt(0,view.center,0);
    garment.rotation.y=view.yaw;renderer.render(scene,camera);
  }
  // Eased camera and inertia; frames are only drawn while something moves.
  function tick(now){
    frame=0;const dt=Math.min(.05,(now-(last||now))/1000);last=now;
    if(drag===null&&Math.abs(velocity)>.002){
      goal.yaw+=velocity*dt;velocity*=Math.exp(-dt*3.2);
      if(Math.abs(goal.yaw)>LIMIT){goal.yaw=Math.sign(goal.yaw)*LIMIT;velocity=0;}
    }else if(drag===null)velocity=0;
    if(intro){ // first appearance: one slow full turn, eased in and out
      const t=Math.min(1,(now-intro)/2600),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
      view.yaw=goal.yaw=REST-TURN*(1-e);
      if(t>=1)intro=null;
    }
    const k=1-Math.exp(-dt*(drag===null?6:22));let moving=Math.abs(velocity)>.002||Boolean(intro);
    for(const name of ['yaw','half','center']){
      const gap=goal[name]-view[name];
      if(Math.abs(gap)>.0004){view[name]+=gap*k;moving=true;}else view[name]=goal[name];
    }
    paint();
    if(moving)schedule();else last=0;
  }
  function schedule(){
    if(!renderer||reduced){Object.assign(view,goal);velocity=0;paint();return;}
    if(!frame)frame=requestAnimationFrame(tick);
  }
  function setYaw(v){goal.yaw=Math.max(-LIMIT,Math.min(LIMIT,v));schedule();}
  host.addEventListener('pointerdown',e=>{intro=null;drag=e.clientX;lastMove=performance.now();velocity=0;host.setPointerCapture(e.pointerId);});
  host.addEventListener('pointermove',e=>{
    if(drag===null)return;
    const now=performance.now(),delta=(e.clientX-drag)*.008,dt=Math.max(.008,(now-lastMove)/1000);
    velocity=velocity*.6+.4*delta/dt;drag=e.clientX;lastMove=now;setYaw(goal.yaw+delta);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(type,()=>{
    if(drag!==null&&performance.now()-lastMove>90)velocity=0;
    drag=null;schedule();
  });
  const nearestFront=()=>REST+TURN*Math.round((goal.yaw-REST)/TURN);
  host.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();intro=null;velocity=0;const step=LIMIT===Infinity?Math.PI/4:.1;setYaw(e.key==='Home'?nearestFront():goal.yaw+(e.key==='ArrowRight'?step:-step));}});
  new ResizeObserver(()=>paint()).observe(host);
  return {
    bust(v){bust=v;framing();intro=null;goal.yaw=nearestFront()+(v?.41:0);velocity=0;schedule();},
    show(v){
      active=v;
      // First appearance: a short quarter turn shows the costume has volume.
      if(v&&!introduced&&renderer&&!reduced&&host.clientHeight){introduced=true;intro=performance.now();}
      schedule();paint();
    },
    zoom(v){zoom=v;paint();},
    update(color,state,swatch){
      if(swatch){cloth.image=swatch;cloth.needsUpdate=true;}
      vents.value={'sans-fente':0,'fente-centrale':1,'deux-fentes-laterales':2,'fentes-laterales-avec-patte':3}[state?.tailoring?.coatVents]??2;for(const mesh of details)mesh.visible=state?.closure==='double'&&state.tailoring?.coatLapel==='en-pointe';rgb=color;if(software)cpuPixels=original.getContext('2d').getImageData(0,0,original.width,original.height).data;side.color.setRGB(...rgb.map(c=>c/255),T.SRGBColorSpace);photo.sheenColor.setRGB(...rgb.map(c=>Math.min(1,c/255*1.25+.03)),T.SRGBColorSpace);texture.needsUpdate=true;paint();}
  };
}
