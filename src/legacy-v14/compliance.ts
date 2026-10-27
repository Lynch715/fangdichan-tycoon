// 违规证据与处罚只由指令、收月及现有随机抽查入口调用。
import type{Config}from'./config.ts';import type{GameState,Project}from'./types.ts';import{ledger}from'./reporting.ts';import{sitePriceFactor}from'./regions.ts';
export function initCompliance(s:GameState,c:Config){if(c.compliance.enabled)s.compliance??={sinceDay:s.day,cash:s.cash,borrowedCash:0,deposits:{},landCases:[],landBans:{}};}
export const landBanUntil=(s:GameState,districtId:string)=>s.compliance?.landBans[districtId]??0;
export const presaleBlocked=(p:Project)=>p.presale?.revokedDay!=null&&!['delivered','closed','sold','abandoned'].includes(p.stage);
export function recordLandFunding(s:GameState,c:Config,p:Project,amount:number){
 if(!s.compliance||amount<=1e-7||!c.compliance.borrowedLand.restrictedPhases.includes(c.cycle.phases[s.market.phaseIndex].id))return;
 s.compliance.landCases.push({day:s.day,projectId:p.id,districtId:p.districtId,amount});
}
export function updateHoarding(s:GameState,c:Config,p:Project,beforeSold:number){
 if(!s.compliance)return;
 const h=c.compliance.hoarding,remaining=p.saleableArea-beforeSold;
 const eligible=['construction','completed'].includes(p.stage)&&p.progress+1e-9>=c.construction.presaleProgress&&p.fundingStoppedMonths===0&&p.stoppedUntil<=s.day&&remaining>1e-7&&!presaleBlocked(p)&&p.filingDueDay===null;
 const market=c.districts.find(d=>d.id===p.districtId)!.basePrice*s.market.priceIndex[p.districtId]*sitePriceFactor(p.attributes);
 const factor=c.filing.restrictedPhases.includes(c.cycle.phases[s.market.phaseIndex].id)&&p.filedPrice!==null?Math.min(p.priceFactor,p.filedPrice/market):p.priceFactor;
 const hoarding=eligible&&factor+1e-9>=h.priceFactor&&(p.soldArea-beforeSold)/remaining<h.maxMonthlySoldRatio;
 if(hoarding){p.presale??={hoardingMonths:0,revokedDay:null,reapplyDay:null};p.presale.hoardingMonths++;}else if(p.presale)p.presale.hoardingMonths=0;
}
export function rectificationError(s:GameState,c:Config,p:Project):string|null{
 if(!presaleBlocked(p))return null;
 if(s.day<(p.presale!.reapplyDay??0))return '预售证已撤销，整改期届满后才可重新申请';
 if(p.priceFactor>c.compliance.hoarding.rectifiedPriceFactor)return `请先将报价降至市场价的${c.compliance.hoarding.rectifiedPriceFactor*100}%以内，再申请整改复审`;
 return null;
}
export function completeRectification(p:Project){if(p.presale){p.presale.revokedDay=null;p.presale.reapplyDay=null;p.presale.hoardingMonths=0;}}
function notice(s:GameState,text:string){s.news.unshift({day:s.day,kind:'warning',text});s.news.length=Math.min(s.news.length,60);s.reports.decisions.push({day:s.day,kind:'risk',text});s.pauses.push('risk');}
export function inspectCompliance(s:GameState,c:Config):boolean{
 const t=s.compliance;if(!t)return false;let found=false;
 for(const evidence of t.landCases){if(evidence.penalizedDay!==undefined)continue;
  const fine=evidence.amount*c.compliance.borrowedLand.fineRate;s.cash-=fine;ledger(s,'fine',-fine,evidence.projectId);evidence.penalizedDay=s.day;
  t.landBans[evidence.districtId]=Math.max(t.landBans[evidence.districtId]??0,s.day+c.compliance.borrowedLand.banMonths*c.time.daysPerMonth);
  const district=c.districts.find(d=>d.id===evidence.districtId)!.name;
  notice(s,`监管抽查：${district} 项目 ${evidence.projectId} 调控期使用借款拿地 ${(evidence.amount/10000).toFixed(2)}亿，罚款 ${(fine/10000).toFixed(2)}亿；该片区暂停拿地 ${c.compliance.borrowedLand.banMonths}个月`);found=true;
 }
 for(const p of s.projects){if(!['construction','completed'].includes(p.stage)||presaleBlocked(p)||(p.presale?.hoardingMonths??0)<c.compliance.hoarding.months)continue;
  const market=c.districts.find(d=>d.id===p.districtId)!.basePrice*s.market.priceIndex[p.districtId]*sitePriceFactor(p.attributes);
  const fine=Math.max(0,p.saleableArea-p.soldArea)*market*(1-p.partnerShare)*c.compliance.hoarding.fineRate;
  s.cash-=fine;ledger(s,'fine',-fine,p.id);p.presale!.revokedDay=s.day;p.presale!.reapplyDay=s.day+c.compliance.hoarding.reapplyMonths*c.time.daysPerMonth;p.presale!.hoardingMonths=0;
  p.filedPrice=null;p.filingPrice=null;p.filingDueDay=null;
  notice(s,`监管抽查：${p.name} 连续高价低成交，按捂盘惜售撤销预售证、罚款 ${(fine/10000).toFixed(2)}亿；整改 ${c.compliance.hoarding.reapplyMonths}个月后降价申请复审`);found=true;
 }
 return found;
}
