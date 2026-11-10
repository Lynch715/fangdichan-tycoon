import { activeProject, isDelivered, marketPrice, projectInventory, projectResult, salesPriceCap, salesRate, type Config, type GameState, type Project } from '../sim/index.ts';
import { pct, yi } from './format.ts';

function prices(config: Config, s: GameState, p: Project) {
  const market = marketPrice(config, s, p.districtId, p.attributes, p.product);
  const requested = market * p.priceFactor;
  const price = Math.min(requested, salesPriceCap(s, config, p, market) ?? requested);
  return { market, price };
}

/**
 * 以实际项目结算口径为起点，只估算尚未实现的利润。
 * 已发生的建安、营销、利息及收购成本基础均保留，不能按当前费率重算历史。
 */
export function projectOutlook(config: Config, s: GameState, p: Project) {
  const { market, price } = prices(config, s, p);
  const result = projectResult(s, p), owned = 1 - p.partnerShare;
  if (!activeProject(p)) return { revenue: result.revenue, profit: result.profit, margin: result.margin };
  const futureRevenue = Math.max(0, p.saleableArea - p.soldArea) * Math.min(price, market) * owned;
  const futureCharges = futureRevenue * (config.sales.taxRate + p.marketingRate);
  // 工程按进度计费；不能用“预算减已付款”替代剩余工程量。
  const futureBuild = p.stage === 'construction' || p.stage === 'land'
    ? p.buildCost * Math.max(0, 1 - p.progress) * config.construction.paces[p.pace].costFactor * owned : 0;
  const unrecognizedSales = isDelivered(p) ? 0 : p.salesIn * owned;
  const revenue = result.revenue + futureRevenue;
  const profit = result.profit === null ? null : result.profit + unrecognizedSales + futureRevenue - projectInventory(p) - futureBuild - futureCharges;
  return { revenue, profit, margin: profit !== null && revenue > 0 ? profit / revenue : null };
}

/** 高于市场价时提示代价：去化相对按市场价的比例，以及尾货按市场价折扣清盘。 */
export function premiumHint(config: Config, s: GameState, p: Project): string {
  const { market, price } = prices(config, s, p), factor = price / market;
  if (factor <= 1.001) return '';
  const base = salesRate(config, s, 1, p.marketingRate, p.districtId, p.product), now = salesRate(config, s, factor, p.marketingRate, p.districtId, p.product);
  const ratio = base > 0 ? now / base : 0, months = config.construction.clearanceMonthsAfterDelivery, cut = pct(config.construction.clearanceDiscount);
  if (ratio <= 0.001) return `<span class="small danger-text">高于市场价 ${pct(factor - 1)}：几乎无人购买；交付满 ${months} 个月后尾货按市场价减 ${cut} 清盘</span>`;
  return `<span class="small warn-text">高于市场价 ${pct(factor - 1)}：去化约为按市场价时的 ${pct(ratio)}；尾货清盘按市场价（不按挂牌价）减 ${cut}</span>`;
}

export function outlookMarkup(config: Config, s: GameState, p: Project): string {
  const o = projectOutlook(config, s, p);
  if (o.profit === null) return '<span class="small muted">历史流水不完整，暂不估算项目利润。</span>';
  return `<span class="small outlook ${o.profit >= 0 ? 'ok-text' : 'danger-text'}">预计利润 <b>${o.profit >= 0 ? '' : '−'}${yi(Math.abs(o.profit))}</b>${o.margin === null ? '' : ` · 利润率 ${pct(o.margin, 1)}`} · 权益销售额 ${yi(o.revenue)}<span class="muted">（估算，含已发生费用；未计未来利息、随机事件及尾货折价）</span></span>${premiumHint(config, s, p)}`;
}
