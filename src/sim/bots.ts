import {productTerms} from './products.ts';
// 平衡测试的玩家机器人；具名同行仍由 rivals.ts 驱动，不改变已有玩家日志。
import {priceRestricted,activeProject,salesEligible,transferQuote} from './features.ts';
import {defaultConfig,type Config} from './config.ts';
import {applyCommand,newGame,stepDay} from './engine.ts';
import {borrowCapacity,industryTight} from './finance.ts';
import {createReports} from './reporting.ts';
import {landBanUntil,presaleBlocked,rectificationError} from './compliance.ts';
import {siteDurationFactor,siteCostFactor} from './regions.ts';
import {initSeasons} from './seasons.ts';
import {postDef,postHolder,payroll,pmSpeedFactor} from './staff.ts';
import type {Employee,StaffPost,StaffSkill,StaffSlot} from './types.ts';
import type {Command,GameState,LoggedCommand,ContractorId,Pace} from './types.ts';

export type Strategy=(state:GameState,config:Config)=>Command[];
type Profile=Config['bots']['conservative'];

/** 不计未来销售的现金压力：到期借款、土地尾款、利息及按当前节奏的工程现金。 */
export function botCashNeed(s:GameState,c:Config,months=c.bots.liquidityMonths):number{
 const end=s.day+months*c.time.daysPerMonth;
 // 员工月薪与项目经理加速施工一并计入（未雇人时均为中性）。
 let need=s.debts.reduce((n,d)=>n+(d.maturityDay<=end?d.principal:0)+d.principal*d.rate*months/12,0)+payroll(s)*months;
 for(const p of s.projects){
  if(p.stage==='sold')continue;
  const owned=1-p.partnerShare;
  if(p.landDueDay<=end)need+=Math.max(0,p.landCost-p.landPaid)*owned;
  if(p.stage!=='construction')continue;
  const pace=c.construction.paces[p.pace],terms=c.construction.contractors[p.contractor??'standard'];
  const inc=Math.min(1-p.progress,months*pace.speed*pmSpeedFactor(s,c,p)/(c.construction.months*terms.durationFactor*siteDurationFactor(p.attributes)*productTerms(c,p.product).durationFactor));
  const paper=s.rating<5&&s.day>=s.financeFrozenUntil?p.paperRatio*(industryTight(s)?c.rivals.default.capacityFactor:1):0;
  need+=p.buildCost*inc*pace.costFactor*owned*(1-paper);
 }
 return need;
}

function strategy(profileKey:'conservative'|'aggressive'):Strategy{return(state,c)=>{
 if(state.status==='bankrupt')return[];
 const monthly=state.day%c.time.daysPerMonth===1;
 const needsFiling=(s:GameState,p:GameState['projects'][number])=>activeProject(p)&&p.filedPrice===null&&p.filingDueDay===null&&(priceRestricted(s,c)||presaleBlocked(p))&&!rectificationError(s,c,p);
 if(!monthly&&!state.projects.some(p=>p.stage==='land'||needsFiling(state,p)))return[];
 // 只在决策日构造独立规划副本。历史报表/对手不参与这些命令，避免复制数十年流水。
 // 全部试算仍走实际命令校验；副本不推进日期、不抽未来随机数、不回写真实公司。
 const s:GameState=structuredClone({...state,reports:createReports(state.cash),rivals:[],news:[],rules:undefined,
  ...(state.session?{session:{...state.session,journalCursor:0}}:{})});
 const cmds:Command[]=[],profile:Profile=c.bots[profileKey];
 const issue=(command:Command)=>{if(!applyCommand(s,command,c).ok)return false;cmds.push(command);return true;};
 const reserve=c.start.cash*profile.cashReserve;
 for(const p of s.projects){
  if(p.stage==='land'){
   const needed=botCashNeed(s,c,c.bots.contractorReserveMonths)+reserve;
   const rich=needed+p.buildCost*c.construction.contractors[profile.cashRichContractor as ContractorId].costFactor;
   const contractor=(s.cash>=rich?profile.cashRichContractor:s.cash<needed?profile.cashTightContractor:profile.normalContractor) as ContractorId;
   issue({type:'startProject',projectId:p.id,contractor});
  }
  if(needsFiling(s,p))issue({type:'filePrice',projectId:p.id});
 }
 if(!monthly)return cmds;
 const weak=c.cycle.phases[s.market.phaseIndex].priceDrift<0;
 for(const p of s.projects){
  if(p.stage==='construction'){
   if(profile.cooperateWhenTight&&s.cash<botCashNeed(s,c)+reserve&&p.soldArea===0&&p.partnerShare===0&&!p.acquisition&&!s.debts.some(d=>d.projectId===p.id))issue({type:'cooperate',projectId:p.id});
   const pace=(s.cash<botCashNeed(s,c)?profile.stressPace:profile.normalPace) as Pace;
   if(p.pace!==pace)issue({type:'setPace',projectId:p.id,pace});
   const paper=profile.paperWhenTight&&s.cash<botCashNeed(s,c)+reserve;
   if(paper!==(p.paperRatio>0))issue({type:'setPaper',projectId:p.id,enabled:paper});
   const cap=borrowCapacity(c,s,'devLoan',p.id).max*profile.devLoanUsage;
   if(cap>=c.bots.minimumLoan)issue({type:'borrow',channel:'devLoan',amount:cap,projectId:p.id});
  }
  if(salesEligible(p,c)){
   const rate=Math.min(c.marketing.maxRate,weak?profile.downturnMarketingRate:profile.normalMarketingRate);
   if(p.marketingRate!==rate)issue({type:'setMarketing',projectId:p.id,rate});
   if(presaleBlocked(p)&&p.priceFactor>c.compliance.hoarding.rectifiedPriceFactor)issue({type:'setPrice',projectId:p.id,priceFactor:c.compliance.hoarding.rectifiedPriceFactor});
   if(needsFiling(s,p))issue({type:'filePrice',projectId:p.id});
  }
 }
 // 先处理已承诺付款，再扩张；额度在每条成功命令后重算，不能重复预支同一额度。
 for(const d of [...s.debts].sort((a,b)=>a.maturityDay-b.maturityDay)){
  if(s.cash>=botCashNeed(s,c)+reserve)break;
  if(d.channel==='paper'||d.acceleration||d.restructuring||(d.extensions??0)>=c.finance.extension.maxTimes||d.maturityDay-s.day>c.finance.extension.windowMonths*c.time.daysPerMonth)continue;
  issue({type:'extend',debtId:d.id});
 }
 const trust=borrowCapacity(c,s,'trust').max*profile.trustUsage;
 if(trust>=c.bots.minimumLoan)issue({type:'borrow',channel:'trust',amount:trust});
 if(s.cash<botCashNeed(s,c)+reserve||!weak&&s.projects.some(activeProject)){
  const hidden=borrowCapacity(c,s,'hidden').max*profile.hiddenUsage;
  if(hidden>=c.bots.minimumLoan)issue({type:'borrow',channel:'hidden',amount:hidden});
 }
 const protectedIds=s.session?.options.mode==='challenge'&&s.session.options.challenge==='delivery'?s.session.requiredProjectIds:[];
 const candidates=s.projects.filter(p=>activeProject(p)&&p.diverted===0&&!protectedIds.includes(p.id)).sort((a,b)=>Number(b.stage==='delivered')-Number(a.stage==='delivered')||transferQuote(s,b,c).net-transferQuote(s,a,c).net);
 for(const p of candidates){
  if(s.cash>=botCashNeed(s,c)+reserve)break;
  if(transferQuote(s,p,c).net>=c.bots.minimumTransferNet)issue({type:'sellProject',projectId:p.id});
 }
 if(s.cash<botCashNeed(s,c))return cmds;
 // 按已提交地价扣除已缴押金，避免押金和尾款重复预留。
 const horizon=s.day+c.bots.liquidityMonths*c.time.daysPerMonth;
 let budget=s.cash-reserve-s.debts.reduce((n,d)=>n+(d.maturityDay<=horizon?d.principal:0)+d.principal*d.rate*c.bots.liquidityMonths/12,0);
 for(const p of s.projects)if(p.stage!=='sold'){
  budget-=Math.max(0,p.landCost-p.landPaid)*(1-p.partnerShare);
  if(activeProject(p))budget-=Math.max(0,p.buildCost*(1-p.progress))*c.construction.paces[p.pace].costFactor*(1-p.partnerShare)*profile.buildReserveRate;
 }
 for(const a of s.auctions)if(a.playerBid!==null)budget-=Math.max(0,a.playerBid*profile.landFundingRate-a.deposit);
 let count=s.projects.filter(activeProject).length+s.auctions.filter(a=>a.playerBid!==null).length;
 for(const a of [...s.auctions].sort((a,b)=>a.startPrice-b.startPrice)){
  if(a.playerBid!==null||count>=profile.maxActive||landBanUntil(s,a.districtId)>s.day)continue;
  const bid=Math.min(Math.round(a.startPrice*profile.bidFactor),a.auction?.priceCap??Infinity);
  const d=c.districts.find(d=>d.id===a.districtId)!,build=a.siteArea*a.far*c.buildCostPerSqm*d.buildCostFactor*siteCostFactor(a.attributes);
  const need=Math.max(bid*profile.landFundingRate,a.startPrice*c.land.depositRate)+build*profile.buildReserveRate;
  if(need<=budget&&issue({type:'bid',parcelId:a.id,amount:bid})){budget-=need;count++;}
 }
 return cmds;
};}

/** 保守：自有资金支付全地价，少并行项目，压力期合作/商票/展期自救，不用明股实债。 */
export const conservative:Strategy=strategy('conservative');
/** 激进：较高溢价和杠杆、低首付扩张，可用明股实债；压力期降速、合作和转让。 */
export const aggressive:Strategy=strategy('aggressive');

/**
 * 招聘包装：在原策略之后，按月填补空缺岗位（项目经理→在建、销售经理→在售、财务总监→有负债、公关总监→关注度≥30）。
 * 先调用待命员工，再从人才市场签主能力最高且≥门槛的候选人；签约费与月薪须在现金压力和储备之外。
 * 现金紧张时解雇待命员工。批量平衡 STAFF=1 使用，默认策略不雇人。
 */
export function staffed(base:Strategy,profileKey:'conservative'|'aggressive'):Strategy{return(state,c)=>{
 const cmds=base(state,c);
 const st=state.staff;
 if(!st||state.status==='bankrupt'||state.day%c.time.daysPerMonth!==1)return cmds;
 const reserve=c.start.cash*c.bots[profileKey].cashReserve,need=botCashNeed(state,c)+reserve;
 let spare=state.cash-need-payroll(state)*c.bots.staffReserveMonths;
 const idle=st.members.filter(m=>!m.post);
 if(spare<0){for(const m of idle)cmds.push({type:'fireStaff',staffId:m.id});return cmds;}
 const vacancies:StaffPost[]=[];
 for(const p of state.projects){
  if(p.stage==='construction'&&!postHolder(state,'pm',p.id))vacancies.push({slot:'pm',projectId:p.id});
  if(salesEligible(p,c)&&!postHolder(state,'salesLead',p.id))vacancies.push({slot:'salesLead',projectId:p.id});
 }
 if(state.debts.length&&!postHolder(state,'cfo'))vacancies.push({slot:'cfo'});
 if(state.attention>=30&&!postHolder(state,'pr'))vacancies.push({slot:'pr'});
 const pool=[...st.pool],free=[...idle];
 const skillFor=(slot:StaffSlot)=>postDef(c,slot).skill as StaffSkill;
 const pick=(list:Employee[],k:StaffSkill)=>list.filter(e=>e.skills[k]>=c.bots.staffMinSkill).sort((a,b)=>b.skills[k]-a.skills[k])[0];
 for(const post of vacancies){
  const k=skillFor(post.slot);
  const own=pick(free,k);
  if(own){free.splice(free.indexOf(own),1);cmds.push({type:'assignStaff',staffId:own.id,post});continue;}
  const cand=pick(pool,k);if(!cand)continue;
  const cost=cand.salary*(c.staff.signingMonths+c.bots.staffReserveMonths);
  if(cost>spare)continue;
  spare-=cost;pool.splice(pool.indexOf(cand),1);
  cmds.push({type:'hireStaff',candidateId:cand.id},{type:'assignStaff',staffId:cand.id,post});
 }
 return cmds;
};}

/** seasons=true 时按真实开局开启季节事件（批量平衡 SEASONS=1）。 */
export function runGame(seed:number,strategy:Strategy,years:number,config:Config=defaultConfig,seasons=false){
 const state=newGame(seed,config),log:LoggedCommand[]=[];
 if(seasons)initSeasons(state,config);
 const endDay=years*12*config.time.daysPerMonth;
 while(state.day<endDay&&state.status!=='bankrupt'){
  for(const command of strategy(state,state.rules??config))if(applyCommand(state,command,config).ok)log.push({day:state.day,command});
  stepDay(state,config);state.pauses=[];
 }
 return{state,log};
}
