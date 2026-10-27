import {preB9Config,preB9State} from './helpers/pre-b9.ts';
import{newGame,applyCommand,stepDay,type Command}from'../src/legacy-v6/index.ts';
import{afterEach,describe,it,expect,vi}from'vitest';
import*as V1 from'../src/legacy-v1/index.ts';import*as V2 from'../src/legacy-v2/index.ts';import*as V3 from'../src/legacy-v3/index.ts';import*as V4 from'../src/legacy-v4/index.ts';import*as V5 from'../src/legacy-v5/index.ts';
import{restore as restore5}from'../src/legacy-v5/restore.ts';import{restore,validateSave}from'../src/save.ts';
import{defaultConfig,createReports,projectResult,statements,type GameState}from'../src/sim/index.ts';
import{observeHistoricalCall}from'../src/history/legacy-reports.ts';import{reportsPanel}from'../src/ui/reports.ts';import{Game}from'../src/game.ts';
afterEach(()=>vi.unstubAllGlobals());
function economic(s:object,version:number){const copy=preB9State(s) as Record<string,unknown>;delete copy.industry;delete copy.rivals;delete copy.rivalsSinceDay;delete copy.reports;copy.version=version;copy.pauses=[];return copy;}
function checkCash(s:GameState){
 expect(s.reports.replayError).toBeUndefined();expect(s.reports.complete).toBe(true);expect(s.reports.sinceDay).toBe(0);
 for(const r of s.reports.months){const t=statements(s,[r])!;expect(t.opening.cash+t.netCash).toBeCloseTo(t.closing.cash,5);expect(t.revenue-t.cost-t.marketing-t.tax-t.risk-t.finance+t.otherProfit).toBeCloseTo(t.profit,5);}
}
describe('B5e 冻结内核完整历史回溯',()=>{
 for(const[version,kernel]of [[1,V1],[2,V2],[3,V3],[4,V4],[5,V5]]as const)it(`v${version}两策略/多种子的历史现金、末态和月表一致`,()=>{
  for(const seed of[7,23])for(const strategy of[kernel.conservative,kernel.aggressive]){
   // 各版策略/状态形状不同，调用各自原配runGame，日志再经过公开存档校验。
   const run=kernel.runGame as unknown as (seed:number,strategy:unknown,years:number)=>{state:{day:number};log:unknown[]};
   const result=run(seed,strategy,6),saved=validateSave({...(version===1?{}:{version}),seed,day:result.state.day,log:result.log})!,s=restore(saved);
   checkCash(s);expect(s.reports.provenance).toBe('replayed');expect(s.reports.months).toHaveLength(Math.floor(s.day/30));
   expect(s.reports.journal.reduce((n,e)=>n+e.cash,50000)).toBeCloseTo(s.cash,5);
  }
 },20000);
 it('旧清盘项目恢复完整利润、IRR及回正，不能把旧资金缺失当作零',()=>{
  const log:V5.LoggedCommand[]=[{day:0,command:{type:'bid',parcelId:'L1',amount:31146}},{day:30,command:{type:'startProject',projectId:'P4',contractor:'standard'}}],raw={version:5 as const,seed:7,day:1170,log,revision:0},old=restore5(raw),s=restore(validateSave(raw)!);
  expect(economic(s,5)).toEqual(economic(old,5));const r=projectResult(s,s.projects[0]);expect(r.complete).toBe(true);expect(r.profit).toBeCloseTo(15000.847050370518,6);expect(r.margin).toBeCloseTo(.2818348141554994,8);expect(r.annualIRR).toBeCloseTo(.787092914491968,7);expect(r.paybackMonths).toBe(16);
  expect(reportsPanel(defaultConfig,s,'projects')).not.toContain('历史缺失');expect(reportsPanel(defaultConfig,s,'year','2')).toContain('>完整年度 ·');checkCash(s);
 });
 it('同一日多版本、多个指令边界不重复记账或提前执行',()=>{
  const first=V1.newGame(7),a=[...first.auctions].sort((a,b)=>a.startPrice-b.startPrice)[0],bid={type:'bid' as const,parcelId:a.id,amount:a.aiMax*2};V1.applyCommand(first,bid);for(let i=0;i<30;i++)V1.stepDay(first);const id=first.projects[0].id;
  const log:Command[]=[bid,{type:'cooperate',projectId:id},{type:'setPaper',projectId:id,enabled:true},{type:'setPace',projectId:id,pace:'fast'},{type:'borrow',channel:'devLoan',projectId:id,amount:5000},{type:'setMarketing',projectId:id,rate:.08}];
  const raw={version:5 as const,seed:7,day:720,revision:0,legacyUntil:30,legacyLogCount:1,legacyV2Until:30,legacyV2LogCount:2,legacyV3Until:30,legacyV3LogCount:3,legacyV4Until:30,legacyV4LogCount:4,log:log.map((command,i)=>({day:i===0?0:i===5?180:30,command}))};
  const old=restore5(raw as unknown as Parameters<typeof restore5>[0]),s=restore(validateSave(raw)!);expect(economic(s,5)).toEqual(economic(old,5));checkCash(s);
  expect(s.reports.journal.filter(e=>e.kind==='partnerInvestment')).toHaveLength(1);expect(s.reports.journal.filter(e=>e.kind==='loan')).toHaveLength(1);expect(s.reports.decisions.filter(d=>d.text.includes('营销'))).toHaveLength(1);expect(s.reports.origins[id].period).toBe(1);
 });
 it('旧版后续v6指令和重新导出仍保留完整历史，只重建统计不存快照',()=>{
  vi.stubGlobal('localStorage',undefined);vi.stubGlobal('indexedDB',undefined);
  const g=new Game(),raw={version:5,seed:7,day:210,log:[{day:0,command:{type:'bid',parcelId:'L1',amount:31146}},{day:30,command:{type:'startProject',projectId:'P4',contractor:'standard'}}]};expect(g.importSave(JSON.stringify(raw)).ok).toBe(true);expect(g.issue({type:'setMarketing',projectId:'P4',rate:.06}).ok).toBe(true);const exported=JSON.parse(g.exportSave());expect(exported.reports).toBeUndefined();expect(exported.legacyV5Until).toBe(210);expect(exported.legacyV5LogCount).toBe(2);
  const again=new Game();expect(again.importSave(JSON.stringify(exported)).ok).toBe(true);expect(again.state.reports).toEqual(g.state.reports);expect(again.state.reports.complete).toBe(true);expect(again.state.projects[0].marketingRate).toBe(.06);
 });
});

describe('B5e 观察流水与原生记录逐笔对照',()=>{
 for(const mode of['solo','cooperate','transfer']as const)it(`${mode}：真实借还/商票/事故/材料/营销/追缴/展期逐笔一致`,()=>{
  const c=preB9Config(defaultConfig);c.start.cash=1e6;c.construction.months=6;c.risk.inspectionBase=0;c.risk.inspectionAttentionFactor=0;c.risk.materialChance=1;c.risk.accidentChance=0;c.risk.demandChance=0;
  const old=V5.newGame(7,c),native=newGame(7,c),record=createReports(c.start.cash),issue=(command:Command)=>{
   observeHistoricalCall(old,c,record,s=>V5.applyCommand(s as V5.GameState,command,c),command);expect(applyCommand(native,command,c)).toEqual({ok:true});
  };
  issue({type:'borrow',channel:'hidden',amount:1000});issue({type:'bid',parcelId:'L1',amount:31146});
  const advance=(day:number)=>{while(old.day<day){c.risk.accidentChance=old.day===119?1:0;c.risk.inspectionBase=old.day===119?1:0;observeHistoricalCall(old,c,record,s=>V5.stepDay(s as V5.GameState,c));stepDay(native,c);expect(native.rng).toBe(old.rng);}};
  // command调用同样使用受控配置，冻结文件本身保持原样。
  advance(30);const id=old.projects[0].id;issue({type:'startProject',projectId:id,contractor:'standard'});if(mode==='cooperate')issue({type:'cooperate',projectId:id});issue({type:'borrow',channel:'devLoan',projectId:id,amount:1000});issue({type:'setPaper',projectId:id,enabled:true});
  advance(90);issue({type:'setMarketing',projectId:id,rate:.08});if(mode!=='cooperate')issue({type:'divert',projectId:id});advance(240);if(mode==='transfer')issue({type:'sellProject',projectId:id});advance(540);issue({type:'extend',debtId:old.debts.find(d=>d.channel==='hidden')!.id});advance(900);
  expect(economic(native,5)).toEqual(economic(old,5));expect(record.journal).toHaveLength(native.reports.journal.length);
  for(let i=0;i<record.journal.length;i++){
   const a=record.journal[i],b=native.reports.journal[i];for(const key of['day','period','kind','projectId','parcelId']as const)expect(a[key],`${i}:${key}`).toEqual(b[key]);for(const key of['cash','projectCash','amount']as const)expect(a[key],`${i}:${key}`).toBeCloseTo(b[key],6);
  }
  expect(record.months).toEqual(native.reports.months);expect(record.decisions).toEqual(native.reports.decisions);expect(record.closedProjects).toEqual(native.reports.closedProjects);expect(record.origins).toEqual(native.reports.origins);expect(record.projectEntries).toEqual(native.reports.projectEntries);
 },20000);
 it('代理保持对象身份和纯数据状态，观察后仍可结构化复制',()=>{
  const state=V5.newGame(7),report=createReports(50000),a=state.auctions[0],command={type:'bid' as const,parcelId:a.id,amount:a.aiMax*2};observeHistoricalCall(state,defaultConfig,report,s=>V5.applyCommand(s as V5.GameState,command),command);for(let i=0;i<30;i++)observeHistoricalCall(state,defaultConfig,report,s=>V5.stepDay(s as V5.GameState));expect(()=>structuredClone(state)).not.toThrow();expect(state.auctions.some(x=>x.id===a.id)).toBe(false);expect(state.projects).toHaveLength(1);
 });
 it('流水现金与监管款分开，观察输出不向冻结经济状态添加报表字段',()=>{
  const state=V5.newGame(7),r=createReports(50000);observeHistoricalCall(state,defaultConfig,r,s=>V5.stepDay(s as V5.GameState));expect(Object.hasOwn(state,'reports')).toBe(false);expect(state.day).toBe(1);expect(r.journal).toHaveLength(0);
 });
});
