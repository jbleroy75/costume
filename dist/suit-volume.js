import {rasterSuit} from './suit-raster.js';
import * as T from './vendor/three.module.min.js';

// Cross sections measured in the shared 384 × 576 studio frame.
// Each ring stores its height, left edge, right edge and front-to-centre depth.
const profiles={
  collar:[[27,183,199,6],[29,176,206,12],[34,170,212,15],[42,168,214,16],[54,170,212,15],[64,174,208,11]],
  body:[[37,167,215,13],[43,160,222,18],[50,145,236,22],[58,126,254,28],[64,115,267,29],[79,116,266,35],[100,122,259,38],[126,127,255,38],[146,130,251,35],[174,134,248,32],[198,130,251,33],[224,126,255,36],[253,123,258,38],[274,122,260,38],[280,128,254,37]],
  sleeve:[[63,112,119,6],[68,109,124,11],[82,105,129,15],[109,99,130,17],[145,93,126,18],[175,91,123,17],[200,89,121,16],[239,88,119,15],[257,88,119,15],[263,90,118,14]],
  leg:[[267,131,194,25],[278,128,194,26],[294,129,191,25],[311,131,185,23],[340,133,181,21],[400,136,176,18],[490,137,175,17],[536,139,173,17],[541,142,171,15]]
};

export function garmentGeometry(part,reflected=false){
  const rows=profiles[part],pos=[],uv=[],idx=[],surface=[];
  const segments=64;
  const rings=[];
  for(let k=0;k<rows.length-1;k++){
    const a=rows[k],b=rows[k+1],steps=Math.ceil((b[0]-a[0])/3);
    for(let j=0;j<steps;j++)rings.push(a.map((v,i)=>v+(b[i]-v)*j/steps));
  }
  rings.push(rows.at(-1));
  for(const [y,l,r,depth] of rings){
    const center=reflected?382-(l+r)/2:(l+r)/2,radius=(r-l)/2;
    for(let i=0;i<=segments;i++){
      const a=i*2*Math.PI/segments-Math.PI,cs=Math.cos(a),sn=Math.sin(a);
      const x=center+radius*sn;
      let z=depth*cs;
      if(part==='leg')z+=2.3*Math.exp(-sn*sn/.045)*Math.max(0,cs);
      if(part==='body')z+=2.8*Math.exp(-Math.pow((Math.abs(x-191)-(150-y)*.31)/5,2))*Math.max(0,cs);
      if(part==='collar')z-=3;
      if(part==='leg')z-=6;
      pos.push((x-191)/100,(542-y)/100,z/100);
      uv.push((center+(x-center)*.985)/384,1-y/576);
      surface.push(i/segments,(542-y)/180);
    }
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
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals();return geo;
}

export function doubleFrontDetails(){
  const overlap=[[165,209,171],[188,212,170],[220,214,170],[250,218,170],[276,215,171]];
  return [tailoredPanel(overlap,false),...facings.map(rows=>tailoredPanel(rows,true))];
}

export function createStudio(host,original){
  let renderer;
  try{renderer=new T.WebGLRenderer({canvas:host,antialias:true,alpha:false,preserveDrawingBuffer:true});}catch{renderer=null;}
  const software=renderer?null:host.getContext('2d');
  let cpuPixels,rgb=[43,49,64];
  if(renderer){
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.setClearColor(0xece9e4);
  }
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-2,2,3,-3,.1,40);
  const texture=new T.CanvasTexture(original);texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=renderer?Math.min(8,renderer.capabilities.getMaxAnisotropy()):1;
  const photo=new T.MeshStandardMaterial({map:texture,roughness:.93,metalness:0});
  const side=new T.MeshStandardMaterial({roughness:.95});
  const garment=new T.Group();scene.add(garment);
  for(const [part,mirror] of [['leg',false],['leg',true],['body',false],['sleeve',false],['sleeve',true],['collar',false]]){
    const mesh=new T.Mesh(garmentGeometry(part,mirror),[photo,side]);mesh.castShadow=true;mesh.receiveShadow=true;garment.add(mesh);
  }
  const details=doubleFrontDetails().map(geometry=>{
    const mesh=new T.Mesh(geometry,[photo,side]);mesh.castShadow=true;mesh.receiveShadow=true;garment.add(mesh);return mesh;
  });
  const fill=new T.HemisphereLight(0xfbf8f3,0xc3bdba,1.65);scene.add(fill);
  const key=new T.DirectionalLight(0xfff6ed,2.25);key.position.set(-3.2,8,5);key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.011;key.shadow.bias=-.0003;
  key.target.position.y=2.4;scene.add(key,key.target);
  const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.ShadowMaterial({opacity:.22}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.018;floor.receiveShadow=true;scene.add(floor);
  let yaw=.11,bust=false,zoom=1,active=false,drag=null;
  function draw(){
    if(!active||!host.clientHeight||!host.clientWidth)return;
    const w=host.clientWidth,h=host.clientHeight;
    if(!renderer){
      if(!cpuPixels)return;
      const ratio=Math.min(1.4,1100/Math.max(w,h));
      const sw=Math.max(1,Math.round(w*ratio)),sh=Math.max(1,Math.round(h*ratio));
      if(host.width!==sw||host.height!==sh){host.width=sw;host.height=sh;}
      const frame=rasterSuit(garment.children.filter(m=>m.visible).map(m=>m.geometry),cpuPixels,original.width,original.height,sw,sh,yaw,zoom,rgb,bust);
      software.putImageData(new ImageData(frame,sw,sh),0,0);
      return;
    }
    renderer.setSize(w,h,false);
    const half=Math.max(bust?1.40:2.83,1.23*h/w)/zoom;
    Object.assign(camera,{left:-half*w/h,right:half*w/h,top:half,bottom:-half});
    camera.updateProjectionMatrix();const center=bust?3.96:2.55;camera.position.set(0,center+.40,10);camera.lookAt(0,center,0);
    garment.rotation.y=yaw;renderer.render(scene,camera);
  }
  function rotate(delta){yaw=Math.max(-.62,Math.min(.62,yaw+delta));draw();}
  host.addEventListener('pointerdown',e=>{drag=e.clientX;host.setPointerCapture(e.pointerId);});
  host.addEventListener('pointermove',e=>{if(drag!==null){rotate((e.clientX-drag)*.008);drag=e.clientX;}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(type,()=>{drag=null;});
  host.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home'){yaw=0;draw();}else rotate(e.key==='ArrowRight'?.1:-.1);}});
  new ResizeObserver(draw).observe(host);
  return {bust(v){bust=v;yaw=v?.52:.11;draw();},show(v){active=v;draw();},zoom(v){zoom=v;draw();},update(color,state){for(const mesh of details)mesh.visible=state?.closure==='double'&&state.tailoring?.coatLapel==='en-pointe';rgb=color;if(software)cpuPixels=original.getContext('2d').getImageData(0,0,original.width,original.height).data;side.color.setRGB(...rgb.map(c=>c/255),T.SRGBColorSpace);texture.needsUpdate=true;draw();}};
}
