// 拍地前的固定情景估算：不推进游戏、不取随机数、不修改状态。
import{siteCostFactor,siteDurationFactor}from'../sim/regions.ts';
import{saleableArea,bidError}from'../sim/auctions.ts';
import {district,type Config} from '../sim/config.ts';
import {marketPrice,salesRate} from '../sim/engine.ts';
import {priceRestricted} from '../sim/features.ts';
import type {ContractorId,GameState,Parcel} from '../sim/types.ts';

export interface EstimateMonth {month:number;balance:number;progress:number;soldArea:number;revenue:number;released:number;outflow:number}
export interface LandEstimate {
 saleableArea:number;salePrice:number;monthlyAbsorption:number;buildCost:number;revenue:number;profit:number;margin:number|null;
 peakFunding:number;paybackMonths:number|null;months:EstimateMonth[];
}
/** 中标当月计第1月；独资、正常施工、无新增融资，当前房价/去化/监管保持不变。 */
export function estimateLand(c:Config,s:GameState,a:Pick<Parcel,'siteArea'|'far'|'districtId'|'startPrice'|'auction'|'attributes'>,offer:number,contractor:ContractorId='standard',extraAmenityRate=0):LandEstimate|null {
 const area=a.siteArea*a.far,d=district(c,a.districtId),market=marketPrice(c,s,a.districtId,a.attributes),pace=c.construction.paces.normal;
 if(bidError(c,a,offer,extraAmenityRate)||!Number.isFinite(offer)||offer<a.startPrice||offer<=0||area<=0||!Number.isFinite(area)||market<=0||!Number.isFinite(market))return null;
 const restricted=priceRestricted(s,c),priceFactor=restricted?Math.min(1,c.filing.maxMarketFactor):1;
 const salePrice=market*priceFactor,rate=salesRate(c,s,priceFactor,c.sales.marketingRate,a.districtId),saleable=saleableArea(c,area,a.auction,extraAmenityRate);
 const terms=c.construction.contractors[contractor];
 const duration=c.construction.months*terms.durationFactor*siteDurationFactor(a.attributes);
 const buildCost=area*c.buildCostPerSqm*d.buildCostFactor*pace.costFactor*terms.costFactor*siteCostFactor(a.attributes);
 // 中标日正值月末：玩家选定开工后的下次月末才发生首笔工程款。
 const completed=Math.ceil(duration/pace.speed),delivered=completed+Math.ceil(c.construction.deliveryMonths);
 const clearance=delivered+Math.ceil(c.construction.clearanceMonthsAfterDelivery),approved=restricted?Math.ceil(c.filing.approvalMonths):0;
 const last=Math.max(clearance,approved,Math.ceil(c.land.balanceDueMonths)),months:EstimateMonth[]=[];
 let cash=0,peak=0,progress=0,soldArea=0,revenue=0,released=0;
 const change=(amount:number)=>{cash+=amount;peak=Math.max(peak,-cash);};
 // 保证金抵首付，不重复计为土地成本；即使保证金大于首付，也保留其占用峰值。
 const deposit=a.startPrice*c.land.depositRate;change(-deposit);change(-(offer*c.land.firstPaymentRate-deposit));
 for(let m=0;m<=last;m++){
  let outflow=m===0?offer*c.land.firstPaymentRate:0;
  const pay=(amount:number)=>{outflow+=amount;change(-amount);};
  if(m===Math.ceil(c.land.balanceDueMonths))pay(offer*(1-c.land.firstPaymentRate));
  if(m>=1&&m<=completed){const next=Math.min(1,m*pace.speed/duration);pay(buildCost*(next-progress));progress=next;}
  if(m>=1&&progress+1e-9>=c.construction.presaleProgress&&m>=approved){
   const clearing=m>=clearance,remaining=Math.max(0,saleable-soldArea),sold=clearing?remaining:remaining*rate;
   const income=sold*salePrice*(clearing?1-c.construction.clearanceDiscount:1);soldArea+=sold;revenue+=income;
   pay(income*(c.sales.marketingRate+c.sales.taxRate));
  }
  const releaseRatio=m>=delivered?1:s.regulation.active?progress:Math.min(1,progress+c.regulation.escrowReleaseLoose);
  const target=revenue*releaseRatio;change(target-released);released=target;
  months.push({month:m+1,balance:cash,progress,soldArea,revenue,released,outflow});
 }
 const profit=revenue-offer-buildCost-revenue*(c.sales.marketingRate+c.sales.taxRate);
 let lastNegative=-1;for(let i=months.length-1;i>=0;i--)if(months[i].balance < -1e-7){lastNegative=i;break;}
 return {saleableArea:saleable,salePrice,monthlyAbsorption:rate,buildCost,revenue,profit,margin:revenue>0?profit/revenue:null,peakFunding:peak,
  paybackMonths:lastNegative===months.length-1?null:lastNegative+2,months};
}
