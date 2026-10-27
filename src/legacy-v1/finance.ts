// 财务计算：样例项目测算、三张表简化指标、评级、可借额度。
import type { Config } from './config.ts';
import type { ChannelId, GameState, Metrics, Project } from './types.ts';

export interface StaticProjectInput {
  siteArea: number;
  far: number;
  floorPrice: number; // 楼面价 万元/㎡
  buildCostPerSqm: number;
  salePrice: number; // 万元/㎡
  interest: number; // 万元
}

/** 静态项目测算（规范 10.1 样例），不含时间维度。 */
export function projectPnL(config: Config, p: StaticProjectInput) {
  const buildArea = p.siteArea * p.far;
  const saleableArea = buildArea * config.sales.saleableRatio;
  const revenue = saleableArea * p.salePrice;
  const land = buildArea * p.floorPrice;
  const build = buildArea * p.buildCostPerSqm;
  const marketing = revenue * config.sales.marketingRate;
  const tax = revenue * config.sales.taxRate;
  const profit = revenue - land - build - marketing - tax - p.interest;
  return { buildArea, saleableArea, revenue, land, build, marketing, tax, interest: p.interest, profit, margin: profit / revenue };
}

const DAY_PER_YEAR = 360;

export function isDelivered(p: Project): boolean {
  return p.stage === 'delivered' || p.stage === 'closed';
}

export function computeMetrics(state: GameState): Metrics {
  let escrow = 0;
  let inventory = 0;
  let contractLiabilities = 0;
  let landPayable = 0;
  for (const p of state.projects) {
    escrow += p.salesIn - p.escrowReleased;
    const recognized = isDelivered(p) ? p.soldArea / p.saleableArea : 0;
    // 土地按合同总价入账（未付部分同时记为应付地价款）
    inventory += (p.landCost + p.buildSpent) * (1 - recognized);
    if (!isDelivered(p)) contractLiabilities += p.salesIn;
    landPayable += p.landCost - p.landPaid;
  }
  // 拍卖保证金视为其他资产
  const deposits = state.auctions.reduce((s, a) => s + a.deposit, 0);
  const cash = state.cash;
  const interestDebt = state.debts.reduce((s, d) => s + d.principal, 0);
  const shortDebt = state.debts
    .filter((d) => d.maturityDay - state.day <= DAY_PER_YEAR)
    .reduce((s, d) => s + d.principal, 0);
  const totalAssets = Math.max(cash, 0) + escrow + inventory + deposits;
  const totalLiabilities = interestDebt + contractLiabilities + landPayable + Math.max(-cash, 0);
  const equity = totalAssets - totalLiabilities;
  const exAssets = totalAssets - contractLiabilities;
  const liabilityRatio = exAssets > 0 ? (totalLiabilities - contractLiabilities) / exAssets : 9.99;
  const netGearing = equity > 0 ? Math.max(interestDebt - Math.max(cash, 0), 0) / equity : 9.99;
  const cashToShortDebt = shortDebt > 0 ? Math.max(cash, 0) / shortDebt : 9.99;
  return {
    cash, escrow, inventory, totalAssets, interestDebt, contractLiabilities, landPayable,
    totalLiabilities, equity, liabilityRatio, netGearing, cashToShortDebt, shortDebt,
  };
}

export function breaches(config: Config, m: Metrics) {
  const t = config.regulation.thresholds;
  return {
    liabilityRatio: m.liabilityRatio > t.liabilityRatio,
    netGearing: m.netGearing > t.netGearing,
    cashToShortDebt: m.cashToShortDebt < t.cashToShortDebt,
  };
}

export function breachCount(b: ReturnType<typeof breaches>): number {
  return Number(b.liabilityRatio) + Number(b.netGearing) + Number(b.cashToShortDebt);
}

/** 评级：0 = AAA … 6 = C。 */
export function computeRating(config: Config, state: GameState, m: Metrics): number {
  if (state.status === 'bankrupt') return 6;
  if (state.status === 'distress') return 5;
  const n = breachCount(breaches(config, m));
  if (n === 0) return m.netGearing < 0.5 ? 0 : 1;
  return Math.min(1 + n, 4);
}

export function channelRate(config: Config, state: GameState, channel: ChannelId): number {
  return config.finance.channels[channel].rate + config.finance.ratingSpread[state.rating];
}

/** 当前某渠道最多还能借多少（含监管增速上限）。 */
export function borrowCapacity(config: Config, state: GameState, channel: ChannelId, projectId?: string): { max: number; reason?: string } {
  if (state.status === 'bankrupt') return { max: 0, reason: '公司已破产' };
  if (state.rating >= 5) return { max: 0, reason: '评级过低，融资渠道关闭' };
  const m = computeMetrics(state);
  let max: number;
  if (channel === 'devLoan') {
    const p = state.projects.find((x) => x.id === projectId);
    if (!p) return { max: 0, reason: '开发贷需要指定项目' };
    if (p.stage !== 'construction') return { max: 0, reason: '开发贷只能用于在建项目' };
    const used = state.debts.filter((d) => d.channel === 'devLoan' && d.projectId === p.id).reduce((s, d) => s + d.principal, 0);
    max = (p.buildCost - p.buildSpent) * config.finance.channels.devLoan.maxOfBuildCost - used;
  } else {
    const used = state.debts.filter((d) => d.channel === 'trust').reduce((s, d) => s + d.principal, 0);
    max = Math.max(m.equity, 0) * config.finance.channels.trust.maxOfEquity - used;
  }
  if (state.regulation.active) {
    const cap = config.regulation.growthCaps[state.regulation.tier];
    // 基数取年初有息负债；负债很少的公司按净资产一半作基数，避免“零负债就永远借不了钱”
    const base = Math.max(state.regulation.debtBaseline, Math.max(m.equity, 0) * 0.5);
    const room = base * (1 + cap) - m.interestDebt;
    if (room < max) return { max: Math.max(room, 0), reason: `受${config.regulation.tiers[state.regulation.tier]}有息负债增速上限限制` };
  }
  return { max: Math.max(max, 0) };
}
