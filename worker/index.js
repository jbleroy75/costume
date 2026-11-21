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

// --- administration: Cloudflare Access ---------------------------------------------------------------
// /admin* and /api/admin* sit behind Cloudflare Access, which signs each request with a JWT. The Worker
// checks that signature itself, so the workers.dev address and any direct call are refused as well.
let accessKeys={at:0,keys:[]};
const b64url=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function accessEmail(request,env){
  const token=request.headers.get('cf-access-jwt-assertion');
  if(!token||!env.ACCESS_TEAM||!env.ACCESS_AUD)return null;
  try{
    const [h,p,sig]=token.split('.'),header=JSON.parse(new TextDecoder().decode(b64url(h))),claims=JSON.parse(new TextDecoder().decode(b64url(p)));
    if(header.alg!=='RS256'||claims.iss!=='https://'+env.ACCESS_TEAM||!(claims.exp*1000>Date.now())||![].concat(claims.aud).includes(env.ACCESS_AUD))return null;
    if(Date.now()-accessKeys.at>3600e3||!accessKeys.keys.some(k=>k.kid===header.kid)){
      const res=await fetch('https://'+env.ACCESS_TEAM+'/cdn-cgi/access/certs');
      accessKeys={at:Date.now(),keys:(await res.json()).keys};
    }
    const jwk=accessKeys.keys.find(k=>k.kid===header.kid);if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64url(sig),new TextEncoder().encode(h+'.'+p));
    return ok&&typeof claims.email==='string'?claims.email.toLowerCase():null;
  }catch{return null;}
}

// --- orders ----------------------------------------------------------------------------------------------
// An order is one JSON object in R2 (orders/<id>): the client's contact details, the full configuration
// and a secret key for the supplier's link. Its preview picture is stored beside it.
const ORDERS='orders/',PREVIEWS='order-previews/',SETTINGS='settings/supplier';
const text=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim().slice(0,max):'';
const random=(n,alphabet)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>alphabet[b%alphabet.length]).join('');
const summary=order=>({id:order.id,created:order.created,name:order.customer.name,status:order.status});
const STATUSES=['nouvelle','envoyee','en-fabrication','livree','annulee'];
async function createOrder(request,env,url){
  if(request.headers.get('origin')!==url.origin)return reply({error:'Requête non autorisée.'},403);
  if(Number(request.headers.get('content-length'))>600000)return reply({error:'Commande trop volumineuse.'},413);
  let body;try{body=await request.json();}catch{return reply({error:'Commande illisible.'},400);}
  if(body?.website)return reply({created:true,id:'C000000-0000'},201); // honeypot: a robot filled the hidden field
  const customer={name:text(body?.customer?.name,80),email:text(body?.customer?.email,120),phone:text(body?.customer?.phone,30),note:text(body?.customer?.note,1000)};
  if(customer.name.length<2||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email))return reply({error:'Indiquez votre nom et une adresse e-mail valide.'},400);
  const config=body?.config;
  if(!config||typeof config!=='object'||Array.isArray(config)||JSON.stringify(config).length>60000)return reply({error:'Composition invalide.'},400);
  const now=new Date(),id='C'+now.toISOString().slice(2,10).replace(/-/g,'')+'-'+random(4,'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  const order={id,created:now.toISOString(),status:'nouvelle',key:random(32,'0123456789abcdef'),customer,config,note:'',history:[]};
  const picture=typeof body.preview==='string'&&body.preview.startsWith('data:image/jpeg;base64,')?body.preview.slice(23):null;
  if(picture&&picture.length<500000){
    try{const bytes=Uint8Array.from(atob(picture),c=>c.charCodeAt(0));if(bytes[0]===255&&bytes[1]===216){await env.BUCKET.put(PREVIEWS+id,bytes);order.preview=true;}}catch{}
  }
  await env.BUCKET.put(ORDERS+id,JSON.stringify(order),{customMetadata:{summary:JSON.stringify(summary(order))}});
  return reply({created:true,id},201);
}
const readOrder=async(env,id)=>{const obj=await env.BUCKET.get(ORDERS+id);return obj?obj.json():null;};
const ORDER_ID=/^C\d{6}-[A-Z2-9]{4}$/;
// What the supplier may see: the order without the client's contact details.
const forSupplier=order=>({id:order.id,created:order.created,customerName:order.customer.name,config:order.config,preview:Boolean(order.preview)});
async function adminOrders(request,env,url,path,email){
  const write=request.method==='POST'||request.method==='PUT';
  if(write&&request.headers.get('origin')!==url.origin)return reply({error:'Requête non autorisée.'},403);
  if(path==='/api/admin/session')return reply({admin:true,email});
  if(path==='/api/admin/settings'){
    if(request.method==='GET'){const obj=await env.BUCKET.get(SETTINGS);return reply(obj?await obj.json():{supplierName:'',supplierEmail:''});}
    if(request.method!=='PUT')return reply({error:'Méthode non autorisée.'},405);
    const body=await request.json().catch(()=>({})),settings={supplierName:text(body.supplierName,80),supplierEmail:text(body.supplierEmail,120)};
    if(settings.supplierEmail&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(settings.supplierEmail))return reply({error:'Adresse e-mail invalide.'},400);
    await env.BUCKET.put(SETTINGS,JSON.stringify(settings));return reply(settings);
  }
  if(path==='/api/admin/orders'&&request.method==='GET'){
    const page=await env.BUCKET.list({prefix:ORDERS,limit:500,include:['customMetadata']});
    const rows=page.objects.map(o=>JSON.parse(o.customMetadata.summary)).sort((a,b)=>b.created.localeCompare(a.created));
    return reply({orders:rows});
  }
  const one=path.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if(one&&ORDER_ID.test(one[1])){
    const order=await readOrder(env,one[1]);if(!order)return reply({error:'Commande introuvable.'},404);
    if(request.method==='GET')return reply(order);
    if(request.method!=='POST')return reply({error:'Méthode non autorisée.'},405);
    const body=await request.json().catch(()=>({}));
    if(STATUSES.includes(body.status)&&body.status!==order.status){order.history.push({at:new Date().toISOString(),by:email,status:body.status});order.status=body.status;}
    if(typeof body.note==='string')order.note=text(body.note,2000);
    await env.BUCKET.put(ORDERS+order.id,JSON.stringify(order),{customMetadata:{summary:JSON.stringify(summary(order))}});
    return reply(order);
  }
  return reply({error:'Introuvable.'},404);
}
export default {async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/orders'&&request.method==='POST')return createOrder(request,env,url);
  // the supplier's link: order id and its secret key, no login
  const shared=path.match(/^\/api\/supplier-order\/([^/]+)(\/preview\.jpg)?$/);
  if(shared&&request.method==='GET'){
    const order=ORDER_ID.test(shared[1])?await readOrder(env,shared[1]):null,key=url.searchParams.get('k')||'';
    const email=order&&key!==order.key?await accessEmail(request,env):null;
    if(!order||(key!==order.key&&!email))return reply({error:'Lien invalide.'},404);
    if(!shared[2])return reply(forSupplier(order));
    const picture=order.preview?await env.BUCKET.get(PREVIEWS+order.id):null;
    return picture?new Response(picture.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}}):new Response(null,{status:404});
  }
  if(path.startsWith('/api/admin/')&&path!=='/api/admin/cloth'){
    const email=await accessEmail(request,env);
    if(!email)return reply({error:'Accès réservé au propriétaire.'},403);
    return adminOrders(request,env,url,path,email);
  }
  if(path==='/api/cloth'&&request.method==='GET'){
    const page=await env.BUCKET.list({prefix,limit:300,cursor:url.searchParams.get('cursor')||undefined,include:['customMetadata']});
    return reply({rows:page.objects.map(o=>JSON.parse(o.customMetadata.row)),cursor:page.truncated?page.cursor:null});
  }
  if(path==='/api/admin/cloth'){
    if(!await accessEmail(request,env))return reply({error:'Accès réservé au propriétaire.'},403);
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
