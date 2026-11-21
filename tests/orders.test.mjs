import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {supplierDossier,dossierText,dossierCsv,dossierHtml,dossierMail} from '../dist/supplier-export.js';

// --- a bucket in memory and an Access login signed with a throwaway key ------------------------------
const store=new Map();
const bucket={
  async put(key,value,options={}){
    if(options.onlyIf&&store.has(key))return null;
    const body=typeof value==='string'?new TextEncoder().encode(value):value instanceof Uint8Array?value:new Uint8Array(await new Response(value).arrayBuffer());
    store.set(key,{body,customMetadata:options.customMetadata||{}});return {key};
  },
  async get(key){const o=store.get(key);return o?{body:o.body,json:async()=>JSON.parse(new TextDecoder().decode(o.body)),customMetadata:o.customMetadata,size:o.body.length}:null;},
  async head(key){const o=store.get(key);return o?{customMetadata:o.customMetadata,size:o.body.length}:null;},
  async list({prefix}){return {objects:[...store].filter(([k])=>k.startsWith(prefix)).map(([key,o])=>({key,customMetadata:o.customMetadata})),truncated:false};}
};
const env={BUCKET:bucket,ASSETS:{fetch:async()=>new Response('asset')},ACCESS_TEAM:'team.example',ACCESS_AUD:'aud-1'};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'k1'};
const realFetch=globalThis.fetch;
globalThis.fetch=async url=>String(url)==='https://team.example/cdn-cgi/access/certs'?Response.json({keys:[jwk]}):realFetch(url);
const b64=v=>Buffer.from(v).toString('base64url');
async function login(claims={}){
  const head=b64(JSON.stringify({alg:'RS256',kid:'k1'})),body=b64(JSON.stringify({iss:'https://team.example',aud:['aud-1'],exp:Math.floor(Date.now()/1000)+600,email:'Owner@Example.com',...claims}));
  return head+'.'+body+'.'+b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(head+'.'+body))));
}
const site='https://costume.example';
const call=(path,{method='GET',body,headers={}}={})=>worker.fetch(new Request(site+path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers}}),env);

const config={color:'navy',fabric:'worsted',pattern:'solid',closure:'single',lapel:'notch',buttons:'horn',supplierFabric:'18061-233',
  tailoring:{vestEnabled:true,measurements:{stature:178,poids:80,poitrine:104,taille:90,bassin:101,epaules:46,manche:60,dos:48,entrejambe:82},
    embroidery:[{location:'jacket-left',enabled:true,text:'J. Dupont',font:'police-1',color:'#ddc8a2'}],liningReference:'paisley bordeaux',customNotes:'Manches un peu courtes'}};
const customer={name:'Jean Dupont',email:'jean@example.com',phone:'06 00 00 00 00',note:'Pour un mariage en juin'};

// --- placing an order ----------------------------------------------------------------------------------
assert.equal((await call('/api/orders',{method:'POST',body:{customer,config}})).status,403,'another site cannot post an order');
assert.equal((await call('/api/orders',{method:'POST',body:{customer:{...customer,email:'nope'},config},headers:{origin:site}})).status,400);
assert.equal((await call('/api/orders',{method:'POST',body:{customer,config:'x'},headers:{origin:site}})).status,400);
const trapped=await call('/api/orders',{method:'POST',body:{customer,config,website:'http://spam'},headers:{origin:site}});
assert.equal(trapped.status,201);assert.equal(store.size,0,'a robot that fills the hidden field stores nothing');
const preview='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,1,2,3]).toString('base64');
const placed=await call('/api/orders',{method:'POST',body:{customer,config,preview},headers:{origin:site}});
assert.equal(placed.status,201);const {id}=await placed.json();assert.match(id,/^C\d{6}-[A-Z2-9]{4}$/);

// --- the owner's desk --------------------------------------------------------------------------------------
assert.equal((await call('/api/admin/orders')).status,403,'no login');
assert.equal((await call('/api/admin/orders',{headers:{'cf-access-jwt-assertion':await login({aud:['other']})}})).status,403,'a login for another application');
assert.equal((await call('/api/admin/orders',{headers:{'cf-access-jwt-assertion':await login({exp:1})}})).status,403,'an expired login');
assert.equal((await call('/api/admin/orders',{headers:{'cf-access-jwt-assertion':(await login()).slice(0,-6)+'AAAAAA'}})).status,403,'a forged signature');
assert.equal((await call('/api/admin/cloth')).status,403,'fabric import is behind the same login');
const auth={'cf-access-jwt-assertion':await login()};
assert.deepEqual(await (await call('/api/admin/session',{headers:auth})).json(),{admin:true,email:'owner@example.com'});
const listed=(await (await call('/api/admin/orders',{headers:auth})).json()).orders;
assert.equal(listed.length,1);assert.deepEqual(Object.keys(listed[0]).sort(),['created','id','name','status']);
const order=await (await call('/api/admin/orders/'+id,{headers:auth})).json();
assert.equal(order.customer.email,'jean@example.com');assert.equal(order.status,'nouvelle');assert.match(order.key,/^[0-9a-f]{32}$/);
assert.equal((await call('/api/admin/orders/'+id,{method:'POST',body:{status:'envoyee'},headers:auth})).status,403,'writes need the site as origin');
const moved=await (await call('/api/admin/orders/'+id,{method:'POST',body:{status:'envoyee',note:'Envoyé lundi'},headers:{...auth,origin:site}})).json();
assert.equal(moved.status,'envoyee');assert.equal(moved.history.length,1);assert.equal(moved.note,'Envoyé lundi');
assert.equal((await call('/api/admin/settings',{method:'PUT',body:{supplierEmail:'pas une adresse'},headers:{...auth,origin:site}})).status,400);
await call('/api/admin/settings',{method:'PUT',body:{supplierName:'Mr Chen',supplierEmail:'orders@supplier.example'},headers:{...auth,origin:site}});
assert.equal((await (await call('/api/admin/settings',{headers:auth})).json()).supplierEmail,'orders@supplier.example');

// --- the supplier's link -----------------------------------------------------------------------------------
assert.equal((await call('/api/supplier-order/'+id)).status,404,'no key');
assert.equal((await call('/api/supplier-order/'+id+'?k='+'0'.repeat(32))).status,404,'wrong key');
const sharedResponse=await call('/api/supplier-order/'+id+'?k='+order.key);assert.equal(sharedResponse.status,200);
const shared=await sharedResponse.json(),leaked=JSON.stringify(shared);
assert.ok(!leaked.includes('jean@example.com')&&!leaked.includes('06 00')&&!leaked.includes('mariage')&&!leaked.includes(order.key),'the supplier never receives the contact details');
assert.equal((await call('/api/supplier-order/'+id+'/preview.jpg?k='+order.key)).headers.get('content-type'),'image/jpeg');

// --- the dossier itself ---------------------------------------------------------------------------------------
const dossier=supplierDossier(shared,{origin:site,key:order.key}),text=dossierText(dossier);
assert.deepEqual(dossier.pieces,['Jacket','Trousers','Vest']);
for(const expected of ['EUNZ 18061-233','Single-Breasted 2-Button','Notched Lapel','Side vents','Besom + 2 Buttons','"J. Dupont"','Height: 178 cm','Weight: 80 kg','Inseam (crotch to hem): 82 cm','paisley bordeaux','Manches un peu courtes',`${site}/commande?id=${id}&k=${order.key}`])
  assert.ok(text.includes(expected),'text mentions '+expected);
assert.ok(!/[éèàç]/.test(text.replace('Manches un peu courtes','')),'the dossier is in English apart from the client note');
assert.deepEqual(dossier.missing,[]);
const csv=dossierCsv(dossier);assert.ok(csv.startsWith('﻿"order","section","item","choice","code"'));assert.ok(csv.includes(`"${id}","JACKET","Lapel shape","Notched Lapel",""`));
const html=dossierHtml(dossier,{preview:'data:image/jpeg;base64,AAAA'});assert.ok(html.includes('src="data:image/jpeg;base64,AAAA"')&&html.includes('Order '+id));
assert.ok(dossierHtml(supplierDossier({...shared,config:{...config,tailoring:{...config.tailoring,customNotes:'<script>x</script>'}}})).includes('&lt;script&gt;'),'client text is escaped');
const mail=dossierMail(dossier,{supplierName:'Mr Chen'});assert.ok(mail.subject.includes(id)&&mail.body.startsWith('Hello Mr Chen,'));
// two pieces, a cloth outside the supplier's range, missing measurements, vest embroidery dropped
const bare=supplierDossier({id:'C261121-ZZZZ',created:'2026-11-21T00:00:00Z',customerName:'A B',config:{color:'sand',fabric:'linen',pattern:'solid',tailoring:{embroidery:[{location:'vest-left',enabled:true,text:'X',font:'police-1',color:'#000000'}]}}});
assert.deepEqual(bare.pieces,['Jacket','Trousers']);assert.equal(bare.fabric.known,false);assert.equal(bare.missing.length,8);assert.equal(bare.embroidery.length,0);
assert.ok(dossierText(bare).includes('NOT A SUPPLIER REFERENCE')&&dossierText(bare).includes('Sand / Linen / Solid'));
console.log('orders: order placed, owner desk protected, supplier link and dossier checked');
