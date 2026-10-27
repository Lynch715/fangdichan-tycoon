import{annualRanking,currentReport,projectResult,statements,type Config,type GameState,type Metrics,type MonthlyReport}from'../sim/index.ts';
import{esc,pct,yi}from'./format.ts';
export type ReportView='month'|'year'|'projects'|'review';
const periodName=(n:number)=>`第${Math.floor((n-1)/12)+1}年${(n-1)%12+1}月`;
const dayName=(c:Config,day:number)=>`第${Math.floor(day/(12*c.time.daysPerMonth))+1}年${Math.floor(day/c.time.daysPerMonth)%12+1}月${day%c.time.daysPerMonth+1}日`;
const reportMoney=(n:number)=>Math.abs(n)<1e-7?'0.00 万':Math.abs(n)<1000?n.toFixed(2)+' 万':yi(n);
function table(title:string,rows:[string,number][],strong?:string){return`<section class="report-section"><h3>${title}</h3><table><tbody>${rows.map(([label,value])=>`<tr class="${label===strong?'report-total':''}"><th scope="row">${label}</th><td>${reportMoney(value)}</td></tr>`).join('')}</tbody></table></section>`;}
function threeStatements(s:GameState,records:MonthlyReport[]){
 const t=statements(s,records);if(!t)return'<p class="muted">尚无可用期间。</p>';
 const m=t.closing,otherAssets=m.totalAssets-Math.max(m.cash,0)-m.escrow-m.inventory;
 return`<div class="report-metrics"><div><span>预售及现房回款</span><b>${yi(t.salesReceived)}</b></div><div><span>确认收入</span><b>${yi(t.revenue)}</b></div><div><span>本期净利润</span><b class="${t.profit< -1e-7?'danger-text':'ok-text'}">${yi(Math.abs(t.profit)<1e-7?0:t.profit)}</b></div><div><span>可用现金净变动</span><b>${yi(t.netCash)}</b></div></div>
 <p class="small muted">预售回款先入监管账户，交付后才确认收入；借款和股东增资不计利润。现金流量表统计可用现金，监管资金另列资产。</p>
 <div class="report-tables">${table('资产负债表（期末）',[
  ['可用现金',Math.max(m.cash,0)],['监管账户',m.escrow],['开发存货',m.inventory],['拍地保证金等',otherAssets],['资产总额',m.totalAssets],['有息借款',m.interestDebt],['应付商票',m.paperDebt],['预收合同负债',m.contractLiabilities],['未付土地款',m.landPayable],['现金缺口',Math.max(-m.cash,0)],['负债总额',m.totalLiabilities],['净资产',m.equity],['负债及净资产',m.totalLiabilities+m.equity]],'资产总额')}
 ${table('利润表（本期）',[
  ['确认收入',t.revenue],['减：结转开发成本',t.cost],['减：营销费用',t.marketing],['减：税费',t.tax],['减：事故及罚款',t.risk],['减：利息及展期费',t.finance],['处置及其他账面变动',t.otherProfit],['净利润',t.profit],['期初净资产',t.opening.equity],['股东增资（不计利润）',t.capitalIn],['期末净资产',m.equity]],'净利润')}
 ${table('可用现金流量表（本期）',[
  ['期初可用现金',t.opening.cash],['经营现金净流量',t.operating],['项目处置净流量',t.investing],['融资现金净流量',t.financing],['现金净变动',t.netCash],['期末可用现金',m.cash]],'现金净变动')}</div>`;
}
function projectCards(c:Config,s:GameState,id?:string){
 const projects=s.projects.filter(p=>p.stage==='closed').sort((a,b)=>(b.closedDay??0)-(a.closedDay??0));
 if(!projects.length)return'<p class="muted">项目清盘后会自动弹出结算，也可在这里重新查看。</p>';
 const selection=id??projects[0].id,ids=new Set(selection.split(',')),chosen=projects.filter(p=>ids.has(p.id));
 const picker=`<label class="report-period">项目 <select id="report-project">${ids.size>1?`<option value="${esc(selection)}" selected>本批清盘 ${chosen.length} 个项目</option>`:''}${projects.map(p=>`<option value="${p.id}" ${selection===p.id?'selected':''}>${esc(p.name)} · ${dayName(c,p.closedDay!)}</option>`).join('')}</select></label>`;
 return picker+chosen.map(p=>{const r=projectResult(s,p);return`<article class="report-section"><div class="row between"><h3>${esc(p.name)} · 清盘结算</h3><span class="small muted">${dayName(c,p.closedDay!)}</span></div>
 ${p.acquisition?`<p class="small muted">本公司自第${p.acquisition.day}天收购起结算，收购对价 ${yi(p.acquisition.price)}；包含承接的监管款和交付义务，未包含原公司金融借款。</p>`:''}
 ${!r.complete?'<p class="warn-text">此项目缺少接手或迁移前的历史流水，完整利润、净利率、IRR及回正月数无法核实。</p>':''}
 <div class="report-metrics"><div><span>本公司项目利润</span><b>${r.profit===null?'历史缺失':yi(r.profit)}</b></div><div><span>销售净利率</span><b>${r.margin===null?'—':pct(r.margin,1)}</b></div><div><span>年化IRR</span><b>${r.annualIRR===null?'—':pct(r.annualIRR,1)}</b></div><div><span>自有资金回正</span><b>${!r.complete?'历史缺失':r.paybackMonths===null?'尚未回正':r.paybackMonths+'个月'}</b></div></div>
 <p class="small muted">汇总截至 ${dayName(c,s.day)} 的流水。本公司权益口径：项目借还款、商票、合作投资和直接费用按实际流水计算；公司统借利息按当时存货账面额分摊，未归属项目的公司费用留在公司报表。按月现金流计算IRR；回正要求累计收支此后不再为负。</p>
 ${r.irrReason?`<p class="small warn-text">IRR：${esc(r.irrReason)}</p>`:''}
 ${r.remainingObligations>1e-7?`<p class="small warn-text">结算价值已扣除剩余项目融资及义务 ${yi(r.remainingObligations)}，按余额立即结清估算；不预测未来利息。</p>`:''}
 ${r.remainingAssets>1e-7?`<p class="small warn-text">仍有 ${yi(r.remainingAssets)} 非现金资产按账面列示，未计为实际资金回正。</p>`:''}
 <details><summary>查看逐月项目资金</summary><table><thead><tr><th>${r.complete?"项目月数":"续玩记录月数"}</th><th>本公司净流量（万元）</th><th>累计（万元）</th></tr></thead><tbody>${r.flows.map((flow,i)=>`<tr><td>${i+1}</td><td>${flow.toFixed(2)}</td><td>${r.flows.slice(0,i+1).reduce((a,b)=>a+b,0).toFixed(2)}</td></tr>`).join('')}</tbody></table><p class="small muted">最后一月包含按余额预留的未清偿义务，不是实际提前还款指令。</p></details></article>`}).join('');
}
type CurvePoint={day:number;m:Metrics};
function curve(title:string,points:CurvePoint[],get:(m:Metrics)=>number|null,format:(n:number)=>string){
 const values=points.map(p=>get(p.m)),finite=values.filter((x):x is number=>x!==null&&Number.isFinite(x)),max=Math.max(1e-9,...finite),min=Math.min(0,...finite),range=max-min;
 let path='',drawing=false;const dots:string[]=[];
 for(let i=0;i<points.length;i++){const v=values[i];if(v===null||!Number.isFinite(v)){drawing=false;continue;}const x=110+(points.length>1?i/(points.length-1):0)*620,y=160-(v-min)/range*132;path+=`${drawing?'L':'M'}${x.toFixed(2)},${y.toFixed(2)} `;drawing=true;dots.push(`<circle cx="${x}" cy="${y}" r="2"><title>第${points[i].day}天：${format(v)}</title></circle>`);}
 return`<section class="report-section"><h3>${title}</h3><svg class="report-curve" viewBox="0 0 760 190" role="img" aria-label="${esc(title)}，${points.length}个时点"><path class="axis" d="M110 20V160H730"/><text x="2" y="30">${esc(format(max))}</text><text x="2" y="164">${esc(format(min))}</text><text x="110" y="184">第${points[0].day}天</text><text x="730" y="184" text-anchor="end">第${points.at(-1)!.day}天</text><path d="${path}"/>${dots.join('')}</svg></section>`;
}
const companyStatus={playing:'经营中',distress:'资金困境',bankrupt:'破产清算',finished:'已结算'};
function ranking(c:Config,s:GameState,year:number){
 const r=annualRanking(s,c,year);if(!r)return'<section class="report-section"><h3>净资产排名</h3><p class="muted">该年度尚无可核对的期末排名。</p></section>';
 const title=r.ended?'年末净资产排名':'净资产排名（进行中）';
 return`<section class="report-section report-ranking"><h3>第${year}年 · ${title}</h3><p class="small muted">${r.ended?'年末结算快照':'当前经营快照'} · ${dayName(c,r.day)}。按净资产原值排序，同值并列；破产公司保留清算账面值。</p>${r.beforeRivals?'<p class="small muted">该年末结算时同行尚未加入，只展示本公司。</p>':s.rivalsSinceDay>(year-1)*12*c.time.daysPerMonth?`<p class="small muted">同行从 ${dayName(c,s.rivalsSinceDay)} 加入，当年为加入后的经营。</p>`:''}${r.missing.length?`<p class="warn-text small">${esc(r.missing.join('、'))} 的该时点账目缺失，暂不列完整名次。</p>`:''}<table><thead><tr><th>名次</th><th>公司 / 状态</th><th>净资产</th></tr></thead><tbody>${r.ranks.map(({rank,row})=>`<tr data-rank-company="${esc(row.id)}"><td>${r.missing.length||r.beforeRivals?'—':rank}</td><th scope="row">${esc(row.name)}<br><small class="${row.status==='playing'?'muted':'warn-text'}">${companyStatus[row.status]}</small></th><td class="${row.equity<0?'danger-text':''}">${reportMoney(row.equity)}</td></tr>`).join('')}</tbody></table></section>`;
}
function review(c:Config,s:GameState){
 const reports=s.reports,points:CurvePoint[]=[{day:reports.sinceDay,m:reports.months[0]?.opening??reports.opening},...reports.months.map(r=>({day:r.endDay,m:r.closing}))];
 if(points.at(-1)!.day!==s.day)points.push({day:s.day,m:currentReport(s).closing});
 const leverage=(m:Metrics)=>m.totalAssets>0?m.totalLiabilities/m.totalAssets:null;
 const decisions=[...reports.decisions].reverse(),timeline=(ds:typeof decisions)=>`<ol class="report-timeline">${ds.map(d=>`<li><span class="small muted">${dayName(c,d.day)}</span><p class="${d.kind==='bankruptcy'?'danger-text':d.kind==='risk'?'warn-text':''}">${esc(d.text)}</p></li>`).join('')}</ol>`;
 const last=reports.months.at(-1),crisis=reports.months.find(r=>r.closing.cash<0&&r.opening.cash>=0),reference=crisis??last,entries=reference?reports.journal.slice(reference.fromEntry,reference.toEntry):[];
 const outflow=(...k:string[])=>-entries.filter(e=>k.includes(e.kind)&&e.cash<0).reduce((n,e)=>n+e.cash,0);
 return`<section class="report-section"><h3>${s.status==='bankrupt'?'破产复盘':'经营复盘'}</h3><p>${s.status==='bankrupt'?`经营 ${(s.day/(12*c.time.daysPerMonth)).toFixed(1)} 年后进入破产清算，现金缺口 ${yi(Math.max(-s.cash,0))}。`:'公司仍在经营，可随时查看规模、杠杆和决策轨迹。'}</p>${reference?`<p class="small muted">${crisis?'记录内首次现金转负月':'最近月末'}（${periodName(reference.period)}）主要支出：土地 ${reportMoney(outflow('land'))}、工程现金 ${reportMoney(outflow('construction'))}、还本 ${reportMoney(outflow('repay'))}、利息 ${reportMoney(outflow('interest'))}、事故/罚款 ${reportMoney(outflow('accident','fine'))}。</p>`:''}</section>
 ${curve('总资产规模（亿）',points,m=>m.totalAssets,n=>(n/10000).toFixed(2)+'亿')}${curve('杠杆：总负债 / 总资产（含合同负债）',points,leverage,n=>pct(n,1))}<p class="small muted">总资产为0的时点不计算杠杆比例，曲线留空；可展开数值查看。</p>
 <details class="report-section"><summary>查看曲线数值</summary><table><thead><tr><th>日期</th><th>总资产</th><th>负债/资产</th></tr></thead><tbody>${points.map(p=>`<tr><td>${dayName(c,p.day)}</td><td>${yi(p.m.totalAssets)}</td><td>${leverage(p.m)===null?'无资产':pct(leverage(p.m)!,1)}</td></tr>`).join('')}</tbody></table></details>
 <section class="report-section"><h3>关键决策与风险</h3>${decisions.length?timeline(decisions.slice(0,40)):'<p class="muted">记录区间内尚无决策。</p>'}${decisions.length>40?`<details><summary>更早的 ${decisions.length-40} 条记录</summary>${timeline(decisions.slice(40))}</details>`:''}</section>`;
}
export function reportsPanel(c:Config,s:GameState,view:ReportView='month',selected?:string){
 const names:Record<ReportView,string>={month:'月报',year:'年报',projects:'项目结算',review:s.status==='bankrupt'?'破产复盘':'经营复盘'};
 const nav=`<nav class="report-nav" aria-label="报表类型">${Object.entries(names).map(([id,name])=>`<button class="${id===view?'on':''}" data-act="report-view" data-view="${id}">${name}</button>`).join('')}</nav>`;
 let content='';const available=[...s.reports.months],current=currentReport(s);if(!available.length||current.endDay>current.startDay||current.toEntry>current.fromEntry)available.push(current);
 if(view==='projects')content=projectCards(c,s,selected);
 else if(view==='review')content=review(c,s);
 else if(view==='month'){
  const period=Number(selected)||available.at(-1)!.period,record=available.find(r=>r.period===period)??available.at(-1)!;
  content=`<label class="report-period">期间 <select id="report-period">${[...available].reverse().map(r=>`<option value="${r.period}" ${r.period===record.period?'selected':''}>${periodName(r.period)}${r===current?'（进行中）':''}</option>`).join('')}</select></label><p class="small muted">${dayName(c,record.startDay)} 至 ${dayName(c,record.endDay)} · ${record.phase}</p>${threeStatements(s,[record])}`;
 }else{
  const years=[...new Set(available.map(r=>Math.floor((r.period-1)/12)+1))],year=years.includes(Number(selected))?Number(selected):years.at(-1)!,records=available.filter(r=>Math.floor((r.period-1)/12)+1===year);
  content=`<label class="report-period">年度 <select id="report-period">${[...years].reverse().map(y=>`<option value="${y}" ${y===year?'selected':''}>第${y}年</option>`).join('')}</select></label><p class="small muted">${records.length===12&&records[0].startDay===(year-1)*12*c.time.daysPerMonth&&records.at(-1)!.endDay===year*12*c.time.daysPerMonth?'完整年度':'年度记录尚不完整'} · 月度流量相加，期末余额取最后一月。</p>${threeStatements(s,records)}${ranking(c,s,year)}`;
 }
 return`<header class="report-header"><h2 id="report-title">${names[view]}</h2><button class="ghost" data-act="close-reports" aria-label="关闭经营报表">关闭</button></header>${nav}<div class="report-body">${!s.reports.complete?`<p class="report-coverage">历史统计尚未全部核对；当前报表从 ${dayName(c,s.reports.sinceDay)} 起记录，部分旧项目完整收益可能无法核实。</p>`:s.reports.provenance==='replayed'?'<p class="small muted">历史报表已从开局回溯，经营结果保持原记录。</p>':''}${content}</div>`;
}
