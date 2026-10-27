import { describe, expect, it } from 'vitest';
import { newGame, applyCommand, stepDay, defaultConfig, computeMetrics, transferQuote, mapUnlocked, freeSites, backgroundOccupied, runGame, conservative, aggressive, replay, type Config, type GameState, type Project } from './helpers/ordinary-auctions.ts';
import { newGame as oldNew, applyCommand as oldApply, stepDay as oldStep } from '../src/legacy-v1/engine.ts';
import { validateSave, restore } from '../src/save.ts';
function quiet():Config {const c=structuredClone(defaultConfig);c.land.auctionDays=1;Object.assign(c.risk,{inspectionBase:0,inspectionAttentionFactor:0,materialChance:0,accidentChance:0,demandChance:0});return c;}
function advance(s:GameState,n:number,c:Config){for(let i=0;i<n;i++)stepDay(s,c);}
function project(c=quiet()):{s:GameState;p:Project;c:Config}{const s=newGame(7,c);const a=[...s.auctions].sort((a,b)=>a.startPrice-b.startPrice)[0];expect(applyCommand(s,{type:'bid',parcelId:a.id,amount:a.aiMax*2},c).ok).toBe(true);advance(s,1,c);expect(applyCommand(s,{type:"startProject",projectId:s.projects[0].id,contractor:"standard"},c).ok).toBe(true);advance(s,29,c);return {s,p:s.projects[0],c};}

describe('工程商票与融资边界',()=>{
 it('商票不能直接套现；仅在施工时产生应付票据，不虚增工程资产',()=>{
  const {s,p,c}=project();const cash=s.cash,spent=p.buildSpent,eq=computeMetrics(s).equity;
  expect(applyCommand(s,{type:'borrow',channel:'paper',amount:1000},c).ok).toBe(false);
  expect(applyCommand(s,{type:'setPaper',projectId:p.id,enabled:true},c).ok).toBe(true);
  expect(s.cash).toBe(cash);advance(s,30,c);
  const spend=p.buildSpent-spent,m=computeMetrics(s);
  expect(m.paperDebt).toBeCloseTo(spend*.5);expect(cash-s.cash).toBeCloseTo(spend*.5);expect(m.interestDebt).toBe(0);expect(m.equity).toBeCloseTo(eq);
 });
 it('商票到期兑付且不支持展期；停止签发后不再产生新票',()=>{
  const {s,p,c}=project();applyCommand(s,{type:'setPaper',projectId:p.id,enabled:true},c);advance(s,30,c);
  const d=s.debts.find(d=>d.channel==='paper')!;expect(applyCommand(s,{type:'extend',debtId:d.id},c).ok).toBe(false);
  applyCommand(s,{type:'setPaper',projectId:p.id,enabled:false},c);advance(s,d.maturityDay-s.day,c);expect(s.debts.find(x=>x.id===d.id)).toBeUndefined();expect(computeMetrics(s).paperDebt).toBe(0);
 });
 it('明股实债按实质计入债务并支付利息',()=>{
  const c=quiet(),s=newGame(5,c),eq=computeMetrics(s).equity;
  expect(applyCommand(s,{type:'borrow',channel:'hidden',amount:10000},c).ok).toBe(true);
  expect(computeMetrics(s).hiddenDebt).toBe(10000);expect(computeMetrics(s).interestDebt).toBe(10000);expect(computeMetrics(s).equity).toBe(eq);
  advance(s,30,c);expect(s.cash).toBeCloseTo(60000-10000*.15/12);
 });
 it('拒绝非有限金额和非法施工节奏，不改变状态',()=>{
  const {s,p,c}=project();for(const amount of [Infinity,NaN,-1]){const before=JSON.stringify(s);expect(applyCommand(s,{type:'borrow',channel:'trust',amount},c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
  expect(applyCommand(s,{type:'setPace',projectId:p.id,pace:'invalid' as 'fast'},c).ok).toBe(false);
 });
});
describe('合作开发与转让',()=>{
 it('引入合作资金不创造净资产，成本按权益分摊且不能重复合作',()=>{
  const {s,p,c}=project();const eq=computeMetrics(s).equity, cash=s.cash, spent=p.buildSpent;
  expect(applyCommand(s,{type:'cooperate',projectId:p.id},c).ok).toBe(true);
  expect(s.cash-cash).toBeCloseTo((p.landPaid+spent)*.3);expect(computeMetrics(s).equity).toBeCloseTo(eq);
  expect(applyCommand(s,{type:'cooperate',projectId:p.id},c).ok).toBe(false);
  const cash2=s.cash;advance(s,30,c);expect(cash2-s.cash).toBeCloseTo((p.buildSpent-spent)*.7);
 });
 it('有项目融资或已预售时不允许事后稀释合作',()=>{
  const {s,p,c}=project();applyCommand(s,{type:'borrow',channel:'devLoan',projectId:p.id,amount:1000},c);expect(applyCommand(s,{type:'cooperate',projectId:p.id},c).ok).toBe(false);
  applyCommand(s,{type:'repay',debtId:s.debts[0].id},c);advance(s,180,c);expect(p.soldArea).toBeGreaterThan(0);expect(applyCommand(s,{type:'cooperate',projectId:p.id},c).ok).toBe(false);
 });
 it('转让先结清项目债务；尾款、工程、预售义务不再重复扣款',()=>{
  const {s,p,c}=project();applyCommand(s,{type:'borrow',channel:'devLoan',projectId:p.id,amount:1000},c);const q=transferQuote(s,p,c),cash=s.cash;
  expect(applyCommand(s,{type:'sellProject',projectId:p.id},c).ok).toBe(true);expect(s.cash-cash).toBeCloseTo(q.net);expect(s.debts).toHaveLength(0);expect(computeMetrics(s).inventory).toBe(0);expect(computeMetrics(s).landPayable).toBe(0);
  const after=s.cash;advance(s,360,c);expect(s.cash).toBe(after);expect(applyCommand(s,{type:'sellProject',projectId:p.id},c).ok).toBe(false);
 });
});
describe('备案、事故与抽查',()=>{
 it('限价期无备案停止销售，审批满一个月后按备案上限成交',()=>{
  const {s,p,c}=project();advance(s,180,c);s.market.phaseIndex=3;s.market.phaseEndMonth=999;
  const sold=p.soldArea;advance(s,30,c);expect(p.soldArea).toBe(sold);
  expect(applyCommand(s,{type:'filePrice',projectId:p.id},c).ok).toBe(true);advance(s,29,c);expect(p.filedPrice).toBeNull();advance(s,1,c);expect(p.filedPrice).not.toBeNull();
  expect(p.soldArea).toBeGreaterThan(sold);expect(applyCommand(s,{type:'setPrice',projectId:p.id,priceFactor:1.2},c).ok).toBe(false);
 });
 it('挪用需补回尚未合法释放的款项、支付罚款并冻结融资',()=>{
  const {s,p,c}=project();advance(s,180,c);expect(p.salesIn-p.escrowReleased).toBeGreaterThan(0);
  expect(applyCommand(s,{type:'divert',projectId:p.id},c).ok).toBe(true);expect(p.diverted).toBeGreaterThan(0);expect(applyCommand(s,{type:'sellProject',projectId:p.id},c).ok).toBe(false);
  c.risk.inspectionBase=1;advance(s,30,c);expect(p.diverted).toBe(0);expect(s.financeFrozenUntil).toBe(s.day+c.risk.freezeMonths*30);expect(s.pauses).toContain('risk');
  expect(applyCommand(s,{type:'borrow',channel:'trust',amount:100},c).ok).toBe(false);
 });
 it('明股实债抽查处罚只对未披露融资收一次',()=>{
  const c=quiet(),s=newGame(5,c);applyCommand(s,{type:'borrow',channel:'hidden',amount:1000},c);c.risk.inspectionBase=1;advance(s,30,c);expect(s.debts[0].revealed).toBe(true);const freeze=s.financeFrozenUntil;advance(s,30,c);expect(s.financeFrozenUntil).toBe(freeze);
 });
 it('事故停工后按期恢复，涨价增加真实工程成本',()=>{
  const {s,p,c}=project();const before=p.progress;c.risk.accidentChance=1;advance(s,30,c);expect(p.progress).toBe(before);expect(p.stoppedUntil).toBe(s.day+60);
  c.risk.accidentChance=0;advance(s,30,c);expect(p.progress).toBe(before);advance(s,30,c);expect(p.progress).toBeGreaterThan(before);
  const spent=p.buildSpent;c.risk.materialChance=1;advance(s,30,c);expect(p.buildSpent-spent).toBeCloseTo(p.buildCost/c.construction.months*c.risk.materialCostFactor);
 });
});
describe('债务展期和远郊',()=>{
 it('展期有时间窗口、费用、加息与次数限制',()=>{
  const c=quiet(),s=newGame(2,c);applyCommand(s,{type:'borrow',channel:'trust',amount:1000},c);const d=s.debts[0];expect(applyCommand(s,{type:'extend',debtId:d.id},c).ok).toBe(false);
  advance(s,360,c);const cash=s.cash,oldDue=d.maturityDay;expect(applyCommand(s,{type:'extend',debtId:d.id},c).ok).toBe(true);expect(s.cash).toBeCloseTo(cash-20);expect(d.maturityDay).toBe(oldDue+180);expect(d.rate).toBeCloseTo(.14);expect(applyCommand(s,{type:'extend',debtId:d.id},c).ok).toBe(false);
 });
 it('远郊第3年开放，片区与占地独立，开放后可以拍地开发',()=>{
  const c=quiet(),s=newGame(4,c);expect(mapUnlocked(s,c,'suburb')).toBe(false);expect(s.auctions.every(a=>c.districts.find(d=>d.id===a.districtId)?.mapId==='city')).toBe(true);
  expect(freeSites('bishan',backgroundOccupied('suburb'),'suburb').length).toBeGreaterThan(0);advance(s,720,c);expect(mapUnlocked(s,c,'suburb')).toBe(true);
  let a=s.auctions.find(a=>['bishan','jiangjin'].includes(a.districtId));for(let i=0;i<8&&!a;i++){advance(s,90,c);a=s.auctions.find(a=>['bishan','jiangjin'].includes(a.districtId));}
  expect(a).toBeDefined();expect(applyCommand(s,{type:'bid',parcelId:a!.id,amount:a!.aiMax*2},c).ok).toBe(true);advance(s,30,c);expect(s.projects.some(p=>p.districtId===a!.districtId)).toBe(true);
 });
});
describe('存档兼容与长局',()=>{
 it('旧日志完全按旧规则回放，然后从旧日期接入新功能，同日新指令不丢失',()=>{
  const old=oldNew(7),a=[...old.auctions].sort((a,b)=>a.startPrice-b.startPrice)[0];const cmd={type:'bid' as const,parcelId:a.id,amount:a.aiMax*2};oldApply(old,cmd);for(let i=0;i<210;i++)oldStep(old);
  const save=validateSave({seed:7,day:210,log:[{day:0,command:cmd}]})!;const s=restore(save);expect(s.cash).toBe(old.cash);expect(s.rng).toBe(old.rng);expect(s.projects[0].progress).toBe(old.projects[0].progress);
  const extra={type:'setPaper' as const,projectId:s.projects[0].id,enabled:true};applyCommand(s,extra);save.log.push({day:210,command:extra});expect(restore(save)).toEqual(s);
 });
 it('新规则及新增指令日志可确定性回放',()=>{
  const s=newGame(7);const a=s.auctions[0],commands=[{day:0,command:{type:'bid' as const,parcelId:a.id,amount:a.aiMax*2}}];applyCommand(s,commands[0].command);for(let i=0;i<90;i++)stepDay(s);const rebuilt=replay(7,commands,90);expect(rebuilt).toEqual({...s,pauses:[]});
 });
 it('包含合作、商票、明股实债、备案、展期和转让的完整日志可重放',()=>{
  const c=quiet(),s=newGame(7,c),log:import('../src/sim/types.ts').LoggedCommand[]=[];
  const issue=(command:import('../src/sim/types.ts').Command)=>{expect(applyCommand(s,command,c).ok).toBe(true);log.push({day:s.day,command});};
  const a=[...s.auctions].sort((a,b)=>a.startPrice-b.startPrice)[0];issue({type:'bid',parcelId:a.id,amount:a.aiMax*2});advance(s,1,c);issue({type:"startProject",projectId:s.projects[0].id,contractor:"standard"});advance(s,29,c);const id=s.projects[0].id;
  issue({type:'cooperate',projectId:id});issue({type:'setPaper',projectId:id,enabled:true});issue({type:'borrow',channel:'hidden',amount:1000});issue({type:'filePrice',projectId:id});
  advance(s,600,c);const debt=s.debts.find(d=>d.channel==='hidden')!;issue({type:'extend',debtId:debt.id});issue({type:'sellProject',projectId:id});
  expect(replay(7,log,s.day,c)).toEqual({...s,pauses:[]});
 });
 it('损坏或乱序存档拒绝读取',()=>{expect(validateSave({seed:1,day:-1,log:[]})).toBeNull();expect(validateSave({seed:1,day:5,log:[{day:8,command:{type:'bid'}}]})).toBeNull();});
 it('30年两策略多个种子保持有限财务指标',()=>{for(const seed of [1,7,42])for(const strat of [conservative,aggressive]){const {state}=runGame(seed,strat,30);for(const v of Object.values(computeMetrics(state)))expect(Number.isFinite(v)).toBe(true);}});
});
