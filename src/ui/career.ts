// 公司履历：已交付作品集 + 生涯成绩（只读，从状态与流水推导）。
import { calendar, computeMetrics, district, projectResult, type Config, type GameState, type Project } from '../sim/index.ts';
import { founderBookValue } from '../sim/capital.ts';
import { downturnDrawdown } from '../analysis/balance.ts';
import { appearanceOf, PRODUCT_NAMES } from '../appearance.ts';
import { companyTitle, totalSales } from './milestones.ts';
import { esc, pct, yi } from './format.ts';

export interface Work { p: Project; profit: number | null; margin: number | null; revenue: number }

/** 已交付（含清盘、交付后转让）的作品，按交付时间排序。 */
export function works(s: GameState): Work[] {
  return s.projects
    .filter(p => p.deliveredDay !== null)
    .sort((a, b) => (a.deliveredDay ?? 0) - (b.deliveredDay ?? 0))
    .map(p => { const r = projectResult(s, p); return { p, profit: r.profit, margin: r.margin, revenue: r.revenue }; });
}

/** 代表作：已完整结算中权益利润最高的项目。 */
export function masterpiece(ws: Work[]): Work | null {
  return ws.filter(w => w.profit !== null).sort((a, b) => b.profit! - a.profit!)[0] ?? null;
}

export function careerSummary(config: Config, s: GameState) {
  const m = computeMetrics(s), ws = works(s), sales = totalSales(s);
  const rivals = s.rivals.map(r => ({ name: r.name, equity: computeMetrics(r.company).equity }));
  const rank = 1 + rivals.filter(r => r.equity > m.equity).length;
  const downName = config.cycle.phases.find(p => p.id === 'downturn')?.name ?? '';
  const dd = downturnDrawdown(s.reports.months, downName);
  const qualities = ws.map(w => w.p.quality).filter((q): q is number => q !== null);
  return {
    equity: m.equity, founder: founderBookValue(s), founderShare: s.capital?.founderShare ?? 1, sales, title: companyTitle(sales).name,
    delivered: ws.length, closedProfit: ws.reduce((n, w) => n + (w.profit ?? 0), 0), avgQuality: qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null,
    best: masterpiece(ws), rank, rivals: rivals.length, peak: s.stats.peakEquity, brand: s.brand,
    drawdown: dd ? dd.rate?.value ?? null : null, districts: new Set(ws.map(w => district(config, w.p.districtId).name)).size,
  };
}

const when = (config: Config, day: number | null) => { if (day === null) return '—'; const c = calendar(config, day); return `第${c.year}年${c.month}月`; };

export function portfolioMarkup(config: Config, s: GameState): string {
  const ws = works(s), best = masterpiece(ws);
  if (!ws.length) return '<p class="empty">还没有交付的作品。第一个项目交付后会出现在这里。</p>';
  return `<div class="works">${ws.slice().reverse().map(w => {
    const p = w.p, a = appearanceOf(p), isBest = best?.p.id === p.id;
    return `<article class="work${isBest ? ' best' : ''}">
      <div class="row between"><b>${esc(p.name)}</b>${isBest ? '<span class="pill orange">代表作</span>' : `<span class="pill gray">${p.stage === 'closed' ? '已清盘' : p.stage === 'sold' ? '已转让' : '在售尾盘'}</span>`}</div>
      <span class="small muted">${esc(district(config, p.districtId).name)} · ${esc(PRODUCT_NAMES[a.product])} · 建面 ${(p.buildArea / 10000).toFixed(1)} 万㎡ · ${when(config, p.deliveredDay)} 交付</span>
      <span class="small">质量 ${p.quality ?? '—'} 分 · 销售 ${yi(w.revenue)}${w.profit !== null ? ` · 权益利润 <b class="${w.profit >= 0 ? 'ok-text' : 'danger-text'}">${yi(w.profit)}</b>${w.margin !== null ? `（${pct(w.margin, 1)}）` : ''}` : ' · 结算待清盘后确认'}</span>
    </article>`;
  }).join('')}</div>`;
}

export function careerMarkup(config: Config, s: GameState, achievements: string): string {
  const x = careerSummary(config, s), years = Math.floor(s.day / (config.time.daysPerMonth * 12));
  const target = config.time.careerYears, done = years >= target;
  const grade = !done ? null : x.equity >= 100 * 10000 ? 'S' : x.equity >= 60 * 10000 ? 'A' : x.equity >= 30 * 10000 ? 'B' : x.equity > config.start.cash ? 'C' : 'D';
  return `${done ? `<div class="career-grade"><span class="grade grade-${grade}">${grade}</span><div><b>${target} 年生涯结算</b><span class="small muted">${esc(x.title)} · 同行排名第 ${x.rank}/${x.rivals + 1}</span></div></div>` : `<p class="small muted">生涯进度：第 ${Math.min(years + 1, target)} / ${target} 年，第 ${target} 年自动结算并给出评级，可继续经营。</p>`}
  <dl class="setup-facts career-facts">
    <div><dt>公司净资产</dt><dd>${yi(x.equity)}</dd></div>
    <div><dt>创始人权益（${pct(x.founderShare)}）</dt><dd>${yi(x.founder)}</dd></div>
    <div><dt>累计销售</dt><dd>${yi(x.sales)}</dd></div>
    <div><dt>交付项目</dt><dd>${x.delivered} 个 · ${x.districts} 个片区</dd></div>
    <div><dt>已结算权益利润</dt><dd>${yi(x.closedProfit)}</dd></div>
    <div><dt>平均交付质量</dt><dd>${x.avgQuality === null ? '—' : x.avgQuality.toFixed(0) + ' 分'}</dd></div>
    <div><dt>公司品牌</dt><dd>${x.brand.toFixed(0)} 分</dd></div>
    <div><dt>下行期最大回撤</dt><dd>${x.drawdown === null ? '未经历' : pct(x.drawdown, 1)}</dd></div>
  </dl>
  ${x.best ? `<p class="small">代表作：<b>${esc(x.best.p.name)}</b>，权益利润 ${yi(x.best.profit!)}${x.best.margin !== null ? `，净利率 ${pct(x.best.margin, 1)}` : ''}。</p>` : ''}
  <p class="small muted">${achievements}</p>`;
}

export function careerDialogMarkup(config: Config, s: GameState, tab: 'works' | 'career', achievements: string, ending = false): string {
  return `<div class="row between"><h2 id="career-title">${ending ? '🎖 生涯结算' : '公司履历'} · ${esc(config.start.companyName)}</h2><button class="ghost" data-career-close>${ending ? '继续经营' : '关闭'}</button></div>
  <div class="report-nav career-nav"><button data-career-tab="career" class="${tab === 'career' ? 'on' : ''}">生涯成绩</button><button data-career-tab="works" class="${tab === 'works' ? 'on' : ''}">作品集（${works(s).length}）</button></div>
  ${tab === 'career' ? careerMarkup(config, s, achievements) : portfolioMarkup(config, s)}`;
}
