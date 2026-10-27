import {district,type Config} from './config.ts';
import {buildDifficultyConfig,type SessionOptions} from './sessionConfig.ts';
import {breachCount,breaches,computeMetrics,computeRating} from './finance.ts';
import {backgroundOccupied,footprint,freeSites,tileKey} from './map.ts';
import {createReports,ledger} from './reporting.ts';
import {initCompliance} from './compliance.ts';
import type {GameState,Project,ChannelId} from './types.ts';

export interface SessionState {
 options:SessionOptions;
 origin:'selected'|'implicit'|'legacy';
 startedDay:number;
 targetDay:number|null;
 result:'running'|'won'|'lost';
 resultDay:number|null;
 reason:string;
 sales:number;
 journalCursor:number;
 requiredProjectIds:string[];
 deliveredProjectIds:string[];
 sandboxCapitalIn:number;
}
export function defaultSession(s:GameState,origin:'implicit'|'legacy'):SessionState {
 return {options:{mode:'career',difficulty:'standard'},origin,startedDay:s.day,targetDay:null,result:'running',resultDay:null,reason:'',sales:0,journalCursor:s.reports.journal.length,requiredProjectIds:[],deliveredProjectIds:[],sandboxCapitalIn:0};
}
export function buildSessionConfig(base:Config,options:SessionOptions):Config {
 const c=buildDifficultyConfig(base,options.difficulty);
 if(options.mode==='sandbox'){
  c.start.cash*=c.sessions.sandbox.initialCashFactor;c.maps.suburbUnlockYear=1;
 }else if(options.mode==='challenge'){
  c.maps.suburbUnlockYear=1;
  if(options.challenge==='sales'){
   const terms=c.sessions.challenges.sales;
   c.start.cash*=terms.initialCashFactor;
   c.land.parcelsPerQuarter=[...terms.parcelsPerQuarter];
   c.land.siteAreaRange=[...terms.siteAreaRange];
  }else{
   const terms=c.sessions.challenges[options.challenge];
   c.cycle.startPhase=c.cycle.phases.findIndex(p=>p.id===terms.phase);
   if(c.cycle.startPhase<0)throw new Error('挑战周期配置缺失');
   c.regulation.startYear=1;
   if(options.challenge==='downturn')c.start.cash*=c.sessions.challenges.downturn.initialCashFactor;
   else c.start.companyName=c.sessions.challenges.delivery.companyName;
  }
 }
 return c;
}

/** 只由newGame内部的开局指令路径调用；初始资产负债是真实存量，不伪造此前流水。 */
export function initSessionOpening(s:GameState,c:Config,options:SessionOptions){
 const session=s.session={...defaultSession(s,'implicit'),options:structuredClone(options),origin:'selected' as const};
 s.rules=c;
 if(options.mode!=='challenge')return;
 const dpm=c.time.daysPerMonth,kind=options.challenge;
 if(kind==='sales'){
  session.targetDay=c.sessions.challenges.sales.years*12*dpm;
  s.news.unshift({day:0,kind:'company',text:`千亿销售挑战：大型公司开局，5年内本公司权益口径新增销售额达到 ${(c.sessions.challenges.sales.targetSales/10000).toFixed(0)} 亿元。借款、增资、承接的旧合同不计入。`});
  return;
 }
 const terms=c.sessions.challenges[kind];
 for(const spec of terms.projects){
  const d=district(c,spec.districtId),occupied=backgroundOccupied(d.mapId);
  for(const p of s.projects)if(district(c,p.districtId).mapId===d.mapId)for(const [i,j]of p.tiles)occupied.add(tileKey(i,j));
  const site=freeSites(d.id,occupied,d.mapId)[0];
  if(!site)throw new Error('挑战项目没有可用场地');
  const buildCost=spec.buildArea*c.buildCostPerSqm*d.buildCostFactor;
  const saleableArea=spec.buildArea*c.sales.saleableRatio,soldArea=saleableArea*spec.soldRatio,salesIn=soldArea*d.basePrice;
  const p:Project={id:`P${++s.nextId}`,name:spec.name,districtId:d.id,tiles:footprint(site),buildArea:spec.buildArea,saleableArea,
   landCost:spec.landCost,landPaid:spec.landCost,landDueDay:0,buildCost,buildSpent:buildCost*spec.progress,progress:spec.progress,
   stage:'construction',contractor:'standard',quality:c.construction.contractors.standard.quality,pace:'normal',marketingRate:c.sales.marketingRate,
   fundingStoppedMonths:spec.stoppedMonths,fundingGap:0,takeover:null,priceFactor:1,soldArea,salesIn,escrowReleased:salesIn*spec.releasedRatio,
   completedDay:null,deliveredDay:null,closedDay:null,paperRatio:0,partnerShare:0,diverted:0,stoppedUntil:0,
   filedPrice:soldArea>0?d.basePrice*c.filing.maxMarketFactor:null,filingPrice:null,filingDueDay:null};
  s.projects.push(p);
 }
 for(const debt of terms.debts)s.debts.push({id:`D${++s.nextId}`,channel:debt.channel as ChannelId,principal:debt.principal,rate:debt.rate,startDay:0,maturityDay:debt.termMonths*dpm,projectId:debt.channel==='devLoan'?s.projects[0].id:null});
 if(kind==='delivery')s.cash=c.sessions.challenges.delivery.openingCash;
 // 报表从接手时开始；期初包含全部旧项目、债务和监管账户，不把历史投入记成当期支出。
 s.reports=createReports(s.cash);s.reports.opening=computeMetrics(s);
 for(const p of s.projects)s.reports.origins[p.id]={period:1,complete:false};
 initCompliance(s,c);
 if(kind==='delivery'){
  s.status='distress';s.distressMonths=c.sessions.challenges.delivery.priorDistressMonths;
  s.cash+=c.start.cash;ledger(s,'equityInvestment',c.start.cash);
  session.requiredProjectIds=s.projects.map(p=>p.id);
  session.targetDay=c.sessions.challenges.delivery.months*dpm;
  s.news=[{day:0,kind:'warning',text:`接手嘉岳置业：原现金缺口 ${(-c.sessions.challenges.delivery.openingCash/10000).toFixed(1)} 亿元，承接 ${(s.debts.reduce((n,d)=>n+d.principal,0)/10000).toFixed(1)} 亿元债务及两处停工项目。救助资本 ${(c.start.cash/10000).toFixed(1)} 亿元已到账；须在36个月内由本公司完成两项目交付，转让或政府接管均失败。`}];
 }else{
  session.targetDay=s.market.phaseEndMonth*dpm;
  s.news=[{day:0,kind:'warning',text:`橙档开局：承接三处在建项目和长期借款，市场已进入下行期；第 ${s.market.phaseEndMonth} 月走出本轮下行时，须保持正常经营、现金非负且净资产为正。`}];
 }
 const metrics=computeMetrics(s),lights=breaches(c,metrics);
 s.regulation={active:true,announced:true,tier:breachCount(lights),debtBaseline:metrics.interestDebt,breaches:lights};
 s.rating=computeRating(c,s,metrics);s.stats.peakEquity=metrics.equity;
}

export function sandboxFunding(s:GameState,amount:number){
 s.cash+=amount;ledger(s,'equityInvestment',amount);
 s.session!.sandboxCapitalIn+=amount;
}
/** 沙盒仍支付所有成本和还本付息；资金不足时注入资本，不免债、不计利润。 */
export function protectSandbox(s:GameState,c:Config){
 if(s.opponentId||s.session?.options.mode!=='sandbox'||s.cash>=0)return;
 const amount=c.sessions.sandbox.automaticReserve-s.cash;
 sandboxFunding(s,amount);
 s.news.unshift({day:s.day,kind:'company',text:`沙盒自动注资 ${(amount/10000).toFixed(2)} 亿元，已列资本投入。项目停工与交付规则继续适用。`});
 s.news.length=Math.min(60,s.news.length);
}

/** 日推进和成功指令后统一评估；结局只记一次，仍可继续经营。 */
export function updateSession(s:GameState,c:Config){
 const x=s.session;if(!x||s.opponentId)return;
 for(let i=x.journalCursor;i<s.reports.journal.length;i++){
  const entry=s.reports.journal[i];if(entry.kind==='saleBooked')x.sales+=entry.amount;
 }
 x.journalCursor=s.reports.journal.length;
 if(x.options.mode!=='challenge'||x.result!=='running')return;
 for(const id of x.requiredProjectIds){
  const p=s.projects.find(p=>p.id===id);
  if(p?.deliveredDay!==null&&p?.deliveredDay!==undefined&&!x.deliveredProjectIds.includes(id))x.deliveredProjectIds.push(id);
 }
 let result:'won'|'lost'|null=null,reason='';
 if(s.status==='bankrupt'){result='lost';reason='公司破产清算，挑战失败';}
 else if(x.options.challenge==='sales'){
  if(x.sales>=c.sessions.challenges.sales.targetSales&&s.day<=x.targetDay!){result='won';reason='5年内新增权益销售额达到千亿元';}
  else if(s.day>=x.targetDay!){result='lost';reason='5年期限已到，新增权益销售额未达千亿元';}
 }else if(x.options.challenge==='downturn'&&s.day>=x.targetDay!){
  const healthy=s.status==='playing'&&s.cash>=0&&computeMetrics(s).equity>0;
  result=healthy?'won':'lost';reason=healthy?'已走过本轮下行，现金非负且净资产为正':'走出下行时未恢复正常经营或净资产不为正';
 }else if(x.options.challenge==='delivery'){
  const lost=x.requiredProjectIds.some(id=>{const p=s.projects.find(p=>p.id===id);return !p||p.stage==='abandoned'||p.stage==='sold'&&!x.deliveredProjectIds.includes(id);});
  if(lost){result='lost';reason='目标项目在交付前被转让或接管，保交楼挑战失败';}
  else if(x.deliveredProjectIds.length===x.requiredProjectIds.length&&s.status==='playing'&&s.cash>=0){result='won';reason='两处承接项目均由本公司完成交付，现金非负';}
  else if(s.day>=x.targetDay!){result='lost';reason='36个月期限已到，未完成全部交付并恢复正常经营';}
 }
 if(result){x.result=result;x.resultDay=s.day;x.reason=reason;s.pauses.push('challenge');s.news.unshift({day:s.day,kind:result==='won'?'company':'warning',text:`${result==='won'?'挑战完成':'挑战结束'}：${reason}`});s.news.length=Math.min(60,s.news.length);}
}
