const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const prefix='cloth/';
const patterns={solid:'Uni',pinstripe:'Rayures',windowpane:'Carreaux',other:'Autre motif'};
const code=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const field=(data,key)=>String(data.get(key)||'').trim();
async function save(request,bucket){
  if(Number(request.headers.get('content-length'))>1500000)return reply({error:'Import trop volumineux.'},413);
  const data=await request.formData();
  const supplier=field(data,'supplier'),reference=field(data,'reference'),collection=field(data,'collection');
  const id='import-'+code(supplier)+'_'+code(reference),pattern=field(data,'pattern'),family=field(data,'family');
  const rgb=field(data,'rgb').split(',').map(Number),hash=field(data,'hash');
  if(![supplier,reference,collection].every(s=>code(s)&&s.length<=60)||!Object.hasOwn(patterns,pattern)||!family||family.length>40||rgb.length!==3||!rgb.every(n=>Number.isInteger(n)&&n>=0&&n<=255)||!/^[a-f0-9]{64}$/.test(hash))return reply({error:'Fiche de tissu invalide.'},400);
  const jpg=data.get('preview'),tile=data.get('tile');
  if(!jpg?.size||!tile?.size||jpg.size+tile.size>1400000)return reply({error:'Images invalides.'},400);
  const photo=new Uint8Array(await jpg.arrayBuffer()),weave=new Uint8Array(await tile.arrayBuffer());
  if(photo[0]!==255||photo[1]!==216||String.fromCharCode(...weave.slice(8,12))!=='WEBP')return reply({error:'Format de texture invalide.'},400);
  const stem='/api/cloth/'+id+'/'+code(family)+'-'+pattern;
  const row={id,supplier,reference,collection,pattern,patternLabel:patterns[pattern],colorFamily:family,colorName:family,baseRGB:rgb,stripeRGB:rgb,image:stem+'.jpg',texture:stem+'-weave.webp',compositionCode:'Non renseignée',weightValue:null,weightUnit:null,scaleMillimeters:null,sourceName:field(data,'sourceName').slice(0,120),imageSha256:hash};
  const key=prefix+id;
  const stored=await bucket.put(key,new Blob([photo,weave]),{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{row:JSON.stringify(row),split:String(photo.length)}});
  if(!stored){
    const previous=await bucket.head(key);
    const same=previous&&JSON.parse(previous.customMetadata.row).imageSha256===hash;
    return reply(same?{existing:true,id}:{error:'Cette référence correspond déjà à une autre photo.'},same?200:409);
  }
  return reply({created:true,id},201);
}
export default {async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/cloth'&&request.method==='GET'){
    const page=await env.BUCKET.list({prefix,limit:300,cursor:url.searchParams.get('cursor')||undefined,include:['customMetadata']});
    return reply({rows:page.objects.map(o=>JSON.parse(o.customMetadata.row)),cursor:page.truncated?page.cursor:null});
  }
  if(path==='/api/admin/cloth'){
    const email=request.headers.get('oai-authenticated-user-email')?.toLowerCase();
    if(!email||email!==env.FABRIC_ADMIN_EMAIL?.toLowerCase())return reply({error:'Accès réservé au propriétaire.'},403);
    if(request.method==='GET')return reply({admin:true});
    if(request.method!=='POST'||request.headers.get('origin')!==url.origin)return reply({error:'Requête non autorisée.'},403);
    return save(request,env.BUCKET);
  }
  const asset=path.match(/^\/api\/cloth\/(import-[a-z0-9-]+_[a-z0-9-]+)\/([a-z0-9-]+\.(?:jpg|webp))$/);
  if(asset&&request.method==='GET'){
    const key=prefix+asset[1],meta=await env.BUCKET.head(key);
    if(!meta)return new Response(null,{status:404});
    const row=JSON.parse(meta.customMetadata.row),tile=path===row.texture;
    if(!tile&&path!==row.image)return new Response(null,{status:404});
    const split=Number(meta.customMetadata.split),range=tile?{offset:split,length:meta.size-split}:{offset:0,length:split};
    const obj=await env.BUCKET.get(key,{range});
    return new Response(obj.body,{headers:{'Content-Type':tile?'image/webp':'image/jpeg','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'}});
  }
  return env.ASSETS.fetch(request);
}};
