import{describe,it,expect,afterEach,vi}from'vitest';
import{newGame,applyCommand,stepDay,defaultConfig,currentReport,statements,projectResult,projectIRR,sustainedPayback,computeMetrics,replay,type Command,type Config,type GameState,type LoggedCommand}from'./helpers/ordinary-auctions.ts';
import{reportsPanel}from'../src/ui/reports.ts';import{Game}from'../src/game.ts';
import{restore,validateSave}from'../src/save.ts';
import*as historicalReports from'../src/legacy-v6/legacy-reports.ts';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function quiet():Config{const c=structuredClone(defaultConfig);c.start.cash=1e6;Object.assign(c.risk,{inspectionBase:0,inspectionAttentionFactor:0,materialChance:0,accidentChance:0,demandChance:0});Object.assign(c.construction,{months:2,presaleProgress:1,deliveryMonths:1,clearanceMonthsAfterDelivery:1});return c;}
function fixture(c=quiet()){
 const s=newGame(7,c),log:LoggedCommand[]=[],issue=(command:Command)=>{expect(applyCommand(s,command,c)).toEqual({ok:true});log.push({day:s.day,command});};
 issue({type:'bid',parcelId:'L1',amount:31146});while(s.day<30)stepDay(s,c);const p=s.projects[0];issue({type:'startProject',projectId:p.id,contractor:'standard'});return{s,p,c,log,issue};
}
function to(s:GameState,c:Config,day:number){while(s.day<day&&s.status!=='bankrupt')stepDay(s,c);expect(s.day).toBe(day);}
function auditCash(s:GameState,c:Config){
 expect(s.reports.journal.reduce((n,e)=>n+e.cash,c.start.cash)).toBeCloseTo(s.cash,6);
 for(const report of [...s.reports.months,currentReport(s)]){const t=statements(s,[report])!;expect(t.opening.cash+t.netCash).toBeCloseTo(t.closing.cash,6);expect(t.closing.totalAssets-t.closing.totalLiabilities).toBeCloseTo(t.closing.equity,6);expect(t.revenue-t.cost-t.marketing-t.tax-t.risk-t.finance+t.otherProfit).toBeCloseTo(t.profit,6);}
}
describe('B5 结算指标',()=>{
 it('月度IRR年化、亏损IRR与无正负现金流边界',()=>{
  expect(projectIRR([-100,110]).annual).toBeCloseTo(1.1**12-1,8);expect(projectIRR([-100,80]).annual).toBeCloseTo(.8**12-1,8);expect(projectIRR([-100,-10]).annual).toBeNull();expect(projectIRR([0,0]).annual).toBeNull();
 });
 it('识别多个IRR和重根，不随意挑选一个收益率',()=>{
  expect(projectIRR([-100,230,-132]).annual).toBeNull();expect(projectIRR([-100,230,-132]).reason).toContain('多个');expect(projectIRR([-100,200,-100]).annual).toBeCloseTo(0,7);
 });
 it('自有资金回正要求此后持续非负，迟到支出不能被忽略',()=>{
  expect(sustainedPayback([-70,30,50,42.5])).toBe(3);expect(sustainedPayback([-100,150,-100])).toBeNull();expect(sustainedPayback([-100,150,-100,200])).toBe(4);
 });
});
describe('B5 真实流水与三张表',()=>{
 it('保证金抵首付，清盘利润计全额地价；后来到期尾款仍支付',()=>{
  const {s,p,c}=fixture();to(s,c,150);expect(p.stage).toBe('closed');expect(p.landPaid).toBe(p.landCost*.5);expect(s.pauses).toContain('settlement');
  const r=projectResult(s,p),profit=p.salesIn*(1-c.sales.taxRate-c.sales.marketingRate)-p.landCost-p.buildSpent;
  expect(r.complete).toBe(true);expect(r.profit).toBeCloseTo(profit,6);expect(r.margin).toBeCloseTo(profit/p.salesIn,8);expect(r.remainingObligations).toBe(p.landCost*.5);expect(r.annualIRR).not.toBeNull();
  expect(s.reports.journal.filter(e=>e.kind==='deposit')[0].projectId).toBe(p.id);expect(s.reports.origins[p.id].period).toBe(1);
  const cash=s.cash;to(s,c,210);expect(p.landPaid).toBe(p.landCost);expect(s.cash).toBeCloseTo(cash-p.landCost*.5,6);expect(projectResult(s,p).profit).toBeCloseTo(profit,6);auditCash(s,c);
 });
 it('预售回款不提前确认收入；交付结转成本与收入，年表合计一致',()=>{
  const {s,p,c}=fixture();to(s,c,90);const presale=statements(s,[s.reports.months[2]])!;expect(p.salesIn).toBeGreaterThan(0);expect(presale.salesReceived).toBe(p.salesIn);expect(presale.revenue).toBe(0);expect(presale.cost).toBe(0);
  to(s,c,150);const t=statements(s,s.reports.months)!;expect(t.revenue).toBeCloseTo(p.salesIn,6);expect(t.cost).toBeCloseTo(p.landCost+p.buildSpent,6);expect(t.profit).toBeCloseTo(computeMetrics(s).equity-c.start.cash,6);expect(t.netCash).toBeCloseTo(s.cash-c.start.cash,6);auditCash(s,c);
 });
 it('项目借款和商票不能虚增利润；结算预留未还余额及利息',()=>{
  const {s,p,c,issue}=fixture();issue({type:'borrow',channel:'devLoan',projectId:p.id,amount:1000});issue({type:'setPaper',projectId:p.id,enabled:true});to(s,c,150);
  const r=projectResult(s,p),interest=s.reports.journal.filter(e=>e.projectId===p.id&&e.kind==='interest').reduce((n,e)=>n+e.amount,0),profit=p.salesIn*(1-c.sales.taxRate-c.sales.marketingRate)-p.landCost-p.buildSpent-interest;
  expect(r.profit).toBeCloseTo(profit,6);expect(r.remainingObligations).toBeCloseTo(p.landCost-p.landPaid+s.debts.reduce((n,d)=>n+d.principal,0),6);expect(s.reports.journal.filter(e=>e.kind==='paperIssue').reduce((n,e)=>n+e.amount,0)).toBeCloseTo(p.buildSpent*.5,6);auditCash(s,c);
 });
 it('合作投资是资金回笼而非销售收入，收益按实际权益流量核对',()=>{
  const {s,p,c,issue}=fixture();issue({type:'cooperate',projectId:p.id});to(s,c,150);const r=projectResult(s,p),profit=(p.salesIn*(1-c.sales.taxRate-c.sales.marketingRate)-p.landCost-p.buildSpent)*.7;
  expect(r.revenue).toBeCloseTo(p.salesIn*.7,6);expect(r.profit).toBeCloseTo(profit,6);expect(statements(s,s.reports.months)!.revenue).toBeCloseTo(p.salesIn*.7,6);auditCash(s,c);
 });
 it('公司统借利息只扣一次，并按存货额进入项目费用分摊',()=>{
  const {s,p,c,issue}=fixture();issue({type:'borrow',channel:'trust',amount:1000});to(s,c,90);
  const interest=s.reports.journal.filter(e=>e.kind==='interest').reduce((n,e)=>n+e.amount,0),allocated=s.reports.journal.filter(e=>e.kind==='financeAllocation').reduce((n,e)=>n+e.amount,0);
  expect(allocated).toBeCloseTo(interest,8);expect(s.reports.journal.filter(e=>e.kind==='financeAllocation').every(e=>e.cash===0&&e.projectId===p.id&&e.projectCash<0)).toBe(true);auditCash(s,c);
 });
 it('监管追缴、罚款、事故和项目转让现金全部对账',()=>{
  const c=quiet();c.construction.months=24;c.construction.presaleProgress=.25;const {s,p,issue}=fixture(c);to(s,c,210);issue({type:'divert',projectId:p.id});c.risk.inspectionBase=1;c.risk.accidentChance=1;to(s,c,240);
  expect(s.reports.journal.some(e=>e.kind==='fine'&&e.projectId===p.id)).toBe(true);expect(s.reports.journal.some(e=>e.kind==='accident')).toBe(true);expect(p.diverted).toBe(0);auditCash(s,c);
  const other=fixture();other.issue({type:'borrow',channel:'devLoan',projectId:other.p.id,amount:1000});other.issue({type:'sellProject',projectId:other.p.id});expect(other.s.reports.journal.some(e=>e.kind==='transfer')).toBe(true);expect(other.s.debts).toHaveLength(0);auditCash(other.s,other.c);
 });
 it('明股实债抽查手算：借款不是收入，罚款和利息进入费用',()=>{
  const c=quiet();c.risk.inspectionBase=1;const s=newGame(7,c);expect(applyCommand(s,{type:'borrow',channel:'hidden',amount:1000},c).ok).toBe(true);to(s,c,30);const t=statements(s,s.reports.months)!;
  expect(t.revenue).toBe(0);expect(t.finance).toBe(12.5);expect(t.risk).toBe(30);expect(t.profit).toBe(-42.5);expect(t.otherProfit).toBeCloseTo(0,8);expect(t.netCash).toBe(957.5);auditCash(s,c);
 });
 it('非法指令不留假流水；只读报表不改变状态和随机数',()=>{
  const {s,p,c}=fixture();const before=JSON.stringify(s);expect(applyCommand(s,{type:'repay',debtId:'missing'},c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  for(const view of ['month','year','projects','review']as const)reportsPanel(c,s,view);projectResult(s,p);statements(s,s.reports.months);expect(JSON.stringify(s)).toBe(before);
 });
 it('统计回溯异常不影响旧档经济读取，降级数据不冒充完整年度',()=>{
  vi.spyOn(historicalReports,'rebuildLegacyReports').mockImplementation(()=>{throw Error('test-recorder-unavailable');});
  const old=restore(validateSave({version:5,seed:7,day:15,log:[]})!);to(old,defaultConfig,360);expect(old.cash).toBe(50000);expect(old.reports.replayError).toBe("test-recorder-unavailable");expect(old.reports.months).toHaveLength(12);expect(reportsPanel(defaultConfig,old,'year','1')).toContain('年度记录尚不完整');
  const full=newGame(7);to(full,defaultConfig,360);expect(reportsPanel(defaultConfig,full,'year','1')).toContain('>完整年度 ·');
 });
 it('项目结算、关键决策与月表可从种子日志完整重建',()=>{
  const {s,p,c,issue,log}=fixture();issue({type:'borrow',channel:'devLoan',projectId:p.id,amount:1000});to(s,c,210);expect(replay(7,log,s.day,c)).toEqual({...s,pauses:[]});expect(s.reports.decisions.some(d=>d.text.includes('借入'))).toBe(true);
 });
 it('同月多个项目清盘时可在同一批结算中逐个查看',()=>{
  const c=quiet(),s=newGame(7,c);for(const a of s.auctions.slice(0,2))expect(applyCommand(s,{type:'bid',parcelId:a.id,amount:a.aiMax*2},c).ok).toBe(true);to(s,c,30);for(const p of s.projects)expect(applyCommand(s,{type:'startProject',projectId:p.id,contractor:'standard'},c).ok).toBe(true);to(s,c,150);expect(s.reports.closedProjects).toHaveLength(2);const html=reportsPanel(c,s,'projects',s.reports.closedProjects.join(','));expect(html.match(/· 清盘结算/g)).toHaveLength(2);for(const p of s.projects)expect(html).toContain(p.name);
 });
 it('真实破产局保留规模、杠杆和关键决策，复盘不靠最近60条新闻',()=>{
  const s=newGame(8);applyCommand(s,{type:'bid',parcelId:'L4',amount:192156});to(s,defaultConfig,30);applyCommand(s,{type:'startProject',projectId:s.projects[0].id,contractor:'standard'});while(s.status!=='bankrupt')stepDay(s);
  expect(s.reports.months.length).toBeGreaterThan(6);expect(s.reports.decisions.some(d=>d.kind==='bankruptcy')).toBe(true);expect(s.reports.decisions.some(d=>d.text.includes('土地出价'))).toBe(true);const html=reportsPanel(defaultConfig,s,'review');expect(html).toContain('总资产规模');expect(html).toContain('总负债 / 总资产');expect(html).toContain('破产复盘');auditCash(s,defaultConfig);
 });
 it('导出只存种子和命令，报表随回放重建而不写状态快照',()=>{
  vi.stubGlobal('localStorage',undefined);vi.stubGlobal('indexedDB',undefined);const g=new Game();expect(g.importSave(JSON.stringify({version:6,seed:7,day:30,log:[{day:0,command:{type:'borrow',channel:'trust',amount:1000}}]})).ok).toBe(true);const data=JSON.parse(g.exportSave());expect(data.reports).toBeUndefined();expect(data.journal).toBeUndefined();const next=new Game();expect(next.importSave(JSON.stringify(data)).ok).toBe(true);expect(next.state.reports).toEqual(g.state.reports);
 });
});
