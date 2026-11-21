export const families=['Blancs','Beiges','Gris','Noirs','Bleus','Verts','Bruns','Rouges','Violets','Oranges'];
export function classify(data,w,h){
  const rgb=[0,1,2].map(c=>{
    const v=[];for(let i=c;i<data.length;i+=16)v.push(data[i]);
    return v.sort((a,b)=>a-b)[Math.floor(v.length/2)];
  });
  const [r,g,b]=rgb,max=Math.max(...rgb),min=Math.min(...rgb),d=max-min;
  const hue=!d?0:((max===r?(g-b)/d:max===g?2+(b-r)/d:4+(r-g)/d)*60+360)%360;
  let family;
  if(d<Math.max(8,max*.12))family=max<37?'Noirs':max>205?'Blancs':'Gris';
  else if(hue>=190&&hue<257)family='Bleus';
  else if(hue>=257&&hue<326)family='Violets';
  else if(hue>=65&&hue<190)family='Verts';
  else if(hue<=18||hue>=326)family='Rouges';
  else family=max<145?'Bruns':d<85?'Beiges':'Oranges';
  const columns=new Float64Array(w),rows=new Float64Array(h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=4*(y*w+x),l=.21*data[i]+.72*data[i+1]+.07*data[i+2];
    columns[x]+=l/h;rows[y]+=l/w;
  }
  function periodic(a){
    const mean=a.reduce((s,n)=>s+n,0)/a.length;
    const values=a.map(n=>n-mean);
    if(Math.max(...a)-Math.min(...a)<9)return false;
    let last=0,rising=false;
    for(let k=3;k<a.length/2;k++){
      let cross=0,aa=0,bb=0;
      for(let j=k;j<a.length;j++){cross+=values[j]*values[j-k];aa+=values[j]**2;bb+=values[j-k]**2;}
      const score=cross/Math.sqrt(aa*bb||1);
      if(rising&&score<last&&last>.48)return true;
      rising=score>last;last=score;
    }
    return false;
  }
  const vertical=periodic(columns),horizontal=periodic(rows);
  return {rgb,family,pattern:vertical&&horizontal?'windowpane':vertical||horizontal?'pinstripe':'solid',rotate:horizontal&&!vertical};
}
export async function* photos(file){
  if(!/\.zip$/i.test(file.name)){yield file;return;}
  const bytes=async(a,b)=>new Uint8Array(await file.slice(a,b).arrayBuffer());
  const end=await bytes(Math.max(0,file.size-65557),file.size);
  const view=new DataView(end.buffer);
  let e=end.length-22;
  while(e>=0&&view.getUint32(e,true)!==0x06054b50)e--;
  if(e<0)throw Error('Archive ZIP illisible.');
  const size=view.getUint32(e+12,true),offset=view.getUint32(e+16,true);
  if(size>24000000||offset+size>file.size)throw Error('Répertoire ZIP incompatible. Utilise une archive par collection.');
  const directory=await bytes(offset,offset+size),dv=new DataView(directory.buffer);
  for(let i=0;i<directory.length;){
    if(dv.getUint32(i,true)!==0x02014b50)throw Error('Entrée ZIP invalide.');
    const n=dv.getUint16(i+28,true),method=dv.getUint16(i+10,true),flags=dv.getUint16(i+8,true);
    const path=new TextDecoder().decode(directory.subarray(i+46,i+46+n));
    const at=dv.getUint32(i+42,true),compressed=dv.getUint32(i+20,true),length=dv.getUint32(i+24,true);
    i+=46+n+dv.getUint16(i+30,true)+dv.getUint16(i+32,true);
    if(!/\.(jpe?g|png|webp)$/i.test(path)||/(^|\/)\./.test(path)||path.startsWith('__MACOSX/'))continue;
    if(length>28e6||compressed>28e6||flags&1||![0,8].includes(method))throw Error('Format ou taille incompatible : '+path);
    const local=new DataView((await bytes(at,at+30)).buffer);
    const start=at+30+local.getUint16(26,true)+local.getUint16(28,true);
    const raw=file.slice(start,start+compressed);
    let blob=raw;
    if(method===8){
      const reader=raw.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];
      let total=0;
      for(;;){const result=await reader.read();if(result.done)break;total+=result.value.length;if(total>length){await reader.cancel();throw Error('Taille ZIP invalide.');}chunks.push(result.value);}
      if(total!==length)throw Error('Image ZIP incomplète.');
      blob=new Blob(chunks);
    }
    yield new File([blob],path.split('/').pop());
  }
}
