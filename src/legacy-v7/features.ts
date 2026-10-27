// 扩展规则只由 applyCommand / stepDay 调用；所有经济参数来自配置。
import type { Config } from './config.ts';
import type { Command, CommandResult, GameState, Project } from './types.ts';
import { nextRandom } from './rng.ts';
import{ledger,allocateFinance}from'./reporting.ts';

export const activeProject = (p: Project) => p.stage !== 'closed' && p.stage !== 'sold'&&p.stage!=='abandoned';
export const salesEligible=(p:Project,c:Config)=>p.stage==='completed'||p.stage==='delivered'||p.stage==='construction'&&p.progress+1e-9>=c.construction.presaleProgress;
export const mapUnlocked = (s: GameState, c: Config, id: string) => id === 'city' || s.day >= (c.maps.suburbUnlockYear - 1) * 12 * c.time.daysPerMonth;
export const priceRestricted = (s: GameState, c: Config) => c.filing.restrictedPhases.includes(c.cycle.phases[s.market.phaseIndex].id);
export function transferQuote(s: GameState, p: Project, c: Config) {
  const recognized = p.stage === 'delivered' ? p.soldArea / p.saleableArea : 0;
  const book = (p.landCost + p.buildSpent) * (1 - recognized) + p.salesIn - p.escrowReleased - (p.stage === 'delivered' ? 0 : p.salesIn) - (p.landCost - p.landPaid);
  const price = book * (1 - p.partnerShare) * (book >= 0 ? c.rescue.saleBookDiscount : 1 / c.rescue.saleBookDiscount);
  const debt = s.debts.filter(d => d.projectId === p.id).reduce((sum,d) => sum + d.principal, 0);
  return { price, debt, net: price - debt };
}
function news(s: GameState, text: string, warning = false) {
  s.news.unshift({day:s.day,kind: warning ? 'warning' : 'company',text});
  s.news.length = Math.min(s.news.length, 60);
}
export function featureCommand(s: GameState, cmd: Command, c: Config): CommandResult | null {
  const fail = (error: string) => ({ ok: false, error });
  if (cmd.type === 'extend') {
    const d = s.debts.find(x => x.id === cmd.debtId), e = c.finance.extension;
    if (!d) return fail('债务已结清');
    if (d.channel === 'paper') return fail('商票到期必须兑付，不支持展期');
    if ((d.extensions ?? 0) >= e.maxTimes) return fail('这笔债务已用完展期次数');
    if (d.maturityDay - s.day > e.windowMonths * c.time.daysPerMonth) return fail(`到期前 ${e.windowMonths} 个月才能申请展期`);
    const fee = d.principal * e.feeRate;
    if (s.cash < fee) return fail('现金不足以支付展期费');
    s.cash -= fee; d.maturityDay += e.months * c.time.daysPerMonth; d.rate += e.rateBump; d.extensions = (d.extensions ?? 0) + 1;
    ledger(s,'extensionFee',-fee,d.projectId);if(d.projectId===null)allocateFinance(s,fee);
    news(s, `债务展期 ${e.months} 个月，支付费用 ${(fee/10000).toFixed(2)} 亿`);
    return {ok:true};
  }
  if (!['setPaper','cooperate','divert','filePrice','sellProject'].includes(cmd.type)) return null;
  if (!('projectId' in cmd)) return fail('需要指定项目');
  const p = s.projects.find(x => x.id === cmd.projectId);
  if (!p || !activeProject(p)) return fail('项目已退出经营');
  switch(cmd.type) {
    case 'setPaper':
      if (p.stage !== 'construction') return fail('商票只可支付在建工程款');
      if (cmd.enabled && (s.rating >= 5 || s.day < s.financeFrozenUntil)) return fail('信用不足或融资冻结，承包商拒收商票');
      p.paperRatio = cmd.enabled ? c.finance.channels.paper.maxOfBuildCost : 0;
      return {ok:true};
    case 'cooperate': {
      if (p.partnerShare > 0 || p.soldArea > 0 || p.stage !== 'construction') return fail('合作仅限尚未预售、未引入合作方的在建项目');
      if (s.debts.some(d => d.projectId === p.id)) return fail('请先结清项目融资再引入合作方');
      p.partnerShare = c.cooperation.partnerShare;
      const investment = (p.landPaid + p.buildSpent) * p.partnerShare;
      s.cash += investment;
      ledger(s,'partnerInvestment',investment,p.id);
      news(s, `${p.name} 引入合作方，到账 ${(investment/10000).toFixed(2)} 亿，此后按权益分摊成本与回款`);
      return {ok:true};
    }
    case 'divert': {
      const amount = (p.salesIn - p.escrowReleased) * c.risk.diversionLimit;
      if (amount <= 0 || p.diverted > 0 || p.partnerShare > 0) return fail('暂无可挪用监管款，或已有违规待处理，或合作方拒绝');
      p.diverted += amount; p.escrowReleased += amount; s.cash += amount;
      ledger(s,'diversion',amount,p.id);
      s.attention = Math.min(100, s.attention + c.risk.diversionAttention);
      news(s, `${p.name} 挪用监管款 ${(amount/10000).toFixed(2)} 亿，存在补缴、罚款及融资冻结风险`, true);
      return {ok:true};
    }
    case 'filePrice':
      if (p.filingDueDay !== null) return fail('备案正在审批中');
      p.filingPrice = c.districts.find(d => d.id === p.districtId)!.basePrice * s.market.priceIndex[p.districtId] * c.filing.maxMarketFactor;
      p.filingDueDay = s.day + c.filing.approvalMonths * c.time.daysPerMonth;
      news(s, `${p.name} 已申请限价备案，审批需 ${c.filing.approvalMonths} 个月`);
      return {ok:true};
    case 'sellProject': {
      if (p.diverted > 0) return fail('请先处理挪用监管资金，买方拒绝接盘');
      const q = transferQuote(s,p,c);
      if (s.cash + q.net < 0) return fail('转让所得不足以结清项目债务');
      s.cash += q.net;
      ledger(s,'transfer',q.price,p.id);
      for(const debt of s.debts)if(debt.projectId===p.id)ledger(s,'repay',-debt.principal,p.id);
      s.debts = s.debts.filter(d => d.projectId !== p.id);
      p.stage = 'sold'; p.closedDay = s.day;
      news(s, `${p.name} 转让完成，结清项目债务后净回笼 ${(q.net/10000).toFixed(2)} 亿，后续交付由买方承接`);
      return {ok:true};
    }
  }
  return null;
}
export function inspect(s: GameState, c: Config) {
  if (nextRandom(s) >= c.risk.inspectionBase + s.attention * c.risk.inspectionAttentionFactor) return;
  let fine = 0, returned = 0;
  for (const p of s.projects) {
    if ((!activeProject(p)&&p.stage!=='abandoned') || p.diverted <= 0) continue;
    // 已由正常工程进度覆盖的部分无需重复补缴。
    const legal = p.salesIn * (p.stage === 'delivered' ? 1 : s.regulation.active ? p.progress : Math.min(1,p.progress + c.regulation.escrowReleaseLoose));
    const restore = Math.min(p.diverted, Math.max(0,p.escrowReleased - legal));
    returned += restore; p.escrowReleased -= restore;
    ledger(s,'escrowReturn',-restore,p.id);ledger(s,'fine',-p.diverted*c.risk.fineRate,p.id);
    fine += p.diverted * c.risk.fineRate; p.diverted = 0;
  }
  for (const d of s.debts) if(d.channel === 'hidden' && !d.revealed) { fine += d.principal * c.risk.hiddenFineRate;ledger(s,'fine',-d.principal*c.risk.hiddenFineRate,d.projectId); d.revealed = true; }
  if (fine > 0 || returned > 0) {
    s.cash -= fine + returned;
    s.financeFrozenUntil = s.day + c.risk.freezeMonths * c.time.daysPerMonth;
    s.attention = 100;
    s.reports.decisions.push({day:s.day,kind:'risk',text:`监管追缴 ${(returned/10000).toFixed(2)}亿、罚款 ${(fine/10000).toFixed(2)}亿，新增融资冻结`});
    news(s, `监管抽查：补回监管款 ${(returned/10000).toFixed(2)} 亿，罚款 ${(fine/10000).toFixed(2)} 亿，新增融资冻结 ${c.risk.freezeMonths} 个月`,true);
    s.pauses.push('risk');
  } else news(s, '监管例行抽查完成，未发现新增违规');
}
export function projectEvent(s: GameState,p: Project,c: Config): {cost:number; demand:number} {
  let cost = 1, demand = 1;
  if(p.stage === 'construction' && nextRandom(s) < c.risk.materialChance) {cost = c.risk.materialCostFactor; news(s,`${p.name} 遇建材涨价，本月工程支出上浮 ${Math.round((cost-1)*100)}%`,true);}
  if(p.stage === 'construction' && nextRandom(s) < c.risk.accidentChance * c.construction.contractors[p.contractor??'standard'].accidentFactor * (p.pace === 'fast' ? c.risk.fastAccidentMultiplier : 1)) {
    const loss = p.buildCost * c.risk.accidentCostOfBuild * (1-p.partnerShare);
    s.cash -= loss; p.stoppedUntil = s.day + c.risk.accidentStopMonths * c.time.daysPerMonth;
    ledger(s,'accident',-loss,p.id);s.reports.decisions.push({day:s.day,kind:'risk',text:`${p.name} 安全事故，损失 ${(loss/10000).toFixed(2)}亿`});
    p.quality=Math.max(0,(p.quality??c.construction.contractors.standard.quality)-c.quality.accidentPenalty);
    news(s,`${p.name} 发生安全事故，损失 ${(loss/10000).toFixed(2)} 亿，停工 ${c.risk.accidentStopMonths} 个月`,true); s.pauses.push('risk');
  }
  if(nextRandom(s) < c.risk.demandChance) {demand = c.risk.demandBoost;news(s,`${p.name} 周边配套落地，本月销售去化提升`);}
  return {cost,demand};
}
