import { computeMetrics, type Config, type GameState } from '../sim/index.ts';
import { esc } from './format.ts';

/** 只读：从状态推导，不进存档、不影响模拟。金额单位万元。 */
const YI = 10000;

/** 公司称号随累计销售额升级。 */
export const TITLES: { at: number; name: string }[] = [
  { at: 0, name: '初创公司' },
  { at: 5 * YI, name: '本地开发商' },
  { at: 30 * YI, name: '区域开发商' },
  { at: 100 * YI, name: '城市名企' },
  { at: 300 * YI, name: '西南龙头' },
  { at: 1000 * YI, name: '全国百强' },
  { at: 3000 * YI, name: '千亿房企' },
];

export type Goal = { id: string; title: string; value: number; target: number; unit: '亿' | '个' };

let cache: { len: number; sales: number } = { len: -1, sales: 0 };
/** 累计合同销售额（本公司口径），按流水长度缓存。 */
export function totalSales(s: GameState): number {
  const j = s.reports.journal;
  if (cache.len === j.length) return cache.sales;
  let sales = 0;
  for (const e of j) if (e.kind === 'saleBooked' || e.kind === 'acquiredContracts') sales += e.amount;
  cache = { len: j.length, sales };
  return sales;
}

export function companyTitle(sales: number) {
  let i = 0;
  while (i + 1 < TITLES.length && sales >= TITLES[i + 1].at) i++;
  return { level: i + 1, name: TITLES[i].name, next: TITLES[i + 1] ?? null };
}

/** 每条线只取下一个未达成的目标，外加已达成数量。 */
export function goals(s: GameState): { next: Goal[]; achieved: string[] } {
  const sales = totalSales(s);
  const delivered = s.projects.filter(p => p.deliveredDay !== null).length;
  const equity = computeMetrics(s).equity;
  const lines: { id: string; title: (t: number) => string; value: number; targets: number[]; unit: Goal['unit'] }[] = [
    { id: 'sales', title: t => `累计销售 ${t / YI} 亿`, value: sales, targets: [1, 5, 10, 30, 50, 100, 300, 500, 1000, 3000].map(x => x * YI), unit: '亿' },
    { id: 'delivered', title: t => `交付 ${t} 个项目`, value: delivered, targets: [1, 3, 5, 10, 20, 30, 50], unit: '个' },
    { id: 'equity', title: t => `净资产 ${t / YI} 亿`, value: equity, targets: [10, 20, 50, 100, 200, 500].map(x => x * YI), unit: '亿' },
  ];
  const next: Goal[] = [], achieved: string[] = [];
  for (const l of lines) {
    for (const t of l.targets) {
      if (l.value >= t) achieved.push(`${l.id}:${t}`);
      else { next.push({ id: `${l.id}:${t}`, title: l.title(t), value: l.value, target: t, unit: l.unit }); break; }
    }
  }
  return { next, achieved };
}

export function goalTitle(id: string): string {
  const [line, raw] = id.split(':'), t = Number(raw);
  if (line === 'sales') return `累计销售突破 ${t / YI} 亿`;
  if (line === 'delivered') return `累计交付 ${t} 个项目`;
  return `净资产达到 ${t / YI} 亿`;
}

const fmt = (g: Goal, v: number) => (g.unit === '亿' ? `${(v / YI).toFixed(v >= 10 * YI ? 0 : 1)}` : `${v}`);

export function milestonesPanel(_config: Config, s: GameState, achievements = ''): string {
  const sales = totalSales(s), t = companyTitle(sales), { next, achieved } = goals(s);
  const toNext = t.next ? Math.min(1, (sales - TITLES[t.level - 1].at) / (t.next.at - TITLES[t.level - 1].at)) : 1;
  return `<section class="milestones">
    <div class="row between"><h2>公司成长</h2><span class="small muted">已达成 ${achieved.length} 项</span></div>
    <div class="rank"><span class="rank-lv">Lv${t.level}</span><div class="grow"><b>${esc(t.name)}</b>
      <div class="progress"><div style="width:${(toNext * 100).toFixed(1)}%"></div></div>
      <span class="small muted">${t.next ? `累计销售 ${(sales / YI).toFixed(1)} / ${t.next.at / YI} 亿 → 晋级「${esc(t.next.name)}」` : `累计销售 ${(sales / YI).toFixed(0)} 亿，已登顶`}</span></div></div>
    ${next.map(g => `<div class="goal"><div class="row between small"><span>${esc(g.title)}</span><span class="muted">${fmt(g, Math.max(0, g.value))} / ${fmt(g, g.target)} ${g.unit}</span></div>
      <div class="progress thin"><div style="width:${(Math.max(0, Math.min(1, g.value / g.target)) * 100).toFixed(1)}%"></div></div></div>`).join('')}
    ${achievements ? `<button class="ghost ach-entry" data-act="achievements">${achievements}</button>` : ''}
  </section>`;
}
