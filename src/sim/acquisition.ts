// 违约项目资产收购：原金融借款留在卖方，买方接监管款、土地余款和交付义务。
import {projectPriceFactor} from './products.ts';

import{computeMetrics,isDelivered}from'./finance.ts';import{activeProject,priceRestricted}from'./features.ts';import{ledger}from'./reporting.ts';
import type{Config}from'./config.ts';import type{CommandResult,GameState,Project}from'./types.ts';
export interface AcquisitionQuote {rivalId:string;projectId:string;price:number;bookEquity:number;inventory:number;escrow:number;contracts:number;landPayable:number;remainingBuild:number;remainingValue:number;fundingStoppedMonths:number}
export function acquisitionQuote(root:GameState,rivalId:string,projectId:string,c:Config):AcquisitionQuote|null {
 const rival=root.rivals.find(r=>r.id===rivalId),seller=rival?.company,p=seller?.projects.find(p=>p.id===projectId);
 if(!seller||!p||!['distress','bankrupt'].includes(seller.status)||!activeProject(p)||p.diverted>0||p.saleableArea<=0||isDelivered(p)&&p.soldArea>=p.saleableArea)return null;
 const owned=1-p.partnerShare,m=computeMetrics({day:root.day,cash:0,projects:[p],auctions:[],debts:[]});
 // 监管现金不作为无条件折价赠与；负净资产项目不要求已违约卖方虚构现金补贴。
 const price=Math.max(0,m.equity*c.rivals.default.projectDiscount,m.escrow-m.contractLiabilities-m.landPayable);
 const market=c.districts.find(d=>d.id===p.districtId)!.basePrice*root.market.priceIndex[p.districtId]*projectPriceFactor(c,p);
 const salePrice=priceRestricted(root,c)?Math.min(market*p.priceFactor,p.filedPrice??market*c.filing.maxMarketFactor):market*p.priceFactor;
 return{rivalId,projectId,price,bookEquity:m.equity,inventory:m.inventory,escrow:m.escrow,contracts:m.contractLiabilities,landPayable:m.landPayable,remainingBuild:Math.max(0,p.buildCost-p.buildSpent)*owned,remainingValue:Math.max(0,p.saleableArea-p.soldArea)*salePrice*owned,fundingStoppedMonths:p.fundingStoppedMonths};
}
export function acquireProject(root:GameState,cmd:{rivalId:string;projectId:string},c:Config):CommandResult {
 const q=acquisitionQuote(root,cmd.rivalId,cmd.projectId,c);if(!q)return{ok:false,error:'项目不在违约收购清单，或已转让/接管/存在未处理挪用'};
 if(root.cash<q.price)return{ok:false,error:'现金不足以支付收购对价；监管款不能抵作收购现金'};
 const rival=root.rivals.find(r=>r.id===cmd.rivalId)!,seller=rival.company,old=seller.projects.find(p=>p.id===cmd.projectId)!;
 const p:Project={...old,...(old.presale?{presale:{...old.presale,hoardingMonths:0}}:{}),...(old.attributes?{attributes:{...old.attributes}}:{}),tiles:old.tiles.map(t=>[...t] as [number,number]),...(old.appearance?{appearance:{...old.appearance}}:{})};delete p.acquisition;
 const raw=computeMetrics({day:root.day,cash:0,projects:[p],auctions:[],debts:[]});root.nextId++;p.id=`P${root.nextId}`;
 p.acquisition={day:root.day,rivalId:rival.id,originalProjectId:old.id,price:q.price,basisAdjustment:q.price-raw.equity,recognizedRatio:isDelivered(p)?p.soldArea/p.saleableArea:0};
 root.cash-=q.price;seller.cash+=q.price;
 root.projects.push(p);root.reports.origins[p.id]={period:root.reports.period,complete:true};
 ledger(root,'acquisition',-q.price,p.id);ledger(root,'acquiredContracts',0,p.id,q.contracts);
 ledger(seller,'transfer',q.price,old.id);old.stage='sold';old.closedDay=root.day;
 const text=`收购 ${rival.name} 的 ${p.name}，支付 ${(q.price/10000).toFixed(2)}亿，承接监管款、土地尾款及保交楼义务；原金融借款留在卖方`;
 root.news.unshift({day:root.day,kind:'company',text});root.news.length=Math.min(60,root.news.length);root.pauses.push(p.stage==='land'?'startProject':'risk');
 seller.reports.decisions.push({day:root.day,kind:'command',text:`向${c.start.companyName}转让 ${p.name}，回笼 ${(q.price/10000).toFixed(2)}亿，金融债务仍由本公司承担`});
 return{ok:true};
}
