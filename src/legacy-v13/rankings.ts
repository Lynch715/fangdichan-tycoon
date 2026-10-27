// 只读排名查询；年末快照仅在stepDay收月和applyCommand迁移时写入派生报表。
import{computeMetrics}from'./finance.ts';import type{Config}from'./config.ts';import type{GameState,Metrics,MonthlyReport}from'./types.ts';
export interface ComparisonRow {id:string;name:string;equity:number;status:GameState['status']}
export interface ComparisonSnapshot {day:number;rows:ComparisonRow[];missing:string[]}
export interface AnnualRanking extends ComparisonSnapshot {year:number;ended:boolean;beforeRivals:boolean;ranks:{row:ComparisonRow;rank:number}[]}
type Company=Pick<GameState,'cash'|'projects'|'auctions'|'debts'|'day'|'status'>;
type ComparisonState=Company&Pick<GameState,'reports'>&Partial<Pick<GameState,'rivals'|'rivalsSinceDay'|'opponentId'>>;
const row=(id:string,name:string,m:Metrics,status:GameState['status']):ComparisonRow=>({id,name,equity:m.equity,status});
function liveSnapshot(s:ComparisonState,c:Config):ComparisonSnapshot {
 return{day:s.day,rows:[row('player',c.start.companyName,computeMetrics(s),s.status),...(s.rivals??[]).map(r=>row(r.id,r.name,computeMetrics(r.company),r.company.status))],missing:[]};
}
function historicalSnapshot(s:ComparisonState,own:MonthlyReport,c:Config,frozen7=false):ComparisonSnapshot {
 const rows=[row('player',c.start.companyName,own.closing,own.status)],missing:string[]=[];
 // 年末结算后同日迁移才加入的对手，不回填到该年末。
 if(own.endDay>(s.rivalsSinceDay??Infinity))for(const rival of s.rivals??[]){
  const records=rival.company.reports.months,exact=records.find(m=>m.endDay===own.endDay),last=[...records].reverse().find(m=>m.endDay<=own.endDay);
  // 冻结v7破产后账本不再推进，且尚无项目收购；保留最后清算账面净资产。
  const record=exact??(frozen7&&last?.status==='bankrupt'?last:undefined);
  if(record)rows.push(row(rival.id,rival.name,record.closing,record.status));else missing.push(rival.name);
 }
 return{day:own.endDay,rows,missing};
}
export function captureYearEndComparison(s:ComparisonState,c:Config){
 if(s.opponentId||!s.rivals?.length||s.day<=0||s.day%(12*c.time.daysPerMonth)!==0)return;
 const comparisons=s.reports.comparisons??=[];
 if(!comparisons.some(r=>r.day===s.day))comparisons.push(liveSnapshot(s,c));
}
/** 冻结v7回放已有各家月末账本，迁移只补派生年末快照，不改经济值。 */
export function backfillComparisons(s:ComparisonState,c:Config){
 if(s.opponentId||!s.rivals?.length)return;
 for(const own of s.reports.months){if(own.endDay%(12*c.time.daysPerMonth)!==0||own.endDay<=(s.rivalsSinceDay??Infinity))continue;
  if(s.reports.comparisons?.some(r=>r.day===own.endDay))continue;
  (s.reports.comparisons??=[]).push(historicalSnapshot(s,own,c,true));
 }
}
export function annualRanking(s:GameState,c:Config,year:number):AnnualRanking|null {
 if(!Number.isInteger(year)||year<1)return null;const yearDays=12*c.time.daysPerMonth,end=year*yearDays,start=end-yearDays;
 if(s.day<start)return null;
 const ended=s.day>=end,own=s.reports.months.find(m=>m.endDay===end);
 let snapshot:ComparisonSnapshot;
 if(ended){if(!own)return null;snapshot=s.reports.comparisons?.find(m=>m.day===end)??historicalSnapshot(s,own,c);}
 else snapshot=liveSnapshot(s,c);
 const sorted=[...snapshot.rows].sort((a,b)=>b.equity-a.equity||snapshot.rows.indexOf(a)-snapshot.rows.indexOf(b));
 let rank=1;const ranks=sorted.map((r,i)=>{if(i===0||Math.abs(r.equity-sorted[i-1].equity)>1e-7)rank=i+1;return{row:{...r},rank};});
 return{...snapshot,rows:snapshot.rows.map(r=>({...r})),missing:[...snapshot.missing],ranks,year,ended,beforeRivals:ended&&end<=s.rivalsSinceDay};
}
