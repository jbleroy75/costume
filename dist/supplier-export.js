// The production dossier sent to the garment supplier for one order.
//
// It is written for the factory, not for the client: in English, with the supplier's own option names
// (the `original` wording of its catalogue), its codes, its fabric reference, and the measurements in a
// fixed order. Client contact details never appear in it. One function builds the data; three others
// print it as plain text (e-mail body), CSV (spreadsheet) and a self-contained printable page.
import {GROUPS,CATEGORIES,getOption,normalizeTailoring} from './catalog.js';
import {getSupplierFabric} from './supplier-fabric-data.js';
import {LOCATIONS} from './embroidery.js';

const SECTION={coat:'JACKET',trousers:'TROUSERS',vest:'VEST',finish:'FINISHING'};
const ITEM={
  coatFront:'Front / closure',coatLapel:'Lapel shape',lapelWidth:'Lapel width',buttonholePosition:'Lapel buttonhole',
  buttonholeStyle:'Buttonhole style',coatPockets:'Pockets',sleeveDesign:'Sleeve cuff',sleeveAlignment:'Sleeve button alignment',
  sleeveSpacing:'Sleeve button spacing',coatVents:'Back vents',lining:'Lining',catalogButtons:'Buttons',
  suspenderButtons:'Suspender buttons',waistGrip:'Waistband grip tape',waistAdjustment:'Waist adjustment',
  waistExtension:'Waistband extension',trouserBackPockets:'Back pockets',trouserPleats:'Pleats',trouserFrontPockets:'Front pockets',
  vestFront:'Front / hem',vestCollar:'Collar / lapel',vestPockets:'Pockets',vestBack:'Back fabric',vestBelt:'Back belt'
};
const ORDER={
  coat:['coatFront','coatLapel','lapelWidth','buttonholePosition','buttonholeStyle','coatPockets','sleeveDesign','sleeveAlignment','sleeveSpacing','coatVents'],
  trousers:['trouserPleats','trouserFrontPockets','trouserBackPockets','waistAdjustment','waistExtension','suspenderButtons','waistGrip'],
  vest:['vestFront','vestCollar','vestPockets','vestBack','vestBelt'],
  finish:['lining','catalogButtons']
};
const MEASURE=[
  ['stature','Height','cm'],['poids','Weight','kg'],['poitrine','Chest circumference','cm'],['taille','Waist circumference (natural waist)','cm'],
  ['bassin','Hip circumference (fullest part)','cm'],['epaules','Shoulder width (across back, point to point)','cm'],
  ['manche','Sleeve length (shoulder point to wrist)','cm'],['dos','Back length (nape to natural waist)','cm'],['entrejambe','Inseam (crotch to hem)','cm']
];
const PLACE={'jacket-left':'Jacket, inside left (above inner pocket)','jacket-right':'Jacket, inside right (above inner pocket)',
  'jacket-neck':'Jacket, inside, under the collar','trouser-waist':'Trousers, inside waistband, centre back','vest-left':'Vest, inside left'};
const PREVIEW_BUTTONS={horn:'Brown horn',dark:'Black horn',black:'Black',metal:'Metal'};
const BASIC={color:{navy:'Navy',charcoal:'Charcoal',black:'Black',gray:'Pearl grey',taupe:'Taupe',sand:'Sand',cream:'Ecru',brown:'Chocolate brown',olive:'Olive green',burgundy:'Burgundy'},
  fabric:{worsted:'Worsted wool',flannel:'Flannel',linen:'Linen',twill:'Twill'},
  pattern:{solid:'Solid',pinstripe:'Pinstripe',windowpane:'Windowpane check',glen:'Glen check',herringbone:'Herringbone'}};

// order: {id, created, customerName, config}; origin: site address, for absolute picture links.
export function supplierDossier(order,{origin='',key=''}={}){
  const config=order.config||{},choices=normalizeTailoring(config.tailoring,config),fabric=getSupplierFabric(config.supplierFabric);
  const pieces=choices.vestEnabled?['Jacket','Trousers','Vest']:['Jacket','Trousers'];
  const sections=[];
  for(const category of CATEGORIES){
    if(category.id==='vest'&&!choices.vestEnabled)continue;
    const lines=[];
    for(const id of ORDER[category.id]){
      const group=GROUPS.find(g=>g.id===id),option=group&&getOption(id,choices[id]);if(!option)continue;
      let choice=option.original;
      if(id==='lapelWidth'&&choices[id]==='largeur-personnalisee')choice=choices.lapelCustomWidth?`Custom width: ${choices.lapelCustomWidth} cm`:'Custom width: TO BE CONFIRMED';
      if(id==='catalogButtons'&&choices[id]==='boutons-actuels')choice=PREVIEW_BUTTONS[config.buttons]||'Brown horn';
      lines.push({item:ITEM[id],choice,code:option.code||''});
    }
    if(category.id==='finish'&&choices.liningReference)lines.push({item:'Lining requested by client',choice:choices.liningReference,code:''});
    sections.push({title:SECTION[category.id],lines});
  }
  const embroidery=choices.embroidery.filter(e=>e.enabled&&e.text.trim()&&(e.location!=='vest-left'||choices.vestEnabled)).map(e=>({
    place:PLACE[e.location]||LOCATIONS.find(l=>l.id===e.location)?.label||e.location,text:e.text.trim(),
    font:getOption('monogramFont',e.font)?.original||e.font,thread:e.color.toUpperCase()
  }));
  const measurements=MEASURE.filter(([k])=>choices.measurements[k]).map(([k,label,unit])=>({key:k,label,value:choices.measurements[k],unit}));
  return {
    reference:order.id,date:(order.created||'').slice(0,10),client:order.customerName||'',pieces,
    fabric:fabric?{known:true,supplier:fabric.supplier,reference:fabric.reference,collection:fabric.collection,pattern:fabric.pattern,
        composition:fabric.compositionCode,weight:fabric.weightValue?`${fabric.weightValue} ${fabric.weightUnit}`:'',image:origin+String(fabric.image).replace(/^\./,'')}
      :{known:false,description:[BASIC.color[config.color],BASIC.fabric[config.fabric],BASIC.pattern[config.pattern]].filter(Boolean).join(' / ')},
    sections,embroidery,measurements,missing:MEASURE.filter(([k])=>k!=='poids'&&!choices.measurements[k]).map(([,label])=>label),
    notes:choices.customNotes||'',
    preview:order.preview?`${origin}/api/supplier-order/${order.id}/preview.jpg?k=${key}`:'',
    link:key?`${origin}/commande?id=${order.id}&k=${key}`:''
  };
}

const fabricLine=f=>f.known?`${f.supplier} ${f.reference} (collection ${f.collection}${f.composition?', '+f.composition:''}${f.weight?', '+f.weight:''})`:`NOT A SUPPLIER REFERENCE - to be confirmed: ${f.description}`;

// Plain text, for the body of an e-mail.
export function dossierText(d){
  const out=[`ORDER ${d.reference} - ${d.pieces.length}-piece suit (${d.pieces.join(' + ')})`,`Date: ${d.date}`,`Client name (label): ${d.client}`,'',`FABRIC: ${fabricLine(d.fabric)}`,''];
  for(const s of d.sections){out.push(s.title);for(const l of s.lines)out.push(`- ${l.item}: ${l.choice}${l.code?' ['+l.code+']':''}`);out.push('');}
  if(d.embroidery.length){out.push('EMBROIDERY');for(const e of d.embroidery)out.push(`- ${e.place}: "${e.text}" - ${e.font} - thread ${e.thread}`);out.push('');}
  out.push('BODY MEASUREMENTS (taken on the body over a light shirt, not garment measurements)');
  for(const m of d.measurements)out.push(`- ${m.label}: ${m.value} ${m.unit}`);
  if(d.missing.length)out.push(`- MISSING: ${d.missing.join('; ')}`);
  if(d.notes)out.push('','CLIENT NOTE (French, as written)',d.notes);
  if(d.link)out.push('','Full order sheet with pictures:',d.link);
  return out.join('\n');
}

const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
// CSV with a byte-order mark, so that a spreadsheet opens it with the right characters.
export function dossierCsv(d){
  const rows=[['order','section','item','choice','code']];
  const add=(section,item,choice,code='')=>rows.push([d.reference,section,item,choice,code]);
  add('ORDER','Date',d.date);add('ORDER','Client name (label)',d.client);add('ORDER','Pieces',d.pieces.join(' + '));
  if(d.fabric.known){add('FABRIC','Supplier',d.fabric.supplier);add('FABRIC','Reference',d.fabric.reference,d.fabric.reference);add('FABRIC','Collection',d.fabric.collection);add('FABRIC','Composition',d.fabric.composition);add('FABRIC','Weight',d.fabric.weight);}
  else add('FABRIC','To be confirmed (not a supplier reference)',d.fabric.description);
  for(const s of d.sections)for(const l of s.lines)add(s.title,l.item,l.choice,l.code);
  for(const e of d.embroidery)add('EMBROIDERY',e.place,`${e.text} | ${e.font} | thread ${e.thread}`);
  for(const m of d.measurements)add('BODY MEASUREMENTS',m.label,`${m.value} ${m.unit}`);
  for(const label of d.missing)add('BODY MEASUREMENTS',label,'MISSING');
  if(d.notes)add('NOTE','Client note (French)',d.notes);
  return '﻿'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}

const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// One printable page (A4). `pictures` may replace the picture addresses by embedded data, so that the
// downloaded file works without the site.
export function dossierHtml(d,pictures={}){
  const preview=pictures.preview||d.preview,swatch=pictures.swatch||(d.fabric.known?d.fabric.image:'');
  const table=(title,rows)=>rows.length?`<section><h2>${esc(title)}</h2><table>${rows.map(r=>`<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td><td class="code">${esc(r[2]||'')}</td></tr>`).join('')}</table></section>`:'';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Order ${esc(d.reference)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#16191d;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 20px 48px}header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 24px;align-items:baseline;border-bottom:2px solid #16191d;padding-bottom:10px}
h1{font-size:24px;margin:0;letter-spacing:.01em}header p{margin:0;color:#4a5058}
.top{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:20px;margin-top:18px;align-items:start}.top img{width:100%;height:auto;border:1px solid #c9cdd2;display:block}
.fabric{border:1px solid #16191d;padding:12px 14px;display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;align-items:center}.fabric img{width:96px;height:96px;object-fit:cover}
.fabric strong{font-size:20px;display:block}.warn{color:#8a1f11;font-weight:600}
h2{font-size:12px;letter-spacing:.12em;margin:22px 0 6px;color:#4a5058}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #d9dce0;vertical-align:top}th{width:38%;font-weight:500;color:#4a5058}td{font-weight:600}td.code{width:90px;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:500;text-align:right}
.note{white-space:pre-wrap;border-left:3px solid #16191d;padding:6px 12px;margin:6px 0 0}
@media (max-width:560px){.top{grid-template-columns:1fr}.top>img{max-width:220px}th{width:46%}}
@media print{main{padding:0}section{break-inside:avoid}}
</style></head><body><main>
<header><h1>Order ${esc(d.reference)}</h1><p>${esc(d.date)} · ${d.pieces.length}-piece suit: ${esc(d.pieces.join(' + '))} · Client name (label): ${esc(d.client)}</p></header>
<div class="top"><div>
<h2>FABRIC</h2><div class="fabric">${swatch?`<img src="${esc(swatch)}" alt="Fabric swatch">`:'<span></span>'}<div>${d.fabric.known?`<strong>${esc(d.fabric.supplier)} ${esc(d.fabric.reference)}</strong>Collection ${esc(d.fabric.collection)}${d.fabric.composition?' · '+esc(d.fabric.composition):''}${d.fabric.weight?' · '+esc(d.fabric.weight):''}`:`<strong class="warn">Fabric to be confirmed</strong>Not a supplier reference: ${esc(d.fabric.description)}`}</div></div>
${table('BODY MEASUREMENTS — taken on the body over a light shirt, not garment measurements',[...d.measurements.map(m=>[m.label,`${m.value} ${m.unit}`]),...d.missing.map(l=>[l,'MISSING'])])}
</div>${preview?`<img src="${esc(preview)}" alt="Preview of the suit">`:''}</div>
${d.sections.map(s=>table(s.title,s.lines.map(l=>[l.item,l.choice,l.code]))).join('')}
${table('EMBROIDERY',d.embroidery.map(e=>[e.place,`“${e.text}” — ${e.font} — thread ${e.thread}`]))}
${d.notes?`<section><h2>CLIENT NOTE (French, as written)</h2><p class="note">${esc(d.notes)}</p></section>`:''}
</main></body></html>`;
}

// Short e-mail to the supplier: the essentials and the link to the full sheet.
export function dossierMail(d,{supplierName=''}={}){
  const subject=`Order ${d.reference} - ${d.pieces.length}-piece suit - fabric ${d.fabric.known?d.fabric.supplier+' '+d.fabric.reference:'to be confirmed'}`;
  const body=[`Hello${supplierName?' '+supplierName:''},`,'','Please find a new made-to-measure order below.','',dossierText(d),'','Could you confirm receipt and the delivery date?','','Best regards,'].join('\n');
  return {subject,body};
}
