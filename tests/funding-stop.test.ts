import {describe,expect,it} from 'vitest';
import {applyCommand,computeMetrics,defaultConfig,newGame,replay,stepDay,type Command,type Config,type GameState,type LoggedCommand} from './helpers/ordinary-auctions.ts';
import {projectArtKey} from '../src/render/projectArt.ts';

function quietConfig(){
 const c=structuredClone(defaultConfig);c.rivals.companies=[];
 c.risk.inspectionBase=0;c.risk.inspectionAttentionFactor=0;c.risk.materialChance=0;c.risk.accidentChance=0;c.risk.demandChance=0;
 c.land.balanceDueMonths=12;c.land.auctionDays=1;return c;
}
function advance(s:GameState,c:Config,day:number){while(s.day<day&&s.status!=='bankrupt')stepDay(s,c);expect(s.day).toBe(day);}
function fixture(buildPayments=0,extra=0){
 const c=quietConfig(),probe=newGame(7,c),a=[...probe.auctions].sort((a,b)=>a.startPrice-b.startPrice)[0];
 const price=a.startPrice,d=c.districts.find(d=>d.id===a.districtId)!;
 const payment=a.siteArea*a.far*c.buildCostPerSqm*d.buildCostFactor/c.construction.months;
 c.start.cash=price*c.land.firstPaymentRate+payment*buildPayments+extra;
 const s=newGame(7,c),log:LoggedCommand[]=[];
 const issue=(command:Command)=>{const result=applyCommand(s,command,c);expect(result).toEqual({ok:true});log.push({day:s.day,command});};
 issue({type:'bid',parcelId:a.id,amount:a.aiMax*2});advance(s,c,1);issue({type:'startProject',projectId:s.projects[0].id,contractor:'standard'});advance(s,c,30);
 return {s,c,log,issue,p:s.projects[0],payment};
}

describe('B2 资金停工与政府接管',()=>{
 it('工程款差一万元即停工，不扣工程款、不计虚假进度',()=>{
  const {s,p,payment}=fixture(1,-1);
  expect(s.cash).toBeCloseTo(payment-1);expect(s.cash).toBeGreaterThan(0);
  expect(p.buildSpent).toBe(0);expect(p.progress).toBe(0);expect(p.fundingGap).toBeCloseTo(1);expect(p.fundingStoppedMonths).toBe(1);
 });
 it('现金恰好足额可施工；下月才首次计资金停工',()=>{
  const {s,c,p,payment}=fixture(1);
  expect(s.cash).toBeCloseTo(0);expect(p.buildSpent).toBeCloseTo(payment);expect(p.progress).toBeCloseTo(1/24);expect(p.fundingStoppedMonths).toBe(0);
  advance(s,c,60);expect(p.fundingStoppedMonths).toBe(1);expect(p.buildSpent).toBeCloseTo(payment);
 });
 it('第五个月尚可自救，第六个月才接管且不会重复接管',()=>{
  const {s,c,p,payment}=fixture(1,-1);advance(s,c,150);
  expect(p.stage).toBe('construction');expect(p.fundingStoppedMonths).toBe(5);expect(p.takeover).toBeNull();
  const attention=s.attention;advance(s,c,180);
  expect(p.stage).toBe('abandoned');expect(p.fundingStoppedMonths).toBe(6);expect(p.takeover?.day).toBe(180);expect(s.stats.projectsTakenOver).toBe(1);
  expect(s.attention).toBe(attention+c.regulation.takeoverAttentionIncrease-2);
  expect(s.cash).toBeCloseTo(payment-1);expect(projectArtKey(p)).toContain('abandoned');
  const snapshot=structuredClone(p.takeover);advance(s,c,210);expect(s.stats.projectsTakenOver).toBe(1);expect(p.takeover).toEqual(snapshot);expect(p.progress).toBe(0);
 });
 it('补足资金后实际施工才复工，并重新计算连续停工月份',()=>{
  const {s,c,p,payment,issue}=fixture(1,-1);advance(s,c,150);
  issue({type:'borrow',channel:'devLoan',projectId:p.id,amount:payment*2});advance(s,c,180);
  expect(p.stage).toBe('construction');expect(p.fundingStoppedMonths).toBe(0);expect(p.fundingGap).toBe(0);expect(p.progress).toBeCloseTo(1/24);
  expect(s.news.some(n=>n.text.includes('恢复施工'))).toBe(true);
  advance(s,c,240);expect(p.fundingStoppedMonths).toBe(1);expect(p.progress).toBeCloseTo(2/24);expect(p.takeover).toBeNull();
 });
 it('商票只在现金部分付足时随实际工程签发，合作按权益分摊',()=>{
  const {s,c,p,issue,payment}=fixture(0);issue({type:'setPaper',projectId:p.id,enabled:true});advance(s,c,60);
  expect(s.debts).toHaveLength(0);expect(p.buildSpent).toBe(0);expect(p.fundingStoppedMonths).toBe(2);
  issue({type:'cooperate',projectId:p.id});const cash=s.cash;advance(s,c,90);
  expect(p.progress).toBeCloseTo(1/24);expect(p.buildSpent).toBeCloseTo(payment);expect(p.fundingStoppedMonths).toBe(0);
  expect(s.debts).toHaveLength(1);expect(s.debts[0].principal).toBeCloseTo(payment*.7*.5);expect(s.cash).toBeCloseTo(cash-payment*.7*.5);
 });
 it('接管移除项目资产与交付义务，不给公司现金、不免除土地尾款',()=>{
  const {s,c,p,payment}=fixture(1,-1);advance(s,c,180);const m=computeMetrics(s);
  expect(m.inventory).toBe(0);expect(m.escrow).toBe(0);expect(m.contractLiabilities).toBe(0);expect(m.landPayable).toBeCloseTo(p.landCost-p.landPaid);
  expect(p.takeover?.remainingValue).toBeGreaterThan(0);expect(p.takeover?.bookValue).toBe(p.landCost);expect(s.cash).toBeCloseTo(payment-1);
  advance(s,c,Math.ceil(p.landDueDay/30)*30);expect(p.landPaid).toBe(p.landCost);expect(computeMetrics(s).landPayable).toBe(0);expect(s.cash).toBeCloseTo(payment-1-p.landCost*.5);
 });
 it('政府接管的项目不可再融资、转让、调价、挪款或改变外观',()=>{
  const {s,c,p}=fixture(0);advance(s,c,180);
  const commands:Command[]=[{type:'borrow',channel:'devLoan',projectId:p.id,amount:1},{type:'setPace',projectId:p.id,pace:'fast'},{type:'setPrice',projectId:p.id,priceFactor:1.1},{type:'setPaper',projectId:p.id,enabled:true},{type:'cooperate',projectId:p.id},{type:'divert',projectId:p.id},{type:'filePrice',projectId:p.id},{type:'sellProject',projectId:p.id},{type:'setAppearance',projectId:p.id,product:'tower',variant:'b'}];
  const before=JSON.stringify(s);for(const cmd of commands)expect(applyCommand(s,cmd,c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 });
 it('事故停工不会直接算作资金停工',()=>{
  const {s,c,p}=fixture(2);c.risk.accidentChance=1;c.risk.accidentCostOfBuild=0;advance(s,c,180);
  expect(p.stoppedUntil).toBeGreaterThan(s.day);expect(p.fundingStoppedMonths).toBe(0);expect(p.stage).toBe('construction');
 });
 it('已预售项目接管时划走实际未释放监管款，原开发贷仍留在公司',()=>{
  const c=quietConfig(),probe=newGame(7,c),a=[...probe.auctions].sort((a,b)=>a.startPrice-b.startPrice)[0],d=c.districts.find(d=>d.id===a.districtId)!;
  const payment=a.siteArea*a.far*c.buildCostPerSqm*d.buildCostFactor/24;
  c.start.cash=a.startPrice*.5+payment*2;
  c.construction.presaleProgress=.04;c.sales.baseMonthlyAbsorption=.001;c.sales.taxRate=0;c.sales.marketingRate=0;c.regulation.escrowReleaseLoose=0;
  const s=newGame(7,c);expect(applyCommand(s,{type:'bid',parcelId:a.id,amount:a.aiMax*2},c).ok).toBe(true);advance(s,c,1);expect(applyCommand(s,{type:'startProject',projectId:s.projects[0].id,contractor:'standard'},c).ok).toBe(true);advance(s,c,30);
  const p=s.projects[0];expect(applyCommand(s,{type:'borrow',channel:'devLoan',projectId:p.id,amount:100},c).ok).toBe(true);const debtId=s.debts[0].id;
  advance(s,c,240);expect(p.stage).toBe('abandoned');expect(p.takeover?.escrow).toBeGreaterThan(0);
  expect(p.takeover?.escrow).toBeCloseTo(p.salesIn-p.escrowReleased);expect(computeMetrics(s).escrow).toBe(0);expect(computeMetrics(s).inventory).toBe(0);expect(computeMetrics(s).contractLiabilities).toBe(0);
  expect(s.debts.find(d=>d.id===debtId)?.principal).toBe(100);expect(computeMetrics(s).interestDebt).toBe(100);
  const sales=p.salesIn;advance(s,c,270);expect(p.salesIn).toBe(sales);expect(p.takeover?.escrow).toBeCloseTo(p.salesIn-p.escrowReleased);
 });
 it('停工与复工的同种子日志完整重放一致',()=>{
  const {s,c,p,issue,log,payment}=fixture(1,-1);advance(s,c,90);issue({type:'borrow',channel:'devLoan',projectId:p.id,amount:payment*2});advance(s,c,300);
  expect(replay(s.seed,log,s.day,c)).toEqual({...s,pauses:[]});
 });
});
