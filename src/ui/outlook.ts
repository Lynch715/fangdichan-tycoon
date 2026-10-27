import { marketPrice, priceRestricted, salesRate, type Config, type GameState, type Project } from '../sim/index.ts';
import { pct, yi } from './format.ts';

function prices(config: Config, s: GameState, p: Project) {
  const market = marketPrice(config, s, p.districtId, p.attributes, p.product);
  const requested = market * p.priceFactor;
  const price = priceRestricted(s, config) && p.filedPrice !== null ? Math.min(requested, p.filedPrice) : requested;
  return { market, price };
}

/**
 * 项目预计利润（只读估算）：已售回款 + 剩余可售面积按“挂牌价与市场价取低”估值
 * （溢价卖不掉的部分最终按市场价清盘，不按挂牌价高估），减地价、全部建安、税费与营销；
 * 本公司权益口径，不含融资利息。让玩家在交付确认收入之前，就能看到“这盘在赚钱”。
 */
export function projectOutlook(config: Config, s: GameState, p: Project) {
  const { market, price } = prices(config, s, p);
  const remaining = Math.max(0, p.saleableArea - p.soldArea);
  const revenue = p.salesIn + remaining * Math.min(price, market);
  const charges = revenue * (config.sales.taxRate + (p.marketingRate ?? config.sales.marketingRate));
  const owned = 1 - p.partnerShare;
  const profit = (revenue - charges - p.landCost - p.buildCost) * owned;
  return { revenue: revenue * owned, profit, margin: revenue > 0 ? profit / (revenue * owned) : null };
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
  return `<span class="small outlook ${o.profit >= 0 ? 'ok-text' : 'danger-text'}">预计利润 <b>${o.profit >= 0 ? '' : '−'}${yi(Math.abs(o.profit))}</b>${o.margin === null ? '' : ` · 利润率 ${pct(o.margin, 1)}`} · 货值 ${yi(o.revenue)}<span class="muted">（估算，未计利息）</span></span>${premiumHint(config, s, p)}`;
}
