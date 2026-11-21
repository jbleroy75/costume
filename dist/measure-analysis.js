// The analysis shown once every measurement is entered: a line figure on which each measurement is drawn
// in turn, a gauge per measurement showing where the value sits in the range the others predict, and a
// verdict. Everything displayed comes from the plausibility model (measure-check.js); the animation only
// paces the reveal.
import {KEYS,predict,checkMeasurements,describeAlert} from './measure-check.js';

const SVG='http://www.w3.org/2000/svg';
const svg=(tag,attrs={})=>{const node=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);return node;};
// Where each measurement is taken, on a 220 × 440 figure.
const MARKS={
  stature:['path',{d:'M22 18V412M14 18H30M14 412H30'}],
  epaules:['path',{d:'M56 84H164'}],
  poitrine:['ellipse',{cx:110,cy:118,rx:43,ry:9}],
  taille:['ellipse',{cx:110,cy:168,rx:38,ry:8}],
  bassin:['ellipse',{cx:110,cy:218,rx:43,ry:9}],
  manche:['path',{d:'M166 86L177 206'}],
  dos:['path',{d:'M110 62V168'}],
  entrejambe:['path',{d:'M104 262L98 408'}],
  poids:['path',{d:'M62 426H158'}]
};
const BODY='M96 58Q96 70 70 76Q52 80 50 100L42 200Q40 214 48 216Q56 216 57 202L66 120L70 190Q66 215 68 240L74 400Q74 412 86 412L98 412Q104 412 104 400L110 262L116 400Q116 412 122 412L134 412Q146 412 146 400L152 240Q154 215 150 190L154 120L163 202Q164 216 172 216Q180 214 178 200L170 100Q168 80 150 76Q124 70 124 58';
const STEP=230; // milliseconds between two measurements

export function mountAnalysis(host,labels){
  const box=document.createElement('section');box.className='measure-analysis';box.hidden=true;box.setAttribute('aria-live','polite');
  const figure=svg('svg',{viewBox:'0 0 220 440','aria-hidden':'true',class:'analysis-figure'});
  figure.append(svg('circle',{cx:110,cy:38,r:20,class:'body'}),svg('path',{d:BODY,class:'body'}),svg('rect',{x:0,y:0,width:220,height:26,class:'scan'}));
  const marks={};
  for(const [key,[tag,attrs]] of Object.entries(MARKS)){marks[key]=svg(tag,{...attrs,pathLength:1,class:'mark'});figure.append(marks[key]);}
  const side=document.createElement('div');side.className='analysis-side';
  const title=document.createElement('h3');title.textContent='Analyse de vos mesures';
  const stage=document.createElement('p');stage.className='analysis-stage';
  const list=document.createElement('ol');list.className='analysis-list';
  const verdict=document.createElement('p');verdict.className='analysis-verdict';
  side.append(title,stage,list,verdict);box.append(figure,side);host.after(box);
  const rows={};
  for(const key of KEYS){
    const row=document.createElement('li'),name=document.createElement('span'),value=document.createElement('b'),track=document.createElement('i'),dot=document.createElement('u');
    name.textContent=labels[key];track.append(dot);row.append(name,value,track);list.append(row);rows[key]={row,value,dot};
  }
  let signature='',timers=[];
  const later=(fn,ms)=>timers.push(setTimeout(fn,ms));
  return function update(values){
    const filled=KEYS.every(key=>Number(values[key])>0);
    if(!filled){box.hidden=true;signature='';return;}
    const numbers=Object.fromEntries(KEYS.map(key=>[key,Number(values[key])])),next=JSON.stringify(numbers);
    if(next===signature)return;
    signature=next;timers.forEach(clearTimeout);timers=[];
    const alerts=Object.fromEntries(checkMeasurements(numbers).alerts.map(a=>[a.key,a]));
    const flagged=Object.keys(alerts),sound=Object.fromEntries(Object.entries(numbers).filter(([k])=>!alerts[k]));
    const still=matchMedia('(prefers-reduced-motion: reduce)').matches,step=still?0:STEP;
    box.hidden=false;box.dataset.state='running';verdict.textContent='';
    stage.textContent='Comparaison avec 4 082 morphologies mesurées…';
    figure.classList.remove('run');void figure.getBoundingClientRect();figure.classList.add('run');
    KEYS.forEach((key,n)=>{
      const {row,value,dot}=rows[key],mark=marks[key],alert=alerts[key];
      // position of the value in the range predicted by the measurements that are not in doubt
      const expected=predict(key,{...sound,[key]:undefined}),z=(numbers[key]-expected.mean)/expected.sd;
      row.className='';mark.setAttribute('class','mark');dot.style.left='50%';
      value.textContent=String(numbers[key]).replace('.',',')+(key==='poids'?' kg':' cm');
      later(()=>{
        const state=alert?(alert.level==='error'?'error':'check'):'ok';
        row.className='shown '+state;mark.setAttribute('class','mark drawn '+state);
        dot.style.left=Math.max(2,Math.min(98,50+z*50/3.6))+'%';
        row.title=alert?describeAlert(alert):'Dans la plage attendue';
      },still?0:500+n*step);
    });
    later(()=>{
      box.dataset.state=flagged.length?'check':'ok';stage.textContent='';
      verdict.textContent=flagged.length
        ?`${flagged.length===1?'Une mesure est':flagged.length+' mesures sont'} à vérifier : ${flagged.map(k=>labels[k].toLowerCase()).join(', ')}. Le détail est indiqué sous ${flagged.length===1?'la case concernée':'les cases concernées'}.`
        :'Mesures cohérentes entre elles : elles dessinent une morphologie réelle. Vous pouvez passer à la suite.';
    },still?0:700+KEYS.length*step);
    if(!still)later(()=>box.scrollIntoView({behavior:'smooth',block:'nearest'}),60);
  };
}
