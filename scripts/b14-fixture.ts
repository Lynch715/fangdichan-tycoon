import{readFileSync,writeFileSync}from'node:fs';
import{restore,validateSave}from'../src/save.ts';
import{transferQuote,activeProject,defaultConfig}from'../src/sim/index.ts';
import{estimateTransfer}from'../src/estimates/transfer.ts';
for(const source of ['b13-sales-7.json','b13-delivery-7.json','b13-old-browser-save.json']){
 const full=JSON.parse(readFileSync('tests/acceptance/'+source,'utf8'));
 let found=false;
 for(let day=30;day<=full.day&&!found;day+=30){
  // 只裁剪原有指令日志，不写入任何游戏状态。
  const save=validateSave({...full,day,log:full.log.filter((x:{day:number})=>x.day<=day)})!;
  if(!save)continue;
  const s=restore(save),c=s.rules??defaultConfig;
  const p=s.projects.find(p=>activeProject(p)&&p.stage!=='delivered'&&transferQuote(s,p,c).price<0&&p.diverted===0);
  if(p){writeFileSync('tests/acceptance/b14-negative-save.json',JSON.stringify(save,null,2)+'\n');
   writeFileSync('tests/acceptance/b14-fixture.json',JSON.stringify({source,day,projectId:p.id,name:p.name,estimate:estimateTransfer(c,s,p)},null,2)+'\n');
   console.log({source,day,id:p.id,estimate:estimateTransfer(c,s,p)});found=true;break;
  }
 }
 if(found)break;
}
