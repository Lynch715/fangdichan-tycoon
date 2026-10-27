import { marketPrice, priceRestricted, type Config, type GameState, type Project } from '../sim/index.ts';
import { pct, yi } from './format.ts';

/**
 * 项目预计利润（只读估算）：已售回款 + 剩余可售面积按当前售价，
 * 减地价、全部建安、税费与营销；本公司权益口径，不含融资利息。
 * 让玩家在交付确认收入之前，就能看到“这盘在赚钱”。
 */
export function projectOutlook(config: Config, s: GameState, p: Project) {
  const requested = marketPrice(config, s, p.districtId, p.attributes) * p.priceFactor;
  const price = priceRestricted(s, config) && p.filedPrice !== null ? Math.min(requested, p.filedPrice) : requested;
  const remaining = Math.max(0, p.saleableArea - p.soldArea);
  const revenue = p.salesIn + remaining * price;
  const charges = revenue * (config.sales.taxRate + (p.marketingRate ?? config.sales.marketingRate));
  const owned = 1 - p.partnerShare;
  const profit = (revenue - charges - p.landCost - p.buildCost) * owned;
  return { revenue: revenue * owned, profit, margin: revenue > 0 ? profit / (revenue * owned) : null };
}

export function outlookMarkup(config: Config, s: GameState, p: Project): string {
  const o = projectOutlook(config, s, p);
  return `<span class="small outlook ${o.profit >= 0 ? 'ok-text' : 'danger-text'}">预计利润 <b>${o.profit >= 0 ? '' : '−'}${yi(Math.abs(o.profit))}</b>${o.margin === null ? '' : ` · 利润率 ${pct(o.margin, 1)}`} · 货值 ${yi(o.revenue)}<span class="muted">（估算，未计利息）</span></span>`;
}
