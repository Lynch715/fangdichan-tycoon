// 旧版流水回溯：只调用冻结内核，通过只转发的Proxy观察读写，不改冻结代码或经济值。
import*as V1 from'../legacy-v1/index.ts';import*as V2 from'../legacy-v2/index.ts';import*as V3 from'../legacy-v3/index.ts';import*as V4 from'../legacy-v4/index.ts';import*as V5 from'../legacy-v5/index.ts';
import{restore as restore2}from'../legacy-v2/restore.ts';import{restore as restore3}from'../legacy-v3/restore.ts';import{restore as restore4}from'../legacy-v4/restore.ts';import{restore as restore5}from'../legacy-v5/restore.ts';
import{allocateFromWeights,closeReportMonth,createReports,financeWeights,ledger,linkParcel,recordDecision,type FinanceWeight,type ReportContext,type ReportSnapshot}from'../sim/reporting.ts';
import type{Command,CommandResult,Debt,GameState,LedgerKind,Parcel,Project,ReportState}from'../sim/types.ts';import type{Config}from'../sim/config.ts';import type{SaveData}from'../save.ts';

type Added='partnerShare'|'paperRatio'|'diverted'|'stoppedUntil'|'filedPrice'|'filingPrice'|'filingDueDay'|'contractor'|'quality'|'marketingRate'|'fundingStoppedMonths'|'fundingGap'|'takeover';
type OldProject=Omit<Project,Added>&Partial<Pick<Project,Added>>;
export type HistoricalState=Omit<Pick<GameState,'day'|'cash'|'status'|'market'|'auctions'|'debts'|'projects'>,'projects'>&{projects:OldProject[]};
interface ReplayInput {seed:number;day:number;log:SaveData['log'];legacyUntil?:number;legacyLogCount?:number;legacyV2Until?:number;legacyV2LogCount?:number;legacyV3Until?:number;legacyV3LogCount?:number;legacyV4Until?:number;legacyV4LogCount?:number;revision:number}
interface Kernel {version:number;config:Config;newGame(seed:number):HistoricalState;step(s:HistoricalState):void;command(s:HistoricalState,c:Command):CommandResult;restore?(s:ReplayInput):HistoricalState}
const kernels:Kernel[]=[
 {version:1,config:V1.defaultConfig as unknown as Config,newGame:s=>V1.newGame(s) as unknown as HistoricalState,step:s=>V1.stepDay(s as unknown as V1.GameState),command:(s,c)=>V1.applyCommand(s as unknown as V1.GameState,c as unknown as V1.Command)},
 {version:2,config:V2.defaultConfig as unknown as Config,newGame:s=>V2.newGame(s) as unknown as HistoricalState,step:s=>V2.stepDay(s as unknown as V2.GameState),command:(s,c)=>V2.applyCommand(s as unknown as V2.GameState,c as unknown as V2.Command),restore:s=>restore2(s as unknown as Parameters<typeof restore2>[0]) as unknown as HistoricalState},
 {version:3,config:V3.defaultConfig as unknown as Config,newGame:s=>V3.newGame(s) as unknown as HistoricalState,step:s=>V3.stepDay(s as unknown as V3.GameState),command:(s,c)=>V3.applyCommand(s as unknown as V3.GameState,c as unknown as V3.Command),restore:s=>restore3(s as unknown as Parameters<typeof restore3>[0]) as unknown as HistoricalState},
 {version:4,config:V4.defaultConfig as unknown as Config,newGame:s=>V4.newGame(s) as unknown as HistoricalState,step:s=>V4.stepDay(s as unknown as V4.GameState),command:(s,c)=>V4.applyCommand(s as unknown as V4.GameState,c as unknown as V4.Command),restore:s=>restore4(s as unknown as Parameters<typeof restore4>[0]) as unknown as HistoricalState},
 {version:5,config:V5.defaultConfig as unknown as Config,newGame:s=>V5.newGame(s) as unknown as HistoricalState,step:s=>V5.stepDay(s as unknown as V5.GameState),command:(s,c)=>V5.applyCommand(s as unknown as V5.GameState,c as unknown as V5.Command),restore:s=>restore5(s as unknown as Parameters<typeof restore5>[0]) as unknown as HistoricalState},
];
function project(p:OldProject,c:Config):Project{return{...p,partnerShare:p.partnerShare??0,paperRatio:p.paperRatio??0,diverted:p.diverted??0,stoppedUntil:p.stoppedUntil??0,filedPrice:p.filedPrice??null,filingPrice:p.filingPrice??null,filingDueDay:p.filingDueDay??null,contractor:p.contractor??(p.stage==='land'?null:'standard'),quality:p.quality??null,marketingRate:p.marketingRate??c.sales.marketingRate,fundingStoppedMonths:p.fundingStoppedMonths??0,fundingGap:p.fundingGap??0,takeover:p.takeover??null};}
function snapshot(s:HistoricalState,c:Config,reports:ReportState):ReportSnapshot{return{day:s.day,cash:s.cash,status:s.status,market:s.market,projects:s.projects.map(p=>project(p,c)),auctions:s.auctions,debts:s.debts,reports};}
type Entity={kind:'project';id:string;p:Project}|{kind:'debt';id:string;d:Debt}|{kind:'parcel';id:string;a:Parcel};
type Trace={type:'cash';delta:number;entity?:Entity;reads:string[];weights:FinanceWeight[]}|{type:'project';id:string;key:string;before:unknown;after:unknown;p:Project}|{type:'created';p:Project;parcelId?:string}|{type:'debt';d:Debt}|{type:'revealed';d:Debt};
const watched=new Set(['landPaid','buildSpent','progress','soldArea','salesIn','escrowReleased','stoppedUntil','diverted','stage','fundingStoppedMonths']);
type CashPart={kind:LedgerKind;amount:number;projectId:string|null};
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-6+Math.max(Math.abs(a),Math.abs(b))*1e-12;

/** 返回冻结内核的原结果；所有观察值留在外部ReportState，代理不额外调用随机数。 */
export function observeHistoricalCall(s:HistoricalState,c:Config,reports:ReportState,run:(s:HistoricalState)=>CommandResult|void,command?:Command):void{
 const trace:Trace[]=[],cache=new WeakMap<object,object>(),raws=new WeakMap<object,object>(),normalized=new WeakSet<object>(),names=new Map(s.auctions.map(a=>[a.name,a.id]));
 const before={day:s.day,status:s.status,debts:s.debts.map(d=>({...d}))};
 let context:{kind:Entity['kind'];id:string;raw:Record<string,unknown>}|undefined,reads=new Set<string>(),allocationCache:FinanceWeight[]|undefined;
 const identify=(target:object)=>{const t=target as Record<string,unknown>;if(typeof t.id!=='string')return undefined;return'landCost'in t?'project':'principal'in t?'debt':'startPrice'in t?'parcel':undefined;};
 const touch=(target:object,key:PropertyKey)=>{const kind=identify(target);if(!kind)return;const t=target as Record<string,unknown>;if(context?.raw!==t){context={kind,id:t.id as string,raw:t};reads=new Set();}if(typeof key==='string')reads.add(key);};
 const entity=():Entity|undefined=>{if(!context)return;const {kind,id,raw}=context;if(kind==='project')return{kind,id,p:project(raw as unknown as OldProject,c)};if(kind==='debt')return{kind,id,d:{...raw} as unknown as Debt};return{kind,id,a:{...raw} as unknown as Parcel};};
 const unwrap=(value:unknown):unknown=>{
  if(!value||typeof value!=='object')return value;
  const raw=raws.get(value);if(raw)return raw;
  if(normalized.has(value)||cache.has(value))return value;normalized.add(value);
  for(const key of Reflect.ownKeys(value)){const v=Reflect.get(value,key),plain=unwrap(v);if(v!==plain)Reflect.set(value,key,plain);}
  return value;
 };
 const wrap=(value:unknown):unknown=>{
  if(!value||typeof value!=='object')return value;const old=cache.get(value);if(old)return old;
  const proxy=new Proxy(value,{
   get(target,key){touch(target,key);return wrap(Reflect.get(target,key,target));},
   set(target,key,next){
    const kind=identify(target),previous=Reflect.get(target,key,target),plain=unwrap(next);touch(target,key);const result=Reflect.set(target,key,plain,target);
    if(target===s&&key==='cash'){
     const e=entity();if(e?.kind==='debt'&&e.d.projectId===null&&reads.has('rate'))allocationCache??=financeWeights(snapshot(s,c,reports));
     trace.push({type:'cash',delta:Number(plain)-Number(previous),entity:e,reads:[...reads],weights:allocationCache??[]});reads=new Set();
    }else if(kind==='project'&&typeof key==='string'&&watched.has(key)&&previous!==plain){const p=project(target as unknown as OldProject,c);trace.push({type:'project',id:p.id,key,before:previous,after:plain,p});}
    else if(kind==='debt'&&key==='revealed'&&plain===true&&previous!==true)trace.push({type:'revealed',d:{...target} as unknown as Debt});
    else if(Array.isArray(target)&&key!=='length'&&plain&&typeof plain==='object'&&plain!==previous){const newKind=identify(plain);if(newKind==='project'){const p=project(plain as OldProject,c);trace.push({type:'created',p,parcelId:names.get(p.name)});}else if(newKind==='debt')trace.push({type:'debt',d:{...plain} as Debt});}
    return result;
   },
  });cache.set(value,proxy);raws.set(proxy,value);return proxy;
 };
 const result=run(wrap(s) as HistoricalState);if(result&&!result.ok)throw Error('旧档回溯指令无效');
 const writer:ReportContext={day:s.day,reports},inspection:CashPart[]=[],lastSales=new Map<string,Extract<Trace,{type:'project'}>>(),lastSold=new Map<string,number>();
 const emit=(kind:LedgerKind,cash:number,id:string|null=null,amount=Math.abs(cash),parcelId?:string)=>ledger(writer,kind,cash,id,amount,parcelId);
 const split=(delta:number,parts:CashPart[])=>{const total=parts.reduce((n,p)=>n+p.amount,0);let assigned=0;parts.forEach((p,i)=>{const cash=i===parts.length-1?delta-assigned:delta*p.amount/total;assigned+=cash;emit(p.kind,cash,p.projectId,p.amount);});};
 function nextInBlock<T extends Trace['type']>(index:number,type:T,test:(t:Extract<Trace,{type:T}>)=>boolean):Extract<Trace,{type:T}>|undefined{
  for(let j=index+1;j<trace.length&&trace[j].type!=='cash';j++){const t=trace[j];if(t.type===type&&test(t as Extract<Trace,{type:T}>))return t as Extract<Trace,{type:T}>;}
 }
 for(let i=0;i<trace.length;i++){
  const t=trace[i];
  if(t.type==='created'){if(!t.parcelId)throw Error('旧项目无法关联拍地保证金');linkParcel(writer,t.parcelId,t.p);continue;}
  if(t.type==='debt'){if(!command&&t.d.channel==='paper')emit('paperIssue',0,t.d.projectId,t.d.principal);continue;}
  if(t.type==='revealed'){if(!command)inspection.push({kind:'fine',amount:t.d.principal*c.risk.hiddenFineRate,projectId:t.d.projectId});continue;}
  if(t.type==='project'){
   const p=t.p,owned=1-p.partnerShare;
   if(t.key==='soldArea')lastSold.set(p.id,Number(t.after)-Number(t.before));
   if(t.key==='salesIn'){
    const revenue=(Number(t.after)-Number(t.before))*owned;emit('saleBooked',0,p.id,revenue);lastSales.set(p.id,t);
    if(p.stage==='delivered'||p.stage==='closed'){emit('revenueRecognized',0,p.id,revenue);emit('costRecognized',0,p.id,(p.landCost+p.buildSpent)*(lastSold.get(p.id)??0)/p.saleableArea*owned);}
   }
   if(!command){
    if(t.key==='escrowReleased'&&Number(t.after)<Number(t.before))inspection.push({kind:'escrowReturn',amount:Number(t.before)-Number(t.after),projectId:p.id});
    if(t.key==='diverted'&&Number(t.before)>0&&t.after===0)inspection.push({kind:'fine',amount:Number(t.before)*c.risk.fineRate,projectId:p.id});
    if(t.key==='stoppedUntil'&&Number(t.after)>Number(t.before))reports.decisions.push({day:s.day,kind:'risk',text:`${p.name} 安全事故，损失 ${((p.buildCost*c.risk.accidentCostOfBuild*owned)/10000).toFixed(2)}亿`});
    if(t.key==='stage'&&t.after==='delivered'){emit('revenueRecognized',0,p.id,p.salesIn*owned);emit('costRecognized',0,p.id,(p.landCost+p.buildSpent)*p.soldArea/p.saleableArea*owned);}
    if(t.key==='stage'&&t.after==='closed'&&!reports.closedProjects.includes(p.id))reports.closedProjects.push(p.id);
    if(t.key==='stage'&&t.after==='abandoned')reports.decisions.push({day:s.day,kind:'risk',text:`${p.name} 连续停工 ${p.fundingStoppedMonths} 个月，政府接管`});
   }
   continue;
  }
  const delta=t.delta;
  if(command){
   const id='projectId'in command?command.projectId??null:null;
   switch(command.type){
    case'bid':emit('deposit',delta,null,Math.abs(delta),command.parcelId);break;
    case'borrow':{const d=trace.find(x=>x.type==='debt');emit('loan',delta,d?.type==='debt'?d.d.projectId:null,command.amount);break;}
    case'repay':{const d=before.debts.find(d=>d.id===command.debtId);emit('repay',delta,d?.projectId??null,d?.principal??Math.abs(delta));break;}
    case'extend':{const d=before.debts.find(d=>d.id===command.debtId);emit('extensionFee',delta,d?.projectId??null);if(d?.projectId===null)allocateFromWeights(writer,Math.abs(delta),financeWeights(snapshot(s,c,reports)));break;}
    case'cooperate':emit('partnerInvestment',delta,id);break;
    case'divert':emit('diversion',delta,id);break;
    case'sellProject':{const removed=before.debts.filter(d=>d.projectId===id&&!s.debts.some(x=>x.id===d.id)),paid=removed.reduce((n,d)=>n+d.principal,0);emit('transfer',delta+paid,id);for(const d of removed)emit('repay',-d.principal,id);break;}
    default:if(delta!==0)throw Error('旧指令存在未归类资金变动');
   }
   continue;
  }
  if(inspection.length){const amount=inspection.reduce((n,x)=>n+x.amount,0);if(!near(-delta,amount))throw Error('旧监管款补缴未能核对');const returned=inspection.filter(x=>x.kind==='escrowReturn').reduce((n,x)=>n+x.amount,0),fine=amount-returned;split(delta,inspection);inspection.length=0;reports.decisions.push({day:s.day,kind:'risk',text:`监管追缴 ${(returned/10000).toFixed(2)}亿、罚款 ${(fine/10000).toFixed(2)}亿，新增融资冻结`});continue;}
  const e=t.entity;
  if(e?.kind==='parcel'){
   if(delta>=0)emit('depositRefund',delta,null,e.a.deposit,e.id);
   else{const made=nextInBlock(i,'created',x=>x.parcelId===e.id);if(!made)throw Error('旧地价首付无法关联项目');emit('land',delta,null,made.p.landPaid,e.id);}
  }else if(e?.kind==='debt'){
   if(t.reads.includes('rate')){const amount=e.d.principal*e.d.rate/12;emit('interest',delta,e.d.projectId,amount);if(e.d.projectId===null)allocateFromWeights(writer,amount,t.weights);}
   else emit('repay',delta,e.d.projectId,e.d.principal);
  }else if(e?.kind==='project'){
   const p=e.p,next=nextInBlock(i,'project',x=>x.id===p.id&&['landPaid','stoppedUntil','buildSpent','escrowReleased'].includes(x.key));
   if(next?.key==='landPaid')emit('land',delta,p.id,(Number(next.after)-Number(next.before))*(1-p.partnerShare));
   else if(next?.key==='stoppedUntil')emit('accident',delta,p.id,p.buildCost*c.risk.accidentCostOfBuild*(1-p.partnerShare));
   else if(next?.key==='buildSpent')emit('construction',delta,p.id,(Number(next.after)-Number(next.before))*(1-p.partnerShare));
   else if(delta>=0&&next?.key==='escrowReleased')emit('escrowRelease',delta,p.id);
   else if(lastSales.has(p.id)){
    const sales=lastSales.get(p.id)!,revenue=(Number(sales.after)-Number(sales.before))*(1-p.partnerShare),parts:CashPart[]=[{kind:'marketing',amount:revenue*p.marketingRate,projectId:p.id},{kind:'tax',amount:revenue*c.sales.taxRate,projectId:p.id}];
    if(near(-delta,parts[0].amount+parts[1].amount)){if(delta!==0)split(delta,parts);lastSales.delete(p.id);}else throw Error('旧销售费用未能核对');
   }else if(delta===0)continue;
   else throw Error('旧项目资金变动未能归类');
  }else if(delta!==0)throw Error('旧资金变动缺少归属');
 }
 if(inspection.length)throw Error('旧抽查流水缺少实际扣款');
 const after=snapshot(s,c,reports);
 if(command)recordDecision(after,command,c);
 else{
  if(before.status!==s.status&&(s.status==='distress'||s.status==='bankrupt'))reports.decisions.push({day:s.day,kind:s.status==='bankrupt'?'bankruptcy':'risk',text:s.status==='bankrupt'?'自救窗口结束，公司破产':`现金缺口 ${(-s.cash/10000).toFixed(2)}亿，进入自救窗口`});
  if(s.day>before.day&&s.day%c.time.daysPerMonth===0)closeReportMonth(after,c);
 }
}

/** 逐段调用冻结回放，边界以日期+同日日志数量共同定义，不重跑已记录的指令。 */
export function rebuildLegacyReports(save:SaveData,expected:unknown):ReportState{
 const boundaries=[{version:1,until:save.legacyUntil,count:save.legacyLogCount},{version:2,until:save.legacyV2Until,count:save.legacyV2LogCount},{version:3,until:save.legacyV3Until,count:save.legacyV3LogCount},{version:4,until:save.legacyV4Until,count:save.legacyV4LogCount},{version:5,until:save.legacyV5Until,count:save.legacyV5LogCount}].filter((x):x is{version:number;until:number;count:number}=>x.until!==undefined&&x.count!==undefined);
 // 空版本区间由下一版冻结restore自动完成迁移，避免在同一日重复回放整个前缀。
 const segments=boundaries.filter((x,i)=>i===0||i===boundaries.length-1||x.until!==boundaries[i-1].until||x.count!==boundaries[i-1].count);
 if(!segments.length)throw Error('没有旧版回放边界');
 let kernel=kernels[segments[0].version-1],state=kernel.newGame(save.seed),index=0;const reports=createReports(state.cash);reports.provenance='replayed';
 for(let stage=0;stage<segments.length;stage++){
  const segment=segments[stage];
  while(state.day<=segment.until){
   while(index<segment.count&&save.log[index].day===state.day){const command=save.log[index++].command;observeHistoricalCall(state,kernel.config,reports,s=>kernel.command(s,command),command);}
   if(state.day===segment.until)break;if(state.status==='bankrupt')throw Error('旧统计日期超过破产日期');observeHistoricalCall(state,kernel.config,reports,s=>kernel.step(s));
  }
  if(index!==segment.count)throw Error('旧统计指令边界不符');
  const next=segments[stage+1];if(next){kernel=kernels[next.version-1];if(!kernel.restore)throw Error('旧统计迁移内核缺失');state=kernel.restore({...save,day:segment.until,log:save.log.slice(0,index)});}
 }
 const canonical=(value:unknown)=>JSON.stringify({...value as object,pauses:[]});
 if(canonical(state)!==canonical(expected))throw Error('旧统计回放末态与原档不一致');
 const cash=reports.journal.reduce((n,e)=>n+e.cash,reports.months[0]?.opening.cash??reports.opening.cash);
 if(!near(cash,state.cash))throw Error('旧统计现金流水不平衡');
 return reports;
}
