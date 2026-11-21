import assert from 'node:assert/strict';
import {KEYS,COVARIANCE,MODEL,THRESHOLD,checkMeasurements,describeAlert,predict} from '../dist/measure-check.js';

// The covariance must be a real one: Cholesky succeeds only for a positive definite matrix.
const n=KEYS.length,L=KEYS.map(()=>new Array(n).fill(0));
for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
  let s=COVARIANCE[i][j];for(let k=0;k<j;k++)s-=L[i][k]*L[j][k];
  if(i===j){assert.ok(s>0,'covariance positive definite at '+KEYS[i]);L[i][j]=Math.sqrt(s);}else L[i][j]=s/L[j][j];
}
// A deterministic generator, so the measured rates do not move between runs.
let seed=12345;const uniform=()=>{seed=(seed*1664525+1013904223)>>>0;return (seed+.5)/4294967296;};
const normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
function person(){
  const z=KEYS.map(normal),out={};
  KEYS.forEach((key,i)=>{let v=MODEL.MEAN[key];for(let k=0;k<=i;k++)v+=L[i][k]*z[k];out[key]=Math.round(v*2)/2;});
  return out;
}
const ordinary={stature:178,poitrine:104,taille:90,bassin:101,epaules:46,manche:60,dos:48,entrejambe:82};
assert.deepEqual(checkMeasurements(ordinary).alerts,[],'an ordinary man raises nothing');
assert.deepEqual(checkMeasurements({}).alerts,[],'nothing entered');
assert.deepEqual(checkMeasurements({taille:92}).alerts,[],'a single ordinary value');
// tall and short, slim and stout builds stay quiet
for(const build of [{stature:194,poitrine:110,taille:96,bassin:107,epaules:48,manche:65.5,dos:50.5,entrejambe:91,poids:98},
  {stature:164,poitrine:98,taille:86,bassin:95,epaules:44,manche:55.5,dos:45,entrejambe:74},
  {stature:176,poitrine:122,taille:122,bassin:118,epaules:47.5,manche:60,dos:50,entrejambe:79,poids:118},
  {stature:182,poitrine:108,taille:84,bassin:98,epaules:48,manche:62,dos:48,entrejambe:85,poids:80}])
  assert.deepEqual(checkMeasurements(build).alerts,[],'plausible build '+JSON.stringify(build));

function only(values,key,kind){
  const {alerts}=checkMeasurements(values);
  assert.equal(alerts.length,1,JSON.stringify(alerts));assert.equal(alerts[0].key,key);
  if(kind)assert.equal(alerts[0].suggestion?.kind,kind,JSON.stringify(alerts[0]));
  assert.ok(describeAlert(alerts[0]).length>20);return alerts[0];
}
assert.equal(only({...ordinary,poitrine:52},'poitrine','half').suggestion.value,104);
assert.equal(only({...ordinary,taille:35.5},'taille','inches').suggestion.value,90.2);
assert.equal(only({...ordinary,stature:78},'stature','missing-hundred').suggestion.value,178);
assert.equal(only({...ordinary,entrejambe:28},'entrejambe','digits').suggestion.value,82);
assert.equal(only({...ordinary,manche:70},'manche','ten-less').suggestion.value,60);
assert.equal(only({...ordinary,stature:1.78},'stature').level,'error');
// two fields swapped: one alert that names the other field
const swapped=checkMeasurements({...ordinary,manche:48,dos:60}).alerts;
assert.equal(swapped.length,1);assert.equal(swapped[0].suggestion.kind,'swap');
assert.ok(/inversées/.test(describeAlert(swapped[0])));
// everything in inches
const inches=checkMeasurements(Object.fromEntries(Object.entries(ordinary).map(([k,v])=>[k,Math.round(v/2.54*2)/2])));
assert.ok(inches.allInches);assert.equal(inches.alerts.length,8);
// weight: in pounds, and a weight that contradicts the tape
assert.equal(only({...ordinary,poids:176},'poids','pounds').suggestion.value,79.8);
assert.deepEqual(checkMeasurements({...ordinary,poids:80}).alerts,[]);
assert.ok(/kg/.test(describeAlert(only({...ordinary,poids:176},'poids'))));
// the weight sharpens the check: 11 cm too much at the hips passes without it and is caught with it
assert.deepEqual(checkMeasurements({...ordinary,bassin:112}).alerts,[]);
assert.equal(checkMeasurements({...ordinary,bassin:112,poids:82}).alerts[0]?.key,'bassin');
// an impossible value with nothing to compare with
assert.equal(checkMeasurements({taille:9}).alerts[0].level,'error');
assert.ok(predict('manche',{stature:195}).mean>predict('manche',{stature:165}).mean+5,'sleeve follows stature');

// Rates on simulated clients drawn from the model itself (not real clients).
const N=4000;let falseAlarm=0;
for(let i=0;i<N;i++)if(checkMeasurements(person()).alerts.length)falseAlarm++;
const errors={
  pouces:(p,k)=>p[k]/2.54,'demi-tour':(p,k)=>p[k]/2,'dizaine (+10)':(p,k)=>p[k]+10,'dizaine (-10)':(p,k)=>p[k]-10,
  'erreur de 5 cm':(p,k)=>p[k]+5,'erreur de 3 cm':(p,k)=>p[k]+3
};
const report={};
for(const [name,wrong] of Object.entries(errors)){
  let found=0,total=0;
  for(let i=0;i<1500;i++){
    const p=person(),pool=name==='demi-tour'?['poitrine','taille','bassin']:KEYS.filter(k=>k!=='poids'),key=pool[Math.floor(uniform()*pool.length)];
    p[key]=Math.round(wrong(p,key)*2)/2;total++;
    if(checkMeasurements(p).alerts.some(a=>a.key===key))found++;
  }
  report[name]=found/total;
}
const pct=v=>(100*v).toFixed(1)+' %';
console.log('contrôle des mensurations — clients simulés : fausses alertes '+pct(falseAlarm/N)+' ; détection : '+Object.entries(report).map(([k,v])=>k+' '+pct(v)).join(', '));
assert.ok(falseAlarm/N<.05,'few false alarms');
assert.ok(report.pouces>.99&&report['demi-tour']>.99,'gross errors are always caught');
assert.ok(report['dizaine (+10)']>.5,'a slipped ten is caught more often than not');
assert.ok(THRESHOLD.check<THRESHOLD.error);

// The figure of the analysis panel is drawn from the measurements themselves.
const {landmarks,figurePath,profile}=await import('../dist/measure-analysis.js');
const tall=landmarks({...ordinary,stature:194,entrejambe:91}),base=landmarks(ordinary);
assert.ok(tall.H>base.H&&tall.crotchY>base.crotchY,'a taller man gives a taller figure with longer legs');
assert.ok(landmarks({...ordinary,taille:110}).waist>base.waist&&landmarks({...ordinary,epaules:50}).shoulder>base.shoulder);
assert.ok(base.nape>base.shoulderY&&base.shoulderY>base.chestY&&base.chestY>base.waistY&&base.waistY>base.hipY&&base.hipY>base.crotchY,'landmarks stay in order');
for(let i=0;i<300;i++)assert.ok(!/NaN|Infinity/.test(figurePath(person())),'every simulated build can be drawn');
assert.deepEqual(profile({...ordinary,poids:80}),['Veste ≈ 52','Pantalon ≈ 46','Carrure classique','Longueur régulière']);
assert.equal(profile({...ordinary,poitrine:112,taille:88,stature:190})[2],'Carrure athlétique');
