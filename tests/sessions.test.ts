import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {newGame,applyCommand,stepDay,defaultConfig,replay,computeMetrics,currentReport,statements,projectResult,DIFFICULTIES,type GameState,type SessionOptions,type Command,type LoggedCommand} from '../src/sim/index.ts';
import {validateSave,restore,SAVE_KEY} from '../src/save.ts';
import {Game} from '../src/game.ts';
import {sessionPanel,setupMarkup} from '../src/ui/session.ts';

afterEach(()=>vi.unstubAllGlobals());
const start=(options:SessionOptions,seed=7)=>{const s=newGame(seed);expect(applyCommand(s,{type:'startGame',options}).ok).toBe(true);return s;};
function to(s:GameState,day:number){while(s.day<day&&s.status!=='bankrupt')stepDay(s);}
const shape=(s:GameState)=>({...s,pauses:[]});
class Storage {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}}

describe('B13模式指令、真实挑战与存档',()=>{
 it('开局只能执行一次，失效或非法选择不改变任何状态',()=>{
  const s=newGame(7),before=JSON.stringify(s);
  expect(applyCommand(s,{type:'startGame',options:{mode:'challenge',difficulty:'standard'} as SessionOptions}).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
  expect(applyCommand(s,{type:'startGame',options:{mode:'sandbox',difficulty:'hard'}}).ok).toBe(true);
  const opened=JSON.stringify(s);
  expect(applyCommand(s,{type:'startGame',options:{mode:'career',difficulty:'easy'}}).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(opened);
  for(const first of ['command','day']){
   const used=newGame(7);
   if(first==='command')expect(applyCommand(used,{type:'borrow',channel:'trust',amount:1000}).ok).toBe(true);else stepDay(used);
   const prior=JSON.stringify(used);
   expect(applyCommand(used,{type:'startGame',options:{mode:'sandbox',difficulty:'easy'}}).ok).toBe(false);
   expect(JSON.stringify(used)).toBe(prior);
  }
 });
 it('三种难度在每个模式派生一次，日推进/操作不重复叠乘',()=>{
  for(const difficulty of DIFFICULTIES)for(const options of [{mode:'career',difficulty},{mode:'sandbox',difficulty},...(['sales','downturn','delivery'] as const).map(challenge=>({mode:'challenge',difficulty,challenge}))] as SessionOptions[]){
   const s=start(options),config=s.rules!,rules=JSON.stringify(config),reference=s.rules;
   to(s,90);
   expect(s.rules).toBe(reference);expect(JSON.stringify(s.rules)).toBe(rules);
   const log:LoggedCommand[]=[{day:0,command:{type:'startGame',options}}];
   expect(replay(7,log,s.day)).toEqual(shape(s));
  }
 });
 it('三档橙档场景都由真实资产负债得出两条踩线，开局即处于下行和监管',()=>{
  for(const difficulty of DIFFICULTIES){
   const s=start({mode:'challenge',difficulty,challenge:'downturn'}),m=computeMetrics(s);
   expect(s.regulation.active).toBe(true);expect(s.regulation.tier).toBe(2);
   expect(m.liabilityRatio).toBeGreaterThan(defaultConfig.regulation.thresholds.liabilityRatio);
   expect(m.netGearing).toBeGreaterThan(defaultConfig.regulation.thresholds.netGearing);
   expect(m.cashToShortDebt).toBeGreaterThanOrEqual(1);
   expect(s.rules!.cycle.phases[s.market.phaseIndex].id).toBe('downturn');
   expect(m.inventory).toBe(180000);expect(m.interestDebt).toBe(140000);
   expect(s.projects).toHaveLength(3);expect(s.reports.opening).toEqual(m);
   expect(s.reports.journal).toHaveLength(0);
  }
 });
 it('接手违约公司有实际旧预收款/监管款/债务，救助投入不算销售或利润',()=>{
  const s=start({mode:'challenge',difficulty:'standard',challenge:'delivery'}),m=computeMetrics(s);
  expect(s.status).toBe('distress');expect(s.distressMonths).toBe(2);
  expect(s.projects.every(p=>p.fundingStoppedMonths===4)).toBe(true);
  expect(m.contractLiabilities).toBe(62820);expect(m.escrow).toBe(29187);
  expect(m.interestDebt+m.paperDebt).toBe(60000);expect(m.cash).toBe(40000);
  expect(s.reports.opening.cash).toBe(-10000);expect(s.session!.sales).toBe(0);
  expect(s.compliance!.cash).toBe(s.cash);expect(s.compliance!.borrowedCash).toBe(0);
  const report=statements(s,[currentReport(s)])!;
  expect(report.capitalIn).toBe(50000);expect(report.profit).toBeCloseTo(0);
  expect(report.financing).toBe(50000);expect(report.salesReceived).toBe(0);
  expect(projectResult(s,s.projects[0]).complete).toBe(false);
  expect(projectResult(s,s.projects[0]).profit).toBeNull();
  to(s,90);
  expect(s.reports.journal.filter(e=>e.kind==='repay').reduce((n,e)=>n+e.amount,0)).toBe(10000);
  expect(s.debts.some(d=>d.channel==='paper')).toBe(false);
  expect(s.session!.sales).toBeCloseTo(s.reports.journal.filter(e=>e.kind==='saleBooked').reduce((n,e)=>n+e.amount,0));
 });
 it('开局项目、拍卖和对手地块不存在同一地图占地冲突',()=>{
  for(const challenge of ['downturn','delivery'] as const){
   const s=start({mode:'challenge',difficulty:'standard',challenge});
   const cells=new Set<string>();
   for(const p of [...s.projects,...s.auctions]){
    const map=s.rules!.districts.find(d=>d.id===p.districtId)!.mapId;
    for(const tile of p.tiles){const key=map+':'+tile.join(',');expect(cells.has(key)).toBe(false);cells.add(key);}
   }
  }
 });
 for(const challenge of ['sales','downturn','delivery'] as const)it(`${challenge}真实成功日志重放、结局固定且可继续`,()=>{
  const raw=JSON.parse(readFileSync(new URL(`./acceptance/b13-${challenge}-7.json`,import.meta.url),'utf8'));
  const saved=validateSave(raw)!;expect(saved).not.toBeNull();
  const s=restore(saved),x=s.session!;
  expect(x.options).toEqual({mode:'challenge',difficulty:'standard',challenge});expect(x.result).toBe('won');
  expect(s.day).toBeLessThanOrEqual(x.targetDay!);
  if(challenge==='sales'){
   expect(x.sales).toBeGreaterThanOrEqual(10000000);
   expect(x.sales).toBeCloseTo(s.reports.journal.filter(e=>e.kind==='saleBooked').reduce((n,e)=>n+e.amount,0));
  }
  if(challenge==='delivery'){
   expect(x.deliveredProjectIds).toHaveLength(2);
   expect(x.requiredProjectIds.every(id=>s.projects.find(p=>p.id===id)!.deliveredDay!==null)).toBe(true);
  }
  const result={day:x.resultDay,reason:x.reason,result:x.result};
  to(s,s.day+60);
  expect({day:x.resultDay,reason:x.reason,result:x.result}).toEqual(result);
  expect(restore({...saved,day:s.day})).toEqual(shape(s));
 });
 it('不开发的千亿关到期失败，不能用融资或资本投入充当销售',()=>{
  const s=start({mode:'challenge',difficulty:'standard',challenge:'sales'});
  expect(applyCommand(s,{type:'strategicInvestment',share:.4}).ok).toBe(true);
  expect(applyCommand(s,{type:'borrow',channel:'trust',amount:1000}).ok).toBe(true);
  to(s,s.session!.targetDay!);
  expect(s.session!.result).toBe('lost');expect(s.session!.sales).toBe(0);
  expect(s.session!.resultDay).toBe(1800);expect(s.pauses).toContain('challenge');
 });
 it('保交楼目标在交付前转让立即失败，不能把买方交楼当自己的成果',()=>{
  const s=start({mode:'challenge',difficulty:'standard',challenge:'delivery'});
  expect(applyCommand(s,{type:'sellProject',projectId:s.projects[1].id}).ok).toBe(true);
  expect(s.session!.result).toBe('lost');expect(s.session!.deliveredProjectIds).toEqual([]);
  expect(s.session!.reason).toContain('转让');
 });
 it('沙盒资金只在沙盒可用，记入融资资本；月底补资防破产且不免债',()=>{
  const career=start({mode:'career',difficulty:'standard'}),before=JSON.stringify(career);
  expect(applyCommand(career,{type:'sandboxGrant'}).ok).toBe(false);expect(JSON.stringify(career)).toBe(before);
  const base=structuredClone(defaultConfig);base.finance.channels.trust.rate=12;
  const s=newGame(7,base);
  expect(applyCommand(s,{type:'startGame',options:{mode:'sandbox',difficulty:'standard'}},base).ok).toBe(true);
  expect(applyCommand(s,{type:'sandboxGrant'}).ok).toBe(true);
  expect(statements(s,[currentReport(s)])!.profit).toBeCloseTo(0);
  expect(applyCommand(s,{type:'borrow',channel:'trust',amount:800000}).ok).toBe(true);
  to(s,540);
  expect(s.status).toBe('playing');expect(s.cash).toBeGreaterThanOrEqual(0);
  expect(s.debts).toHaveLength(0);
  expect(s.reports.journal.filter(e=>e.kind==='repay').reduce((n,e)=>n+e.amount,0)).toBe(800000);
  expect(s.session!.sandboxCapitalIn).toBeGreaterThan(500000);
  const report=statements(s,[...s.reports.months,currentReport(s)])!;
  expect(report.profit).toBeCloseTo(-report.finance);
  expect(report.capitalIn).toBeCloseTo(s.session!.sandboxCapitalIn);
  expect(report.netCash).toBeCloseTo(s.cash-1000000);
 });
 it('Game导出只含种子日志和版本边界，重开/导入更新配置，旧档不能换模式',()=>{
  vi.stubGlobal('localStorage',new Storage());vi.stubGlobal('indexedDB',undefined);
  const g=new Game();
  const options:SessionOptions={mode:'sandbox',difficulty:'hard'};
  expect(g.restart(options).ok).toBe(true);expect(g.config.start.cash).toBe(600000);
  options.difficulty='easy';expect(g.state.session!.options.difficulty).toBe('hard');
  expect(g.issue({type:'sandboxGrant'}).ok).toBe(true);
  const raw=g.exportSave(),data=JSON.parse(raw);
  expect(data.version).toBe(17);expect(data.log).toHaveLength(2);
  for(const key of ['state','session','rules','cash','projects'])expect(data).not.toHaveProperty(key);
  expect(g.importSave(raw).ok).toBe(true);expect(g.config.start.cash).toBe(600000);
  expect(g.state).toEqual(restore(validateSave(data)!));
  expect(g.importSave(JSON.stringify({version:14,seed:7,day:0,log:[]})).ok).toBe(true);
  expect(g.config.start.cash).toBe(50000);expect(g.data().legacyV14Until).toBe(0);
  expect(g.issue({type:'startGame',options:{mode:'sandbox',difficulty:'standard'}}).ok).toBe(false);
  expect(g.issue({type:'borrow',channel:'trust',amount:1000}).ok).toBe(true);
  expect(restore(validateSave(JSON.parse(g.exportSave()))!)).toEqual(g.state);
  expect(g.restart({mode:'career',difficulty:'easy'}).ok).toBe(true);
  expect(g.data().legacyV14Until).toBeUndefined();expect(g.config.start.cash).toBe(80000);
 });
 it('初始选择前不自动写空档；无效重开及坏导入保留当前档和配置',async()=>{
  const storage=new Storage();vi.stubGlobal('localStorage',storage);vi.stubGlobal('indexedDB',undefined);
  const g=new Game();await g.init();expect(g.needsSetup).toBe(true);expect(storage.getItem(SAVE_KEY)).toBeNull();
  g.restart({mode:'challenge',difficulty:'standard',challenge:'delivery'});
  const before=JSON.stringify(g.state),raw=storage.getItem(SAVE_KEY),rules=g.config;
  expect(g.restart({mode:'challenge',difficulty:'standard'} as SessionOptions).ok).toBe(false);
  expect(g.importSave(JSON.stringify({version:15,seed:7,day:2,log:[{day:2,command:{type:'startGame',options:{mode:'sandbox',difficulty:'easy'}}}]})).ok).toBe(false);
  expect(JSON.stringify(g.state)).toBe(before);expect(storage.getItem(SAVE_KEY)).toBe(raw);expect(g.config).toBe(rules);
 });
 it('拒绝新模式插入旧历史、重复开局和非法组合，缺迁移边界不猜测',()=>{
  const startCommand:Command={type:'startGame',options:{mode:'career',difficulty:'standard'}};
  for(const raw of [
   {version:14,seed:7,day:0,log:[{day:0,command:startCommand}]},
   {version:15,seed:7,day:0,log:[{day:0,command:startCommand},{day:0,command:startCommand}]},
   {version:15,seed:7,day:0,legacyV14Until:0,legacyV14LogCount:0,log:[{day:0,command:startCommand}]},
   {version:15,seed:7,day:0,legacyV13Until:0,legacyV13LogCount:0,log:[]},
  ])expect(validateSave(raw)).toBeNull();
 });
 it('选择与进度HTML只读，清楚标明场景资金、目标和失败条件',()=>{
  const options:SessionOptions={mode:'challenge',difficulty:'standard',challenge:'delivery'},s=start(options),before=JSON.stringify(s);
  const setup=setupMarkup(options,true),panel=sessionPanel(s.rules!,s);
  expect(setup).toContain('4.00 亿');expect(setup).toContain('6亿元债务');expect(setup).toContain('替换当前进度');
  expect(panel).toContain('0 / 2');expect(panel).toContain('转让或被接管');expect(JSON.stringify(s)).toBe(before);
 });
});
