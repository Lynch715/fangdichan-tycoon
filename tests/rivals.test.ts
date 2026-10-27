import{applyCommand as productionCommand,stepDay as productionDay}from'../src/sim/index.ts';
import{describe,it,expect,vi,afterEach}from'vitest';
import{newGame,applyCommand,stepDay,replay,defaultConfig,rivalMetrics,allMapProjects,type GameState}from'./helpers/ordinary-auctions.ts';
import{validateSave,restore}from'../src/save.ts';import{Game}from'../src/game.ts';import{rivalsPanel}from'../src/ui/rivals.ts';import{auctionsPanel}from'../src/ui/panels.ts';import golden from'./acceptance/b6-v6-golden.json';
afterEach(()=>vi.unstubAllGlobals());
const to=(s:GameState,day:number)=>{while(s.day<day&&s.status!=='bankrupt')stepDay(s);expect(s.day).toBe(day);};
function audit(s:GameState){for(const r of s.rivals){const c=r.company,initial=defaultConfig.rivals.companies.find(p=>p.id===r.id)!.cash;expect(c.reports.journal.reduce((n,e)=>n+e.cash,initial)).toBeCloseTo(c.cash,5);for(const report of c.reports.months){expect(report.closing.totalAssets-report.closing.totalLiabilities).toBeCloseTo(report.closing.equity,6);const flow=c.reports.journal.slice(report.fromEntry,report.toEntry).reduce((n,e)=>n+e.cash,0);expect(report.opening.cash+flow).toBeCloseTo(report.closing.cash,5);}}}
describe('B6b 真实开发商账本与竞拍',()=>{
 it('三家具名风险偏好，各自现金、债务和保证金，禁止递归生成对手',()=>{
  const s=newGame(7);expect(s.rivals.map(r=>r.name)).toEqual(['青岚置业','江舟地产','跃峰发展']);expect(new Set(s.rivals.map(r=>r.risk)).size).toBe(3);expect(s.rivals.every(r=>r.company.rivals.length===0)).toBe(true);to(s,1);
  for(const r of s.rivals){const bids=s.auctions.flatMap(a=>a.rivalBids??[]).filter(b=>b.rivalId===r.id),company=r.company;expect(company.auctions).toHaveLength(bids.length);expect(company.auctions.reduce((n,a)=>n+a.deposit,0)).toBeCloseTo(bids.reduce((n,b)=>n+b.deposit,0));expect(company.cash).toBeGreaterThanOrEqual(0);}
  expect(s.rivals[0].company.debts).toHaveLength(0);expect(s.rivals[2].company.debts.some(d=>d.channel==='trust')).toBe(true);audit(s);
 });
 it('玩家未报名，对手仍实际成交、扣地价、开工并月度付工程款',()=>{
  const s=newGame(7);to(s,60);expect(s.projects).toHaveLength(0);const rival=s.rivals.find(r=>r.company.projects.length)!;expect(rival.company.stats.landWon).toBeGreaterThan(0);const p=rival.company.projects[0];expect(p.stage).toBe('construction');expect(p.buildSpent).toBeGreaterThan(0);expect(p.progress).toBeGreaterThan(0);expect(rival.company.debts.some(d=>d.projectId===p.id)).toBe(true);expect(rival.company.reports.journal.some(e=>e.kind==='land'&&e.projectId===p.id)).toBe(true);expect(rival.company.reports.journal.some(e=>e.kind==='construction'&&e.projectId===p.id)).toBe(true);audit(s);
 });
 it('玩家最高报价成交仅收次高实际报价加一档，失败者保证金退回；aiMax不参与',()=>{
  const s=newGame(7),a=s.auctions[0],bid=a.startPrice*3;expect(applyCommand(s,{type:'bid',parcelId:a.id,amount:bid}).ok).toBe(true);to(s,1);
  const second=Math.max(...a.rivalBids!.map(b=>b.amount));a.aiMax=Number.MAX_VALUE;to(s,30);const p=s.projects.find(p=>p.name===a.name)!;expect(p.landCost).toBe(Math.min(bid,second+a.startPrice*defaultConfig.rivals.bidStepRate));expect(s.reports.journal.filter(e=>e.kind==='land'&&e.projectId===p.id).reduce((n,e)=>n+e.cash,0)).toBeCloseTo(-(p.landPaid-a.deposit));
  for(const b of a.rivalBids!){const company=s.rivals.find(r=>r.id===b.rivalId)!.company;expect(company.reports.journal.filter(e=>e.parcelId===a.id&&e.kind==='depositRefund').reduce((n,e)=>n+e.cash,0)).toBe(b.deposit);expect(company.projects.some(p=>p.name===a.name)).toBe(false);}audit(s);
 });
 it('无人可支付保证金则流拍；没有虚构心理价买家，无对手时玩家按底价成交',()=>{
  const c=structuredClone(defaultConfig);for(const p of c.rivals.companies){p.cash=1;p.trustUsage=0;}const s=newGame(7,c),a=s.auctions[0];for(let i=0;i<30;i++)stepDay(s,c);expect(s.rivals.every(r=>r.company.stats.landWon===0)).toBe(true);expect(s.news.some(n=>n.text.includes(a.name)&&n.text.includes('流拍'))).toBe(true);
  c.rivals.companies=[];const solo=newGame(7,c),land=solo.auctions[0];applyCommand(solo,{type:'bid',parcelId:land.id,amount:land.startPrice*2},c);for(let i=0;i<30;i++)stepDay(solo,c);expect(solo.projects[0].landCost).toBe(land.startPrice);
 });
 it('共享市场只更新一次，真实经营十年含销售/交付/利息/还本且全部对账',()=>{
  const s=newGame(7),c=structuredClone(defaultConfig);c.rivals.companies=[];const solo=newGame(7,c);for(let i=0;i<30;i++){stepDay(s);stepDay(solo,c);}expect(s.market).toEqual(solo.market);
  to(s,3600);for(const r of s.rivals){const company=r.company;expect(company.reports.journal.some(e=>e.kind==='saleBooked')).toBe(true);expect(company.reports.journal.some(e=>e.kind==='interest')).toBe(true);expect(company.reports.journal.some(e=>e.kind==='repay')).toBe(true);expect(company.stats.projectsClosed).toBeGreaterThan(0);expect(company.projects.every(p=>p.id.startsWith(r.id+'-'))).toBe(true);}
  expect(allMapProjects(s)).toHaveLength(s.rivals.reduce((n,r)=>n+r.company.projects.length,0));audit(s);
 });
 it('同种子同日志重建全部对手状态；查询和页面不改变现金/随机数/日志',()=>{
  const s=newGame(23),log=[{day:0,command:{type:'borrow' as const,channel:'trust' as const,amount:1000}}];applyCommand(s,log[0].command);to(s,900);const before=JSON.stringify(s);rivalMetrics(s);allMapProjects(s);rivalsPanel(defaultConfig,s);auctionsPanel(defaultConfig,s,null);expect(JSON.stringify(s)).toBe(before);expect(replay(23,log,900)).toEqual({...s,pauses:[]});
 });
 it('v6迁移边界当天的旧经济/报表保持，新对手从该日出生无伪造历史',()=>{
  const fixture=golden[0],save=validateSave(fixture.save)!,s=restore(save);expect(save.version).toBe(16);expect(save.legacyV6Until).toBe(fixture.day);expect(save.legacyV6LogCount).toBe(fixture.save.log.length);expect(s.rivalsSinceDay).toBe(fixture.day);expect(s.cash).toBe(fixture.cash);expect(s.rng).toBe(fixture.rng);expect(s.rivals.every(r=>r.company.projects.length===0&&r.company.reports.months.length===0&&r.company.day===fixture.day)).toBe(true);
  const command={type:'borrow' as const,channel:'trust' as const,amount:100};productionCommand(s,command);save.log.push({day:s.day,command});const end=s.day+31;while(s.day<end)productionDay(s);save.day=s.day;expect(restore(save)).toEqual({...s,pauses:[]});audit(s);
 });
 it('v7迁移边界必须成对且有序，不能绕过v6冻结或注入内部升级',()=>{
  const base={version:7,seed:7,day:30,log:[]};for(const markers of[{legacyV6Until:30},{legacyV6LogCount:0},{legacyV6Until:31,legacyV6LogCount:0},{legacyV5Until:30,legacyV5LogCount:0},{legacyV5Until:30,legacyV5LogCount:0,legacyV6Until:0,legacyV6LogCount:0}])expect(validateSave({...base,...markers})).toBeNull();expect(validateSave({...base,log:[{day:0,command:{type:'upgradeRules'}}]})).toBeNull();expect(validateSave({...base,version:99})).toBeNull();
 });
 it('Game导出仅种子日志和v6边界，重载及重开正常，不保存对手状态快照',()=>{
  vi.stubGlobal('localStorage',undefined);vi.stubGlobal('indexedDB',undefined);const g=new Game();expect(g.importSave(JSON.stringify(golden[2].save)).ok).toBe(true);const output=JSON.parse(g.exportSave());expect(output.version).toBe(16);expect(output.legacyV6Until).toBe(750);expect(output.rivals).toBeUndefined();expect(output.reports).toBeUndefined();const again=new Game();expect(again.importSave(JSON.stringify(output)).ok).toBe(true);expect(again.state).toEqual(g.state);again.restart();expect(JSON.parse(again.exportSave()).legacyV6Until).toBeUndefined();expect(again.state.rivalsSinceDay).toBe(0);
 });
});
