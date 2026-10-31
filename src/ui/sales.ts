// 销售反馈只读实际项目与月报，不写入存档，也不消耗模拟随机数。
import { priceRestricted, presaleBlocked, salesEligible, type Config, type GameState, type Project } from '../sim/index.ts';
import { esc, pct, money } from './format.ts';

export const soldRatio = (p: Project) => p.saleableArea > 0 ? Math.max(0, Math.min(1, p.soldArea / p.saleableArea)) : 0;
export function salesStatus(c: Config, s: GameState, p: Project) {
  if (['land', 'sold', 'abandoned'].includes(p.stage) || p.stage !== 'closed' && !salesEligible(p, c)) return null;
  if (p.saleableArea > 0 && p.saleableArea - p.soldArea < 1e-6) return { text: '全部售罄', tone: 'gold' };
  if (p.stage === 'closed') return { text: '已清盘', tone: 'gold' };
  if (presaleBlocked(p)) return { text: '预售暂停', tone: 'muted' };
  if (priceRestricted(s, c) && p.filedPrice === null) return { text: '待备案开盘', tone: 'muted' };
  return { text: p.stage === 'delivered' ? '现房销售' : '预售进行中', tone: 'green' };
}

/** 金额与月报一致，按本公司权益口径；不能把签约额直接算作可用现金。 */
export function monthlySales(s: GameState, projectId?: string) {
  const month = s.reports.months.at(-1);
  let booked = 0, released = 0;
  if (month) for (const e of s.reports.journal.slice(month.fromEntry, month.toEntry)) {
    if (projectId && e.projectId !== projectId) continue;
    if (e.kind === 'saleBooked') booked += e.amount;
    if (e.kind === 'escrowRelease') released += e.cash;
  }
  return { booked, released };
}

export function salesBoardMarkup(c: Config, s: GameState, p: Project): string {
  const status = salesStatus(c, s, p);
  if (!status) return '';
  const ratio = soldRatio(p), { booked, released } = monthlySales(s, p.id);
  // 每格代表 2.5% 可售面积，部分格按比例填充，不虚构套数。
  const cells = Array.from({ length: 40 }, (_, i) => {
    const fill = Math.max(0, Math.min(1, ratio * 40 - i));
    return `<i style="--fill:${fill * 100}%"></i>`;
  }).join('');
  const milestone = ratio >= 1 ? '售罄达成' : ratio >= .75 ? '冲刺售罄' : ratio >= .5 ? '去化过半' : ratio >= .25 ? '去化达四分之一' : ratio > 0 ? '首批成交已达成' : '等待首批成交';
  return `<div class="sales-board ${status.tone}">
    <div class="row between"><b>${status.text}</b><span class="sales-milestone">${milestone}</span></div>
    <div class="sales-head"><strong>${pct(ratio, 1)}</strong><span class="small muted">累计去化<br>已售 ${Math.round(p.soldArea).toLocaleString('zh-CN')} ㎡</span></div>
    <div class="sales-units" role="img" aria-label="已售面积占可售面积 ${pct(ratio, 1)}">${cells}</div>
    <div class="row between small muted"><span>每格 = 2.5% 可售面积</span><span>未售 ${Math.round(Math.max(0, p.saleableArea - p.soldArea)).toLocaleString('zh-CN')} ㎡</span></div>
    <div class="sales-money"><div><span>上月签约</span><b>${booked > 0 ? '+' : ''}${money(booked)}</b></div><div><span>上月释放为现金</span><b>${released > 0 ? '+' : ''}${money(released)}</b></div></div>
    <span class="small muted">累计签约 ${money(p.salesIn * (1 - p.partnerShare))} · 监管余额 ${money(Math.max(0, p.salesIn - p.escrowReleased) * (1 - p.partnerShare))}（本公司权益口径）</span>
  </div>`;
}

export function salesHighlightsMarkup(c: Config, s: GameState): string {
  const total = monthlySales(s);
  if (total.booked <= 0 && total.released <= 0) return '';
  const projects = s.projects.filter(p => monthlySales(s, p.id).booked > 0);
  return `<section class="sales-highlight" aria-label="上回合销售战报">
    <div class="row between"><b>上回合销售战报</b><span class="sales-milestone">${projects.length} 个项目成交</span></div>
    <div class="sales-money"><div><span>签约销售</span><b>+${money(total.booked)}</b></div><div><span>释放为可用现金</span><b>+${money(total.released)}</b></div></div>
    ${projects.map(p => `<div class="sales-result"><div class="row between small"><b>${esc(p.name)}</b><span>+${money(monthlySales(s, p.id).booked)}</span></div><div class="sales-track"><i style="width:${soldRatio(p) * 100}%"></i></div><span class="small muted">${salesStatus(c, s, p)?.text ?? '项目销售'} · 累计去化 ${pct(soldRatio(p), 1)}</span></div>`).join('')}
    <span class="small muted">本公司权益口径；签约款按监管规则释放，以上未扣工程款、税费及营销支出。</span>
  </section>`;
}
