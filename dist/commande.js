// The supplier's view of one order, opened from the link in the e-mail (order id + secret key).
import {supplierDossier,dossierHtml} from './supplier-export.js';
const query=new URLSearchParams(location.search),id=query.get('id')||'',key=query.get('k')||'',status=document.getElementById('status');
try{
  const res=await fetch(`/api/supplier-order/${encodeURIComponent(id)}?k=${encodeURIComponent(key)}`);
  if(!res.ok)throw new Error('link');
  const dossier=supplierDossier(await res.json(),{origin:location.origin,key});
  const page=new DOMParser().parseFromString(dossierHtml(dossier),'text/html');
  document.title='Order '+dossier.reference;
  document.head.append(...page.head.querySelectorAll('style'));
  document.getElementById('sheet').append(...page.body.childNodes);
  document.getElementById('ref').textContent='Order '+dossier.reference;
  document.getElementById('bar').hidden=false;status.hidden=true;
  document.getElementById('print').addEventListener('click',()=>print());
}catch{status.textContent='This link is not valid any more. Please ask for a new one.';}
