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
const ordinary={stature:178,poitrine:102,taille:88,bassin:100,epaules:46,manche:64,dos:46.5,entrejambe:81};
assert.deepEqual(checkMeasurements(ordinary).alerts,[],'an ordinary man raises nothing');
assert.deepEqual(checkMeasurements({}).alerts,[],'nothing entered');
assert.deepEqual(checkMeasurements({taille:92}).alerts,[],'a single ordinary value');
// tall and short, slim and stout builds stay quiet
for(const build of [{stature:196,poitrine:108,taille:94,bassin:106,epaules:49,manche:70,dos:50,entrejambe:91},
  {stature:164,poitrine:96,taille:84,bassin:95,epaules:43.5,manche:58.5,dos:43,entrejambe:73},
  {stature:176,poitrine:122,taille:124,bassin:120,epaules:49,manche:63,dos:47,entrejambe:78},
  {stature:182,poitrine:112,taille:82,bassin:98,epaules:50,manche:65,dos:48,entrejambe:83}])
  assert.deepEqual(checkMeasurements(build).alerts,[],'plausible build '+JSON.stringify(build));

function only(values,key,kind){
  const {alerts}=checkMeasurements(values);
  assert.equal(alerts.length,1,JSON.stringify(alerts));assert.equal(alerts[0].key,key);
  if(kind)assert.equal(alerts[0].suggestion?.kind,kind,JSON.stringify(alerts[0]));
  assert.ok(describeAlert(alerts[0]).length>20);return alerts[0];
}
assert.equal(only({...ordinary,poitrine:51},'poitrine','half').suggestion.value,102);
assert.equal(only({...ordinary,taille:34.5},'taille','inches').suggestion.value,87.6);
assert.equal(only({...ordinary,stature:78},'stature','missing-hundred').suggestion.value,178);
assert.equal(only({...ordinary,entrejambe:18},'entrejambe','digits').suggestion.value,81);
assert.equal(only({...ordinary,manche:74},'manche','ten-less').suggestion.value,64);
assert.equal(only({...ordinary,stature:1.78},'stature').level,'error');
// two fields swapped: one alert that names the other field
const swapped=checkMeasurements({...ordinary,manche:46.5,dos:64}).alerts;
assert.equal(swapped.length,1);assert.equal(swapped[0].suggestion.kind,'swap');
assert.ok(/inversées/.test(describeAlert(swapped[0])));
// everything in inches
const inches=checkMeasurements(Object.fromEntries(Object.entries(ordinary).map(([k,v])=>[k,Math.round(v/2.54*2)/2])));
assert.ok(inches.allInches);assert.equal(inches.alerts.length,8);
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
    const p=person(),pool=name==='demi-tour'?['poitrine','taille','bassin']:KEYS,key=pool[Math.floor(uniform()*pool.length)];
    p[key]=Math.round(wrong(p,key)*2)/2;total++;
    if(checkMeasurements(p).alerts.some(a=>a.key===key))found++;
  }
  report[name]=found/total;
}
const pct=v=>(100*v).toFixed(1)+' %';
console.log('contrôle des mensurations — clients simulés : fausses alertes '+pct(falseAlarm/N)+' ; détection : '+Object.entries(report).map(([k,v])=>k+' '+pct(v)).join(', '));
assert.ok(falseAlarm/N<.04,'few false alarms');
assert.ok(report.pouces>.99&&report['demi-tour']>.99,'gross errors are always caught');
assert.ok(report['dizaine (+10)']>.5,'a slipped ten is caught more often than not');
assert.ok(THRESHOLD.check<THRESHOLD.error);
