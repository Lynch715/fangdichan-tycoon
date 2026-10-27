import{trackCash}from'./fundingTrace.ts';
import{captureYearEndComparison}from'./rankings.ts';
// 经营流水与报表：仅由applyCommand/stepDay写入；所有查询与指标计算纯只读。
import{computeMetrics,projectInventory}from'./finance.ts';
import type{ChannelId,Command,GameState,LedgerKind,Metrics,MonthlyReport,Project,ReportState}from'./types.ts';
import type{Config}from'./config.ts';
export type ReportContext=Pick<GameState,'day'|'reports'>&Partial<Pick<GameState,'compliance'>>;
export type ReportSnapshot=Pick<GameState,'day'|'cash'|'projects'|'auctions'|'debts'|'status'|'market'|'reports'>&Partial<Pick<GameState,'rivals'|'rivalsSinceDay'|'opponentId'>>;
export interface FinanceWeight {projectId:string|null;parcelId?:string;weight:number}

export function createReports(cash:number):ReportState{
 return{sinceDay:0,complete:true,period:1,periodStart:0,opening:computeMetrics({cash,projects:[],auctions:[],debts:[],day:0}),cursor:0,journal:[],months:[],decisions:[],origins:{},closedProjects:[],parcelEntries:{},projectEntries:{}};
}
export function upgradeReports(s:GameState,c:Config){
 if(s.reports)return;
 s.reports={...createReports(s.cash),sinceDay:s.day,complete:false,period:Math.floor(s.day/c.time.daysPerMonth)+1,periodStart:s.day,opening:computeMetrics(s)};
 for(const p of s.projects){s.reports.origins[p.id]={period:s.reports.period,complete:false};if(p.stage==='closed')s.reports.closedProjects.push(p.id);}
}
export function ledger(s:ReportContext,kind:LedgerKind,cash:number,projectId:string|null=null,amount=Math.abs(cash),parcelId?:string,projectCash=projectId?cash:0,repaymentChannel?:ChannelId){
 const borrowed=trackCash(s,kind,cash,parcelId,repaymentChannel);
 if(cash===0&&amount===0&&projectCash===0)return borrowed;
 s.reports.journal.push({day:s.day,period:s.reports.period,kind,cash,projectCash,amount,projectId,...(parcelId?{parcelId}:{})});
 if(projectId)(s.reports.projectEntries[projectId]??=[]).push(s.reports.journal.length-1);
 if(parcelId){(s.reports.parcelEntries[parcelId]??=[]).push(s.reports.journal.length-1);if(kind==='depositRefund')delete s.reports.parcelEntries[parcelId];}
 return borrowed;
}
export function pay(s:GameState,kind:LedgerKind,cash:number,projectId:string|null=null,amount=Math.abs(cash),parcelId?:string){
 s.cash+=cash;ledger(s,kind,cash,projectId,amount,parcelId);
}
export function linkParcel(s:ReportContext,parcelId:string,p:Project){
 let first=s.reports.period,hasDeposit=false;
 for(const index of s.reports.parcelEntries[parcelId]??[]){const e=s.reports.journal[index];e.projectId=p.id;e.projectCash=e.kind==='financeAllocation'?-e.amount:e.cash;(s.reports.projectEntries[p.id]??=[]).push(index);first=Math.min(first,e.period);hasDeposit||=e.kind==='deposit';}
 delete s.reports.parcelEntries[parcelId];s.reports.origins[p.id]={period:first,complete:s.reports.complete||hasDeposit};
}
/** 公司统借利息/展期费按当时存货账面额分摊；现金仍只支付一次。 */
export function financeWeights(s:Pick<GameState,'projects'|'auctions'>):FinanceWeight[]{
 const weights:FinanceWeight[]=s.projects.filter(p=>!['sold','closed','abandoned'].includes(p.stage)).map(p=>({projectId:p.id,weight:projectInventory(p)}));
 for(const a of s.auctions)if(a.deposit>0)weights.push({projectId:null,parcelId:a.id,weight:a.deposit});
 return weights;
}
export function allocateFromWeights(s:ReportContext,amount:number,weights:FinanceWeight[]){
 if(amount<=0)return;
 const total=weights.reduce((n,x)=>n+Math.max(0,x.weight),0);if(total<=0)return;
 for(const x of weights)if(x.weight>0){const share=amount*x.weight/total;ledger(s,'financeAllocation',0,x.projectId,share,x.parcelId,-share);}
}
export function allocateFinance(s:GameState,amount:number){allocateFromWeights(s,amount,financeWeights(s));}
export function recordDecision(s:Pick<GameState,'day'|'reports'|'projects'>,cmd:Command,c:Config){
 const p='projectId'in cmd?s.projects.find(p=>p.id===cmd.projectId):undefined,label=p?.name??('projectId'in cmd?cmd.projectId:'');
 let text='';
 switch(cmd.type){
  case'acquireProject':text=`收购 ${s.projects.find(p=>p.acquisition?.rivalId===cmd.rivalId&&p.acquisition.originalProjectId===cmd.projectId)?.name??cmd.projectId}，承接项目权益及交付义务`;break;
  case'bid':text=`土地出价 ${cmd.parcelId} ${(cmd.amount/10000).toFixed(2)}亿${cmd.amenityRate?`，额外配建 ${(cmd.amenityRate*100).toFixed(1)}%`:""}`;break;
  case'borrow':text=`借入${c.finance.channels[cmd.channel].name} ${(cmd.amount/10000).toFixed(2)}亿${label?' · '+label:''}${cmd.channel==='bond'?`，期限 ${(cmd.termMonths??c.finance.channels.bond.termMonths)/12}年`:''}`;break;
  case'repay':text=`提前偿还债务 ${cmd.debtId}`;break;
  case'startProject':text=`${label} 选择${c.construction.contractors[cmd.contractor].name}开工`;break;
  case'setMarketing':text=`${label} 营销 ${(cmd.rate*100).toFixed(1)}%`;break;
  case'setPrice':text=`${label} 售价调至市场价 ${(cmd.priceFactor*100).toFixed(0)}%`;break;
  case'setPace':text=`${label} 施工${c.construction.paces[cmd.pace].name}`;break;
  case'cooperate':text=`${label} 引入合作方`;break;
  case'divert':text=`${label} 挪用监管款`;break;
  case'extend':text=`债务 ${cmd.debtId} 展期`;break;
  case'sellProject':text=`${label} 项目转让`;break;
  case'setPaper':text=`${label} ${cmd.enabled?'开启':'关闭'}商票`;break;
  case'filePrice':text=`${label} 申请限价备案`;break;
 }
 if(text)s.reports.decisions.push({day:s.day,text,kind:'command'});
}
export function closeReportMonth(s:ReportSnapshot,c:Config){
 const r=s.reports;
 captureYearEndComparison(s,c);
 r.months.push({period:r.period,startDay:r.periodStart,endDay:s.day,opening:r.opening,closing:computeMetrics(s),fromEntry:r.cursor,toEntry:r.journal.length,phase:c.cycle.phases[s.market.phaseIndex].name,status:s.status});
 r.period++;r.periodStart=s.day;r.opening=computeMetrics(s);r.cursor=r.journal.length;
}
export function currentReport(s:GameState):MonthlyReport{
 const r=s.reports;return{period:r.period,startDay:r.periodStart,endDay:s.day,opening:r.opening,closing:computeMetrics(s),fromEntry:r.cursor,toEntry:r.journal.length,phase:'本期',status:s.status};
}
export interface Statements {opening:Metrics;closing:Metrics;salesReceived:number;revenue:number;cost:number;marketing:number;tax:number;risk:number;finance:number;otherProfit:number;profit:number;operating:number;investing:number;financing:number;netCash:number}
export function statements(s:GameState,reports:MonthlyReport[]):Statements|null{
 if(reports.length===0)return null;
 const ordered=[...reports].sort((a,b)=>a.period-b.period),opening=ordered[0].opening,closing=ordered.at(-1)!.closing;
 const entries=ordered.flatMap(r=>s.reports.journal.slice(r.fromEntry,r.toEntry)),sum=(...k:LedgerKind[])=>entries.filter(e=>k.includes(e.kind)).reduce((n,e)=>n+e.amount,0);
 let operating=0,investing=0,financing=0;
 for(const e of entries){if(['transfer','acquisition'].includes(e.kind))investing+=e.cash;else if(['loan','repay','interest','extensionFee','partnerInvestment'].includes(e.kind))financing+=e.cash;else operating+=e.cash;}
 const salesReceived=sum('saleBooked'),revenue=sum('revenueRecognized'),cost=sum('costRecognized'),marketing=sum('marketing'),tax=sum('tax'),risk=sum('fine','accident'),finance=sum('interest','extensionFee'),profit=closing.equity-opening.equity;
 return{opening,closing,salesReceived,revenue,cost,marketing,tax,risk,finance,otherProfit:profit-revenue+cost+marketing+tax+risk+finance,profit,operating,investing,financing,netCash:operating+investing+financing};
}

// 正折现因子多项式根隔离：导数临界点切分单调区间，识别多根与重根。
function relativeValue(c:number[],x:number){
 let value=0,scale=0;
 if(x>1){for(let i=0;i<c.length;i++){value=value/x+c[i];scale=scale/x+Math.abs(c[i]);}}
 else for(let i=c.length-1;i>=0;i--){value=value*x+c[i];scale=scale*x+Math.abs(c[i]);}
 return scale?value/scale:0;
}
function positiveRoots(input:number[]):number[]{
 let c=[...input];while(c.length>1&&c.at(-1)===0)c.pop();if(c.length<2)return[];
 const scale=Math.max(...c.map(Math.abs));if(scale===0)return[];c=c.map(x=>x/scale);
 if(c.length===2){const x=-c[0]/c[1];return x>0?[x]:[];}
 const bound=1+Math.max(...c.slice(0,-1).map(x=>Math.abs(x/c.at(-1)!)));
 const critical=positiveRoots(c.slice(1).map((x,i)=>x*(i+1))).filter(x=>x<bound),points=[0,...critical,bound],roots:number[]=[];
 const add=(x:number)=>{if(x>0&&Number.isFinite(x)&&!roots.some(r=>Math.abs(r-x)<=1e-7*Math.max(1,r,x)))roots.push(x);};
 for(const x of critical)if(Math.abs(relativeValue(c,x))<1e-10)add(x);
 for(let i=0;i<points.length-1;i++){
  let lo=points[i],hi=points[i+1],a=relativeValue(c,lo),b=relativeValue(c,hi);if(a===0||b===0||a*b>=0)continue;
  for(let n=0;n<100;n++){const mid=(lo+hi)/2,v=relativeValue(c,mid);if(Math.abs(v)<1e-13||hi-lo<1e-12*Math.max(1,mid)){lo=hi=mid;break;}if(v*a>0){lo=mid;a=v;}else hi=mid;}
  add((lo+hi)/2);
 }
 return roots.sort((a,b)=>a-b);
}
export function projectIRR(flows:number[]):{annual:number|null;reason:string|null}{
 if(!flows.some(x=>x<0)||!flows.some(x=>x>0))return{annual:null,reason:'没有正负两类跨月现金流'};
 const roots=positiveRoots(flows);if(roots.length!==1)return{annual:null,reason:roots.length>1?'现金流存在多个IRR':'未找到有限IRR'};
 const annual=Math.pow(1/roots[0],12)-1;return Number.isFinite(annual)?{annual,reason:null}:{annual:null,reason:'IRR超出有限数值范围'};
}
export function sustainedPayback(flows:number[]):number|null{
 let cash=0,lastNegative=-1;for(let i=0;i<flows.length;i++){cash+=flows[i];if(cash< -1e-7)lastNegative=i;}
 return lastNegative===flows.length-1?null:lastNegative+2;
}
export interface ProjectResult {id:string;name:string;complete:boolean;revenue:number;profit:number|null;margin:number|null;annualIRR:number|null;irrReason:string|null;paybackMonths:number|null;flows:number[];terminal:number;remainingAssets:number;remainingObligations:number}
export function projectResult(s:Pick<GameState,'day'|'reports'|'debts'>,p:Project):ProjectResult{
 const origin=s.reports.origins[p.id],indices=s.reports.projectEntries[p.id],entries=indices?indices.map(i=>s.reports.journal[i]):s.reports.journal.filter(e=>e.projectId===p.id),complete=origin?.complete??false;
 const debt=s.debts.filter(d=>d.projectId===p.id),terminalMetrics=computeMetrics({cash:0,projects:[p],auctions:[],debts:debt,day:s.day});
 const terminal=terminalMetrics.equity,remainingAssets=terminalMetrics.totalAssets,remainingObligations=terminalMetrics.totalLiabilities;
 const start=origin?.period??s.reports.period,last=Math.max(start,...entries.map(e=>e.period)),flows=Array.from({length:last-start+1},()=>0);
 for(const e of entries)flows[e.period-start]+=e.projectCash;
 const cashTotal=flows.reduce((n,x)=>n+x,0),revenue=entries.filter(e=>(e.kind==='saleBooked'||e.kind==='acquiredContracts')).reduce((n,e)=>n+e.amount,0);
 // 清盘日假设按余额结清尾款及项目融资，避免将借款或未付工程款当作收益。
 flows[flows.length-1]-=remainingObligations;
 const irr=complete&&remainingAssets<1e-7?projectIRR(flows):{annual:null,reason:complete?'仍有非现金资产，IRR未结清':'缺少迁移日前历史流水'};
 return{id:p.id,name:p.name,complete,revenue,profit:complete?cashTotal+terminal:null,margin:complete&&revenue>0?(cashTotal+terminal)/revenue:null,annualIRR:irr.annual,irrReason:irr.reason,paybackMonths:complete?sustainedPayback(flows):null,flows,terminal,remainingAssets,remainingObligations};
}
