// 默认冻结参数的历史统计验收，不改玩家存档；JSON只保存审计结果，不保存GameState。
import{writeFile}from'node:fs/promises';import*as V1 from'../src/legacy-v1/index.ts';import*as V2 from'../src/legacy-v2/index.ts';import*as V3 from'../src/legacy-v3/index.ts';import*as V4 from'../src/legacy-v4/index.ts';import*as V5 from'../src/legacy-v5/index.ts';
import{replay,type LoggedCommand}from'../src/legacy-v6/index.ts';
import{restore,validateSave}from'../src/save.ts';import{projectResult}from'../src/sim/index.ts';
interface AuditRow{version:number;seed:number;years:number;strategy:string;day:number;projects:number;months:number;entries:number;cash:number;rng:number;restoreMs:number;maxNativeProfitDifference?:number}
const rows:AuditRow[]=[];
for(const[version,kernel]of[[1,V1],[2,V2],[3,V3],[4,V4],[5,V5]]as const){
 for(const[seed,years,strategy]of[[7,8,kernel.conservative],[23,8,kernel.aggressive],[91,30,kernel.aggressive]]as const){
  const run=kernel.runGame as unknown as (seed:number,strategy:unknown,years:number)=>{state:{cash:number;rng:number;day:number};log:LoggedCommand[]};
  const original=run(seed,strategy,years),saved=validateSave({...(version===1?{}:{version}),seed,day:original.state.day,log:original.log})!;
  const start=performance.now(),state=restore(saved),restoreMs=performance.now()-start;
  if(!state.reports.complete||state.reports.replayError)throw Error(`v${version} ${seed}: ${state.reports.replayError}`);
  if(state.cash!==original.state.cash||state.rng!==original.state.rng)throw Error('历史经济结果被改变');
  const row:AuditRow={version,seed,years,strategy:strategy===kernel.conservative?'conservative':'aggressive',day:state.day,projects:state.projects.length,months:state.reports.months.length,entries:state.reports.journal.length,cash:state.cash,rng:state.rng,restoreMs};
  if(version===5){
   const native=replay(seed,original.log,state.day),clean=(s:object)=>{const copy={...s} as Record<string,unknown>;for(const key of['reports','version','rivals','rivalsSinceDay'])delete copy[key];return copy;};
   if(JSON.stringify(clean(native))!==JSON.stringify(clean(state)))throw Error('v5与原生记录的经济末态不一致');
   const differences=state.projects.map(p=>{const a=projectResult(state,p).profit,b=projectResult(native,native.projects.find(x=>x.id===p.id)!).profit;return a===null||b===null?Infinity:Math.abs(a-b);});
   row.maxNativeProfitDifference=Math.max(0,...differences);if(row.maxNativeProfitDifference>.00001)throw Error('项目利润与原生记录不一致');
  }
  rows.push(row);console.log(`v${version} ${row.strategy} seed${seed} day${state.day} ${restoreMs.toFixed(0)}ms ${row.entries} entries`);
  if(version===5&&years===30)await writeFile('tests/acceptance/b5e-v5-long.json',JSON.stringify({version:5,seed,day:original.state.day,log:original.log,revision:0},null,2)+'\n');
 }
}
await writeFile('tests/acceptance/b5e-history-audit.json',JSON.stringify({rows,allComplete:true,economicValuesUnchanged:true},null,2)+'\n');
