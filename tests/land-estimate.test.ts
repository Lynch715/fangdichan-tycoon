import {describe,it,expect} from 'vitest';
import {defaultConfig,newGame,stepDay,type Config} from './helpers/ordinary-auctions.ts';
import {estimateLand} from '../src/estimates/land.ts';
import {auctionsPanel,auctionEstimateMarkup} from '../src/ui/panels.ts';
function example():Config {
 const c=structuredClone(defaultConfig);
 Object.assign(c.construction,{months:2,presaleProgress:1,deliveryMonths:1,clearanceMonthsAfterDelivery:1});
 Object.assign(c.sales,{saleableRatio:1,marketingRate:0,taxRate:0,baseMonthlyAbsorption:.5,maxMonthlyAbsorption:.9});
 c.buildCostPerSqm=1;c.districts[0].buildCostFactor=1;c.land.balanceDueMonths=1;
 c.cycle.phases[0].absorption=1;c.cycle.phases[0].sentiment=50;return c;
}
const site={siteArea:100,far:1,districtId:'yuzhong',startPrice:20};
describe('拍地测算的月度资金与口径',()=>{
 it('手算样例：首付/尾款/工程分期，尾货折价后利润和持续回正',()=>{
  const c=example(),s=newGame(7,c),e=estimateLand(c,s,site,40)!;
  // 中标月无工程款；开工后2月建成，1月后交付，再1月清盘：售50、25、25㎡，最后25㎡折价15%。
  expect(e.months.map(m=>m.balance)).toEqual([-20,-90,-40,10,52.5]);
  expect(e.revenue).toBe(192.5);expect(e.buildCost).toBe(100);expect(e.profit).toBe(52.5);
  expect(e.margin).toBeCloseTo(52.5/192.5);expect(e.peakFunding).toBe(140);expect(e.paybackMonths).toBe(4);
  expect(e.months.at(-1)!.soldArea).toBe(100);expect(e.months.at(-1)!.balance).toBeCloseTo(e.profit);
 });
 it('提高报价只增加土地支出，不偷看对手价格，利润下降、资金占用不降',()=>{
  const c=example(),s=newGame(7,c),low=estimateLand(c,s,site,40)!,high=estimateLand(c,s,site,60)!;
  expect(high.revenue).toBe(low.revenue);expect(high.profit-low.profit).toBe(-20);expect(high.peakFunding).toBeGreaterThanOrEqual(low.peakFunding);
  expect(high.paybackMonths===null||high.paybackMonths>=low.paybackMonths!).toBe(true);
 });
 it('营销税费从现金支付，资金峰值包含监管回款释放前的支出',()=>{
  const c=example();c.sales.taxRate=.1;c.sales.marketingRate=.05;const e=estimateLand(c,newGame(7,c),site,40)!;
  expect(e.peakFunding).toBeCloseTo(155);expect(e.profit).toBeCloseTo(23.625);expect(e.paybackMonths).toBe(5);
  expect(e.months.at(-1)!.balance).toBeCloseTo(e.profit);
 });
 it('低去化率增加折价尾货，零去化仍按配置清盘；亏损明确无法回正',()=>{
  const c=example(),s=newGame(7,c),normal=estimateLand(c,s,site,40)!;
  c.sales.baseMonthlyAbsorption=.1;const slow=estimateLand(c,s,site,40)!;
  expect(slow.monthlyAbsorption).toBe(.1);expect(slow.revenue).toBeLessThan(normal.revenue);expect(slow.paybackMonths).toBe(5);
  c.sales.baseMonthlyAbsorption=0;const zero=estimateLand(c,s,site,40)!;expect(zero.revenue).toBe(170);expect(zero.paybackMonths).toBe(5);
  expect(estimateLand(c,s,site,250)!.paybackMonths).toBeNull();
 });
 it('监管按进度释放时，预售较早的项目需要更多自有资金',()=>{
  const loose=example();loose.construction.months=4;loose.construction.presaleProgress=.25;loose.regulation.startYear=10;loose.sales.baseMonthlyAbsorption=.2;
  const strict=structuredClone(loose);strict.regulation.startYear=1;
  const a=newGame(7,loose),b=newGame(7,strict);for(let i=0;i<30;i++){stepDay(a,loose);stepDay(b,strict);}
  expect(a.market).toEqual(b.market);expect(a.regulation.active).toBe(false);expect(b.regulation.active).toBe(true);
  expect(estimateLand(strict,b,site,40)!.peakFunding).toBeGreaterThan(estimateLand(loose,a,site,40)!.peakFunding);
 });
 it('保证金抵首付不重复扣除，尾款晚于清盘时仍计入回正和最终利润',()=>{
  const c=example();c.land.balanceDueMonths=6;const e=estimateLand(c,newGame(7,c),site,40)!;
  expect(e.months).toHaveLength(7);expect(e.months.at(-1)!.balance).toBeCloseTo(e.profit);expect(e.profit).toBe(52.5);
  const lateLoss=estimateLand(c,newGame(7,c),site,100)!;
  expect(lateLoss.months[4].balance).toBeGreaterThan(0);expect(lateLoss.months.at(-1)!.balance).toBeLessThan(0);expect(lateLoss.paybackMonths).toBeNull();
 });
 it('测算不修改配置、游戏状态或随机数，非法报价不产生数值',()=>{
  const c=example(),s=newGame(7,c),before=JSON.stringify({c,s,site});
  for(const offer of [NaN,Infinity,-1,0,19])expect(estimateLand(c,s,site,offer)).toBeNull();
  estimateLand(c,s,site,40);expect(JSON.stringify({c,s,site})).toBe(before);
 });
 it('限价情景用备案上限和对应售价去化，而非原房价',()=>{
  const c=example();c.cycle.startPhase=3;const s=newGame(7,c),e=estimateLand(c,s,site,40)!;
  expect(e.salePrice).toBeCloseTo(2*c.filing.maxMarketFactor);
  expect(e.monthlyAbsorption).toBeCloseTo(c.sales.baseMonthlyAbsorption*c.cycle.phases[3].absorption*(.5+s.market.sentiment/100)*(1-c.sales.priceElasticity*(c.filing.maxMarketFactor-1)));
 });
 it('拍卖卡片标明估算和资金口径，并用报价草稿计算，无效输入显示提示',()=>{
  const c=defaultConfig,s=newGame(7,c),a=s.auctions[0],draft=(a.startPrice*2/10000).toFixed(2);
  const html=auctionsPanel(c,s,null,new Map([[a.id,draft]]));
  expect(html).toContain(`value="${draft}"`);expect(html).toContain('预期利润率');expect(html).toContain('资金峰值');expect(html).toContain('回正月数');expect(html).toContain('估算');expect(html).toContain('利润未计融资利息');
  expect(auctionEstimateMarkup(c,s,a,0)).toContain('有效报价');
 });
});
