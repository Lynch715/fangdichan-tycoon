// 成就系统：只读，从状态推导；解锁记录跨局永久保存在本机（localStorage），不进存档、不影响模拟。
import { activeProject, computeMetrics, district, type Config, type GameState } from '../sim/index.ts';
import { builtArea, urbanization } from '../render/growth.ts';
import { esc } from './format.ts';
import { totalSales } from './milestones.ts';

const YI = 10000;

export interface Achievement { id: string; icon: string; name: string; desc: string; group: '起步' | '规模' | '品质' | '经营' | '传奇'; check: (x: Ctx) => boolean }
interface Ctx { s: GameState; c: Config; sales: number; equity: number; interestDebt: number }

const delivered = (s: GameState) => s.projects.filter(p => p.deliveredDay !== null);
const mapOf = (c: Config, districtId: string) => district(c, districtId).mapId;

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_land', icon: '🚧', name: '破土动工', group: '起步', desc: '拍下第一块地', check: x => x.s.projects.length > 0 },
  { id: 'first_sale', icon: '🎉', name: '开盘大吉', group: '起步', desc: '第一个项目开盘卖出', check: x => x.s.projects.some(p => p.soldArea > 0) },
  { id: 'first_delivery', icon: '🔑', name: '钥匙交付', group: '起步', desc: '第一个项目交付入伙', check: x => delivered(x.s).length > 0 },
  { id: 'first_close', icon: '💰', name: '落袋为安', group: '起步', desc: '第一个项目清盘结算', check: x => x.s.projects.some(p => p.stage === 'closed') },
  { id: 'sales_10', icon: '📈', name: '十亿俱乐部', group: '规模', desc: '累计销售突破 10 亿', check: x => x.sales >= 10 * YI },
  { id: 'sales_100', icon: '🏢', name: '百亿房企', group: '规模', desc: '累计销售突破 100 亿', check: x => x.sales >= 100 * YI },
  { id: 'sales_1000', icon: '🏙', name: '千亿房企', group: '规模', desc: '累计销售突破 1000 亿', check: x => x.sales >= 1000 * YI },
  { id: 'ten_delivered', icon: '🧱', name: '十盘连珠', group: '规模', desc: '累计交付 10 个项目', check: x => delivered(x.s).length >= 10 },
  { id: 'big_project', icon: '🏗', name: '大盘开发', group: '规模', desc: '开发一个建面 20 万㎡ 以上的项目', check: x => x.s.projects.some(p => p.buildArea >= 200000) },
  { id: 'equity_100', icon: '💎', name: '身家百亿', group: '规模', desc: '净资产达到 100 亿', check: x => x.equity >= 100 * YI },
  { id: 'cash_king', icon: '🏦', name: '现金为王', group: '经营', desc: '账上现金达到 30 亿', check: x => x.s.cash >= 30 * YI },
  { id: 'zero_debt', icon: '🕊', name: '无债一身轻', group: '经营', desc: '同时经营 3 个以上项目且没有有息负债', check: x => x.interestDebt === 0 && x.s.projects.filter(activeProject).length >= 3 },
  { id: 'green_redline', icon: '🟢', name: '三道绿线', group: '经营', desc: '三道红线实施后仍保持绿档', check: x => x.s.regulation.active && x.s.regulation.tier === 0 && x.s.projects.some(activeProject) },
  { id: 'acquire', icon: '🤝', name: '趁势收购', group: '经营', desc: '收购一个违约同行的项目', check: x => x.s.projects.some(p => p.acquisition) },
  { id: 'suburb', icon: '🌾', name: '远郊拓荒', group: '经营', desc: '在远郊区县拿下项目', check: x => x.s.projects.some(p => mapOf(x.c, p.districtId) === 'suburb') },
  { id: 'three_maps', icon: '🗺', name: '三城并进', group: '经营', desc: '主城、外围、远郊同时有在营项目', check: x => new Set(x.s.projects.filter(activeProject).map(p => mapOf(x.c, p.districtId))).size >= 3 },
  { id: 'brand_90', icon: '⭐', name: '品质标杆', group: '品质', desc: '公司品牌达到 90 分', check: x => x.s.brand >= 90 },
  { id: 'craftsman', icon: '🛠', name: '匠心交付', group: '品质', desc: '交付一个质量 90 分以上的项目', check: x => delivered(x.s).some(p => (p.quality ?? 0) >= 90) },
  { id: 'river_view', icon: '🌊', name: '一线江景', group: '品质', desc: '交付一个江景项目', check: x => delivered(x.s).some(p => p.attributes?.scenery === 'river' || p.attributes?.scenery === 'both') },
  { id: 'skyline', icon: '🌆', name: '高楼林立', group: '传奇', desc: '任一地图城市化达到 60%', check: x => {
    const years = x.s.day / (x.c.time.daysPerMonth * 12), all = [...x.s.projects, ...x.s.rivals.flatMap(r => r.company.projects)];
    return ['city', 'outer', 'suburb'].some(m => urbanization(years, builtArea(all, id => mapOf(x.c, id) === m)) >= 0.6);
  } },
  { id: 'survive_downturn', icon: '🌧', name: '穿越周期', group: '传奇', desc: '挺过一轮完整的下行期并正常经营', check: x => {
    const name = x.c.cycle.phases.find(p => p.id === 'downturn')?.name, months = x.s.reports.months;
    const i = months.findIndex(m => m.phase === name);
    return i >= 0 && months.slice(i).some(m => m.phase !== name) && x.s.status === 'playing';
  } },
  { id: 'top_rival', icon: '👑', name: '行业龙头', group: '传奇', desc: '净资产超过所有同行开发商', check: x => x.s.rivals.length > 0 && x.equity > x.c.start.cash && x.s.rivals.every(r => computeMetrics(r.company).equity < x.equity) },
  { id: 'challenge_won', icon: '🏆', name: '挑战者', group: '传奇', desc: '完成任意一个挑战关卡', check: x => x.s.session?.options.mode === 'challenge' && x.s.session.result === 'won' },
  { id: 'career_30', icon: '🎖', name: '三十而立', group: '传奇', desc: '生涯经营满 30 年未破产', check: x => x.s.day >= x.c.time.careerYears * 12 * x.c.time.daysPerMonth && x.s.status !== 'bankrupt' },
];

/** 本局当前满足的成就（沙盒模式资金无限，不计成就）。 */
export function earnedAchievements(s: GameState, c: Config): string[] {
  if (s.session?.options.mode === 'sandbox') return [];
  const m = computeMetrics(s), x: Ctx = { s, c, sales: totalSales(s), equity: m.equity, interestDebt: m.interestDebt };
  return ACHIEVEMENTS.filter(a => a.check(x)).map(a => a.id);
}

export type Unlocks = Record<string, { at: string; company: string }>;
const KEY = 'fdc-achievements';
export function loadUnlocks(store: Pick<Storage, 'getItem'> = localStorage): Unlocks {
  try { const v = JSON.parse(store.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v as Unlocks : {}; } catch { return {}; }
}
export function saveUnlocks(u: Unlocks, store: Pick<Storage, 'setItem'> = localStorage) { try { store.setItem(KEY, JSON.stringify(u)); } catch { /* 只是不记住 */ } }

/** 合并本局新满足的成就，返回新解锁列表（不重复解锁）。 */
export function mergeUnlocks(u: Unlocks, earned: string[], company: string, now = new Date()): string[] {
  const fresh = earned.filter(id => !u[id]);
  for (const id of fresh) u[id] = { at: now.toISOString(), company };
  return fresh;
}

export function achievementsMarkup(u: Unlocks, sandbox: boolean): string {
  const got = ACHIEVEMENTS.filter(a => u[a.id]).length;
  const groups = [...new Set(ACHIEVEMENTS.map(a => a.group))];
  return `<div class="row between"><h2 id="achievements-title">成就 ${got} / ${ACHIEVEMENTS.length}</h2><button class="ghost" data-achievements-close>关闭</button></div>
  <div class="progress"><div style="width:${(got / ACHIEVEMENTS.length * 100).toFixed(1)}%"></div></div>
  ${sandbox ? '<p class="small warn-text">沙盒模式资金无限，本局不计成就。</p>' : '<p class="small muted">成就跨局永久保存在本机，换公司重开也保留。</p>'}
  ${groups.map(g => `<h3 class="saves-sub">${g}</h3><div class="ach-grid">${ACHIEVEMENTS.filter(a => a.group === g).map(a => {
    const r = u[a.id];
    return `<div class="ach ${r ? 'got' : ''}"><span class="ach-icon">${r ? a.icon : '🔒'}</span><div><b>${esc(a.name)}</b><span class="small">${esc(a.desc)}</span>${r ? `<span class="small muted">${esc(r.company)} · ${r.at.slice(0, 10)}</span>` : ''}</div></div>`;
  }).join('')}</div>`).join('')}`;
}

export const achievementName = (id: string) => ACHIEVEMENTS.find(a => a.id === id);
