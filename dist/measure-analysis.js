// The analysis shown once every measurement is entered.
//
// A figure is drawn from the client's own numbers (stature, shoulders, chest, waist, hips, sleeve, back,
// inseam), in centimetres, over a faint cloud of other builds drawn from the reference population. Each
// measurement is then traced on the figure while a gauge shows where the value sits in the range the
// other measurements predict, and the panel ends on a verdict and an estimated profile. Everything shown
// comes from the plausibility model (measure-check.js); the animation only paces the reveal.
import {KEYS,MODEL,COVARIANCE,predict,checkMeasurements,describeAlert} from './measure-check.js';

const SVG='http://www.w3.org/2000/svg';
const svg=(tag,attrs={})=>{const node=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);return node;};
const f=v=>v.toFixed(1);

// Landmarks of a standing figure, in centimetres from the floor (x across, y up), from the measurements.
export function landmarks(m){
  const H=m.stature,nape=.86*H,shoulderY=nape-.025*H,chestY=nape-.13*H;
  const waistY=Math.min(nape-.2*H,Math.max(.5*H,nape-m.dos)),crotchY=Math.min(waistY-10,m.entrejambe+4),hipY=crotchY+.05*H;
  const round=c=>c/(2*Math.PI);
  return {H,nape,shoulderY,chestY,waistY,crotchY,hipY,head:.062*H,
    shoulder:m.epaules*.49,chest:round(m.poitrine)*1.22,waist:round(m.taille)*1.2,hip:round(m.bassin)*1.13,
    sleeve:m.manche,arm:.0235*H+round(m.poitrine)*.09};
}
// A closed outline through points, rounded at each point.
function smooth(points){
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],n=points.length,start=mid(points[n-1],points[0]);
  let d=`M${f(start[0])} ${f(start[1])}`;
  for(let i=0;i<n;i++){const p=points[i],q=mid(p,points[(i+1)%n]);d+=`Q${f(p[0])} ${f(p[1])} ${f(q[0])} ${f(q[1])}`;}
  return d+'Z';
}
function capsule([x1,y1],[x2,y2],r1,r2){
  const dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy),nx=-dy/l,ny=dx/l;
  return `M${f(x1+nx*r1)} ${f(y1+ny*r1)}L${f(x2+nx*r2)} ${f(y2+ny*r2)}A${f(r2)} ${f(r2)} 0 0 1 ${f(x2-nx*r2)} ${f(y2-ny*r2)}L${f(x1-nx*r1)} ${f(y1-ny*r1)}A${f(r1)} ${f(r1)} 0 0 1 ${f(x1+nx*r1)} ${f(y1+ny*r1)}Z`;
}
const armEnds=(g,side)=>{const a=.11,sx=side*(g.shoulder-1),sy=g.shoulderY-2.5;return [[sx,sy],[sx+side*Math.sin(a)*g.sleeve,sy-Math.cos(a)*g.sleeve]];};
// The whole figure as one path: head, torso and legs, two arms.
export function figurePath(m){
  const g=landmarks(m),knee=g.crotchY*.52,leg=g.hip*.56;
  const right=[[4.6,g.nape+1.5],[g.shoulder*.55,g.nape-.5],[g.shoulder,g.shoulderY],[g.chest+1,g.chestY],[g.waist,g.waistY],[g.hip,g.hipY],
    [g.hip*.93,knee+6],[leg+4.2,knee*.5],[leg+3.4,5],[leg+5.5,0],[leg-4.5,0],[leg-3.6,6],[leg-5,knee],[1.2,g.crotchY-1]];
  const outline=[...right,...right.slice().reverse().map(([x,y])=>[-x,y])];
  const r=g.head,cy=g.H-r,head=`M${f(-r)} ${f(cy)}A${f(r*.84)} ${f(r)} 0 1 1 ${f(r)} ${f(cy)}A${f(r*.84)} ${f(r)} 0 1 1 ${f(-r)} ${f(cy)}Z`;
  return head+smooth(outline)+[1,-1].map(side=>{const [a,b]=armEnds(g,side);return capsule(a,b,g.arm,g.arm*.66);}).join('');
}
// Where each measurement is taken on that figure.
function marks(m){
  const g=landmarks(m),edge=Math.max(g.shoulder,g.hip)+g.sleeve*.13+13,[a,b]=armEnds(g,1),out=g.arm+3.2,leg=g.hip*.56;
  const ring=(y,r)=>['ellipse',{cx:0,cy:f(y),rx:f(r),ry:f(r*.2)}];
  return {
    stature:['path',{d:`M${f(-edge)} 0V${f(g.H)}M${f(-edge-3)} 0h6M${f(-edge-3)} ${f(g.H)}h6`}],
    epaules:['path',{d:`M${f(-g.shoulder)} ${f(g.shoulderY+1)}H${f(g.shoulder)}`}],
    poitrine:ring(g.chestY,g.chest),taille:ring(g.waistY,g.waist),bassin:ring(g.hipY,g.hip),
    manche:['path',{d:`M${f(a[0]+out)} ${f(a[1])}L${f(b[0]+out)} ${f(b[1])}`}],
    dos:['path',{d:`M0 ${f(g.nape)}V${f(g.waistY)}`}],
    entrejambe:['path',{d:`M2.4 ${f(g.crotchY-1.5)}L${f(leg-2.2)} 4`}],
    poids:['path',{d:`M${f(-g.hip-4)} -4H${f(g.hip+4)}`}]
  };
}
// Other builds from the reference population: the model's own distribution, drawn with a fixed seed.
function population(count){
  const n=KEYS.length,L=KEYS.map(()=>new Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=COVARIANCE[i][j];for(let k=0;k<j;k++)s-=L[i][k]*L[j][k];L[i][j]=i===j?Math.sqrt(Math.max(s,1e-9)):s/L[j][j];}
  let seed=4082;const uniform=()=>{seed=(seed*1664525+1013904223)>>>0;return (seed+.5)/4294967296;};
  const normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
  return Array.from({length:count},()=>{const z=KEYS.map(normal),person={};KEYS.forEach((key,i)=>{let v=MODEL.MEAN[key];for(let k=0;k<=i;k++)v+=L[i][k]*z[k];person[key]=v;});return person;});
}
// Reading of the measurements in tailoring terms. Sizes follow the French convention (half the chest,
// half the waist); they are estimates, the suit is cut to the measurements.
export function profile(m){
  const even=v=>2*Math.round(v/4),drop=m.poitrine-m.taille;
  return [`Veste ≈ ${even(m.poitrine)}`,`Pantalon ≈ ${even(m.taille)}`,
    drop>=16?'Carrure athlétique':drop>=7?'Carrure classique':'Carrure droite',
    m.stature<170?'Longueur courte':m.stature>184?'Longueur longue':'Longueur régulière'];
}

const GHOSTS=22,REFERENCE=4082;
export function mountAnalysis(host,labels){
  const box=document.createElement('section');box.className='measure-analysis';box.hidden=true;box.setAttribute('aria-live','polite');
  const figure=svg('svg',{viewBox:'-66 -8 132 222','aria-hidden':'true',class:'analysis-figure'});
  const flip=svg('g',{transform:'translate(0,208) scale(1,-1)'}),cloud=svg('g',{class:'cloud'}),self=svg('path',{class:'self',pathLength:1}),traced=svg('g');
  const scan=svg('rect',{x:-66,y:-8,width:132,height:10,class:'scan'});
  flip.append(cloud,self,traced);figure.append(flip,scan);
  const ghosts=population(GHOSTS).map(person=>{const path=svg('path',{d:figurePath(person),class:'ghost'});cloud.append(path);return path;});
  const side=document.createElement('div');side.className='analysis-side';
  const title=document.createElement('h3');title.textContent='Analyse de vos mesures';
  const stage=document.createElement('p');stage.className='analysis-stage';
  const list=document.createElement('ol');list.className='analysis-list';
  const verdict=document.createElement('p');verdict.className='analysis-verdict';
  const chips=document.createElement('ul');chips.className='analysis-profile';
  side.append(title,stage,list,verdict,chips);box.append(figure,side);host.after(box);
  const rows={};
  for(const key of KEYS){
    const row=document.createElement('li'),name=document.createElement('span'),value=document.createElement('b'),track=document.createElement('i'),dot=document.createElement('u');
    name.textContent=labels[key];track.append(dot);row.append(name,value,track);list.append(row);rows[key]={row,value,dot};
  }
  let signature='',timers=[],frame=0;
  const later=(fn,ms)=>timers.push(setTimeout(fn,ms));
  return function update(values){
    const filled=KEYS.every(key=>Number(values[key])>0);
    if(!filled){box.hidden=true;signature='';return;}
    const numbers=Object.fromEntries(KEYS.map(key=>[key,Number(values[key])])),next=JSON.stringify(numbers);
    if(next===signature)return;
    signature=next;timers.forEach(clearTimeout);timers=[];cancelAnimationFrame(frame);
    const alerts=Object.fromEntries(checkMeasurements(numbers).alerts.map(a=>[a.key,a]));
    const flagged=Object.keys(alerts),sound=Object.fromEntries(Object.entries(numbers).filter(([k])=>!alerts[k]));
    // the figure is drawn from sound values only: a doubtful one is replaced by what the others predict
    const drawn=Object.fromEntries(KEYS.map(key=>[key,alerts[key]?predict(key,sound).mean:numbers[key]]));
    const still=matchMedia('(prefers-reduced-motion: reduce)').matches,t=ms=>still?0:ms;
    box.hidden=false;box.dataset.state='running';verdict.textContent='';chips.replaceChildren();
    self.setAttribute('d',figurePath(drawn));self.setAttribute('class','self');
    const lines=marks(drawn);traced.replaceChildren();
    figure.classList.remove('run');void figure.getBoundingClientRect();figure.classList.add('run');
    ghosts.forEach((ghost,i)=>{ghost.setAttribute('class','ghost');later(()=>ghost.setAttribute('class','ghost seen'),t(40+i*42));});
    // the count runs while the cloud of reference builds appears
    const began=performance.now(),count=now=>{
      const k=still?1:Math.min(1,(now-began)/1300),n=Math.round(REFERENCE*(1-Math.pow(1-k,3)));
      stage.textContent=`Comparaison avec ${n.toLocaleString('fr-FR')} morphologies mesurées…`;
      if(k<1)frame=requestAnimationFrame(count);
    };
    count(began);
    later(()=>self.setAttribute('class','self drawn'),t(950));
    KEYS.forEach((key,n)=>{
      const {row,value,dot}=rows[key],alert=alerts[key],[tag,attrs]=lines[key],mark=svg(tag,{...attrs,pathLength:1,class:'mark'});
      traced.append(mark);
      const expected=predict(key,{...sound,[key]:undefined}),z=(numbers[key]-expected.mean)/expected.sd;
      row.className='';dot.style.left='50%';
      value.textContent=String(numbers[key]).replace('.',',')+(key==='poids'?' kg':' cm');
      later(()=>{
        const state=alert?(alert.level==='error'?'error':'check'):'ok';
        row.className='shown '+state;mark.setAttribute('class','mark drawn '+state);
        dot.style.left=Math.max(2,Math.min(98,50+z*50/3.6))+'%';
        row.title=alert?describeAlert(alert):'Dans la plage attendue';
      },t(1700+n*210));
    });
    later(()=>{
      box.dataset.state=flagged.length?'check':'ok';stage.textContent=`Comparé à ${REFERENCE.toLocaleString('fr-FR')} morphologies mesurées.`;
      verdict.textContent=flagged.length
        ?`${flagged.length===1?'Une mesure est':flagged.length+' mesures sont'} à vérifier : ${flagged.map(k=>labels[k].toLowerCase()).join(', ')}. Le détail est indiqué sous ${flagged.length===1?'la case concernée':'les cases concernées'}.`
        :'Mesures cohérentes entre elles : elles dessinent une morphologie réelle. Vous pouvez passer à la suite.';
      if(!flagged.length)chips.append(...profile(numbers).map((text,i)=>{const chip=document.createElement('li');chip.textContent=text;chip.style.transitionDelay=t(i*90)+'ms';requestAnimationFrame(()=>requestAnimationFrame(()=>chip.classList.add('shown')));return chip;}));
    },t(1900+KEYS.length*210));
    if(!still)later(()=>box.scrollIntoView({behavior:'smooth',block:'nearest'}),60);
  };
}
