import {describe,it,expect,vi,afterEach} from 'vitest';
import {newGame,stepDay,applyCommand,replay,defaultConfig,computeMetrics,type Config,type GameState,type LoggedCommand} from '../src/sim/index.ts';
import {clearAuction,bidError,saleableArea} from '../src/sim/auctions.ts';
import {estimateLand} from '../src/estimates/land.ts';
import {auctionsPanel,projectsPanel,auctionEstimateMarkup} from '../src/ui/panels.ts';
import {restore,validateSave} from '../src/save.ts';
import {Game} from '../src/game.ts';
function config(kind:'ascending'|'lottery'|'amenity',base:'none'|'school'|'affordable'='none'):Config {
 const c=structuredClone(defaultConfig);c.siteAttributes.enabled=false;for(const k of Object.keys(c.auctions.formats) as (keyof typeof c.auctions.formats)[])c.auctions.formats[k]=k===kind?1:0;
 for(const [k,v]of Object.entries(c.auctions.baseAmenities))v.weight=k===base?1:0;
 c.start.cash=1e7;c.auctions.capPremium=.01;
 for(const p of c.rivals.companies){p.cash=1e7;p.minMargin=0;p.premiumFactor=10;}
 return c;
}
const to=(s:GameState,day:number,c=defaultConfig)=>{while(s.day<day&&s.status!=='bankrupt')stepDay(s,c);expect(s.day).toBe(day);};
function audit(s:GameState,c:Config){for(const company of [s,...s.rivals.map(r=>r.company)]){const initial=company.opponentId?c.rivals.companies.find(p=>p.id===company.opponentId)!.cash:c.start.cash;expect(company.reports.journal.reduce((sum,e)=>sum+e.cash,initial)).toBeCloseTo(company.cash,5);expect(computeMetrics(company).totalAssets-computeMetrics(company).totalLiabilities).toBeCloseTo(computeMetrics(company).equity,5);}}
afterEach(()=>vi.unstubAllGlobals());
describe('B7 限价拍卖与真实配建',()=>{
 it('默认生成三种形式与两类配建；只读查询不改变随机数或状态',()=>{
  const kinds=new Set(),bases=new Set();for(let seed=1;seed<=30;seed++){const s=newGame(seed);for(const a of s.auctions){kinds.add(a.auction?.kind??'ascending');a.auction?.required.forEach(r=>bases.add(r.kind));}const before=JSON.stringify(s);for(const a of s.auctions){estimateLand(defaultConfig,s,a,a.startPrice);auctionEstimateMarkup(defaultConfig,s,a,a.startPrice);}auctionsPanel(defaultConfig,s,null);expect(JSON.stringify(s)).toBe(before);}expect([...kinds].sort()).toEqual(['amenity','ascending','lottery']);expect([...bases].sort()).toEqual(['affordable','school']);
 });
 it('越过限价、非有限/负/超限配建、未触顶额外配建被拒，保证金和日志不变',()=>{
  const c=config('amenity'),s=newGame(7,c),a=s.auctions[0],cap=a.auction!.priceCap!;
  for(const [amount,amenityRate]of [[cap+1,0],[cap,NaN],[cap,-.01],[cap,.16],[a.startPrice,.01]]){const before=JSON.stringify(s);expect(applyCommand(s,{type:'bid',parcelId:a.id,amount,amenityRate},c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
  expect(applyCommand(s,{type:'bid',parcelId:a.id,amount:cap,amenityRate:.15},c).ok).toBe(true);const cash=s.cash;expect(applyCommand(s,{type:'bid',parcelId:a.id,amount:cap,amenityRate:.1},c).ok).toBe(true);expect(s.cash).toBe(cash);expect(a.playerAmenityRate).toBe(.1);
 });
 it('真实多家触顶：摇号结果可重放，落选者保证金退回，不读取aiMax',()=>{
  const c=config('lottery'),winners=new Set();for(let seed=1;seed<=12;seed++){
   const s=newGame(seed,c),a=s.auctions[0],command={type:'bid' as const,parcelId:a.id,amount:a.auction!.priceCap!};expect(applyCommand(s,command,c).ok).toBe(true);to(s,1,c);expect(a.rivalBids!.filter(b=>b.amount===command.amount).length).toBeGreaterThanOrEqual(1);a.aiMax=Number.MAX_VALUE;to(s,a.endDay,c);
   const winner=[s,...s.rivals.map(r=>r.company)].find(x=>x.projects.some(p=>p.name===a.name))!;winners.add(winner.opponentId??'player');const p=winner.projects.find(p=>p.name===a.name)!;expect(p.landCost).toBe(command.amount);expect(p.auction!.extraAmenityRate).toBe(0);
   for(const company of [s,...s.rivals.map(r=>r.company)].filter(x=>x!==winner)){const paid=company.reports.journal.filter(e=>e.parcelId===a.id&&e.kind==='deposit').reduce((n,e)=>n-e.cash,0),refund=company.reports.journal.filter(e=>e.parcelId===a.id&&e.kind==='depositRefund').reduce((n,e)=>n+e.cash,0);expect(refund).toBeCloseTo(paid);}
   // aiMax is not copied into projects; deleting the completed parcel removes the deliberately changed field.
   expect(replay(seed,[{day:0,command}],s.day,c)).toEqual({...s,pauses:[]});audit(s,c);
  }expect(winners.size).toBeGreaterThan(1);
 });
 it('竞配建最高额胜出，额外保障房与学校均扣可售面积，完整建安不减少',()=>{
  const c=config('amenity','school'),s=newGame(7,c),a=s.auctions[0],amount=a.auction!.priceCap!,extra=.15;
  expect(applyCommand(s,{type:'bid',parcelId:a.id,amount,amenityRate:extra},c).ok).toBe(true);to(s,1,c);expect(a.rivalBids!.length).toBeGreaterThan(0);to(s,a.endDay,c);const p=s.projects.find(p=>p.name===a.name)!;
  expect(p.auction!.extraAmenityRate).toBe(extra);expect(p.saleableArea).toBeCloseTo(p.buildArea*(c.sales.saleableRatio-.05-extra));expect(p.buildCost).toBe(p.buildArea*c.buildCostPerSqm*c.districts.find(d=>d.id===p.districtId)!.buildCostFactor);
  const e=estimateLand(c,s,a,amount,'standard',extra)!;expect(e.saleableArea).toBe(p.saleableArea);expect(e.buildCost).toBe(p.buildCost);expect(projectsPanel(c,s,null)).toContain('实际可售');audit(s,c);
 });
 it('未转入竞配建时不承担额外面积；单家触顶按底价成交',()=>{
  const c=config('amenity','affordable');c.rivals.companies=[];const s=newGame(7,c),a=s.auctions[0];applyCommand(s,{type:'bid',parcelId:a.id,amount:a.auction!.priceCap!,amenityRate:.15},c);to(s,a.endDay,c);const p=s.projects[0];expect(p.landCost).toBe(a.startPrice);expect(p.auction!.extraAmenityRate).toBe(0);expect(p.saleableArea).toBe(p.buildArea*(c.sales.saleableRatio-.1));audit(s,c);
 });
 it('同额配建摇号仅限最高承诺；单一最高承诺不消耗随机数，未触顶者不参与',()=>{
  const c=config('amenity'),s=newGame(7,c),a=s.auctions[0],cap=a.auction!.priceCap!,rng=s.rng;
  const bids=[{amount:cap,amenityRate:.1,order:0},{amount:cap,amenityRate:.1,order:1},{amount:cap,amenityRate:.05,order:2},{amount:cap-1,amenityRate:.15,order:3}];
  const result=clearAuction(s,c,a,bids);expect(result.finalists).toBe(2);expect([0,1]).toContain(result.winner.order);expect(s.rng).not.toBe(rng);
  bids[1].amenityRate=.15;const before=s.rng;expect(clearAuction(s,c,a,bids).winner.order).toBe(1);expect(s.rng).toBe(before);
 });
 it('AI报价受限价/配建收益和实有资金约束，全部新规则长局账目可重放',()=>{
  for(const seed of [1,7,32]){const s=newGame(seed),log:LoggedCommand[]=[];for(let day=0;day<720;day++){if(s.day===1){const a=s.auctions[0],command={type:'bid' as const,parcelId:a.id,amount:a.auction?.priceCap??a.startPrice,amenityRate:a.auction?.kind==='amenity'?.12:0};if(applyCommand(s,command).ok)log.push({day:s.day,command});}for(const a of s.auctions)for(const b of a.rivalBids??[]){expect(bidError(defaultConfig,a,b.amount,b.amenityRate??0)).toBeNull();expect(b.deposit).toBe(a.startPrice*defaultConfig.land.depositRate);}stepDay(s);}audit(s,defaultConfig);expect(replay(seed,log,s.day)).toEqual({...s,pauses:[]});}
 });
 it('旧v8未结拍地块保留普通竞价和原面积；迁移同日指令与导出再导入一致',()=>{
  vi.stubGlobal('localStorage',undefined);vi.stubGlobal('indexedDB',undefined);
  const g=new Game();expect(g.importSave(JSON.stringify({version:8,seed:7,day:0,log:[]})).ok).toBe(true);expect(g.state.auctions.every(a=>!a.auction)).toBe(true);const a=g.state.auctions[0];expect(g.issue({type:'bid',parcelId:a.id,amount:a.startPrice*3}).ok).toBe(true);
  const saved=g.data();expect(saved.version).toBe(16);expect(saved.legacyV8Until).toBe(0);expect(saved.legacyV8LogCount).toBe(0);expect(saved).not.toHaveProperty('state');expect(restore(validateSave(saved)!)).toEqual({...g.state,pauses:[]});const loaded=new Game();expect(loaded.importSave(JSON.stringify(saved)).ok).toBe(true);expect(loaded.data().legacyV8LogCount).toBe(0);
  const s=restore(saved);to(s,a.endDay);const p=s.projects.find(p=>p.name===a.name)!;expect(p.auction).toBeUndefined();expect(p.saleableArea).toBe(p.buildArea*defaultConfig.sales.saleableRatio);
 });
 it('默认地块6013万元的四位亿输入不因二进制舍入误判超限',()=>{
  const s=restore(validateSave({version:9,seed:1,day:811,log:[]})!);const a=s.auctions.find(a=>a.id==='L37')!;expect(a.auction!.priceCap).toBe(6013);const html=auctionsPanel(defaultConfig,{...s,auctions:[a]},null,new Map([[a.id,'0.6013']]),new Map([[a.id,'12']]));expect(html).toContain('预期利润率');expect(html).not.toContain('有效报价后显示估算');
 });
 it('v9不伪造旧边界，非法或不完整v8边界拒绝；新指令配建值必须有限',()=>{
  const fresh={version:9,seed:7,day:0,log:[]};expect(validateSave(fresh)!.legacyV8Until).toBeUndefined();for(const markers of [{legacyV8Until:0},{legacyV8Until:1,legacyV8LogCount:0},{legacyV7Until:0,legacyV7LogCount:0}])expect(validateSave({...fresh,...markers})).toBeNull();expect(validateSave({...fresh,log:[{day:0,command:{type:'bid',parcelId:'L1',amount:1,amenityRate:Infinity}}]})).toBeNull();
 });
 it('估算扣除配建且总造价不变，输入与项目面板明确比例和面积，所有查询只读',()=>{
  const c=config('amenity','school'),s=newGame(7,c),a=s.auctions[0],cap=a.auction!.priceCap!,before=JSON.stringify(s),base=estimateLand(c,s,a,cap)!,extra=estimateLand(c,s,a,cap,'standard',.1)!;expect(extra.profit).toBeLessThan(base.profit);expect(extra.buildCost).toBe(base.buildCost);expect(extra.saleableArea).toBe(saleableArea(c,a.siteArea*a.far,a.auction,.1));expect(estimateLand(c,s,a,cap+1)).toBeNull();const html=auctionsPanel(c,s,null,new Map([[a.id,String(cap/10000)]]),new Map([[a.id,'10']]));expect(html).toContain('限地价后竞配建');expect(html).toContain('学校');expect(html).toContain('额外配建（%）');expect(auctionEstimateMarkup(c,s,a,cap,.1)).toContain('未转入则不承担');expect(JSON.stringify(s)).toBe(before);
 });
});
