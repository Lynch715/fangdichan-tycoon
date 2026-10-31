import {describe,it,expect,vi,afterEach} from 'vitest';
import {newGame,stepDay,applyCommand,borrowCapacity,channelRate,defaultConfig,computeMetrics,currentReport,statements,replay,accelerateDebts,type Config,type GameState,type LoggedCommand} from '../src/sim/index.ts';
import {restore,validateSave} from '../src/save.ts';import {Game} from '../src/game.ts';import {financePanel} from '../src/ui/panels.ts';
const quiet=()=>{const c=structuredClone(defaultConfig);c.rivals.companies=[];c.land.parcelsPerQuarter=[0,0];return c;};
const to=(s:GameState,day:number,c:Config)=>{while(s.day<day&&s.status!=='bankrupt')stepDay(s,c);expect(s.day).toBe(day);};
function stress(){const c=quiet();c.start.cash=1000;c.finance.channels.trust.maxOfEquity=1000;c.finance.channels.trust.termMonths=1;const s=newGame(7,c),log:LoggedCommand[]=[];for(const command of [{type:'borrow' as const,channel:'bond' as const,amount:600,termMonths:36},{type:'borrow' as const,channel:'trust' as const,amount:1e6}]){expect(applyCommand(s,command,c).ok).toBe(true);log.push({day:0,command});}return{s,c,log};}
function audit(s:GameState,c:Config){expect(s.reports.journal.reduce((n,e)=>n+e.cash,c.start.cash)).toBeCloseTo(s.cash,7);for(const r of[...s.reports.months,currentReport(s)]){const t=statements(s,[r])!;expect(t.opening.cash+t.netCash).toBeCloseTo(t.closing.cash,7);expect(t.closing.totalAssets-t.closing.totalLiabilities).toBeCloseTo(t.closing.equity,7);}}
afterEach(()=>vi.unstubAllGlobals());
describe('B8 公司债与评级提前到期',()=>{
 it('AAA/AA可发行，A及以下、破产、冻结不得发行，极小金额也不能绕过门槛',()=>{
  const c=quiet();for(const rating of[0,1,2,3,4,5,6]){const s={...newGame(7,c),rating};const cap=borrowCapacity(c,s,'bond');expect(cap.max>0).toBe(rating<=1);const before=JSON.stringify(s);const result=applyCommand(s,{type:'borrow',channel:'bond',amount:rating<=1?1000:1e-7},c);expect(result.ok).toBe(rating<=1);if(!result.ok)expect(JSON.stringify(s)).toBe(before);}
  for(const s of[{...newGame(7,c),financeFrozenUntil:30},{...newGame(7,c),status:'bankrupt' as const}])expect(borrowCapacity(c,s,'bond').max).toBe(0);
 });
 it('3/4/5年期、发行利率按评级4–8%，行业收紧受上限约束；旧合同利率不重定价',()=>{
  const c=quiet();for(const rating of[0,1])for(const termMonths of[36,48,60]){const s={...newGame(7,c),rating};expect(applyCommand(s,{type:'borrow',channel:'bond',amount:1000,termMonths},c).ok).toBe(true);const d=s.debts[0];expect(d.maturityDay).toBe(termMonths*c.time.daysPerMonth);expect(d.rate).toBe(rating===0?.04:.06);to(s,30,c);expect(d.rate).toBe(rating===0?.04:.06);}
  const tight={...newGame(7,c),industry:{creditUntil:180,events:[]}};expect(channelRate(c,tight,'bond')).toBe(.08);expect(borrowCapacity(c,tight,'bond').max).toBe(c.start.cash*.6*.5);
 });
 it('非法期限/金额/渠道原子拒绝，分笔发行不能绕过已用额度和红线',()=>{
  const c=quiet(),s=newGame(7,c);for(const termMonths of[0,12,37,NaN,Infinity]){const before=JSON.stringify(s);expect(applyCommand(s,{type:'borrow',channel:'bond',amount:100,termMonths},c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
  const before=JSON.stringify(s);expect(applyCommand(s,{type:'borrow',channel:'trust',amount:100,termMonths:36},c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  const cap=borrowCapacity(c,s,'bond').max;applyCommand(s,{type:'borrow',channel:'bond',amount:cap/2},c);expect(borrowCapacity(c,s,'bond').max).toBeCloseTo(cap/2);applyCommand(s,{type:'borrow',channel:'bond',amount:cap/2},c);expect(borrowCapacity(c,s,'bond').max).toBe(0);expect(applyCommand(s,{type:'borrow',channel:'bond',amount:1e-7},c).ok).toBe(false);
  const restricted={...newGame(7,c),regulation:{...s.regulation,active:true,tier:3,debtBaseline:0}};expect(borrowCapacity(c,restricted,'bond').max).toBe(c.start.cash*.5);
 });
 it('发债是借款现金而非利润，月息及正常到期还本准确，不因评级改善重算合同',()=>{
  const c=quiet(),s=newGame(7,c),equity=computeMetrics(s).equity;applyCommand(s,{type:'borrow',channel:'bond',amount:500,termMonths:36},c);expect(computeMetrics(s).equity).toBe(equity);expect(s.cash).toBe(c.start.cash+500);to(s,1080,c);expect(s.debts).toHaveLength(0);expect(s.cash).toBeCloseTo(c.start.cash-500*.06*3,6);expect(s.reports.journal.filter(e=>e.kind==='repay').reduce((n,e)=>n-e.cash,0)).toBe(500);audit(s,c);
 });
 it('持续困境第1月B不触发，第2月C拆出25%，总本金/净资产不变且下月实际还本',()=>{
  const{s,c}=stress();to(s,30,c);expect(s.rating).toBe(5);expect(s.debts).toHaveLength(1);expect(s.cash).toBeCloseTo(-8403);to(s,60,c);expect(s.rating).toBe(6);expect(s.status).toBe('distress');expect(s.debts).toHaveLength(2);const called=s.debts.find(d=>d.acceleration)!,rest=s.debts.find(d=>!d.acceleration)!;expect(called.principal).toBe(150);expect(called.maturityDay).toBe(90);expect(rest.principal).toBe(450);expect(rest.maturityDay).toBe(1080);expect(called.acceleration!.originalMaturityDay).toBe(1080);expect(s.debts.reduce((n,d)=>n+d.principal,0)).toBe(600);expect(s.cash).toBeCloseTo(-8406);expect(s.reports.journal.filter(e=>e.kind==='repay').map(e=>e.amount)).toEqual([1e6]);to(s,90,c);expect(s.cash).toBeCloseTo(-8559);expect(s.debts).toHaveLength(1);expect(s.debts[0].principal).toBe(450);expect(s.reports.decisions.filter(d=>d.text.includes('触发合同提前到期'))).toHaveLength(1);audit(s,c);
 });
 it('未到期合同只触发一次；商票/旧合同/通知期内债务不拆，触发没有现金或利息流水',()=>{
  const c=quiet(),base=newGame(7,c),terms={...c.finance.covenants},s:GameState={...base,rating:6,day:60,debts:[{id:'a',channel:'bond' as const,principal:400,rate:.06,startDay:0,maturityDay:1080,projectId:null,covenant:terms},{id:'old',channel:'trust' as const,principal:100,rate:.12,startDay:0,maturityDay:540,projectId:null},{id:'near',channel:'trust' as const,principal:100,rate:.12,startDay:0,maturityDay:90,projectId:null,covenant:{...terms}},{id:'paper',channel:'paper' as const,principal:100,rate:0,startDay:0,maturityDay:360,projectId:null,covenant:{...terms}}]};
  const cash=s.cash,equity=computeMetrics(s).equity,journal=JSON.stringify(s.reports.journal);let n=0;accelerateDebts(s,c,()=>`called${++n}`);expect(s.debts).toHaveLength(5);expect(s.cash).toBe(cash);expect(computeMetrics(s).equity).toBe(equity);expect(JSON.stringify(s.reports.journal)).toBe(journal);const before=JSON.stringify(s);accelerateDebts(s,c,()=>`called${++n}`);expect(JSON.stringify(s)).toBe(before);expect(s.debts.filter(d=>d.acceleration).map(d=>d.acceleration!.originalDebtId)).toEqual(['a']);
 });
 it('提前偿还允许，提前到期部分不允许展期，普通公司债展期仍不超过8%',()=>{
  const{s,c}=stress();to(s,60,c);const called=s.debts.find(d=>d.acceleration)!;const before=JSON.stringify(s);expect(applyCommand(s,{type:'extend',debtId:called.id},c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  const rich={...s,cash:1000};expect(applyCommand(rich,{type:'repay',debtId:called.id},c).ok).toBe(true);expect(rich.cash).toBe(850);expect(rich.debts.some(d=>d.id===called.id)).toBe(false);
  const normal=newGame(7,quiet());applyCommand(normal,{type:'borrow',channel:'bond',amount:1000,termMonths:36},quiet());to(normal,900,quiet());const d=normal.debts[0];expect(applyCommand(normal,{type:'extend',debtId:d.id},quiet()).ok).toBe(true);expect(d.rate).toBe(.08);expect(d.maturityDay).toBe(1260);
 });
 it('真实指令到C、提前还本与报表可完整重放，所有财务查询只读',()=>{
  const{s,c,log}=stress();to(s,90,c);const before=JSON.stringify(s);borrowCapacity(c,s,'bond');channelRate(c,s,'bond');const html=financePanel(c,s);expect(html).toContain('评级低于 B');expect(html).toContain('持续资金困境 2 个月降至 C');expect(JSON.stringify(s)).toBe(before);expect(replay(7,log,90,c)).toEqual({...s,pauses:[]});
 });
 it('v9老合同原样迁移，同日新增公司债有新条款；Game导出重载保留边界',()=>{
  vi.stubGlobal('localStorage',undefined);vi.stubGlobal('indexedDB',undefined);const raw={version:9,seed:7,day:0,log:[{day:0,command:{type:'borrow',channel:'trust',amount:1000}}]},save=validateSave(raw)!,s=restore(save);expect(save.legacyV9Until).toBe(0);expect(save.legacyV9LogCount).toBe(1);expect(s.debts[0].covenant).toBeUndefined();const command={type:'borrow' as const,channel:'bond' as const,amount:2000,termMonths:60};applyCommand(s,command);save.log.push({day:0,command});expect(s.debts[1].covenant).toBeDefined();expect(restore(save)).toEqual({...s,pauses:[]});const g=new Game();expect(g.importSave(JSON.stringify(save)).ok).toBe(true);const exported=JSON.parse(g.exportSave());expect(exported.version).toBe(17);expect(exported.legacyV9LogCount).toBe(1);expect(exported.debts).toBeUndefined();expect(restore(validateSave(exported)!)).toEqual({...s,pauses:[]});
 });
});
