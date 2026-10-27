// 真实开发商子账本：仅由newGame内部初始化、applyCommand/stepDay调用。
import{siteCostFactor}from'./regions.ts';
import{saleableArea,clearAuction}from'./auctions.ts';
import{applyCommand,newGame,marketPrice}from'./engine.ts';
import{borrowCapacity,computeMetrics}from'./finance.ts';import{activeProject,priceRestricted,salesEligible}from'./features.ts';
import{createReports,ledger}from'./reporting.ts';import type{Config}from'./config.ts';
import type{GameState,RivalCompany,Parcel,ContractorId,Command}from'./types.ts';

export function createRivals(root:GameState,c:Config):RivalCompany[]{
 return c.rivals.companies.map(profile=>{
  const company=newGame((root.seed+profile.seedOffset)|0,c,profile.id);
  company.day=root.day;company.industry=root.industry;company.cash=profile.cash;company.market=root.market;company.reports=createReports(profile.cash);company.reports.sinceDay=root.day;company.reports.period=Math.floor(root.day/c.time.daysPerMonth)+1;company.reports.periodStart=root.day;company.rivalsSinceDay=root.day;company.stats.peakEquity=profile.cash;
  // 加入时同步监管日历；从当前日开始真实经营，不虚构旧项目/旧年度排名。
  company.regulation={...root.regulation,breaches:{...root.regulation.breaches},tier:0,debtBaseline:0};company.financeFrozenUntil=0;company.news=[];company.pauses=[];
  return{id:profile.id,name:profile.name,risk:profile.risk,company};
 });
}
function news(s:GameState,text:string){s.news.unshift({day:s.day,kind:'land',text});s.news.length=Math.min(60,s.news.length);}
export function actRivals(root:GameState,c:Config){
 for(const rival of root.rivals){
  const s=rival.company,profile=c.rivals.companies.find(p=>p.id===rival.id);if(!profile)continue;
  s.day=root.day;s.market=root.market;if(s.status==='bankrupt')continue;
  const issue=(command:Command)=>applyCommand(s,command,c);
  for(const p of s.projects){
   if(p.stage==='land')issue({type:'startProject',projectId:p.id,contractor:profile.contractor as ContractorId});
   if(activeProject(p)&&priceRestricted(s,c)&&p.filedPrice===null&&p.filingDueDay===null)issue({type:'filePrice',projectId:p.id});
  }
  if(root.day%c.time.daysPerMonth!==1)continue;
  const phase=c.cycle.phases[root.market.phaseIndex],weak=phase.priceDrift<0;
  for(const p of s.projects){
   if(p.stage==='construction'){
    if(p.pace!==profile.pace)issue({type:'setPace',projectId:p.id,pace:profile.pace as 'normal'|'fast'|'slow'});
    const cap=borrowCapacity(c,s,'devLoan',p.id).max*profile.devLoanUsage;if(cap>=c.rivals.minimumLoan)issue({type:'borrow',channel:'devLoan',projectId:p.id,amount:cap});
   }
   if(activeProject(p)){const target=weak?profile.downturnPriceFactor:profile.priceFactor;if(p.priceFactor!==target)issue({type:'setPrice',projectId:p.id,priceFactor:target});}
   if(salesEligible(p,c)&&p.marketingRate!==profile.marketingRate)issue({type:'setMarketing',projectId:p.id,rate:profile.marketingRate});
  }
  if(s.status!=='playing')continue;
  // 融资均受该公司的真实评级、存量借款及红线约束，到账后再报名。
  const trust=borrowCapacity(c,s,'trust').max*profile.trustUsage;
  if(trust>=c.rivals.minimumLoan)issue({type:'borrow',channel:'trust',amount:trust});
  let budget=s.cash-profile.cash*profile.cashReserve;
  for(const p of s.projects)if(activeProject(p))budget-=Math.max(0,p.landCost-p.landPaid)+Math.max(0,p.buildCost-p.buildSpent)*profile.buildReserveRate;
  for(const a of s.auctions)budget-=Math.max(0,(a.playerBid??0)*profile.landFundingRate-a.deposit);
  let count=s.projects.filter(activeProject).length+s.auctions.length;
  for(const a of [...root.auctions].sort((a,b)=>a.startPrice-b.startPrice)){
   if(a.endDay<=root.day||count>=profile.maxActive||a.rivalBids?.some(b=>b.rivalId===rival.id))continue;
   const area=a.siteArea*a.far,d=c.districts.find(d=>d.id===a.districtId)!,terms=c.construction.contractors[profile.contractor as ContractorId];
   const build=area*c.buildCostPerSqm*d.buildCostFactor*terms.costFactor*siteCostFactor(a.attributes);
   const price=marketPrice(c,s,a.districtId,a.attributes)*Math.min(profile.priceFactor,priceRestricted(s,c)?c.filing.maxMarketFactor:Infinity);
   const extra=a.auction?.kind==='amenity'?(c.auctions.rivalAmenityRates[profile.id as keyof typeof c.auctions.rivalAmenityRates]??0):0;
   const revenue=saleableArea(c,area,a.auction,extra)*price,ceiling=revenue*(1-c.sales.taxRate-profile.marketingRate-profile.minMargin)-build;
   const premium=(phase.aiPremium[0]+phase.aiPremium[1])/2*profile.premiumFactor;
   const amount=Math.floor(Math.min(a.startPrice*(1+premium),ceiling,a.auction?.priceCap??Infinity)),deposit=a.startPrice*c.land.depositRate;
   const reserve=Math.max(amount*profile.landFundingRate,deposit)+build*profile.buildReserveRate;
   if(amount<a.startPrice||reserve>budget||deposit>s.cash)continue;
   s.cash-=deposit;ledger(s,'deposit',-deposit,null,deposit,a.id);
   const amenityRate=a.auction?.kind==='amenity'&&amount===a.auction.priceCap?extra:0;
   (a.rivalBids??=[]).push({rivalId:rival.id,amount,deposit,...(a.auction?{amenityRate}: {})});
   s.auctions.push({...a,rivalBids:[],playerBid:amount,deposit,...(a.auction?{playerAmenityRate:amenityRate}:{})});budget-=reserve;count++;
   s.reports.decisions.push({day:s.day,kind:'command',text:`报名 ${a.name}，最高报价 ${(amount/10000).toFixed(2)}亿`});
  }
  s.rating=s.status==='playing'?s.rating:5;
  s.pauses=[];
 }
}

/** 玩家和对手使用同一组已缴保证金的真实报价，按次高报价加一档成交。 */
export function resolveCompetitiveAuction(root:GameState,c:Config,a:Parcel,award:(s:GameState,c:Config,a:Parcel,price:number)=>void){
 root.auctions=root.auctions.filter(x=>x!==a);
 type Bid={s:GameState;name:string;amount:number;deposit:number;order:number;amenityRate:number};
 const bids:Bid[]=[];
 if(a.playerBid!==null)bids.push({s:root,name:c.start.companyName,amount:a.playerBid,deposit:a.deposit,order:0,amenityRate:a.playerAmenityRate??0});
 for(const [i,rival]of root.rivals.entries()){
  const bid=a.rivalBids?.find(b=>b.rivalId===rival.id),s=rival.company;
  s.auctions=s.auctions.filter(x=>x.id!==a.id);
  if(!bid)continue;
  // 结拍时失去支付能力的对手撤回并退还保证金；不会凭空拿地或扣成负数。
  if(s.status==='bankrupt'||s.cash+bid.deposit<bid.amount*c.land.firstPaymentRate){s.cash+=bid.deposit;ledger(s,'depositRefund',bid.deposit,null,bid.deposit,a.id);continue;}
  bids.push({s,name:rival.name,amount:bid.amount,deposit:bid.deposit,order:i+1,amenityRate:bid.amenityRate??0});
 }
 bids.sort((a,b)=>b.amount-a.amount||a.order-b.order);
 if(!bids.length){news(root,`${a.name} 无有效报价，流拍`);return;}
 const result=clearAuction(root,c,a,bids),winner=result.winner,price=result.price;
 const detail=result.mode==='lottery'?`限价摇号（${result.finalists}家）`:result.mode==='amenity'?`竞配建 ${(result.extraAmenityRate*100).toFixed(1)}%${result.finalists>1?'，同额摇号':''}`:'按有效报价成交';
 for(const bid of bids.filter(b=>b!==winner)){bid.s.cash+=bid.deposit;ledger(bid.s,'depositRefund',bid.deposit,null,bid.deposit,a.id);}
 award(winner.s,c,{...a,deposit:winner.deposit,playerBid:winner.amount,playerAmenityRate:result.extraAmenityRate,rivalBids:[]},price);
 if(winner.s!==root){news(root,`${winner.name} 以 ${(price/10000).toFixed(2)}亿竞得 ${a.name}（${detail}）${a.playerBid===null?'':'，本公司保证金已退还'}`);winner.s.pauses=[];}
 else news(root,`${a.name} 成交；有效竞买 ${bids.length} 家，${detail}`);
}

export function rivalMetrics(root:GameState){return root.rivals.map(r=>({id:r.id,name:r.name,risk:r.risk,status:r.company.status,rating:r.company.rating,...computeMetrics(r.company),projects:r.company.projects.filter(activeProject).length,landWon:r.company.stats.landWon}));}

/** 地图合并只读项目，按拿地先后叠放；地块复开发时隐藏旧清盘楼。 */
export function allMapProjects(root:GameState){return[...root.projects,...root.rivals.flatMap(r=>r.company.projects)].sort((a,b)=>a.landDueDay-b.landDueDay);}

/** 实际月末现金违约才触发；同一困境连续月份只记一次，恢复后可再次违约。 */
export function updateIndustryDefaults(root:GameState,c:Config){
 for(const rival of root.rivals){
  const s=rival.company,failed=s.status==='distress'||s.status==='bankrupt';
  if(failed&&!rival.defaultActive){
   rival.defaultActive=true;rival.defaultDay=root.day;
   const before=root.market.sentiment;root.market.sentiment=Math.max(0,before-c.rivals.default.sentimentDrop);
   root.industry.creditUntil=Math.max(root.industry.creditUntil,root.day+c.rivals.default.tighteningMonths*c.time.daysPerMonth);
   root.industry.events.push({day:root.day,rivalId:rival.id,phase:c.cycle.phases[root.market.phaseIndex].id,cashGap:Math.max(-s.cash,0),sentimentBefore:before,sentimentAfter:root.market.sentiment});
   const text=`同行暴雷：${rival.name} 资金缺口 ${(-s.cash/10000).toFixed(2)}亿，市场情绪 −${c.rivals.default.sentimentDrop}；全行业新增融资收紧 ${c.rivals.default.tighteningMonths}个月，利差 +${(c.rivals.default.rateSpread*100).toFixed(0)}个百分点`;
   root.news.unshift({day:root.day,kind:'warning',text});root.news.length=Math.min(60,root.news.length);root.reports.decisions.push({day:root.day,kind:'risk',text});root.pauses.push('risk');
  }else if(!failed)rival.defaultActive=false;
 }
}
