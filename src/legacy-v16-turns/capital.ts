import type {Config} from './config.ts';
import type {GameState,Command,CommandResult,CapitalState} from './types.ts';
import {computeMetrics} from './finance.ts';
import {ledger} from './reporting.ts';

export function initCapital(s:GameState,c:Config){if(c.capitalRescue.enabled)s.capital??={sinceDay:s.day,founderShare:1,strategicShare:0,creditorShare:0,lastInvestmentDay:null,restructurings:0,events:[]};}
export const founderBookValue=(s:GameState)=>computeMetrics(s).equity*(s.capital?.founderShare??1);
const commonError=(s:GameState,c:Config)=>!c.capitalRescue.enabled?'股权自救未启用':s.status==='bankrupt'?'公司已破产清算':null;
export function strategicQuote(s:GameState,c:Config,share:number){
 const terms=c.capitalRescue.strategic,capital=s.capital;
 const equity=computeMetrics(s).equity,preMoney=Math.max(terms.minimumPreMoney,equity*terms.valuationDiscount);
 const valid=Number.isFinite(share)&&terms.shares.includes(share),amount=valid?preMoney*share/(1-share):0;
 const founderBefore=capital?.founderShare??1,founderAfter=valid?founderBefore*(1-share):founderBefore;
 const nextDay=capital?.lastInvestmentDay===null||capital?.lastInvestmentDay===undefined?s.day:capital.lastInvestmentDay+terms.cooldownMonths*c.time.daysPerMonth;
 const error=commonError(s,c)??(!valid?'战投股权比例无效':founderAfter+1e-12<c.capitalRescue.minFounderShare?'本次融资后创始人持股低于最低保留比例':s.day<s.financeFrozenUntil?'监管处罚期内暂停新增融资，暂不能引入战投':s.day<nextDay?`距下一轮战投还需${nextDay-s.day}天`:null);
 return{day:s.day,cash:s.cash,share,amount,preMoney,equity,founderBefore,founderAfter,nextDay,error};
}
export function restructuringQuote(s:GameState,c:Config){
 const terms=c.capitalRescue.restructuring,capital=s.capital,founderBefore=capital?.founderShare??1,founderAfter=founderBefore*(1-terms.newShare);
 const debts=s.debts.filter(d=>d.channel!=='paper'&&!d.acceleration&&!d.restructuring&&d.maturityDay<=s.day+terms.windowMonths*c.time.daysPerMonth).map(d=>({id:d.id,channel:d.channel,principal:d.principal,rate:d.rate,oldDay:d.maturityDay,newDay:Math.max(s.day,d.maturityDay)+terms.extensionMonths*c.time.daysPerMonth}));
 const principal=debts.reduce((n,d)=>n+d.principal,0);
 const error=commonError(s,c)??((capital?.restructurings??0)>=terms.maxTimes?'公司已用完股权重组次数':!debts.length?'未来窗口内没有可重组借款（商票、提前到期部分及已重组债务除外）':founderAfter+1e-12<c.capitalRescue.minFounderShare?'重组后创始人持股低于最低保留比例':null);
 return{day:s.day,cash:s.cash,share:terms.newShare,founderBefore,founderAfter,principal,debts,error};
}
function dilute(capital:CapitalState,share:number,kind:'strategic'|'restructuring'){
 capital.founderShare*=1-share;capital.strategicShare*=1-share;capital.creditorShare*=1-share;
 if(kind==='strategic')capital.strategicShare+=share;else capital.creditorShare+=share;
}
/** 仅applyCommand调用；实际增资入公司账、股权非明股实债；重组不创造现金。 */
export function capitalCommand(s:GameState,cmd:Command,c:Config):CommandResult|null {
 if(cmd.type!=='strategicInvestment'&&cmd.type!=='restructureDebt')return null;
 if(cmd.type==='strategicInvestment'){
  const q=strategicQuote(s,c,cmd.share);if(q.error)return{ok:false,error:q.error};
  initCapital(s,c);const capital=s.capital!;dilute(capital,cmd.share,'strategic');capital.lastInvestmentDay=s.day;
  s.cash+=q.amount;ledger(s,'equityInvestment',q.amount);
  capital.events.push({day:s.day,kind:'strategic',newShare:cmd.share,founderBefore:q.founderBefore,founderAfter:q.founderAfter,cash:q.amount,principal:0,debtIds:[]});
  s.news.unshift({day:s.day,kind:'company',text:`战投增资到账 ${(q.amount/10000).toFixed(2)}亿，新投资人持股 ${(cmd.share*100).toFixed(0)}%；创始人持股降至 ${(q.founderAfter*100).toFixed(1)}%。增资不计利润，无保本或回购义务。`});
 }else{
  const q=restructuringQuote(s,c);if(q.error)return{ok:false,error:q.error};
  initCapital(s,c);const capital=s.capital!;dilute(capital,q.share,'restructuring');capital.restructurings++;
  for(const term of q.debts){const d=s.debts.find(d=>d.id===term.id)!;d.restructuring={day:s.day,originalMaturityDay:d.maturityDay};d.maturityDay=term.newDay;}
  capital.events.push({day:s.day,kind:'restructuring',newShare:q.share,founderBefore:q.founderBefore,founderAfter:q.founderAfter,cash:0,principal:q.principal,debtIds:q.debts.map(d=>d.id)});
  s.news.unshift({day:s.day,kind:'company',text:`债务重组完成：${(q.principal/10000).toFixed(2)}亿借款展期 ${c.capitalRescue.restructuring.extensionMonths}个月，债权人获增发后 ${(q.share*100).toFixed(0)}%股权，创始人持股降至 ${(q.founderAfter*100).toFixed(1)}%。本金和利率不变，现金缺口仍需另行补足。`});
 }
 s.news.length=Math.min(s.news.length,60);return{ok:true};
}
