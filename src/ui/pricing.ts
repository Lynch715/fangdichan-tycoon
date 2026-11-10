// 调价从实际在售价格起算，遵守备案及自动限价；不更改模拟规则。
import { marketPrice, priceRestricted, salesPriceCap, type Config, type GameState, type Project } from '../sim/index.ts';

export function projectPricing(c: Config, s: GameState, p: Project) {
  const market = marketPrice(c, s, p.districtId, p.attributes, p.product);
  const cap = salesPriceCap(s, c, p, market);
  const factor = Math.min(p.priceFactor, cap === null ? p.priceFactor : cap / market);
  const filedMax = priceRestricted(s, c) && p.filedPrice !== null ? p.filedPrice / market : Infinity;
  const max = Math.min(c.sales.maxPriceFactor, cap === null ? Infinity : cap / market, filedMax);
  const min = c.sales.minPriceFactor;
  const change = (delta: number): number | null => {
    if ((delta < 0 && factor <= min + 1e-9) || (delta > 0 && factor >= max - 1e-9)) return null;
    let next = Math.min(max, Math.max(min, factor + delta));
    // 除以市价再乘回可能超备案价一个浮点单位，提交前向合法区间内收一格。
    if (Number.isFinite(filedMax) && market * next > p.filedPrice!) next -= Number.EPSILON * Math.max(1, Math.abs(next));
    return next;
  };
  return { market, price: market * factor, factor, capped: factor < p.priceFactor - 1e-9, change };
}
