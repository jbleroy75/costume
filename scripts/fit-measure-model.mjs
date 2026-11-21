// Fits the measurement plausibility model on the public ANSUR II male survey (US Army, 2012, public
// domain; 4,082 men measured by trained staff) and prints the tables to paste into dist/measure-check.js.
//   node scripts/fit-measure-model.mjs ANSUR_II_MALE_Public.csv
// Source: https://tools.openlab.psu.edu/publicData/ANSUR_II_MALE_Public.csv
import {readFileSync} from 'node:fs';
export const KEYS=['stature','poitrine','taille','bassin','epaules','manche','dos','entrejambe','poids'];
// Tailor's measurement (cm) from the survey columns (mm). Two are adapted:
// - carrure dos follows the curve of the upper back: straight biacromial breadth plus 10 %;
// - the inseam stops at the hem, about 4 cm above the floor.
export const FROM_SURVEY={
  stature:r=>r.stature/10,poitrine:r=>r.chestcircumference/10,taille:r=>r.waistcircumference/10,
  bassin:r=>r.buttockcircumference/10,epaules:r=>r.biacromialbreadth*1.1/10,manche:r=>r.sleeveoutseam/10,
  dos:r=>r.waistbacklength/10,entrejambe:r=>r.crotchheight/10-4,poids:r=>r.weightkg/10
};
export function load(path){
  const [head,...lines]=readFileSync(path,'latin1').trim().split(/\r?\n/);
  const cols=head.split(',').map(c=>c.replace(/"/g,''));
  return lines.map(line=>{
    const cells=line.split(','),row={};
    cols.forEach((c,i)=>{row[c]=Number(cells[i]);});
    return Object.fromEntries(KEYS.map(k=>[k,FROM_SURVEY[k](row)]));
  }).filter(p=>KEYS.every(k=>Number.isFinite(p[k])&&p[k]>0));
}
export function fit(people){
  const n=people.length,mean=Object.fromEntries(KEYS.map(k=>[k,people.reduce((s,p)=>s+p[k],0)/n]));
  const cov=KEYS.map(a=>KEYS.map(b=>people.reduce((s,p)=>s+(p[a]-mean[a])*(p[b]-mean[b]),0)/(n-1)));
  return {mean,cov};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const people=load(process.argv[2]),{mean,cov}=fit(people);
  console.log('// fitted on '+people.length+' men');
  console.log('const MEAN = {'+KEYS.map(k=>k+':'+mean[k].toFixed(2)).join(', ')+'};');
  console.log('const SURVEY_COVARIANCE = [\n'+cov.map(r=>'  ['+r.map(v=>v.toFixed(2)).join(',')+']').join(',\n')+'\n];');
  console.log('// sd: '+KEYS.map((k,i)=>k+' '+Math.sqrt(cov[i][i]).toFixed(1)).join(', '));
  console.log('// correlations with stature: '+KEYS.map((k,i)=>k+' '+(cov[0][i]/Math.sqrt(cov[0][0]*cov[i][i])).toFixed(2)).join(', '));
}

// Held-out evaluation: fit on every other man, judge the others after adding a self-measurement error.
//   node scripts/fit-measure-model.mjs ANSUR_II_MALE_Public.csv --evaluate
if(process.argv[3]==='--evaluate'){
  const {configure,checkMeasurements,MODEL}=await import('../dist/measure-check.js');
  const people=load(process.argv[2]),train=people.filter((_,i)=>i%2===0),test=people.filter((_,i)=>i%2===1);
  const {mean,cov}=fit(train);
  let seed=2026;const uniform=()=>{seed=(seed*1664525+1013904223)>>>0;return (seed+.5)/4294967296;};
  const normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
  let weigh=1;const read=p=>Object.fromEntries(KEYS.filter(k=>weigh||k!=='poids').map(k=>[k,Math.round((p[k]+normal()*MODEL.READING_SD[k])*2)/2]));
  const errors={pouces:(v)=>v/2.54,'demi-tour':v=>v/2,'+10 cm':v=>v+10,'-10 cm':v=>v-10,'+7 cm':v=>v+7,'+5 cm':v=>v+5,'-5 cm':v=>v-5,'+3 cm':v=>v+3};
  for(const [check,use] of [[3,1],[3,0],[2.8,1],[3.2,1]]){
    configure({mean,covariance:cov,threshold:{check,error:check+1.2}});weigh=use;
    let alarm=0;for(const p of test)if(checkMeasurements(read(p)).alerts.length)alarm++;
    const found={};
    for(const [name,wrong] of Object.entries(errors)){
      let hit=0;
      for(const p of test){
        const r=read(p),pool=name==='demi-tour'?['poitrine','taille','bassin']:KEYS.filter(k=>k!=='poids'),key=pool[Math.floor(uniform()*pool.length)];
        r[key]=Math.round(wrong(r[key])*2)/2;
        if(checkMeasurements(r).alerts.some(a=>a.key===key))hit++;
      }
      found[name]=(100*hit/test.length).toFixed(0)+'%';
    }
    console.log('seuil '+check+(use?' avec poids':' sans poids')+' : fausses alertes '+(100*alarm/test.length).toFixed(1)+'% des '+test.length+' hommes ; détection '+JSON.stringify(found));
  }
}
