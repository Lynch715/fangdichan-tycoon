// 现金续航：不计任何未来销售回款与监管账户释放，只看已承诺的刚性支出，
// 按月推算账上现金能撑几个月。只读估算，不推进状态、不消耗随机数。
import type {Config} from '../sim/config.ts';
import type {GameState} from '../sim/types.ts';
import {activeProject} from '../sim/features.ts';
import {siteDurationFactor} from '../sim/regions.ts';
import {productTerms} from '../sim/products.ts';

export interface RunwayMonth {land:number;principal:number;interest:number;construction:number;total:number;cashAfter:number}
export interface Runway {
 /** 现金首次不够付刚性支出前能撑的完整月数；horizon 内都够付时为 null。 */
 months:number|null;
 horizon:number;
 /** 未来 12 个月（或 horizon 更短时）的分项合计。 */
 next12:{land:number;principal:number;interest:number;construction:number;total:number};
 schedule:RunwayMonth[];
 /** 未计入的现金来源：监管账户里已收房款（按工程进度释放）。 */
 escrow:number;
}

export function estimateRunway(c:Config,s:GameState,horizon=36):Runway{
 const dpm=c.time.daysPerMonth,first=(Math.floor(s.day/dpm)+1)*dpm;
 const debts=s.debts.map(d=>({principal:d.principal,rate:d.rate,maturityDay:d.maturityDay}));
 const land=s.projects.filter(p=>(activeProject(p)||p.stage==='abandoned'||p.stage==='closed')&&p.landPaid<p.landCost)
  .map(p=>({due:p.landDueDay,amount:(p.landCost-p.landPaid)*(1-p.partnerShare)}));
 const builds=s.projects.filter(p=>p.stage==='construction').map(p=>{
  const pace=c.construction.paces[p.pace],terms=c.construction.contractors[p.contractor??'standard'];
  const inc=pace.speed/(c.construction.months*terms.durationFactor*siteDurationFactor(p.attributes)*productTerms(c,p.product).durationFactor);
  return {progress:p.progress,inc,monthly:p.buildCost*pace.costFactor*(1-p.partnerShare),stoppedUntil:p.stoppedUntil};
 });
 let cash=s.cash,months:number|null=null;const schedule:RunwayMonth[]=[];
 for(let k=0;k<horizon;k++){
  const day=first+k*dpm;
  let l=0;for(const x of land)if(x.amount>0&&day>=x.due){l+=x.amount;x.amount=0;}
  let build=0;for(const b of builds){if(b.progress>=1-1e-9||day<b.stoppedUntil)continue;const step=Math.min(b.inc,1-b.progress);build+=b.monthly*step;b.progress+=step;}
  let interest=0,principal=0;for(const d of debts){if(d.principal<=0)continue;interest+=d.principal*d.rate/12;if(d.maturityDay<=day){principal+=d.principal;d.principal=0;}}
  const total=l+build+interest+principal;cash-=total;
  schedule.push({land:l,principal,interest,construction:build,total,cashAfter:cash});
  if(cash<0&&months===null)months=k;
 }
 const head=schedule.slice(0,12),sum=(f:(m:RunwayMonth)=>number)=>head.reduce((n,m)=>n+f(m),0);
 const escrow=s.projects.reduce((n,p)=>n+(activeProject(p)?(p.salesIn-p.escrowReleased)*(1-p.partnerShare):0),0);
 return {months,horizon,schedule,escrow,next12:{land:sum(m=>m.land),principal:sum(m=>m.principal),interest:sum(m=>m.interest),construction:sum(m=>m.construction),total:sum(m=>m.total)}};
}
