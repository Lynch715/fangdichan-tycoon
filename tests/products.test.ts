import { describe, expect, it } from 'vitest';
import { applyCommand, defaultConfig as c, marketPrice, salesRate, type GameState } from '../src/sim/index.ts';
import { runGame, conservative } from '../src/sim/bots.ts';
import { productTerms } from '../src/sim/products.ts';
import { productPickerMarkup } from '../src/ui/productChoice.ts';

function landProject(): { s: GameState; id: string } {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { state } = runGame(seed, conservative, 1);
    const p = state.projects.find(p => p.stage === 'land');
    if (p) return { s: state, id: p.id };
    // 机器人拿地即开工：把一个在建项目还原成待开工夹具
    const q = state.projects.find(p => p.stage === 'construction' && p.progress < 0.2);
    if (q) { q.stage = 'land'; q.contractor = null; q.quality = null; q.buildCost /= c.construction.contractors.standard.costFactor; return { s: state, id: q.id }; }
  }
  throw new Error('no fixture');
}

describe('产品线差异化（G05）', () => {
  it('缺省产品线系数均为 1（机器人与旧指令不受影响）', () => {
    const t = productTerms(c, undefined);
    expect([t.costFactor, t.durationFactor, t.priceFactor, t.absorptionFactor, t.policySensitivity]).toEqual([1, 1, 1, 1, 1]);
    expect(productTerms(c, 'tower').priceFactor).toBe(1);
  });
  it('开工选别墅：建安按系数放大、售价溢价、外观产品锁定只能换变体', () => {
    const { s, id } = landProject(), p = s.projects.find(p => p.id === id)!, before = p.buildCost;
    expect(applyCommand(s, { type: 'startProject', projectId: id, contractor: 'standard', product: 'villa' }, c).ok).toBe(true);
    expect(p.product).toBe('villa');
    expect(p.buildCost).toBeCloseTo(before * c.construction.contractors.standard.costFactor * c.products.villa.costFactor, 6);
    expect(marketPrice(c, s, p.districtId, p.attributes, p.product) / marketPrice(c, s, p.districtId, p.attributes)).toBeCloseTo(c.products.villa.priceFactor, 9);
    expect(applyCommand(s, { type: 'setAppearance', projectId: id, product: 'tower', variant: 'a' }, c).ok).toBe(false);
    expect(applyCommand(s, { type: 'setAppearance', projectId: id, product: 'villa', variant: 'b' }, c).ok).toBe(true);
  });
  it('去化：别墅更慢；商业不受购房政策影响', () => {
    const { s } = landProject(), d = s.projects[0].districtId;
    expect(salesRate(c, s, 1, undefined, d, 'villa') / salesRate(c, s, 1, undefined, d, 'tower')).toBeLessThan(1);
    const tight = structuredClone(s);
    for (const k of Object.keys(tight.market.policies ?? {})) tight.market.policies![k].level = c.housingPolicy.levels.length - 1;
    const ratio = (st: GameState, pr: 'tower' | 'commercial') => salesRate(c, st, 1, undefined, d, pr);
    expect(ratio(tight, 'tower')).not.toBeCloseTo(ratio(s, 'tower'), 6);
    expect(ratio(tight, 'commercial')).toBeCloseTo(ratio(s, 'commercial'), 9);
  });
  it('无效产品线被拒绝；选择器展示取舍', () => {
    const { s, id } = landProject();
    expect(applyCommand(s, { type: 'startProject', projectId: id, contractor: 'standard', product: 'castle' as 'villa' }, c).ok).toBe(false);
    expect(productPickerMarkup(c, s.projects.find(p => p.id === id)!)).toContain('开工后锁定');
  });
});
