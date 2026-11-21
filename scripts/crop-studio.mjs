import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/studio-assets.cjs`);
const sharp=require('sharp');
const [source,columns,rows,...names]=process.argv.slice(2);const c=Number(columns),r=Number(rows);
if(names.length!==c*r)throw new Error('Names must cover every cell');
await mkdir('dist/assets/studio',{recursive:true});const {width,height}=await sharp(source).metadata();
for(let i=0;i<names.length;i++){const x=i%c,y=Math.floor(i/c),left=Math.round(x*width/c),top=Math.round(y*height/r),right=Math.round((x+1)*width/c),bottom=Math.round((y+1)*height/r);await sharp(source).extract({left,top,width:right-left,height:bottom-top}).resize(480,480,{fit:'cover'}).webp({quality:88}).toFile(`dist/assets/studio/${names[i]}.webp`);}
console.log(`Saved ${names.length} original studio crops`);
