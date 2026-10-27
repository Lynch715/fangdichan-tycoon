import { describe, expect, it } from 'vitest';
import { defaultConfig as c, newGame, salesRate } from '../src/sim/index.ts';
import { brandTier, brandTileMarkup } from '../src/ui/brand.ts';

describe('品牌分阶段（G06）', () => {
  it('分档按分数递增，去化效果与内核品牌系数一致', () => {
    expect(brandTier(c, 10).name).toBe('口碑受损');
    expect(brandTier(c, 50).name).toBe('普通开发商');
    expect(brandTier(c, 95).next).toBeNull();
    expect(brandTier(c, 70).next?.gap).toBe(5);
    const s = newGame(1, c), at = (b: number) => salesRate(c, { ...s, brand: b }, 1);
    for (const b of [20, 50, 80]) expect(at(b) / at(c.marketing.neutralBrand)).toBeCloseTo(1 + brandTier(c, b).effect, 6);
    expect(brandTileMarkup(c, 80)).toContain('知名品牌');
  });
});
