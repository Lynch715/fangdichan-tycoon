// 仅生成本地验收夹具；不修改正式图集或模拟状态。
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('public/art/atlas-manifest.json','utf8'));
const pages=manifest.pages.filter((p:{density:number})=>p.density===2);
for(const kind of ['json','png'])for(let n=0;n<pages.length;n++){
 const root=`tests/acceptance/a8-${kind}-${n}`;await mkdir(root,{recursive:true});
 const entries=pages.map((p:{json:string},index:number)=>({density:2,json:index===n?'broken.json':'/art/'+p.json}));
 await writeFile(root+'/atlas-manifest.json',JSON.stringify({pages:entries},null,2)+'\n');
 if(kind==='png'){
  const sheet=JSON.parse(await readFile('public/art/'+pages[n].json,'utf8'));sheet.meta.image='missing-image.png';
  await writeFile(root+'/broken.json',JSON.stringify(sheet)+'\n');
 } // json夹具刻意没有broken.json，触发真实404。
}
console.log(`已生成${pages.length*2}种单页JSON/PNG失败夹具；正式图集不变。`);
