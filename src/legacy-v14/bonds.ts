import type {Config} from './config.ts';
import type {GameState,Debt} from './types.ts';
/** 仅月末评级结算内部调用。重排到期日不创造现金、不提前确认还本。 */
export function accelerateDebts(s:GameState,c:Config,newId:()=>string){
 const tranches:Debt[]=[];let amount=0;
 for(const debt of s.debts){
  const terms=debt.covenant;
  if(!terms||terms.triggerDay!==undefined||s.rating<=terms.belowRating||debt.channel==='paper')continue;
  const due=s.day+terms.noticeMonths*c.time.daysPerMonth;
  // 本已在通知期内到期的本金无须另拆，保留其更早的合同日期。
  if(debt.maturityDay<=due||terms.fraction<=0)continue;
  const principal=debt.principal*terms.fraction;
  terms.triggerDay=s.day;
  const tranche:Debt={...debt,id:newId(),principal,maturityDay:due,covenant:{...terms},acceleration:{triggerDay:s.day,originalDebtId:debt.id,originalMaturityDay:debt.maturityDay}};
  debt.principal-=principal;tranches.push(tranche);amount+=principal;
 }
 if(!tranches.length)return;
 s.debts.push(...tranches);
 const text=`评级降至 ${c.finance.ratings[s.rating]}，触发合同提前到期：${(amount/10000).toFixed(2)}亿本金按通知期偿还，剩余本金保留原到期日`;
 s.news.unshift({day:s.day,kind:'warning',text});s.news.length=Math.min(s.news.length,60);s.reports.decisions.push({day:s.day,kind:'risk',text});s.pauses.push('risk');
}
