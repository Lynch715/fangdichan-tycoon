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

/** 收购项目保留实物成本/施工预算，财务存货改用购买日成本基础。 */
export function projectInventory(p:Project):number {
 const recognized=isDelivered(p)?p.soldArea/p.saleableArea:0;
 const base=(p.landCost+p.buildSpent)*(1-recognized)*(1-p.partnerShare),a=p.acquisition;
 return base+(a?a.basisAdjustment*(1-recognized)/(1-a.recognizedRatio):0);
}
export function recognizedProjectCost(p:Project,area:number):number {
 const a=p.acquisition;
 return(p.landCost+p.buildSpent)*area/p.saleableArea*(1-p.partnerShare)+(a?a.basisAdjustment*(area/p.saleableArea)/(1-a.recognizedRatio):0);
}
export const industryTight=(s:Pick<GameState,'day'|'industry'>)=>s.day<s.industry.creditUntil;

export function computeMetrics(state: Pick<GameState,'cash'|'projects'|'auctions'|'debts'|'day'>): Metrics {
  let escrow = 0;
  let inventory = 0;
  let contractLiabilities = 0;
  let landPayable = 0;
  for (const p of state.projects) {
    if (p.stage === 'sold') continue;
    const owned = 1 - p.partnerShare;
    if(p.stage==='abandoned'){landPayable+=(p.landCost-p.landPaid)*owned;continue;}
    escrow += (p.salesIn - p.escrowReleased) * owned;
    // 土地按合同总价入账（未付部分同时记为应付地价款）
    inventory += projectInventory(p);
    if (!isDelivered(p)) contractLiabilities += p.salesIn * owned;
    landPayable += (p.landCost - p.landPaid) * owned;
  }
  // 拍卖保证金视为其他资产
  const deposits = state.auctions.reduce((s, a) => s + a.deposit, 0);
  const cash = state.cash;
  const interestDebt = state.debts.filter((d) => d.channel !== 'paper').reduce((s, d) => s + d.principal, 0);
  const paperDebt = state.debts.filter((d) => d.channel === 'paper').reduce((s, d) => s + d.principal, 0);
  const hiddenDebt = state.debts.filter((d) => d.channel === 'hidden').reduce((s, d) => s + d.principal, 0);
  const shortDebt = state.debts
    .filter((d) => d.channel !== 'paper' && d.maturityDay - state.day <= DAY_PER_YEAR)
    .reduce((s, d) => s + d.principal, 0);
  const totalAssets = Math.max(cash, 0) + escrow + inventory + deposits;
  const totalLiabilities = interestDebt + paperDebt + contractLiabilities + landPayable + Math.max(-cash, 0);
  const equity = totalAssets - totalLiabilities;
  const exAssets = totalAssets - contractLiabilities;
  const liabilityRatio = exAssets > 0 ? (totalLiabilities - contractLiabilities) / exAssets : 9.99;
  const netGearing = equity > 0 ? Math.max(interestDebt - Math.max(cash, 0), 0) / equity : 9.99;
  const cashToShortDebt = shortDebt > 0 ? Math.max(cash, 0) / shortDebt : 9.99;
  return {
    cash, escrow, inventory, totalAssets, interestDebt, contractLiabilities, landPayable,
    totalLiabilities, equity, liabilityRatio, netGearing, cashToShortDebt, shortDebt, paperDebt, hiddenDebt,
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
  if (state.status === 'distress') return state.distressMonths>=config.finance.covenants.distressMonthsForC?6:5;
  const n = breachCount(breaches(config, m));
  if (n === 0) return m.netGearing < 0.5 ? 0 : 1;
  return Math.min(1 + n, 4);
}

export function channelRate(config: Config, state: GameState, channel: ChannelId): number {
  if(channel==='bond')return Math.max(config.finance.bond.minRate,Math.min(config.finance.bond.maxRate,config.finance.bond.rates[state.rating]+(industryTight(state)?config.rivals.default.rateSpread:0)));
  return config.finance.channels[channel].rate + config.finance.ratingSpread[state.rating]+(industryTight(state)?config.rivals.default.rateSpread:0);
}

/** 当前某渠道最多还能借多少（含监管增速上限）。 */
export function borrowCapacity(config: Config, state: GameState, channel: ChannelId, projectId?: string): { max: number; reason?: string } {
  if (state.status === 'bankrupt') return { max: 0, reason: '公司已破产' };
  if (state.day < state.financeFrozenUntil) return { max: 0, reason: '抽查处罚期内暂停新增融资' };
  if (channel === 'paper') return { max: 0, reason: '商票只能支付实际工程款，请在项目中开启' };
  if(channel==='bond'&&state.rating>config.finance.bond.maxIssueRating)return {max:0,reason:'公司债要求评级AA及以上'};
  if (state.rating >= 5) return { max: 0, reason: '评级过低，融资渠道关闭' };
  const m = computeMetrics(state),factor=industryTight(state)?config.rivals.default.capacityFactor:1;
  let max: number;
  if (channel === 'devLoan') {
    const p = state.projects.find((x) => x.id === projectId);
    if (!p) return { max: 0, reason: '开发贷需要指定项目' };
    if (p.stage !== 'construction') return { max: 0, reason: '开发贷只能用于在建项目' };
    const used = state.debts.filter((d) => d.channel === 'devLoan' && d.projectId === p.id).reduce((s, d) => s + d.principal, 0);
    max = Math.max(p.buildCost - p.buildSpent, 0) * (1 - p.partnerShare) * config.finance.channels.devLoan.maxOfBuildCost*factor - used;
  } else {
    const used = state.debts.filter((d) => d.channel === channel).reduce((s, d) => s + d.principal, 0);
    max = Math.max(m.equity, 0) * (channel==='bond'?config.finance.channels.bond.maxOfEquity:channel === 'hidden' ? config.finance.channels.hidden.maxOfEquity : config.finance.channels.trust.maxOfEquity)*factor - used;
  }
  if (state.regulation.active) {
    const cap = config.regulation.growthCaps[state.regulation.tier];
    // 基数取年初有息负债；负债很少的公司按净资产一半作基数，避免“零负债就永远借不了钱”
    const base = Math.max(state.regulation.debtBaseline, Math.max(m.equity, 0) * 0.5);
    const room = base * (1 + cap) - m.interestDebt;
    if (room < max) return { max: Math.max(room, 0), reason: `受${config.regulation.tiers[state.regulation.tier]}有息负债增速上限限制` };
  }
  return { max: Math.max(max, 0),...(industryTight(state)?{reason:'同行违约后全行业融资额度收紧'}:{}) };
}
