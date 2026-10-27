import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {restore,validateSave} from '../src/save.ts';
import {computeMetrics,statements,currentReport,type GameState} from '../src/sim/index.ts';
const assert=(ok:boolean,message:string)=>{if(!ok)throw new Error(message);};
const near=(a:number,b:number,label:string)=>assert(Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
const files=[
 ...['sales','downturn','delivery'].flatMap(kind=>[1,7,32].map(seed=>`b13-${kind}-${seed}.json`)),
 ...['old','cancel','delivery-opening','sandbox','sales-win','downturn-win','delivery-win','delivery-failed','career'].map(kind=>`b13-${kind}-browser-save.json`),
];
const loaded=new Map<string,GameState>();
const rows=files.map(file=>{
 const raw=JSON.parse(readFileSync('tests/acceptance/'+file,'utf8')),save=validateSave(raw);
 assert(!!save,'无效存档 '+file);
 const state=restore(save!),again=restore(validateSave(JSON.parse(JSON.stringify(save)))!);
 assert(JSON.stringify(state)===JSON.stringify(again),'重载不一致 '+file);
 for(const s of [state,...state.rivals.map(r=>r.company)]){
  const opening=s.reports.months[0]?.opening??s.reports.opening;
  near(s.cash,opening.cash+s.reports.journal.reduce((n,e)=>n+e.cash,0),file+' 公司现金');
  for(const month of [...s.reports.months,currentReport(s)]){
   near(month.closing.cash-month.opening.cash,s.reports.journal.slice(month.fromEntry,month.toEntry).reduce((n,e)=>n+e.cash,0),file+' 月度现金');
   const report=statements(s,[month])!;
   near(report.profit+report.capitalIn,month.closing.equity-month.opening.equity,file+' 月度利润/资本');
  }
  if(s.compliance)near(s.cash,s.compliance.cash,file+' 资金归因');
 }
 loaded.set(file,state);
 return {file,day:state.day,commands:save!.log.length,options:state.session?.options,result:state.session?.result,sales:state.session?.sales,cash:state.cash,equity:computeMetrics(state).equity,sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex')};
});
assert(JSON.stringify(loaded.get('b13-old-browser-save.json'))===JSON.stringify(loaded.get('b13-cancel-browser-save.json')),'取消重开改变状态');
for(const kind of ['sales','downturn','delivery'])assert(loaded.get(`b13-${kind}-win-browser-save.json`)!.session!.result==='won','浏览器挑战未完成 '+kind);
assert(loaded.get('b13-delivery-failed-browser-save.json')!.session!.result==='lost','转让未触发失败');
const sandbox=loaded.get('b13-sandbox-browser-save.json')!;
near(sandbox.cash,2100000,'沙盒实际注资');near(sandbox.session!.sandboxCapitalIn,500000,'沙盒资本');
writeFileSync('tests/acceptance/b13-audit.json',JSON.stringify(rows,null,2)+'\n');
console.log(`通过${rows.length}份完整重载、全公司现金/月报/资金归因、取消状态恒等及实际挑战结果核对`);
console.log(rows.map(({file,day,result,cash})=>({file,day,result,cash})));
