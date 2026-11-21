// Owner's order desk: the list of orders, each client's details, and the supplier dossier ready to send.
import {supplierDossier,dossierText,dossierCsv,dossierHtml,dossierMail} from './supplier-export.js';
import {configurationRows} from './catalog.js';
import {checkMeasurements,describeAlert} from './measure-check.js';
import {measurements} from './measurements.js';
const $=id=>document.getElementById(id),status=$('status');
const STATUS={nouvelle:'Nouvelle','envoyee':'Envoyée au fournisseur','en-fabrication':'En fabrication',livree:'Livrée',annulee:'Annulée'};
const api=async(path,options)=>{const res=await fetch('/api/admin/'+path,options);if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||'Erreur '+res.status);return res.json();};
const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
const day=iso=>new Date(iso).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
let settings={supplierName:'',supplierEmail:''},current=null;

function save(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type})),link=el('a',{href:url,download:name});
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
const dataUrl=async src=>{
  try{const blob=await (await fetch(src)).blob();return await new Promise(done=>{const reader=new FileReader();reader.onload=()=>done(reader.result);reader.readAsDataURL(blob);});}
  catch{return '';}
};
async function copy(text,button){
  try{await navigator.clipboard.writeText(text);}catch{const area=el('textarea',{value:text});document.body.append(area);area.select();document.execCommand('copy');area.remove();}
  const label=button.textContent;button.textContent='Copié';setTimeout(()=>{button.textContent=label;},1600);
}

async function show(id){
  const order=current=await api('orders/'+id),box=$('order');
  for(const row of document.querySelectorAll('.order-row'))row.setAttribute('aria-current',String(row.dataset.id===id));
  const dossier=supplierDossier({id:order.id,created:order.created,customerName:order.customer.name,config:order.config,preview:order.preview},{origin:location.origin,key:order.key});
  const mail=dossierMail(dossier,settings);
  const labels=Object.fromEntries(measurements.map(([key,label])=>[key,label]));
  const alerts=checkMeasurements(order.config.tailoring?.measurements).alerts;
  const missing=dossier.missing.length?[`Mesures manquantes : ${dossier.missing.length} sur 8. À demander au client avant d’envoyer.`]:[];
  const fabric=dossier.fabric.known?[]:['Le client n’a pas choisi un tissu du fournisseur : référence à confirmer avec lui.'];
  const problems=[...fabric,...missing,...alerts.map(a=>`${labels[a.key]} (${order.config.tailoring.measurements[a.key]}) : ${describeAlert(a)}`)];
  const statusSelect=el('select',{id:'order-status'},...Object.entries(STATUS).map(([value,label])=>el('option',{value,textContent:label,selected:value===order.status})));
  const note=el('textarea',{id:'order-note',rows:3,value:order.note||'',placeholder:'Note interne (non transmise au fournisseur)'});
  const saved=el('span',{role:'status'});
  const frame=el('iframe',{id:'sheet-frame',title:'Dossier fournisseur',srcdoc:dossierHtml(dossier)});
  const mailto='mailto:'+encodeURIComponent(settings.supplierEmail||'')+'?subject='+encodeURIComponent(mail.subject)+'&body='+encodeURIComponent(mail.body);
  const button=(text,run,quiet)=>{const b=el('button',{type:'button',textContent:text,className:quiet?'quiet':''});b.addEventListener('click',()=>run(b));return b;};
  box.replaceChildren(
    el('h2',{textContent:'Commande '+order.id}),el('p',{textContent:`Reçue le ${day(order.created)} · ${dossier.pieces.length} pièces`}),
    el('div',{className:'cols'},
      el('div',{},el('h3',{textContent:'Client'}),el('dl',{},el('dt',{textContent:'Nom'}),el('dd',{textContent:order.customer.name}),el('dt',{textContent:'E-mail'}),el('dd',{},el('a',{href:'mailto:'+order.customer.email,textContent:order.customer.email})),el('dt',{textContent:'Téléphone'}),el('dd',{textContent:order.customer.phone||'—'}),el('dt',{textContent:'Message'}),el('dd',{textContent:order.customer.note||'—'}))),
      el('div',{},el('h3',{textContent:'Suivi'}),el('label',{textContent:'État '},statusSelect),note,el('div',{className:'actions'},button('Enregistrer le suivi',async()=>{current=await api('orders/'+order.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:statusSelect.value,note:note.value})});saved.textContent='Enregistré.';list();},true),saved)),
      order.preview?el('img',{className:'preview',src:dossier.preview,alt:'Aperçu du costume commandé'}):''
    ),
    el('h3',{textContent:'À vérifier avant l’envoi'}),
    problems.length?el('ul',{className:'alerts'},...problems.map(text=>el('li',{textContent:text}))):el('ul',{className:'alerts ok'},el('li',{textContent:'Rien à signaler : tissu du fournisseur, mesures complètes et cohérentes.'})),
    el('h3',{textContent:'Dossier fournisseur (en anglais, sans les coordonnées du client)'}),
    el('div',{className:'actions'},
      el('a',{href:mailto,textContent:settings.supplierEmail?'Écrire au fournisseur':'Écrire au fournisseur (adresse à renseigner plus haut)'}),
      button('Copier le texte de la commande',b=>copy(dossierText(dossier),b),true),
      button('Copier le lien fournisseur',b=>copy(dossier.link,b),true),
      button('Télécharger la fiche (HTML, à joindre ou imprimer en PDF)',async()=>save(`order-${order.id}.html`,dossierHtml(dossier,{preview:dossier.preview?await dataUrl(dossier.preview):'',swatch:dossier.fabric.known?await dataUrl(dossier.fabric.image):''}),'text/html;charset=utf-8'),true),
      button('Télécharger le tableau (CSV)',()=>save(`order-${order.id}.csv`,dossierCsv(dossier),'text/csv;charset=utf-8'),true)
    ),
    frame,
    el('h3',{textContent:'Composition complète (en français)'}),
    el('dl',{},...configurationRows(order.config).flatMap(row=>[el('dt',{textContent:`${row.category} · ${row.field}`}),el('dd',{textContent:row.value})]))
  );
  box.hidden=false;box.scrollIntoView({behavior:'smooth',block:'start'});
}
async function list(){
  const {orders}=await api('orders'),host=$('orders');
  host.replaceChildren(...orders.map(order=>{
    const row=el('button',{type:'button',className:'order-row'},el('code',{textContent:order.id}),el('span',{textContent:order.name}),el('span',{textContent:day(order.created)}),el('span',{className:'badge',textContent:STATUS[order.status]||order.status}));
    row.dataset.id=order.id;row.lastChild.dataset.status=order.status;row.setAttribute('aria-current',String(current?.id===order.id));
    row.addEventListener('click',()=>show(order.id).catch(error=>{status.hidden=false;status.textContent=error.message;}));
    return row;
  }));
  $('empty').hidden=orders.length>0;
}
try{
  await api('session');settings=await api('settings');
  $('supplier-name').value=settings.supplierName;$('supplier-email').value=settings.supplierEmail;
  $('settings').addEventListener('submit',async event=>{
    event.preventDefault();
    try{settings=await api('settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({supplierName:$('supplier-name').value,supplierEmail:$('supplier-email').value})});$('settings-status').textContent='Enregistré.';if(current)show(current.id);}
    catch(error){$('settings-status').textContent=error.message;}
  });
  await list();status.hidden=true;$('panel').hidden=false;
  const wanted=new URLSearchParams(location.search).get('id');if(wanted)show(wanted);
}catch(error){status.textContent=error.message||'Accès réservé au propriétaire.';}
