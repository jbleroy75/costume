// Orthographic triangle rasterizer for devices without WebGL.
export function rasterSuit(parts,pixels,tw,th,width,height,yaw,zoom,base,bust=false){
  const out=new Uint8ClampedArray(width*height*4),depth=new Float32Array(width*height).fill(-Infinity);
  const scale=Math.min(height/(bust?2.8:5.66),width/2.46)*zoom,cy=Math.cos(yaw),sy=Math.sin(yaw);
  const ground=height/2+(bust?3.96:2.55)*scale,mid=width/2;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=(x-mid)/scale,dy=(y-ground)/scale;
    const soft=Math.exp(-((dx-.18)**2)/.85-((dy+.022*dx)**2)/.0035);
    const contact=Math.exp(-Math.min((dx-.34)**2,(dx+.34)**2)/.032-dy*dy/.0007);
    const shade=soft*.12+contact*.20;
    const n=4*(y*width+x);out[n]=236*(1-shade);out[n+1]=233*(1-shade);out[n+2]=228*(1-shade);out[n+3]=255;
  }
  for(const geo of parts){
    const pos=geo.attributes.position.array,normal=geo.attributes.normal.array,uv=geo.attributes.uv.array,idx=geo.index.array;
    const v=new Float32Array(pos.length/3*4);
    for(let i=0;i<pos.length;i+=3){
      const x=pos[i],z=pos[i+2],worldZ=z*cy-x*sy,j=i/3*4;
      v[j]=mid+(x*cy+z*sy)*scale;v[j+1]=ground-pos[i+1]*scale+.04*worldZ*scale;v[j+2]=worldZ;
      const nx=normal[i]*cy+normal[i+2]*sy,nz=normal[i+2]*cy-normal[i]*sy;
      v[j+3]=.81+.32*Math.max(0,-.48*nx+.48*normal[i+1]+.73*nz);
    }
    const contact=geo.userData.raisedFacing?new Map():null;
    for(const group of geo.groups)for(let k=group.start;k<group.start+group.count;k+=3){
      const a=idx[k]*4,b=idx[k+1]*4,c=idx[k+2]*4;
      const ax=v[a],ay=v[a+1],bx=v[b],by=v[b+1],cx=v[c],yy=v[c+1];
      const det=(by-yy)*(ax-cx)+(cx-bx)*(ay-yy);
      if(det>=-.00001)continue;
      const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
      const minY=Math.max(0,Math.floor(Math.min(ay,by,yy))),maxY=Math.min(height-1,Math.ceil(Math.max(ay,by,yy)));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const w0=((by-yy)*(x+.5-cx)+(cx-bx)*(y+.5-yy))/det;
        const w1=((yy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-yy))/det,w2=1-w0-w1;
        if(Math.min(w0,w1,w2)<-.00001)continue;
        const n=y*width+x,z=w0*v[a+2]+w1*v[b+2]+w2*v[c+2];if(z<=depth[n])continue;
        if(contact&&Number.isFinite(depth[n])){
          const gap=Math.min(.09,z-depth[n]);
          const sx=x+Math.round(.64*gap*scale),sy=y+Math.round(.82*gap*scale);
          if(sx<width&&sy<height&&gap>.003)contact.set(sy*width+sx,z);
        }
        depth[n]=z;
        const light=w0*v[a+3]+w1*v[b+3]+w2*v[c+3];
        const tx=Math.min(tw-1,Math.max(0,(w0*uv[a/2]+w1*uv[b/2]+w2*uv[c/2])*(tw-1)));
        const ty=Math.min(th-1,Math.max(0,(1-w0*uv[a/2+1]-w1*uv[b/2+1]-w2*uv[c/2+1])*(th-1)));
        const ix=Math.floor(tx),iy=Math.floor(ty),fx=tx-ix,fy=ty-iy;
        const t=4*(iy*tw+ix),right=ix===tw-1?0:4,below=iy===th-1?0:4*tw;
        for(let ch=0;ch<3;ch++){
          const top=pixels[t+ch]*(1-fx)+pixels[t+right+ch]*fx;
          const bottom=pixels[t+below+ch]*(1-fx)+pixels[t+below+right+ch]*fx;
          out[4*n+ch]=(group.materialIndex?base[ch]:top*(1-fy)+bottom*fy)*light;
        }
      }
    }
    if(contact)for(const [n,caster] of contact){
      if(Number.isFinite(depth[n])&&caster-depth[n]>.012&&caster-depth[n]<.14){
        for(let ch=0;ch<3;ch++)out[n*4+ch]*=.83;
      }
    }
  }
  return out;
}
