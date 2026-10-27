import { describe, expect, it } from 'vitest';
import { applyCommand, stepDay, defaultConfig as c, marketPrice, type GameState } from '../src/sim/index.ts';
import { runGame, conservative } from '../src/sim/bots.ts';

/** 找一局里已交付、仍有尾货的项目，把它拨到清盘前一天（测试夹具）。 */
function eveOfClearance(seed: number): { s: GameState; id: string } | null {
  const { state } = runGame(seed, conservative, 5 + (seed % 4));
  const p = state.projects.find(p => p.stage === 'delivered' && p.deliveredDay !== null && p.saleableArea - p.soldArea > 100);
  if (!p) return null;
  // 只取未限价的状态：限价期本就不能提价（备案上限另有约束）
  if (!applyCommand(structuredClone(state), { type: 'setPrice', projectId: p.id, priceFactor: 1.2 }, state.rules ?? c).ok) return null;
  const dpm = c.time.daysPerMonth;
  // 下一个月结时恰好满清盘期
  const nextMonthEnd = (Math.floor(state.day / dpm) + 1) * dpm;
  p.deliveredDay = nextMonthEnd - c.construction.clearanceMonthsAfterDelivery * dpm;
  return { s: state, id: p.id };
}

function clearanceTake(base: GameState, id: string, priceFactor: number, marketingRate?: number) {
  const s = structuredClone(base), p = s.projects.find(p => p.id === id)!;
  expect(applyCommand(s, { type: 'setPrice', projectId: id, priceFactor }, s.rules ?? c).ok).toBe(true);
  if (marketingRate !== undefined) expect(applyCommand(s, { type: 'setMarketing', projectId: id, rate: marketingRate }, s.rules ?? c).ok).toBe(true);
  const before = p.salesIn, area = p.saleableArea - p.soldArea;
  while (p.soldArea < p.saleableArea - 1e-6 && s.day < base.day + 31) stepDay(s, s.rules ?? c);
  return { revenue: p.salesIn - before, area, market: marketPrice(s.rules ?? c, s, p.districtId, p.attributes) };
}

describe('G01 尾货清盘不再奖励临时提价', () => {
  const cases = Array.from({ length: 24 }, (_, i) => i + 1).map(eveOfClearance).filter((x): x is NonNullable<typeof x> => x !== null);
  it('样本里有可清盘的真实项目', () => { expect(cases.length).toBeGreaterThanOrEqual(3); });
  it('清盘前把售价提到市场价 120% 不会比按市场价多收钱', () => {
    for (const { s, id } of cases) {
      const at100 = clearanceTake(s, id, 1), at120 = clearanceTake(s, id, 1.2);
      expect(at120.revenue).toBeLessThanOrEqual(at100.revenue + 1e-6);
    }
  });
  it('降价清盘按降后的价格成交（不比市场价高）', () => {
    for (const { s, id } of cases) {
      const at100 = clearanceTake(s, id, 1), at80 = clearanceTake(s, id, 0.8);
      expect(at80.revenue).toBeLessThan(at100.revenue);
    }
  });
  it('清盘单价不超过市场参考价的 85%', () => {
    for (const { s, id } of cases) {
      const r = clearanceTake(s, id, 1.2);
      expect(r.revenue / r.area).toBeLessThanOrEqual(r.market * (1 - c.construction.clearanceDiscount) * 1.000001);
    }
  });
  it('把营销降到 0 不会让清盘回款变多', () => {
    for (const { s, id } of cases) {
      const normal = clearanceTake(s, id, 1), zero = clearanceTake(s, id, 1, 0);
      expect(zero.revenue).toBeLessThanOrEqual(normal.revenue + 1e-6);
    }
  });
});
