import{describe,it,expect}from'vitest';
import{applyCommand,newGame,replay,stepDay,salesRate,salesEligible,defaultConfig,type Command,type Config,type LoggedCommand}from'./helpers/ordinary-auctions.ts';
import{projectsPanel}from'../src/ui/panels.ts';import{estimateLand}from'../src/estimates/land.ts';
function quiet():Config{const c=structuredClone(defaultConfig);c.start.cash=1e7;Object.assign(c.risk,{inspectionBase:0,inspectionAttentionFactor:0,materialChance:0,accidentChance:0,demandChance:0});return c;}
function selling(c=quiet()){
 const s=newGame(7,c),log:LoggedCommand[]=[],issue=(command:Command)=>{expect(applyCommand(s,command,c)).toEqual({ok:true});log.push({day:s.day,command});};
 issue({type:'bid',parcelId:'L1',amount:31146});while(s.day<30)stepDay(s,c);const p=s.projects[0];issue({type:'startProject',projectId:p.id,contractor:'standard'});while(!salesEligible(p,c))stepDay(s,c);
 return{s,p,c,log,issue};
}
describe('B4 品牌、营销投入与去化',()=>{
 it('标准施工满6个月的25%浮点边界即可预售、调营销，面板与内核一致',()=>{
  const {s,p,c,issue}=selling();expect(s.day).toBe(210);expect(p.progress).toBeCloseTo(.25);expect(p.salesIn).toBeGreaterThan(0);issue({type:'setMarketing',projectId:p.id,rate:.05});expect(projectsPanel(c,s,p.id)).toContain('营销投入');
 });
 it('中性品牌和默认营销保持原去化公式，品牌0/100分别作用',()=>{
  const c=quiet(),s=newGame(7,c),base=.08*.8*1.05;
  expect(salesRate(c,s,1)).toBeCloseTo(base);
  for(const brand of [0,100]){const cc=structuredClone(c);cc.quality.initialBrand=brand;const state=newGame(7,cc);expect(salesRate(cc,state,1)).toBeCloseTo(base*(1+(brand-50)*.006));}
 });
 it('营销提高实际销量，费用只按本项目真实销售回款计提',()=>{
  const low=selling(),high=selling();low.issue({type:'setMarketing',projectId:low.p.id,rate:0});high.issue({type:'setMarketing',projectId:high.p.id,rate:.12});
  const amounts=[];
  for(const item of [low,high]){const {s,p,c}=item,before={cash:s.cash,spent:p.buildSpent,sales:p.salesIn,released:p.escrowReleased};for(let i=0;i<30;i++)stepDay(s,c);const revenue=p.salesIn-before.sales;amounts.push(revenue);expect(s.cash-before.cash+p.buildSpent-before.spent).toBeCloseTo(p.escrowReleased-before.released-revenue*(p.marketingRate+c.sales.taxRate),6);}
  const k=low.c.marketing.spendSensitivity,m=low.c.sales.marketingRate;expect(amounts[1]/amounts[0]).toBeCloseTo((1+(.12-m)*k)/(1+(0-m)*k));expect(low.s.market).toEqual(high.s.market);expect(low.s.rng).toBe(high.s.rng);
 });
 it('各项目设置保留，默认3%，0与上限可用且不额外取随机数',()=>{
  const {s,p,c,issue}=selling();expect(p.marketingRate).toBe(.03);const rng=s.rng;
  issue({type:'setMarketing',projectId:p.id,rate:0});expect(p.marketingRate).toBe(0);issue({type:'setMarketing',projectId:p.id,rate:c.marketing.maxRate});expect(p.marketingRate).toBe(.12);expect(s.rng).toBe(rng);
  const html=projectsPanel(c,s,p.id);expect(html).toContain('营销投入');expect(html).toContain('预计月去化');expect(html).toContain('value="12"');
 });
 it('非法比例与非在售/已转让项目拒绝，状态不变',()=>{
  const {s,p,c,issue}=selling();for(const rate of [-.01,.12001,NaN,Infinity]){const before=JSON.stringify(s);expect(applyCommand(s,{type:'setMarketing',projectId:p.id,rate},c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
  issue({type:'sellProject',projectId:p.id});expect(applyCommand(s,{type:'setMarketing',projectId:p.id,rate:0},c).ok).toBe(false);
  const initial=newGame(7,c);expect(applyCommand(initial,{type:'setMarketing',projectId:'missing',rate:.03},c).ok).toBe(false);
  applyCommand(initial,{type:'bid',parcelId:'L1',amount:31146},c);for(let i=0;i<30;i++)stepDay(initial,c);expect(applyCommand(initial,{type:'setMarketing',projectId:initial.projects[0].id,rate:0},c).ok).toBe(false);
 });
 it('营销和品牌增益仍受最高月去化上限与价格抑制',()=>{
  const c=quiet();c.quality.initialBrand=100;c.sales.baseMonthlyAbsorption=10;const s=newGame(7,c);
  expect(salesRate(c,s,1,.12)).toBe(c.sales.maxMonthlyAbsorption);expect(salesRate(c,s,2,.12)).toBe(0);
 });
 it('达标交付加品牌且100封顶，不按后续月份重复增加',()=>{
  const c=quiet();c.quality.initialBrand=99;const {s,p}=selling(c);while(p.deliveredDay===null)stepDay(s,c);expect(s.brand).toBe(100);for(let i=0;i<30;i++)stepDay(s,c);expect(s.brand).toBe(100);
 });
 it('测算采用当前品牌与默认营销固定情景，且不改变状态',()=>{
  const c=quiet(),s=newGame(7,c),before=JSON.stringify(s),a=s.auctions[0],e=estimateLand(c,s,a,a.startPrice)!;expect(e.monthlyAbsorption).toBe(salesRate(c,s,1,c.sales.marketingRate));expect(JSON.stringify(s)).toBe(before);
  c.quality.initialBrand=80;const high=newGame(7,c);expect(estimateLand(c,high,a,a.startPrice)!.monthlyAbsorption).toBeGreaterThan(e.monthlyAbsorption);
 });
 it('营销调整、销售、品牌交付变化可从日志确定性重放',()=>{
  const {s,p,c,issue,log}=selling();issue({type:'setMarketing',projectId:p.id,rate:.08});for(let i=0;i<90;i++)stepDay(s,c);issue({type:'setMarketing',projectId:p.id,rate:0});while(p.deliveredDay===null)stepDay(s,c);expect(s.brand).toBe(52);expect(replay(s.seed,log,s.day,c)).toEqual({...s,pauses:[]});
 });
});
