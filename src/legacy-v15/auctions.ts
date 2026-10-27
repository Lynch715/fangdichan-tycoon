// 拍卖条件与裁决。随机选择仅由 newGame/stepDay 内部调用；估算与校验只读。
import type {Config} from './config.ts';
import type {GameState,Parcel,AuctionTerms,AuctionKind} from './types.ts';
import {nextRandom} from './rng.ts';
function weighted<T extends string>(s:GameState,entries:[T,number][]):T {
 const choices=entries.filter(([,w])=>w>0);
 if(!choices.length)throw Error('拍卖配置须至少有一个正权重');
 if(choices.length===1)return choices[0][0];
 let n=nextRandom(s)*choices.reduce((sum,[,w])=>sum+w,0);
 for(const [key,w]of choices){n-=w;if(n<0)return key;}
 return choices[choices.length-1][0];
}
export function generateAuctionTerms(s:GameState,c:Config,startPrice:number):AuctionTerms|undefined {
 const kind=weighted(s,Object.entries(c.auctions.formats) as [AuctionKind,number][]);
 const base=weighted(s,Object.entries(c.auctions.baseAmenities).map(([k,v])=>[k,v.weight]));
 // 无新条件的地块保持旧形状，旧存量缺省同样按公开竞价处理。
 if(kind==='ascending'&&base==='none')return undefined;
 const item=c.auctions.baseAmenities[base as keyof typeof c.auctions.baseAmenities];
 return {kind,priceCap:kind==='ascending'?null:Math.round(startPrice*(1+c.auctions.capPremium)),required:base==='none'?[]:[{kind:base as 'school'|'affordable',rate:item.rate}]};
}
export function requiredAmenityRate(terms?:AuctionTerms):number{return terms?.required.reduce((n,r)=>n+r.rate,0)??0;}
export function saleableArea(c:Config,buildArea:number,terms?:AuctionTerms,extra=0):number {
 return buildArea*Math.max(0,c.sales.saleableRatio-requiredAmenityRate(terms)-extra);
}
export function bidError(c:Config,a:Pick<Parcel,'startPrice'|'auction'>,amount:number,extra=0):string|null {
 if(!Number.isFinite(amount)||amount<a.startPrice)return '出价不能低于起拍价';
 if(a.auction?.priceCap!==null&&a.auction?.priceCap!==undefined&&amount>a.auction.priceCap)return '出价不能超过地价上限';
 if(!Number.isFinite(extra)||extra<0||extra>c.auctions.maxAdditionalAmenityRate)return `额外配建须在0–${c.auctions.maxAdditionalAmenityRate*100}%之间`;
 if(extra>0&&(a.auction?.kind!=='amenity'||amount!==a.auction.priceCap))return '达到地价上限后才能承诺额外配建';
 if(requiredAmenityRate(a.auction)+extra>=c.sales.saleableRatio)return '配建后须保留可售面积';
 return null;
}
interface Offer {amount:number;order:number;amenityRate:number}
/** 限价至少两家才转第二阶段；单家触顶仍按次高加档成交，不额外配建。 */
export function clearAuction<T extends Offer>(s:GameState,c:Config,a:Parcel,offers:readonly T[]):{winner:T;price:number;extraAmenityRate:number;mode:AuctionKind;finalists:number} {
 if(!offers.length)throw Error('无有效竞买人');
 const bids=[...offers].sort((x,y)=>y.amount-x.amount||x.order-y.order),cap=a.auction?.priceCap;
 const capped=cap==null?[]:bids.filter(b=>b.amount>=cap);
 if(capped.length>1&&a.auction?.kind!=='ascending'){
  const amenity=a.auction?.kind==='amenity',extra=amenity?Math.max(...capped.map(b=>b.amenityRate)):0;
  const finalists=amenity?capped.filter(b=>b.amenityRate===extra):capped;
  const winner=finalists.length===1?finalists[0]:finalists[Math.floor(nextRandom(s)*finalists.length)];
  return {winner,price:cap!,extraAmenityRate:extra,mode:amenity?'amenity':'lottery',finalists:finalists.length};
 }
 const winner=bids[0],step=c.rivals.bidStepRate*a.startPrice;
 return {winner,price:Math.max(a.startPrice,Math.min(winner.amount,(bids[1]?.amount??a.startPrice-step)+step,cap??Infinity)),extraAmenityRate:0,mode:'ascending',finalists:1};
}
